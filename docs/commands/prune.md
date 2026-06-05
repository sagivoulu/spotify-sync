# prune

Review tracks that have been removed from your Spotify playlist and — optionally — move
their local files to the system trash.

Prune never hard-deletes files. It uses the system trash, so files can be recovered if
you change your mind.

## Usage

```
spotify-sync prune [options]
```

## Options

| Flag | Default | Description |
|---|---|---|
| `--dry-run` | `false` | Show what would be moved to trash without actually doing it. |
| `--yes` | `false` | Move files to trash without prompting for confirmation. |
| `--json` | `false` | Output as JSON. |

## What it does

1. Compares local database records against the current Spotify playlist.
2. Identifies tracks that are in the database but no longer in the playlist.
3. Lists those tracks and their local file paths.
4. Without `--yes` or `--dry-run`, prompts: `Move N files to trash? [y/N]`
5. On confirmation (or with `--yes`), moves the files to the system trash.
6. Updates the database to remove the pruned track records.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Prune completed (or nothing to prune, or dry run completed). |
| `1` | Error during prune. |

## Examples

```bash
# See what would be pruned, without touching anything
spotify-sync prune --dry-run

# Prune with interactive confirmation prompt
spotify-sync prune

# Prune without prompting (useful in scripts)
spotify-sync prune --yes

# Machine-readable output of what was pruned
spotify-sync prune --yes --json
```

## Example output

```
Tracks removed from playlist (3 files):

  Kiss From a Rose — Seal
    /Users/you/Music/wcs/Kiss From a Rose - Seal.mp3

  September — Earth, Wind & Fire
    /Users/you/Music/wcs/September - Earth Wind & Fire.mp3

  Just the Two of Us — Grover Washington Jr.
    /Users/you/Music/wcs/Just the Two of Us - Grover Washington Jr.mp3

Move 3 files to trash? [y/N] y

Moved 3 files to trash.
```

::: warning Files go to trash, not permanent deletion
`prune` uses the system trash (macOS Trash / Linux trash). You can restore files from
there if you accidentally prune something you wanted to keep.
:::
