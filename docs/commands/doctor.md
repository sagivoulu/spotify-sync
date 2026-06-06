# doctor

Run a pre-flight checklist: verify your config, authentication, Spotify connectivity, and
external binaries. Use this before your first sync or whenever something seems wrong.

## Usage

```
spotify-sync doctor [options]
```

## Options

| Flag | Default | Description |
|---|---|---|
| `--json` | `false` | Output results as JSON. |

## Checks

Doctor runs five checks in order. Later checks are skipped if an earlier required check fails.

| Check | Depends on | What it verifies |
|---|---|---|
| **Config** | — | Config file loads and all required fields are present. |
| **Auth** | Config | `auth.json` exists and contains a valid token. |
| **Spotify** | Config + Auth | Live connectivity: fetches playlist name, track count, and a sample of tracks. |
| **yt-dlp** | — | `yt-dlp` is on PATH and meets the minimum version (`2026.01.01`). |
| **ffmpeg** | — | `ffmpeg` is on PATH. |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | All checks passed. |
| `1` | One or more checks failed or were skipped. |

## Example output

```
✓ Config      client_id, client_secret, playlist_url, library.path present
✓ Auth        Token valid, expires in 45 min
✓ Spotify     "WCS Social Mix" · 142 tracks
✓ yt-dlp      2026.04.30
✓ ffmpeg       6.1.1

All checks passed.
```

## Example output (failure)

```
✓ Config      client_id, client_secret, playlist_url, library.path present
✓ Auth        Token valid, expires in 45 min
✓ Spotify     "WCS Social Mix" · 142 tracks
✗ yt-dlp      not found on PATH

  Install instructions:
    macOS:  brew install yt-dlp
    Linux:  pipx install yt-dlp
    Any:    https://github.com/yt-dlp/yt-dlp/releases/latest

✓ ffmpeg       6.1.1

1 check failed.
```

## JSON output

```bash
spotify-sync doctor --json
```

```json
{
  "ok": false,
  "checks": [
    { "name": "Config",  "ok": true,  "detail": "client_id, client_secret, playlist_url, library.path present" },
    { "name": "Auth",    "ok": true,  "detail": "Token valid, expires in 45 min" },
    { "name": "Spotify", "ok": true,  "detail": "\"WCS Social Mix\" · 142 tracks" },
    { "name": "yt-dlp",  "ok": false, "detail": "not found on PATH" },
    { "name": "ffmpeg",  "ok": true,  "detail": "6.1.1" }
  ]
}
```

## Tips

- Always run `doctor` after initial setup and again after upgrading yt-dlp.
- yt-dlp below version `2026.01.01` is treated as missing because older versions are
  blocked by YouTube bot detection and will fail silently. Upgrade with
  `yt-dlp -U` or `brew upgrade yt-dlp`.
- If the Spotify check fails, your refresh token may have expired. Re-run
  `spotify-sync auth` to get a fresh token.
