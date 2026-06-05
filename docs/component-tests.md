# Component Test Suite

The component suite runs the real `spotify-sync` binary end-to-end as a subprocess
and asserts on the resulting DB state and file system — exactly as a user would invoke
it — but replaces every external dependency with a local fake:

| Dependency | Replacement |
|---|---|
| Spotify API | Local Node.js HTTP server (started by the test harness) |
| yt-dlp | Fake binary on `PATH` that copies `silence.mp3` as the "download" |
| ffmpeg | Fake binary on `PATH` that responds to `-version` only |

**No credentials, no network, no secrets required.** The suite runs identically
locally and in CI.

---

## Quick start

```bash
npm run test:component
```

`npm run test:component` builds the project first (`npm run build`) so the binary
is always current.

To use the real yt-dlp and ffmpeg instead of the fakes:

```bash
COMPONENT_REAL_DOWNLOADS=1 npm run test:component
```

---

## How it works

### Fake Spotify server

`tests/component/helpers/fake-spotify-server.ts` starts a `http.createServer` on
a random port. It serves two predefined playlists:

| Playlist ID | URL used in tests | Tracks |
|---|---|---|
| `testplayfull` | `https://open.spotify.com/playlist/testplayfull` | 3 (testtrack1, testtrack2, testtrack3) |
| `testplaysubset` | `https://open.spotify.com/playlist/testplaysubset` | 2 (testtrack1, testtrack2) |

The binary is redirected to this server via `SPOTIFY_SYNC_SPOTIFY_BASE_URL`, which
triggers a URL-rewrite seam in `src/spotify/client.ts` (`wrappedFetch`) that rebases
all API calls from `https://api.spotify.com` to the configured origin.

### Test isolation

Each test gets its own sandbox directory (`tests/component/helpers/sandbox.ts`):
a `mkdtempSync` scratch root with isolated `XDG_CONFIG_HOME`, `XDG_DATA_HOME`,
`XDG_STATE_HOME`, library dir, and DB path. The sandbox is removed in `afterEach`.

### Auth

`seed-auth.ts` writes a fake `auth.json` with a non-expired token (`expires_at`
24 hours from now). The binary's proactive-refresh guard never fires, so the token
endpoint at `accounts.spotify.com` is never called.

---

## Flows covered

| Test file | Flow |
|---|---|
| `doctor.test.ts` | `doctor --json` — all 5 checks pass; Spotify check hits fake server |
| `sync.test.ts` | `sync --json` — tracks downloaded, DB rows created, files placed |
| `idempotency.test.ts` | Second `sync` — `downloaded === 0`, no re-placement |
| `prune.test.ts` | Sync FULL → prune with SUBSET URL → track-3 file trashed |
| `import.test.ts` | Sync → set track-1 to `needs_manual` → `import` → file restored |
| `status.test.ts` | Sync → manual files added/deleted → `status`, `status --list`, `status --json` report missing vs untracked correctly |

---

## Production seam

The component tests required one small change to production code: an optional
`spotify.base_url` config field (`SPOTIFY_SYNC_SPOTIFY_BASE_URL` env var) that
causes `wrappedFetch` in `src/spotify/client.ts` to rewrite the origin of Spotify
API calls. The field is absent in all production configs and defaults to no-op.

---

## CI

The `component` job in `.github/workflows/ci.yml` runs `npm run test:component`
with no environment variables or secrets. It runs on every PR — including forks —
because it requires no credentials.
