# 02 — OpenBeat: Electron Desktop UI

> Promoted from `future/ui-app.md`. Replaces the stub.
>
> **Working name: OpenBeat.** Being floated with friends; treat as committed for now,
> but the rename is isolated to one ticket (see *Rename* below) so it's cheap to change.

## Goal

Ship **OpenBeat** — a native desktop application that wraps the existing core in a graphical
interface. v1 covers exactly the feature set the current CLI already has: sync, status, prune,
import, auth, and doctor. No new product capabilities. The CLI stays fully functional alongside
the UI; both are thin layers over the same core.

This release also renames the product from `spotify-sync` to `openbeat`.

## Why now

The CLI is feature-complete for the personal sync workflow (M1–M5 done). The parts of that
workflow that benefit from at-a-glance visibility — *what's downloaded / pending / failed*,
watching a sync run, picking a file to import — are exactly the parts a GUI does better than a
terminal. This is the lowest-risk possible first UI: every capability maps to a command that
already exists and is already tested.

## User stories

- As a DJ, I open OpenBeat and see the state of my library at a glance — downloaded, pending,
  failed, removed — without running a command.
- As a DJ, I trigger a sync from the UI and watch each track succeed, retry, or fail in real time.
- As a DJ, I browse my full track library, filter by status, and search by artist or title.
- As a DJ, I review tracks removed from Spotify and confirm pruning them from disk.
- As a DJ, I import a local file for a specific track using a native file picker — no flags to recall.
- As a DJ, I see health-check and Spotify auth state inside the app, and re-authenticate without a terminal.

## Out of scope (v1)

- **Match QA** (review the YouTube match before committing a download). Not in the CLI today →
  separate future ticket, not this one.
- **Set export** (VDJ → Spotify) — `future/set-export.md`.
- **Library statistics, song discovery, set-building assistant** — far future.
- **Multi-user / event sharing (the "Tana" use cases)** — explicitly parked.
- **Cloud sync, accounts, first-run onboarding for non-technical users** — parked. (But see
  *Distribution*: the build pipeline should be signable from the start, because handing the `.dmg`
  to other DJs is a stated near-term goal.)
- **Multi-library / multi-source / secondary-playlist UI** — core is already scoped for these
  (`libraryId`, `source`), but the UI hardcodes the single default library in v1.
- **Mobile, web, cloud, auto-sync scheduling.**

## Stack / dependencies

Sagiv is a backend engineer with limited frontend experience, and this is an agent-coded project.
Both point the same way: pick the **most mainstream, best-documented** options so generated code is
predictable and help is easy to find. New supply-chain surface is called out per the project's
security guideline.

| Concern | Choice | Rationale / risk |
|---|---|---|
| Desktop framework | **Electron** | TypeScript end-to-end; the existing Node.js core is imported *directly* in the main process — no IPC bridge to a foreign runtime (the dealbreaker for Tauri, whose backend is Rust). Large, well-maintained, huge ecosystem. |
| UI framework | **React 18+** | Default for Electron renderers; best AI-training-data coverage of any option. |
| Styling | **Tailwind CSS** | Utility classes are more predictable for agent-generated code than bespoke CSS. |
| Component kit | **shadcn/ui** (Radix + Tailwind) | Accessible primitives with good defaults; the team composes rather than designs. Removes the need for an owner with visual-design skills. See *UX / design approach*. |
| Build | **electron-vite** | Manages the dual main/renderer build with HMR; Vite-based, consistent with the existing Vitest setup. |
| Packaging | **electron-builder** | De-facto standard; produces a macOS `.dmg`. Supports code signing + notarization when we need them (see *Distribution*). |
| IPC safety | contextBridge + preload | `contextIsolation: true`, `nodeIntegration: false`. Mandatory. |
| Native modules | **@electron/rebuild** | `better-sqlite3` is a native addon and must be rebuilt against Electron's ABI (Electron ships a different Node/V8 than the system Node). One-time build-script setup; runs in CI before packaging. |
| Window state | electron-store (or hand-rolled) | Persist window size / UI prefs. Small; optional. |

**Decision (confirmed): the core runs in-process.** The Electron main process imports `src/`
directly and subscribes to the same EventEmitter the CLI uses — no shelling out to the CLI binary,
no inventing a streaming stdout protocol. The cost is the `@electron/rebuild` step above, which is
standard and well-trodden. This is the architecture the project was designed for.

**Supply-chain note:** Electron + electron-vite + electron-builder + React + Tailwind is a large
dependency footprint compared to the lean CLI. All are first-tier, widely-audited projects, so the
risk is acceptable — but it is a real step up in transitive dependencies and should be a conscious
decision, not a default. Lockfile committed; Dependabot/`npm audit` already in CI.

