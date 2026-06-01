# Integration Test Suite

The integration suite runs the real `spotify-sync` binary end-to-end against live
Spotify and a hermetic fake yt-dlp (by default).  It exercises CLI wiring,
Spotify API calls, DB writes, and file placement in a way that unit tests cannot.

---

## Quick start (local)

```bash
# 1. Authenticate once (opens a browser)
spotify-sync auth

# 2. Export the access_token (valid 1 hour; does NOT touch the GitHub secret)
source <(node scripts/export-test-token.js)

# 3. Set Spotify app credentials and playlist URLs
export SPOTIFY_CLIENT_ID=<your-app-client-id>
export SPOTIFY_CLIENT_SECRET=<your-app-client-secret>
export SPOTIFY_PLAYLIST_URL=<FULL-playlist-url>
export SPOTIFY_PLAYLIST_URL_SUBSET=<SUBSET-playlist-url>

# 4. Run with fake yt-dlp (fast, no real downloads)
npm run test:integration

# 5. Optionally: run with real yt-dlp / ffmpeg (requires both on PATH)
INTEGRATION_REAL_DOWNLOADS=1 npm run test:integration
```

**Important**: always use `scripts/export-test-token.js` (step 2) for local runs.
It exports `INTEGRATION_SPOTIFY_ACCESS_TOKEN` so setup.ts uses the token directly
without calling Spotify's refresh endpoint.  Calling the refresh endpoint locally
would rotate the refresh token and break the GitHub CI secret for the next run.

`npm run test:integration` builds the project first (`npm run build`) so the
spawned binary is always current.

---

## Auth strategy: why the split between local and CI

Spotify **rotates PKCE refresh tokens** on every call to the token endpoint —
each refresh issues a new `refresh_token` and revokes the previous one.

If local test runs called the refresh endpoint with the same token stored in the
GitHub secret, the secret would go stale after one local run, breaking all
subsequent CI runs.

The fix is a clean separation:

| Context | Token source | Calls refresh endpoint? |
|---|---|---|
| **Local dev** | `scripts/export-test-token.js` reads `access_token` from `auth.json` | **No** — uses the token directly |
| **CI** | `Refresh Spotify token` workflow step refreshes once, stores result in `GITHUB_ENV` | **Yes** — but only once per run, and the step self-updates the GitHub secret if Spotify returns a new one |

Both contexts then pass `INTEGRATION_SPOTIFY_ACCESS_TOKEN` to `setup.ts`, which
writes it to a temp file shared by all test workers.  No test worker ever calls
the Spotify token endpoint directly.

## Required environment variables

### Local development

| Variable | Source |
|---|---|
| `INTEGRATION_SPOTIFY_ACCESS_TOKEN` | Set automatically by `source <(node scripts/export-test-token.js)` |
| `INTEGRATION_SPOTIFY_ACCESS_TOKEN_EXPIRES_AT` | Set automatically by the same script |
| `SPOTIFY_CLIENT_ID` | Your Spotify developer dashboard |
| `SPOTIFY_CLIENT_SECRET` | Your Spotify developer dashboard |
| `SPOTIFY_PLAYLIST_URL` | The FULL test playlist URL |
| `SPOTIFY_PLAYLIST_URL_SUBSET` | The SUBSET test playlist URL |

### CI (GitHub Actions)

| Variable | Type | Notes |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | Secret | App client ID |
| `SPOTIFY_CLIENT_SECRET` | Secret | App client secret |
| `SPOTIFY_REFRESH_TOKEN` | Secret | PKCE refresh token (see below) |
| `GH_SECRETS_PAT` | Secret | Fine-grained PAT with **Secrets: write** on this repo (needed to self-update `SPOTIFY_REFRESH_TOKEN` after rotation) |
| `SPOTIFY_PLAYLIST_URL` | Variable | FULL playlist URL |
| `SPOTIFY_PLAYLIST_URL_SUBSET` | Variable | SUBSET playlist URL |

The global setup (`tests/integration/setup.ts`) validates the always-required
vars at startup and fails loudly if they're missing.

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

## Minting a Spotify refresh token (for CI)

1. Make sure `spotify-sync` is configured (set `SPOTIFY_SYNC_SPOTIFY_CLIENT_ID` etc.
   or write a `config.json`).
2. Run `spotify-sync auth` and complete the browser flow.
3. Copy `refresh_token` from `~/.config/spotify-sync/auth.json`.
4. Set it as the `SPOTIFY_REFRESH_TOKEN` GitHub Actions secret.

The CI workflow's `Refresh Spotify token` step will call the token endpoint and
auto-update the secret if Spotify rotates it (requires `GH_SECRETS_PAT`).

**Do not** use this refresh_token for local test runs — use `scripts/export-test-token.js` instead.

---

## GitHub Actions secrets setup

In **Settings → Secrets and variables → Actions**:

| Name | Type | Notes |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | Secret | App client ID |
| `SPOTIFY_CLIENT_SECRET` | Secret | App client secret |
| `SPOTIFY_REFRESH_TOKEN` | Secret | PKCE refresh token — see "Minting" above |
| `GH_SECRETS_PAT` | Secret | Fine-grained PAT, **Secrets: write** on this repo — allows the CI workflow to self-update `SPOTIFY_REFRESH_TOKEN` after Spotify rotates it |
| `SPOTIFY_PLAYLIST_URL` | Variable | FULL playlist URL (non-sensitive) |
| `SPOTIFY_PLAYLIST_URL_SUBSET` | Variable | SUBSET playlist URL (non-sensitive) |

`GH_SECRETS_PAT` is optional but strongly recommended: without it, any Spotify
token rotation will require a manual `SPOTIFY_REFRESH_TOKEN` update.

---

## Known limitations

- **Fork PRs**: GitHub does not expose secrets to fork pull requests.  The
  integration job is skipped on fork PRs (`if: github.event.pull_request.head.repo.full_name == github.repository`).
- **Network coupling**: the suite depends on Spotify API availability.  Transient
  network errors will fail tests that don't retry — re-run the job.
- **Token rotation without `GH_SECRETS_PAT`**: If Spotify rotates the refresh token
  and `GH_SECRETS_PAT` is not set, the CI workflow will warn but not update the secret.
  The next CI run will fail with `400 invalid_grant`.  Fix: update `SPOTIFY_REFRESH_TOKEN`
  manually (by re-running `spotify-sync auth` and copying the new token), or add `GH_SECRETS_PAT`.

---

## Deferred: fake Spotify server

A fake Spotify HTTP server for fully hermetic testing would require a base-URL
override in `src/spotify/` (the API base is embedded in `@spotify/web-api-ts-sdk`
and the token URLs are hardcoded constants).  This is not built in v1 because
real Spotify (read-only) covers all AC scenarios and the production change is
not worth it without a concrete forcing function.  Revisit if:
- Spotify API flakiness makes CI unreliable, OR
- A test scenario requires dynamic playlist mutation that static snapshots can't proxy.
