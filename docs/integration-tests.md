# Integration Test Suite

The integration suite runs the real `spotify-sync` binary end-to-end against live
Spotify and a hermetic fake yt-dlp (by default).  It exercises CLI wiring,
Spotify API calls, DB writes, and file placement in a way that unit tests cannot.

---

## Quick start (local)

```bash
# Export credentials
export SPOTIFY_CLIENT_ID=<your-app-client-id>
export SPOTIFY_CLIENT_SECRET=<your-app-client-secret>
export SPOTIFY_REFRESH_TOKEN=<see "Minting a refresh token" below>
export SPOTIFY_PLAYLIST_URL=<FULL-playlist-url>
export SPOTIFY_PLAYLIST_URL_SUBSET=<SUBSET-playlist-url>

# Run with fake yt-dlp (fast, no real downloads)
npm run test:integration

# Run with real yt-dlp / ffmpeg (requires both on PATH)
INTEGRATION_REAL_DOWNLOADS=1 npm run test:integration
```

`npm run test:integration` builds the project first (`npm run build`) so the
spawned binary is always current.

---

## Required environment variables

| Variable | Where it comes from | Description |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | Spotify developer dashboard | App client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify developer dashboard | App client secret (required by config schema, unused at runtime for PKCE) |
| `SPOTIFY_REFRESH_TOKEN` | Obtained via `spotify-sync auth` | Long-lived refresh token — see below |
| `SPOTIFY_PLAYLIST_URL` | Personal Spotify account | URL of the **FULL** test playlist (≥ 2 tracks) |
| `SPOTIFY_PLAYLIST_URL_SUBSET` | Personal Spotify account | URL of the **SUBSET** test playlist (FULL minus ≥ 1 track) |

The global setup (`tests/integration/setup.ts`) validates all five variables at
startup and fails loudly with the names of any missing vars — no silent skips.

---

## Playlist setup

Create two stable playlists in the personal Spotify account:

- **FULL** — a small fixed set of tracks (≥ 2).  Never remove tracks from this
  playlist once the suite is in use.
- **SUBSET** — the same tracks as FULL **minus at least one**.  The prune test
  syncs against FULL, then runs `prune` with SUBSET to find candidates.

Both playlists must be public or accessible by the app (private playlists work
as long as the refresh token's scopes include `playlist-read-private`).

---

## Minting a refresh token

The suite uses a **static refresh token** stored as a CI secret.  Spotify PKCE
tokens refresh non-interactively (no browser required) — only `client_id` and
`refresh_token` are needed.

To obtain the initial token:

1. Configure `spotify-sync` normally (set `SPOTIFY_SYNC_SPOTIFY_CLIENT_ID`,
   `SPOTIFY_SYNC_SPOTIFY_CLIENT_SECRET`, and `SPOTIFY_SYNC_SPOTIFY_PLAYLIST_URL`,
   or write a `config.json`).
2. Run `spotify-sync auth` and complete the browser flow.
3. Copy the `refresh_token` from `~/.config/spotify-sync/auth.json`.

The token never expires on its own — it's only invalidated if revoked or if
Spotify rotates it on refresh (rare; carry-forward behaviour is the default per
the PKCE spec).  If CI breaks with a 401 auth error, re-run `spotify-sync auth`
and update the `SPOTIFY_REFRESH_TOKEN` GitHub secret.

---

## GitHub Actions secrets

Add these in **Settings → Secrets and variables → Actions**:

| Name | Type | Notes |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | Secret | App client ID |
| `SPOTIFY_CLIENT_SECRET` | Secret | App client secret |
| `SPOTIFY_REFRESH_TOKEN` | Secret | Refresh token (see above) |
| `SPOTIFY_PLAYLIST_URL` | Variable | FULL playlist URL (non-sensitive) |
| `SPOTIFY_PLAYLIST_URL_SUBSET` | Variable | SUBSET playlist URL (non-sensitive) |

The playlist URLs are stored as **Variables** (not Secrets) because they are
non-sensitive.  Secrets and Variables are set under the same Settings page.

---

## Known limitations

- **Fork PRs**: GitHub does not expose secrets to fork pull requests.  The
  integration job is skipped on fork PRs (`if: github.event.pull_request.head.repo.full_name == github.repository`).
- **Network coupling**: the suite depends on Spotify API availability.  Transient
  network errors will fail tests that don't retry — re-run the job.
- **Refresh-token rotation**: Spotify *may* rotate the refresh token during a
  refresh response.  The sandbox `auth.json` is discarded after each test run, so
  CI always re-uses the original static token.  If rotation happens, update the
  `SPOTIFY_REFRESH_TOKEN` secret.

---

## Deferred: fake Spotify server

A fake Spotify HTTP server for fully hermetic testing would require a base-URL
override in `src/spotify/` (the API base is embedded in `@spotify/web-api-ts-sdk`
and the token URLs are hardcoded constants).  This is not built in v1 because
real Spotify (read-only) covers all AC scenarios and the production change is
not worth it without a concrete forcing function.  Revisit if:
- Spotify API flakiness makes CI unreliable, OR
- A test scenario requires dynamic playlist mutation that static snapshots can't proxy.
