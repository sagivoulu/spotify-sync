# Troubleshooting

## yt-dlp not found or below minimum version

**Symptom:** `spotify-sync doctor` reports `yt-dlp: not found on PATH` or flags the
version as too old.

**Why it matters:** spotify-sync requires yt-dlp ≥ `2026.01.01`. Older versions are
blocked by YouTube bot detection and will fail silently — downloads will appear to run
but produce no audio.

**Fix:**

```bash
# macOS
brew install yt-dlp
# or upgrade:
brew upgrade yt-dlp

# Linux (pipx)
pipx install yt-dlp
# or upgrade:
pipx upgrade yt-dlp

# Any platform — standalone binary
# https://github.com/yt-dlp/yt-dlp/releases/latest
yt-dlp -U   # self-update if already installed
```

Verify with:

```bash
yt-dlp --version   # should be 2026.01.01 or later
```

---

## ffmpeg not found

**Symptom:** `spotify-sync doctor` reports `ffmpeg: not found on PATH`.

**Fix:**

```bash
# macOS
brew install ffmpeg

# Debian / Ubuntu
sudo apt install ffmpeg

# Any platform
# https://ffmpeg.org/download.html
```

---

## OAuth redirect URI mismatch

**Symptom:** `spotify-sync auth` opens the browser but the callback fails with an error
like `INVALID_CLIENT: Invalid redirect URI`.

**Cause:** The redirect URI registered in your Spotify app settings doesn't match what
spotify-sync sends.

**Fix:**

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard),
   open your app, and click **Edit settings**.
2. Under **Redirect URIs**, add:
   ```
   http://127.0.0.1:8888/callback
   ```
   Use the literal IP address `127.0.0.1` — not `localhost`. They are treated as
   different strings by Spotify.
3. If you're using a custom port (`--port 9000`), the registered URI must match:
   ```
   http://127.0.0.1:9000/callback
   ```

---

## Port 8888 already in use

**Symptom:** `spotify-sync auth` fails immediately with `address already in use`.

**Fix:** Use a different port and register the matching redirect URI in your Spotify app:

```bash
spotify-sync auth --port 9000
```

Register `http://127.0.0.1:9000/callback` as a redirect URI in your Spotify app settings.

---

## Missing credentials (config not found)

**Symptom:** `spotify-sync doctor` reports Config check failed with a message about
missing `client_id`, `client_secret`, or `playlist_url`.

**Fix:** Create or update `~/.config/spotify-sync/config.json`:

```json
{
  "spotify": {
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "playlist_url": "https://open.spotify.com/playlist/..."
  },
  "library": {
    "path": "/path/to/your/music"
  }
}
```

Alternatively set the environment variables:

```bash
export SPOTIFY_SYNC_SPOTIFY_CLIENT_ID=your_client_id
export SPOTIFY_SYNC_SPOTIFY_CLIENT_SECRET=your_client_secret
export SPOTIFY_SYNC_SPOTIFY_PLAYLIST_URL=https://open.spotify.com/playlist/...
```

---

## Spotify check fails (auth expired)

**Symptom:** `doctor` shows Config and Auth as passing, but the Spotify check fails with
a network or auth error.

**Cause:** The Spotify refresh token has expired or been revoked.

**Fix:** Re-authenticate:

```bash
spotify-sync auth
```

---

## Playlist shown as "unknown" or using stale count

**Symptom:** `spotify-sync status` shows the playlist name as "unknown" or the track
count doesn't match what you see in Spotify.

**Cause:** spotify-sync couldn't reach Spotify (offline or token expired). It falls back
to the last-synced value from the database.

**Fix:** Ensure you have internet connectivity and a valid token (`spotify-sync doctor`),
then re-run `status`.

---

## "Missing files" in status

**Symptom:** `spotify-sync status` shows a non-zero count under "Missing files".

**Cause:** These tracks were recorded as downloaded in the database, but the audio file
is no longer at the recorded path. Common causes: the file was moved, the library
directory was renamed, or an external tool deleted the file.

**Fix (re-download):**

```bash
spotify-sync sync
```

Re-running sync will detect the missing files and queue them for re-download.

**Fix (file was moved to a new path):**

```bash
spotify-sync import /new/path/to/file.mp3 --for <track-id>
```

Use `spotify-sync status --list` to find the track IDs of missing-file tracks.

---

## sync exits with code 1 (partial failure)

**Symptom:** `spotify-sync sync` completes but exits with code `1`, indicating some
tracks failed.

**Fix:**

```bash
# See which tracks failed and their error messages
spotify-sync status --list
```

Common reasons for individual track failures:
- yt-dlp could not find a suitable match on YouTube Music for that track.
- The track's search result was geo-blocked in your region.
- A transient network error — re-running `sync` will retry failed tracks.

---

## sync exits with code 2 (fatal)

**Symptom:** `spotify-sync sync` exits with code `2` immediately.

**Cause:** A fatal error before any downloading started — missing auth, no network, or a
required binary is not on PATH.

**Fix:** Run `spotify-sync doctor` to identify which check is failing.
