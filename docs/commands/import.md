# import

Import a local audio file as the resolved download for a specific Spotify track. Use this
when you already have a track on disk (e.g. downloaded manually or ripped from CD) and
want spotify-sync to record it without re-downloading.

## Usage

```
spotify-sync import <file> --for <track-id> [options]
```

## Arguments

| Argument | Description |
|---|---|
| `<file>` | Path to the audio file to import. Required. |

## Options

| Flag | Default | Description |
|---|---|---|
| `--for <track-id>` | — | **Required.** The Spotify track ID this file corresponds to. |
| `--move` | `false` | Move the file into the library instead of copying it. |
| `--json` | `false` | Output as JSON. |

## Finding a track ID

The track ID is the part of a Spotify track URL after `/track/`:

```
https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC
                                    ^^^^^^^^^^^^^^^^^^^^^^
                                    this is the track ID
```

You can also find it via `spotify-sync status --list` — failed and missing tracks are
shown with their Spotify track IDs.

## What it does

1. Validates that `<file>` exists and is a readable audio file.
2. Looks up the track by `<track-id>` in your Spotify playlist.
3. By default, **copies** the file into your configured library directory, renaming it
   to match spotify-sync's filename convention.
4. With `--move`, the original file is moved instead of copied (no duplicate on disk).
5. Records the import in the local database so subsequent `sync` runs skip this track.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Import succeeded. |
| `1` | Error — file not found, track ID not in playlist, or DB write failed. |

## Examples

```bash
# Copy a file into the library for a specific track
spotify-sync import ~/Downloads/kiss-from-a-rose.mp3 --for 4uLU6hMCjMI75M1A2tKUQC

# Move the file (no copy left behind)
spotify-sync import ~/Downloads/kiss-from-a-rose.mp3 --for 4uLU6hMCjMI75M1A2tKUQC --move

# Machine-readable output
spotify-sync import ~/Downloads/kiss-from-a-rose.mp3 --for 4uLU6hMCjMI75M1A2tKUQC --json
```
