# Future — Multiple Source Catalogs

> Status: **not in v1.** This is a stub.

## Problem

v1 syncs only from Spotify. The user may later want to:

- Sync from Apple Music (e.g. if a primary playlist moves there).
- Mix sources within one library (some songs from Spotify, some from Apple Music).
- Replace Spotify entirely with a different catalog.

Hardcoding Spotify identity into the DB schema would make this an expensive migration; v1's schema is intentionally source-agnostic to avoid that.

## Rough direction

- A `Source` interface in the core: `listTracks()`, `getTrackMetadata(id)`, maybe `searchByText()` for set-export reverse lookup. Implementations: `SpotifySource` (v1), `AppleMusicSource` (future), etc.
- Config grows from a single `spotify` block to a `sources` array, each entry typed:
  ```json
  "sources": [
    { "type": "spotify",     "playlist_url": "...", "library": "default" },
    { "type": "apple-music", "playlist_id":  "...", "library": "default" }
  ]
  ```
- DB rows already carry `source` and `source_id`, so adding new sources is purely additive.
- The download backend interface is unchanged — it takes `{artist, title, durationMs}` and doesn't know which catalog the metadata came from.

## v1 implications

- Don't bake "Spotify" into core type names (`Track`, `Playlist`, `Source` — not `SpotifyTrack`, `SpotifyPlaylist`).
- Don't put Spotify-specific fields (`spotify_added_at`) directly on the generic track type; call it `source_added_at`. Done in v1 schema already.
- The Spotify client lives in its module (`spotify/`) and implements a `Source` interface defined elsewhere. CLI `sync` calls `Source.listTracks()` — not `SpotifyClient.getPlaylist()` directly.

## Open questions

- How does cross-source dedup work if a song is in both the Spotify and Apple Music playlists? Add a `canonical_track_id` later if the answer matters; v1 explicitly doesn't try.
- Auth for additional sources is per-source; do they share the same `auth` command (`spotify-sync auth spotify`, `spotify-sync auth apple-music`) or each get their own? Lean toward the parameterized form.
