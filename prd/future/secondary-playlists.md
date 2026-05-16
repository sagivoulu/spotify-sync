# Future — Secondary Playlists

> Status: **not in v1.** This is a stub.

## Problem

The user has a secondary Spotify playlist of "DJ mood" songs played between sets / while addressing the crowd. v1 only supports one playlist. Future iterations should support multiple Spotify sources, each downloading to its own directory.

## Rough direction

- Promote `spotify.playlist_url` in config to a list (or named map):
  ```json
  "playlists": [
    { "name": "wcs",  "url": "...", "subdir": "wcs" },
    { "name": "mood", "url": "...", "subdir": "mood" }
  ]
  ```
- File layout becomes `<library>/<subdir>/<artist> - <title>.mp3`. The v1 fixed-layout convention extends naturally — the v1 single-playlist case becomes `subdir: ""`.
- `sync` operates over all configured playlists by default; `sync --playlist <name>` for one.
- DB extends with a `playlist_id` column on `tracks`, or a `track_playlists` join table if a track can belong to multiple playlists (likely worth supporting — same song in WCS *and* mood lists shouldn't be downloaded twice).

## Why not in v1

Adds DB schema and config surface that's wasted effort until the single-playlist case is working end-to-end. But: **v1 should keep the door open** — don't bake the "one playlist" assumption deep into core types when it costs little to keep it general (e.g. file layout could already include an optional subdir even if v1 doesn't use it).

## Relationship to other future features

- **`multi-source.md`** is about multiple *catalogs* (Spotify, Apple Music). This file is about multiple *playlists within one source*.
- **`multi-library.md`** is about multiple *library roots*. A library can later have multiple playlists, possibly from multiple sources — these three axes are orthogonal.

## Open questions

- Per-playlist quality / format overrides? Probably not worth it.
- Shared songs across playlists: keep one file, multiple DB rows? One row, multiple playlist memberships? Latter is cleaner — likely a `track_playlists` join table.
