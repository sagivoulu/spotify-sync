# 00 — Product Overview

> Shared context for every feature PRD. Read this first.

## What this is

**spotify-sync** is a personal tool for managing a DJ's music library. It bridges the gap between where music is *collected* (Spotify) and where it's *played* (local files via VirtualDJ at west coast swing socials).

## Primary user

Sagiv — west coast swing DJ, senior backend engineer, comfortable with CLI tools, frequently delegates work to AI coding agents (Claude Code, Codex). v1 is built exclusively for this user.

## Future users

Other WCS DJs with a similar workflow. **Out of scope for v1**, but design choices that would block multi-user use (hardcoded paths, single-user assumptions in data model, etc.) should be flagged when made.

## The workflow this tool supports

1. DJ collects songs into a Spotify playlist over time (the canonical "library of intent").
2. Periodically, the DJ wants those songs as local files. **The tool fills this gap.**
3. DJ tags songs in VirtualDJ (energy, vibe). Manual today; tool may help later.
4. At a social, DJ plays the local library via VirtualDJ. No internet assumed.
5. Optionally, the DJ exports the played set back to a Spotify playlist to share. Manual today; tool may help later.

## Hard constraints

- **Library must work offline.** Local files are the source of truth at play time.
- **VirtualDJ is brittle around file changes.** Renames break tag associations. Deleting a file mid-set produces a silent fail until the DJ tries to play it. The tool must minimize file churn after the initial download.
- **Spotify API has limits.** Direct audio download is blocked; metadata-only.
- **Songs are downloaded from YouTube / YouTube Music** (or other backends), matched against Spotify metadata. Match quality is imperfect.
- **Some songs the user owns are not on Spotify** — sourced manually via web tools (e.g. YouTube-to-mp3 sites). The system must accommodate these eventually.
- **Library is backed up to Google Drive** via a separate sync command. The tool stores its state in a known, backup-friendly location (`$XDG_DATA_HOME/spotify-sync/`) — the user is expected to include that path in their backup setup. State is also recoverable from Spotify + ID3 tags on the library files if ever lost.

## Design principles

- **Brittle file ops are forbidden.** Never rename or move a file after first download. Never auto-delete files. VDJ relies on path stability.
- **State is explicit and durable.** Use a local DB, not filename conventions, to track Spotify-ID ↔ local-file mappings.
- **AI-agent-friendly.** CLI-first, machine-readable output available (`--json`), idempotent commands, clear exit codes. The expected invocation pattern is "ask Claude Code to run sync."
- **Conservative by default.** Auto-pick best match, but never auto-delete or auto-rename. The user retains ultimate control.
- **Small, focused commands.** Each command does one thing; compose them in scripts or AI prompts.
- **Pluggable where it matters.** Download backend is an interface, not a hardcoded yt-dlp call — the YouTube source is the most likely thing to change.

## Planned but not yet built

These shape future work and inform v1 design choices (so we don't paint ourselves into a corner). Details in `future/`.

- **Graphical UI.** Likely an Electron app sitting on top of the same core. CLI remains a first-class entry point even after the UI ships. See `future/ui-app.md`.
- **Multiple source catalogs** (e.g. Apple Music alongside Spotify, or eventually replacing it). v1's DB schema is already source-agnostic (`source` + `source_id` columns), so this is additive. See `future/multi-source.md`.
- **Multiple independent libraries.** One install, multiple separate library roots, each with its own config. v1's DB schema is already scoped by `library_id` so this is additive. See `future/multi-library.md`.
- **Multiple playlists per library** (e.g. mood playlist alongside the main WCS playlist). See `future/secondary-playlists.md`.
- **Non-Spotify songs** (YT2MP3 manual workflow). Slots in as `source='manual'` rows under the existing schema. See `future/manual-imports.md`.
- **Set export** (VDJ history → Spotify playlist). See `future/set-export.md`.
- **Tagging assistance.** Fuzzy direction. See `future/tagging-assistance.md`.

## Out of scope (forever or for a long time)

- Streaming playback inside the tool.
- Acting as a DJ application (mixing, cueing). VDJ owns that.
- Cloud-hosted, multi-tenant SaaS.
- Modifying the Spotify playlist itself (except future set-export, which *creates* new playlists).

## Glossary

- **WCS** — West Coast Swing, a partner dance.
- **Social** — A WCS dance event where the DJ plays for the crowd.
- **Set** — The sequence of songs the DJ played during one social.
- **VDJ / VirtualDJ** — The DJ software the user plays from.
- **Library** — The local directory of audio files the DJ plays from.
- **Mood playlist** — A secondary Spotify playlist of songs the DJ uses to lift the mood between sets / when talking to the crowd.

## PRD layout

- `00-product-overview.md` — this file.
- `01-download-sync.md` — the v1 feature (the only PRD currently in scope to implement).
- `future/` — stubs for known-planned features. Not specs; intent + rough shape. Update when promoted to active work.
  - `ui-app.md` — graphical UI (Electron-leaning).
  - `multi-source.md` — additional source catalogs beyond Spotify (Apple Music, etc.).
  - `multi-library.md` — multiple independent libraries on one install.
  - `secondary-playlists.md` — multiple playlists from a source into one library.
  - `manual-imports.md` — songs not in any source catalog.
  - `set-export.md` — VDJ history → Spotify playlist.
  - `tagging-assistance.md` — possible VDJ tagging help.