**Security posture (non-negotiable):** the renderer is treated as untrusted. No `nodeIntegration`,
`contextIsolation` on, a strict CSP, and `will-navigate` / `setWindowOpenHandler` locked down.
Every privileged operation (filesystem, DB, child processes, Spotify tokens) crosses a typed IPC
channel defined in the preload — the renderer never touches Node APIs directly.

## Architecture

The guiding constraint from `00-product-overview.md` and the original UI stub holds: **core returns
data and emits events; the presentation layer formats.** The CLI is one such layer; the Electron
main process is a second. Core (`src/`) is untouched by this work — if a screen needs something the
core doesn't expose cleanly, that's a core gap to fix in `src/`, not logic to smuggle into Electron.

```
src/                    ← existing core, UNCHANGED (Source, backend, db, config, tagging, logging)
electron/
├── main/
│   ├── index.ts        ← app lifecycle, BrowserWindow, security hardening
│   └── ipc/            ← one handler file per domain; calls core, forwards events
│       ├── sync.ts     ← startSync; pipes core progress events to the renderer
│       ├── library.ts  ← listTracks / importTrack / pruneTracks
│       ├── auth.ts     ← getAuthStatus / startAuth (reuses CLI PKCE flow)
│       └── status.ts   ← getStatus / getDoctorStatus / getConfig
├── preload/
│   └── index.ts        ← contextBridge: the single typed API surface the renderer sees
└── renderer/
    ├── main.tsx        ← React entry
    ├── App.tsx         ← app shell + navigation (structure from the design step)
    ├── pages/          ← view components (grouping decided by the design step)
    └── components/     ← shared widgets (track table, status chip, progress row…)
```

Build artifacts:
- `dist/` — the existing CLI (unchanged).
- `dist-electron/` (or `release/`) — the packaged desktop app.

`package.json` gains `dev:electron`, `build:electron`, `package` scripts alongside the existing
`build` / `test` / `test:component`.

**Long-running sync:** the core already emits structured progress events. The `sync` IPC handler
subscribes and relays each event via `webContents.send(...)`; the renderer subscribes through the
preload bridge and renders progress. No polling.

## Functional requirements

The capabilities v1 must expose. Each maps to an existing, tested command and needs no new core
logic beyond exposing it over IPC.

**This section is deliberately layout-agnostic.** How these capabilities are grouped into screens,
and the navigation model, are produced by a separate UI/UX design step (see *UX / design approach*)
— not decided here. The capabilities below are the stable contract; the layout is free to change
without touching this PRD.

### Library visibility (mirrors `status`)
- Show aggregate counts: downloaded / pending / failed / removed-from-source.
- Show the last sync run: when it ran, duration, how many added / failed.
- Surface overall health (derived from doctor checks) at a glance.

### Library browsing (backed by the DB)
- List all tracks with artist, title, status, and date added.
- Filter by status (downloaded / pending / failed / removed).
- Search by artist or title.
- For a downloaded track, reveal/expose its local file path.

### Sync (mirrors `sync`)
- Trigger a sync run from the UI.
- Reflect live progress from the existing `SyncEvent` stream (`run-start`, `track-downloaded`,
  `track-retry`, `track-failed`, `run-finish`): per-track in-flight → downloaded / retrying
  (attempt N/M) / failed, with running tallies and a final summary.
- Progress is **state-transition granularity, not a percentage** — the core emits no per-track
  progress fraction (see *Known core gaps*). There is **no mid-sync cancel** in v1 (also a core
  gap); a run completes once started.
- Link to the per-run log file (`logPath`) for troubleshooting.

### Prune (mirrors `prune`)
- List `removed_from_source` tracks that still have a local file (with path + metadata).
- Preview what would be deleted (dry-run), then delete only on explicit confirmation.

### Import (mirrors `import`)
- For a given track (typically a failed/pending one), pick a local audio file via a native file
  dialog and import it as that track's canonical file.

### Auth & health (mirrors `auth` + `doctor`)
- Show Spotify auth status (connected / expired / not configured) and allow re-authentication
  (reuses the existing PKCE flow; localhost redirect via the system browser).
- Show doctor results: Spotify reachability, yt-dlp version, ffmpeg version, DB path, config path.

### Config visibility
- Show the active configuration read-only: library path, playlist ID, download concurrency.
  (In-app config editing is not required for v1.)

## Rename: spotify-sync → openbeat

Done as its own ticket, landed *before* the Electron scaffolding so the new app is born under the
new name. Touches:

- `package.json` `name` + `bin` (`openbeat`).
- XDG paths: `~/.config/openbeat/`, `~/.local/share/openbeat/`, `~/.local/state/openbeat/`.
- CLI command name, help text, docs site, README, the npm package.
- The repo / Linear project naming (cosmetic; decide separately).

