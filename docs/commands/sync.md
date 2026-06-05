# sync

Fetch your Spotify playlist and download any tracks that are not yet in your local library.
Running sync repeatedly is safe — it only downloads tracks you don't already have.

## Usage

```
spotify-sync sync [options]
```

Global flags `--library-path` and `--db-path` are also accepted — see
[Configuration](/configuration#cli-flag-overrides).

## Options

| Flag | Default | Description |
|---|---|---|
| `--json` | `false` | Output a single JSON object instead of per-event lines. |

## What it does

1. Loads your config and authentication token.
2. Fetches the full track list from your configured Spotify playlist.
3. Compares playlist tracks against the local database to find what's missing.
4. Downloads each pending track via `yt-dlp`, converting to the configured format (default MP3 320 kbps).
5. Records each successful download in the local SQLite database.

Downloads run concurrently up to `download.concurrency` (default `3`) parallel tracks.
Each failed track is retried up to `download.retry_count` (default `3`) times before
being marked as failed.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | All pending tracks downloaded successfully (or nothing was pending). |
| `1` | Sync completed but at least one track failed after all retries. |
| `2` | Fatal error — missing authentication, no network connectivity, or a required binary (`yt-dlp`, `ffmpeg`) is not on PATH. |

## Example output

```
Logging to /Users/you/.local/state/spotify-sync/logs/abc123.log
Library: /Users/you/Music/wcs
Syncing: 5 pending, 2 new, 0 removed (concurrency: 3)
✓ Seal — Kiss From a Rose (yt-dlp)
✓ Stevie Wonder — Superstition (yt-dlp)
✓ Earth, Wind & Fire — September (yt-dlp)
✓ Bill Withers — Ain't No Sunshine (yt-dlp)
✓ Grover Washington Jr. — Just the Two of Us (yt-dlp)

Done. added=2 downloaded=5 failed=0 removed=0
```

If a track fails after all retries it shows as:

```
✗ Artist — Title failed after 3 attempt(s): <error message>
```

## Tips

- Run `spotify-sync doctor` first to confirm all dependencies and credentials are working.
- If sync exits with code `1`, run `spotify-sync status --list` to see which tracks failed
  and their error messages.
- To download to a different library directory for a single run, use `--library-path`:
  ```bash
  spotify-sync --library-path /tmp/test-lib sync
  ```
