# Future — Set Export (VDJ → Spotify Playlist)

> Status: **not in v1.** This is a stub.

## Problem

After a social, the DJ wants to share what they played with the community via a Spotify playlist. Doing it manually (creating a playlist, searching each song, adding it) takes too long. Existing web tools that try to automate this still require heavy manual fixing.

## Rough direction

- **Input:** the VDJ history file for a given set (VDJ writes session history to disk; format and location need to be investigated).
- **Pipeline:**
  1. Parse the VDJ history file → list of file paths played, in order, with timestamps.
  2. For each file, resolve to a Spotify track via the local DB (`file_path` → `spotify_id`). This is the killer feature — because every downloaded file in the library is already mapped, the matching problem disappears for the common case.
  3. For files not in the DB (e.g. local-only / non-Spotify songs from the future manual-imports feature), fall back to a Spotify search by artist+title and surface a confirmation step.
  4. Create a new Spotify playlist (configurable name template; e.g. `Sagiv @ <social> — <date>`) and add the resolved tracks in order.
- **Command shape (proposal):** `spotify-sync export-set <vdj-history-file> [--name "..."] [--public|--private]`.
- Required Spotify scope: `playlist-modify-public` / `playlist-modify-private`.

## Why this is much easier with v1 in place

The `<file_path> → spotify_id` mapping in the DB is exactly the data that makes set export tractable. Without it, matching played files back to Spotify is the same painful problem the existing web tools fail at.

## Open questions

- VDJ history file format — needs research before this PRD becomes concrete.
- How to handle songs the DJ played that *aren't* in the DB at all (e.g. an emergency download from earlier that day). Probably the same fallback search + confirm flow.
- Should sets be tracked as first-class entities in the DB (so a played set can be re-exported, edited, etc.)?
