# Future — Multiple Libraries

> Status: **not in v1.** This is a stub.

## Problem

A "library" is a self-contained set of local files plus the configuration that drives what gets downloaded into it. Eventually the user may want more than one — for example:

- A personal WCS library and a separate one curated for a specific event.
- A library managed for another DJ (future user) on the same install.
- A test/staging library separate from the real one.

v1 supports exactly one library. The DB is already scoped by `library_id`, so this future feature is purely additive at the data layer.

## Rough direction

- Config grows from a single `library` block to a `libraries` array (or named map):
  ```json
  "libraries": [
    { "id": "default",  "path": "/Users/sagiv/Music/wcs-library",     "source": "spotify-wcs" },
    { "id": "personal", "path": "/Users/sagiv/Music/personal-library","source": "spotify-personal" }
  ]
  ```
- Commands take `--library <id>` to operate on one library at a time. If omitted and only one library is configured, that one is used (v1 behavior). If omitted with multiple libraries, error out.
- New management commands: `library list`, `library add`, `library remove` (DB-only; does not touch files).
- DB schema unchanged — `libraries` table and `library_id` columns are already there in v1.

## v1 implications

- The single library configured in v1 lives in the `libraries` table as one row with `id = 'default'`. No special-casing.
- Core APIs accept a `libraryId` parameter from day one, even though only one value is ever passed. Better than retrofitting later.

## Interaction with related features

- `multi-source.md`: a library can pull from multiple sources. The two features are orthogonal — multi-library is about separate roots, multi-source is about separate catalogs.
- `secondary-playlists.md`: per-library, multiple Spotify playlists feeding the same library root (likely into subdirs). Different again — that's about *within-source* multiplicity, this is about library-level multiplicity.

## Open questions

- Should the `auth` flow be library-scoped or install-wide? Lean install-wide (one Spotify account, used by multiple libraries) but support per-library credentials for the "managing another DJ's library" case.
- DB still global, or per-library DB once multiple libraries exist? Global stays simpler — keeps cross-library reporting cheap and avoids fragmenting state.
