# Future — Graphical UI

> Status: **not in v1.** This is a stub. v1 is CLI-only; a UI is planned but explicitly down the road.

## Why

CLI works well for the AI-driven workflow ("Claude, run sync"). It's less ergonomic for the parts of the workflow that benefit from at-a-glance visibility:

- Browsing what's pending / downloaded / failed.
- Reviewing the chosen YouTube match for a song *before* committing to it (the future match-QA flow).
- Resolving `needs_manual` songs by picking from candidate matches.
- Managing multiple libraries / multiple playlists once those features exist.
- Driving the future set-export flow (reviewing the auto-mapped tracks before pushing the playlist live).

A UI doesn't replace the CLI — both stay first-class, sharing the same core.

## Direction (leaning, not committed)

**Electron desktop app**, preferred over a localhost web app:

- Same machine as the library, no port-binding surprises, no "is the server running" friction.
- Native file dialogs, system tray integration, drag-and-drop of files for `import` flows.
- Simpler distribution (one app the user opens) than a localhost server they have to start manually.

The localhost web-app alternative remains viable if Electron's footprint feels excessive at the time, but Electron is the working assumption.

## Architectural implication for v1

**The v1 core must not assume CLI-only.** Concretely:

- All business logic (Spotify sync, download orchestration, DB access, ID3 tagging, config) lives in a core module / library with **no direct stdout/console coupling**. The CLI is a thin layer that calls the core and prints results.
- Use structured events (EventEmitter or async iterator of progress events) for long-running operations like `sync`, not `console.log` calls inside the sync function. The CLI subscribes and renders; a future UI subscribes and renders differently.
- Return data, not formatted strings, from core functions. CLI does formatting.
- The `--json` output of v1 effectively defines the data contract the UI will consume later, so make it complete (not a stripped-down version of the human output).

This is cheap to do correctly in v1 and very expensive to retrofit. **Treat the v1 core as the API the future UI will sit on.**

## Open questions

- Read-only vs. write-capable UI in its first version? Probably read-only + trigger-existing-actions (no new destructive operations exclusive to the UI).
- One window per library, or a library switcher inside one window?
- Authentication / Spotify OAuth flow inside Electron — should the UI handle it, or shell out to the CLI's `auth` command? Latter is simpler.
