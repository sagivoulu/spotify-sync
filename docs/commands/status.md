# status

Show a summary of your setup health and library state: how many tracks have been
downloaded, how many are pending, and whether any are missing from disk or have failed.

## Usage

```
spotify-sync status [options]
```

## Options

| Flag | Default | Description |
|---|---|---|
| `--list` | `false` | List individual problem tracks by section (not downloaded, missing files, failed). |
| `--json` | `false` | Output as JSON. |

## What it reports

**Setup** — whether config, auth, and Spotify connectivity are healthy. If any check
fails, points you to `spotify-sync doctor` for details.

**Playlist** — your playlist name and total track count (fetched live from Spotify).
Falls back to the last-synced count when offline, or "unknown" if never synced.

**Library** — counts broken down by state:

| State | Meaning |
|---|---|
| Downloaded | Tracks with a local file present on disk. |
| Not yet synced | Tracks in the playlist that haven't been downloaded yet. |
| Pending download | Tracks queued for the next sync run. |
| Missing files | Tracks recorded as downloaded in the DB, but whose file is gone from disk. |
| Failed | Tracks that failed to download after all retries. |
| Needs manual | Tracks that require a manual `import` step. |

Also shows the library directory path and database file path.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | All setup checks passed (config, auth, Spotify connectivity). Does not guarantee the library is complete — tracks may still be pending or missing. |
| `1` | One or more setup checks failed. Run `spotify-sync doctor` for details. |

## Example output

```
Setup:    ✓ everything looks good

Playlist: "WCS Social Mix" — 142 tracks on Spotify
Library:  /Users/you/Music/wcs
Database: /Users/you/.local/share/spotify-sync/db.sqlite

  Downloaded:       137 / 142
  Not yet synced:   3   (in playlist, not yet in library — run `sync`)
  Missing files:    1
  Failed:           1
```

Counts with a value of zero are omitted from the output.

## With `--list`

```bash
spotify-sync status --list
```

Prints the individual tracks under each problem section:

```
Not downloaded (3):
  - Artist One — Track Title
  - Artist Two — Another Track
  - Artist Three — Yet Another

Missing files (1):
  - Seal — Kiss From a Rose

Failed (1):
  - Earth, Wind & Fire — September (yt-dlp: no results found)
```

## Tips

- `status` is read-only — it never writes to the database or downloads anything.
- Use `status` to quickly check the library after a `sync` run.
- If you see "Missing files", the track was downloaded at some point but the file has since
  been moved or deleted. Re-run `sync` to re-download, or use `import` to point to the file
  at its new location.
