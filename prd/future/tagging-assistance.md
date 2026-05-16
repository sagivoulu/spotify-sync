# Future — Tagging Assistance

> Status: **not in v1.** This is a stub — direction is intentionally fuzzy.

## Problem

The DJ tags every song in VirtualDJ with energy and vibe metadata, by hand. This is the slowest part of library prep. There may be ways the tool can help — but the shape isn't clear yet.

## Possible directions (not committed)

- **Surface untagged songs.** `spotify-sync status` knows what's downloaded; if it could read VDJ's tag store, it could report which songs are still missing tags. Read-only — VDJ owns writes.
- **Suggest tags.** Use Spotify audio features (energy, danceability, tempo, valence, mode) as a hint for the user's manual tagging. The tool wouldn't write VDJ tags; it would just produce a report or a sidecar file the user references while tagging.
- **AI-assisted vibe guess.** Long shot. Audio analysis + an LLM to suggest a category. Speculative.

## Hard constraints (carried over from product overview)

- The tool must not modify or rename library files for any tagging concern.
- VDJ remains the source of truth for energy/vibe tags as long as the user uses VDJ for tagging.

## Open questions

- Where does VDJ store tag metadata? Sidecar XML? Embedded ID3 frames? A central database? Need to investigate before this PRD becomes concrete.
- Is Spotify's `audio-features` endpoint sufficient signal? It's a coarse proxy at best.
- Should the tool ever *write* VDJ tags directly? Probably no — the brittleness risk is high and there's no compelling win.
