# Future — Manual Imports (Songs Not in Any Catalog)

> Status: **not in v1.** This is a stub. Update when promoted to active scope.

## Problem

Some songs the user owns aren't on Spotify (and may not be on Apple Music or any catalog the tool ever syncs from). Today they're downloaded manually (e.g. via youtube2mp3.com) and dropped into the library by hand. The DB has no idea they exist, so:

- `status` doesn't show them.
- They're not part of any future per-playlist or per-library organization.
- If/when set export ships, songs the DJ played that aren't in a synced source can't be exported automatically — but at least the tool would *know* they were played.

## Rough direction

- The v1 schema already supports this: rows with `source = 'manual'` and a nullable `source_id`. No schema migration needed; the feature is *enabling* a new value in an existing column.
- New command, separate from v1's `import` (which resolves a `needs_manual` row): `spotify-sync add-local <file> [--artist X --title Y] [--library <id>]`. Reads ID3 tags if present, falls back to flags. Moves/copies file into the library, re-tags consistently, records in DB with `source='manual'`.
- Possibly a "claim from inbox" workflow: drop files into `<library>/_inbox/`, run `spotify-sync scan-inbox`, tool prompts for missing metadata interactively.

## Open questions

- How do these rows interact with set-export? They have no source-side identity. Closest-match search against Spotify (or whatever target the export uses), with a confirm step, is the obvious answer.
- Duplicate detection between a manual row and a later-discovered catalog version of the same song: out of scope until cross-source dedup is needed for something concrete (see the `canonical_track_id` note in `01-download-sync.md`).

## Dependencies / interactions

- **No DB migration required.** v1's source-agnostic schema already accommodates this.