**State migration (must not lose data):** on startup, if new-path config/DB are absent but old-path
ones exist, copy them to the new location once (and log it). Current real-world blast radius is one
user (Sagiv), but silent state loss is unacceptable regardless. Covered by a component test.

## Distribution

v1 is for Sagiv's own machine — but **exposing the app to other DJs is a stated near-term goal**, so
the pipeline is built to be share-ready without over-investing now:

- **v1:** unsigned local build is fine for personal use. *But* structure `electron-builder` config
  so that adding code signing + notarization later is a config change, not a re-architecture.
- **Near-term (pre-share, likely v1.1):** Apple Developer ID signing + notarization so the `.dmg`
  opens on other Macs without Gatekeeper warnings. This needs an Apple Developer account ($99/yr) —
  a real prerequisite to flag now, not a surprise later.
- **Auto-update** (electron-updater) is *not* in v1 and not near-term; revisit only if manual
  re-downloads become a real friction with multiple users.

## UX / design approach

**Screen layout, navigation model, and information architecture are a separate deliverable** —
produced after this PRD, from the *Functional requirements* above. They are intentionally not
specified here so the PRD stays stable while the design evolves. The output of the design step
(screen list, navigation model, wireframes) lives as its own design doc/file and does **not** need
to fold back into this PRD.

Guidance for that design step (owner is a backend engineer without frontend background; project is
agent-coded — bias toward mainstream, low-effort-to-build choices):

- **Adopt a component kit, don't design pixels.** Recommended: **shadcn/ui** (Radix + Tailwind) for
  accessible, good-default primitives — composed rather than designed.
- **Reference-driven layout.** Closest analogs to borrow from: Transmission/qBittorrent (a queue
  with per-row status → the sync view), Plex/MusicBee/Apple Music (library browser), Spotify desktop
  (overall app shell).
- **Lo-fi wireframes before code**, validated against the capability list above. ASCII/Excalidraw
  is enough.
- **Build iteratively against the running app** (Electron HMR) — the fastest feedback loop for a
  developer. Heavy upfront Figma is unnecessary.

## Known core gaps (surfaced by this PRD, not solved by it)

Reading the current core (`src/sync/`, `src/backend/`) turned up two limitations the UI will run
into. Both are **deliberately out of scope** for this PRD and become their own tickets:

1. **No mid-sync cancellation.** `runSync` accepts no `AbortSignal`; `DownloadBackend.download()`
   cannot be interrupted. A "stop sync" feature requires threading cancellation through the sync
   loop and the backend subprocess. Separate future ticket; the UI ships without a Cancel button.
2. **No granular per-track download progress.** The event contract emits state transitions, not a
   percentage. A per-track progress bar would require new events from the backend (parsing yt-dlp's
   progress output). Out of scope; v1 shows spinner → done/failed only.

Neither blocks v1 — they just bound what the sync view can show.

## Suggested ticket breakdown

Roughly milestone-sized; each independently shippable and testable. Tickets 4–8 are organized by
**capability**; how they map onto actual screens follows from the design step and may be re-bundled.

1. **Rename to openbeat** (+ state-migration shim + test). Standalone, no UI.
2. **Electron scaffolding**: electron-vite, hardened BrowserWindow, empty React shell, packaging to
   a runnable `.dmg`. Boots — no features.
3. **IPC + preload contract**: typed bridge; wire `status` end-to-end as the proof of concept.
4. **Library visibility + browsing** (counts, last-run, track list, filter, search, reveal path).
5. **Sync** (trigger + live event stream + log link).
6. **Import** (native picker + run).
7. **Prune** (dry-run + confirm + delete).
8. **Auth, doctor & config view**.

Note: tickets 2–8 depend on the design step having produced at least a navigation model and the
shell layout, so the views have a place to live. The rename (1) and scaffolding (2) can proceed in
parallel with design.

## Open questions

- **Navigation model & screen grouping** (sidebar vs. tab bar, which capabilities share a screen):
  owned by the UI/UX design step, not this PRD.
- **System tray / minimize-to-tray with status:** nice-to-have, out of v1.
- **Auto-sync on launch toggle:** default off; candidate for v1.1, not v1.
- **Testing the renderer:** component tests already spawn the real binary for core. For the UI,
  Playwright-on-Electron is the likely path for a smoke test, but UI test depth for v1 is an open
  call — at minimum the IPC handlers (which contain the only non-trivial logic) get unit tests.
- **shadcn/ui vs. a pre-built theme:** the recommendation is shadcn/ui, but confirm once we see one
  screen built — if composing primitives feels like too much surface for v1, a heavier batteries-
  included kit (e.g. Mantine) is the fallback.
