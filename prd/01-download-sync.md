# 01 — Download Sync (v1)

> The first and only feature in v1. Everything else is in `future/`. Read `00-product-overview.md` first.

## Goal

Given a Spotify playlist URL, download every track in it as a tagged MP3 to a local library directory. Re-runnable: detect new additions, mark removals, never destructively touch files.

## User stories

- "Claude, run `spotify-sync sync` and tell me how many new songs were downloaded." — the primary invocation pattern.
- "Show me what's pending or failed." → `spotify-sync status`.
- "These 10 songs were deleted from my Spotify playlist; what should I do with the files?" → `spotify-sync prune`.
- "The downloaded version of song X is the wrong cover. I deleted the file and found the right one manually." → `spotify-sync import <file> --for <track-id>`.

## Out of scope (deferred to future PRDs)

- Sources other than Spotify (Apple Music, etc.). v1 supports only Spotify, but the data model is source-agnostic. See `future/multi-source.md`.
- Multiple playlists from Spotify in one library (only one playlist per config in v1). See `future/secondary-playlists.md`.
- Songs that don't exist in any source catalog (the YT2MP3 workflow). See `future/manual-imports.md`.
- Exporting played sets back to Spotify. See `future/set-export.md`.
- Tagging help (energy/vibe metadata). See `future/tagging-assistance.md`.
- Graphical UI. CLI only in v1. See `future/ui-app.md`.
- Multiple independent libraries (separate roots, separate configs). One library per install in v1, but the DB schema and storage location are designed so adding more later is additive. See `future/multi-library.md`.
- Auto-retry of `needs_manual` records. Once marked, only an explicit `import` resolves it.
- Match-quality safeguards (duration check, candidate-list selection). Discussed as a future iteration on top of v1's auto-pick.

## Stack

- **Language / runtime:** Node.js (>= 20) + TypeScript.
- **Package layout:** single CLI binary, published as a single npm package. Modules organized by concern (`spotify/`, `backend/`, `db/`, `cli/`, `config/`, `tagging/`).
- **Key dependencies (anticipated):**
  - Spotify Web API client (e.g. `@spotify/web-api-ts-sdk`)
  - `yt-dlp` invoked as a subprocess (binary must be on PATH; tool checks at startup)
  - `better-sqlite3` for the state DB
  - `node-id3` for ID3 write/read (chosen in WES-12: direct MP3 ID3 writes, APIC support, custom `TXXX` frames, and a small dependency surface)
  - A CLI framework — `commander` or similar
  - Each new dependency gets a one-line rationale in the commit that adds it (per `AGENTS.md` security guidance).

## Sources

**v1 syncs from one Spotify playlist**, identified by URL or ID in config. Liked Songs, multiple Spotify playlists, and non-Spotify sources (Apple Music, manual) are deferred — but the DB and core internals are designed source-agnostically so adding them later is additive. See `future/multi-source.md` and `future/manual-imports.md`.

## Auth

- Spotify OAuth user authorization flow (PKCE).
- User runs `spotify-sync auth` once. Browser opens for consent. Refresh token cached at `~/.config/spotify-sync/auth.json` with `0600` permissions.
- Required scopes: `playlist-read-private`, `playlist-read-collaborative` (in case the user later points at a collaborative playlist).
- A Spotify developer app must be registered by the user. App credentials (client ID, client secret) go in config or env vars. Document this in the README.

## Download backend

**Pluggable interface from day 1.** v1 ships one backend implementation; the abstraction matters because the YouTube path is the most likely thing to need swapping.

Backend interface (illustrative):
```ts
interface DownloadBackend {
  name: string;
  search(query: { artist: string; title: string; durationMs?: number }): Promise<Candidate[]>;
  download(candidate: Candidate, opts: { outPath: string; format: AudioFormat }): Promise<DownloadResult>;
}
```

v1 implementation: `yt-dlp` shelling out, default search restricted to YouTube Music. Always picks the top candidate. Logs the chosen candidate (URL, source, duration) into the DB for traceability.

## File layout

- Library root: configured path (e.g. `~/Music/wcs-library/`).
- Files placed flat at `<library>/<artist> - <title>.<ext>`.
  - Sanitize: strip filesystem-illegal characters (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`), collapse whitespace.
  - Artist = the first artist in Spotify's `artists[]`. (Featured artists go in ID3 tags, not the filename, to keep names short for VDJ.)
- **Collision rule:** if a sanitized name already exists in the DB for a *different* `(source, source_id)`, append ` [<short-source-id>]` before the extension (first 8 chars of the source ID). Document in `status` output when this fires.
- **The tool never renames a file after first write.** Period. If the user wants a different name, they delete the row + file and re-sync — by hand, not via the tool.

## Audio format / quality

- Configurable. Default: `mp3` @ `320 kbps CBR`.
- Other supported values in v1: `mp3` (other bitrates), `m4a` (passthrough where possible).
- Transcoding (when needed) handled by `yt-dlp`/`ffmpeg`. `ffmpeg` must be on PATH; checked at startup.

## ID3 tagging

After download, **overwrite tags from Spotify metadata** (yt-dlp's output is messy):
- `TPE1` artist (first artist only, matching the filename convention)
- `TPE2` album artist (joined `;` if multiple)
- `TIT2` title
- `TALB` album
- `TYER` / `TDRC` year (from album release date)
- `TRCK` track number (if available)
- `APIC` album art — fetch the largest image from Spotify's album object, embed inline. Cache by album ID to avoid refetching across tracks on the same album.
- Two custom tags for recoverable identity if the DB is ever lost:
  - `TXXX:SyncSource` — e.g. `spotify`.
  - `TXXX:SyncSourceID` — the external ID within that source.

## State (SQLite)

Single global DB file shared across all of the user's libraries (v1 has one library, but the DB design is multi-library-ready). Default location: `$XDG_DATA_HOME/spotify-sync/db.sqlite`, which on macOS resolves to `~/.local/share/spotify-sync/db.sqlite` (the tool creates the directory if missing).

Override via:
- `data_dir` in config — points at a directory that holds `db.sqlite`.
- `--db-path` CLI flag for ad-hoc runs (tests, debugging, ops on a specific snapshot).
- `SPOTIFY_SYNC_DB_PATH` env var.

The DB is **not** placed inside the library dir, so it isn't tied to a single library's filesystem lifecycle. Backup of the DB is the user's responsibility — recommend pointing their backup tooling at `~/.local/share/spotify-sync/` alongside the music library. The DB is small (KB-MB range) and trivially restorable from Spotify + the library files on disk if lost (track files carry a `TXXX:SpotifyTrackID` tag — see "ID3 tagging").

### Multi-library readiness

Every track / sync row is scoped to a `library_id` (string). v1 has exactly one library, with a default `library_id` of `"default"` (configurable via `library.id` in config). Future multi-library work adds more rows with different `library_id` values — no schema migration needed.

### Source-agnostic schema

v1 only knows about Spotify, but Spotify is not the only future source — the tool will eventually sync from other sources (Apple Music, manually-acquired songs that don't live in any catalog, etc.). To avoid a painful migration later, **identity in the DB is not tied to Spotify.** Each track has a synthetic PK and a `(source, source_id)` pair that names where the track came from.

For v1 every row will have `source = 'spotify'`. That's fine — the abstraction costs almost nothing in v1 and removes a structural migration when new sources land.

### Tables (illustrative)

```sql
CREATE TABLE libraries (
  id              TEXT PRIMARY KEY,            -- e.g. "default", "wcs", "personal"
  path            TEXT NOT NULL,               -- absolute library root
  created_at      TEXT NOT NULL
);

CREATE TABLE tracks (
  id              INTEGER PRIMARY KEY,         -- synthetic, local to this DB
  library_id      TEXT NOT NULL REFERENCES libraries(id),
  source          TEXT NOT NULL,               -- 'spotify' in v1; 'apple-music', 'manual', etc. later
  source_id       TEXT,                        -- external id within `source`; nullable for source='manual'
  artist          TEXT NOT NULL,
  title           TEXT NOT NULL,
  album           TEXT,
  release_year    INTEGER,
  duration_ms     INTEGER,
  source_added_at TEXT,         -- when the track joined the source playlist
  status          TEXT NOT NULL CHECK (status IN (
                    'pending', 'downloaded', 'failed', 'needs_manual', 'removed_from_source'
                  )),
  file_path       TEXT,          -- path RELATIVE TO libraries.path; NULL until downloaded
  backend         TEXT,          -- which backend handled the download
  backend_source  TEXT,          -- e.g. YouTube URL chosen
  last_error      TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,  -- per-sync-run attempt count; see "Sync semantics"
  first_seen_at   TEXT NOT NULL,
  last_synced_at  TEXT NOT NULL,
  downloaded_at   TEXT,
  UNIQUE (library_id, source, source_id)        -- prevents dup-within-library when source_id is set
);

CREATE TABLE sync_runs (
  id              INTEGER PRIMARY KEY,
  library_id      TEXT NOT NULL REFERENCES libraries(id),
  source          TEXT NOT NULL,
  started_at      TEXT NOT NULL,
  finished_at     TEXT,
  added           INTEGER NOT NULL DEFAULT 0,
  downloaded      INTEGER NOT NULL DEFAULT 0,
  failed          INTEGER NOT NULL DEFAULT 0,
  removed_marked  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY
);
```

Notes:
- `tracks.file_path` is **relative to `libraries.path`**, not absolute. This means the user can move a library directory without breaking the DB — only the `libraries.path` row needs updating. The tool composes the absolute path at read time.
- `tracks.attempts` is a **per-sync-run** counter, not lifetime. Reset to 0 when a sync begins processing a row; incremented per download attempt within that run. Lifetime counts (if ever needed) live in `sync_runs`.
- `UNIQUE (library_id, source, source_id)` prevents tracking the same external track twice in the same library. The same track can legitimately appear in two libraries (two rows, same `source`/`source_id`, different `library_id`).
- For `source = 'manual'` (a future feature), `source_id` may be `NULL`. SQLite treats multiple `NULL`s in a UNIQUE constraint as distinct, so manual rows don't collide on uniqueness — desired behavior.
- The `status` column is enforced at the DB level via `CHECK`. Adding new statuses is a migration.
- Cross-source dedup ("this Spotify song is the same as that Apple Music song") is **not** in v1's data model. If it becomes needed, add a `canonical_track_id INTEGER REFERENCES tracks(id)` column to group rows. Don't pre-build it.
- The tool must run `PRAGMA foreign_keys = ON` on every connection — SQLite doesn't enforce FKs by default.

Status lifecycle:
- `pending` — known in Spotify, not yet downloaded.
- `downloaded` — file exists at `file_path` and was tagged.
- `failed` — exceeded retry budget in a sync.
- `needs_manual` — placeholder. Reserved for v1 surface, but in v1 a download either succeeds or fails. (Used by future match-quality safeguards.)
- `removed_from_source` — was in the playlist before, no longer is. File untouched until `prune`.

## Sync semantics

`spotify-sync sync` runs the following pipeline, idempotently:

1. Fetch the configured playlist's track list from Spotify (paginated).
2. For each track:
   - If unknown → insert as `pending`, set `first_seen_at`.
   - If known → update `last_synced_at` and refresh metadata fields (artist, title, album, year) in case Spotify changed them. **Do not** rename files even if metadata changes.
3. Mark any DB tracks not present in this fetch as `removed_from_source` (unless already `downloaded` and missing only this run — same effect, just status change).
4. For each `pending` track, reset `attempts` to 0 and queue a download. Run up to `concurrency` (default 3) downloads in parallel.
5. On each download:
   - Search via configured backend.
   - Top result → download to a temp path.
   - Transcode if needed.
   - Write ID3 tags from Spotify metadata.
   - Move atomically to final path *within the library root*.
   - Update DB row to `downloaded`, populate `file_path` (relative to `libraries.path`), `backend`, `backend_source`, `downloaded_at`.
6. Retries: each `pending` row gets up to `retry_count` (default 3) attempts *within the current sync*. `attempts` increments per try. On exceeding the budget, mark `failed` with `last_error` set. Subsequent syncs do **not** auto-retry `failed` rows; user must explicitly retry (out of v1 — manual workaround: delete the row).
7. Exit code:
   - `0` — all `pending` items downloaded successfully (and no failures introduced).
   - `1` — sync completed but with at least one `failed` row.
   - `2` — fatal error (auth, no network, no backend binary, etc.).

## Commands

```
spotify-sync auth                          # one-time OAuth flow
spotify-sync sync                          # the main loop (fetch + download)
spotify-sync status [--json]               # summary + list of failed / removed / pending
spotify-sync prune [--dry-run]             # confirm-then-delete files for removed_from_source rows
spotify-sync import <file> --for <track-id> [--move]
                                           # resolve a track manually (file already exists, OR you have
                                           # a corrected version). Default: copy. --move: move the file in.
                                           # Tool re-tags the file and updates the DB row.
```

All commands accept `--json` for machine-readable output.

## Output format

- Human-readable: short, colored, terminal-friendly. Concrete: one line per state transition during sync; summary at the end.
- `--json`: structured object per command. Schema documented per-command in the implementation.
- Logs (verbose subprocess output from yt-dlp/ffmpeg) go to `~/.local/state/spotify-sync/logs/<run-id>.log`. Console shows summary, not the raw subprocess noise.

## Config

`~/.config/spotify-sync/config.json` (XDG-respecting; `$XDG_CONFIG_HOME` honored).

Schema (v1):

```json
{
  "spotify": {
    "client_id": "...",
    "client_secret": "...",
    "playlist_url": "https://open.spotify.com/playlist/..."
  },
  "library": {
    "id": "default",                   // logical library id; rows in DB are scoped to this
    "path": "/Users/sagiv/Music/wcs-library"
  },
  "data_dir": null,                    // null = use $XDG_DATA_HOME/spotify-sync/ (~/.local/share/spotify-sync/)
  "db_path": null,                     // null = derive from data_dir as <data_dir>/db.sqlite; explicit path overrides
  "download": {
    "backend": "yt-dlp",
    "format": "mp3",
    "bitrate_kbps": 320,
    "concurrency": 3,
    "retry_count": 3,
    "search_source": "youtube-music"   // backend-specific
  },
  "logging": {
    "level": "info"
  }
}
```

Every config field is overridable via env var (`SPOTIFY_SYNC_<UPPER_SNAKE>`) and CLI flag (`--library-path`, etc.). Precedence: CLI flag > env var > config file > defaults.

## Testing requirements

Per `AGENTS.md`: every behavior shipped has tests.

- **Unit:** filename sanitization, status-transition logic, config merge precedence, DB migrations, ID3 tag application.
- **Integration:**
  - Spotify client wrapped behind an interface; tests use a recorded-response fixture (no live API calls in CI).
  - Backend tests use a fake backend implementation; one optional live-network test gated behind an env var for sanity-checking yt-dlp wiring locally.
  - End-to-end `sync` test against an in-memory SQLite + fake Spotify + fake backend exercising the full pipeline (new song → downloaded; removed song → marked; failure → marked failed after retries).

## Security notes

- Spotify client secret and refresh token are on-disk in `~/.config/spotify-sync/`. Files must be `0600`. No copies to logs, ever.
- `yt-dlp` and `ffmpeg` are external binaries — version drift is a supply-chain concern. The tool should print detected versions on `spotify-sync status` to make incident triage easy.
- Album art is fetched from Spotify-provided URLs only (no arbitrary URL fetching).
- New runtime dependencies must come with a one-line rationale per `AGENTS.md`.

## Open questions

- Should `prune` also offer a "move to trash" mode rather than hard-delete, to make recovery easier? Lean yes; cheap to add. Decide during implementation.
- Album art: embed only, or also save sidecar `cover.jpg`? Embed-only for v1 unless a clear reason emerges.
- `removed_from_source` tracks whose file was *also* manually deleted: do we keep the row forever, or garbage-collect after N days? v1: keep forever; user can edit DB if it gets noisy.
- Should v1 ship a `library register` / `library list` command surface even though only one library is in use? Lean no — wait for `future/multi-library.md` to drive command surface. v1 auto-registers the configured library on first run.
