# Agent Instructions

> `CLAUDE.md` is a symlink to this file. Both Claude Code and Codex read from the same source — edit `AGENTS.md` directly.

## Project Overview

**spotify-sync** is a tool to help DJs download and manage their music library locally for use at west coast swing socials.

The typical DJ workflow this tool supports:
1. Collect songs on Spotify over time
2. Periodically download new songs to a local machine
3. Tag songs with energy and vibe metadata (using VirtualDJ or similar software)
4. Play songs at a social using DJ software

The primary gap this tool fills: easily downloading songs from a Spotify playlist/library to local storage.

---

## This is a Vibe-Coded Project

This project is primarily built with AI coding agents. That creates a specific requirement: **agent instructions must be kept explicit and up to date**.

When you make a structural decision (tech stack choice, module layout, API design), document it here or in the relevant PRD. Future agents won't have your context — leave a clear trail.

If you discover that an existing instruction is wrong or outdated, update it. Don't silently work around it.

---

## Before You Start Any Task

1. **Read the Linear ticket.** Fetch the issue (e.g. `WES-5`) to get the full description, acceptance criteria, and out-of-scope list. Also read its milestone and project for surrounding context — what phase is this, what came before, what comes after.
2. **Read the relevant PRD** in `/prd/` before implementing a feature. Start with `prd/00-product-overview.md`, then the feature PRD. If no PRD exists for the feature, flag it — don't implement against a blank spec.
3. **Explore the codebase first.** Understand existing patterns, conventions, and structure before writing a line.
4. **Raise blockers upfront.** Missing access, unclear requirements, or mismatched assumptions should surface before implementation starts, not halfway through.

---

## Development Guidelines

### Testing
All code must be tested. There are no exceptions.
- Unit tests for logic, transformation, and utility functions
- Integration tests for any external API calls (Spotify, download backends)
- Tests live alongside the code they cover (or in a `tests/` directory mirroring the source structure)
- Don't ship a feature without a test that would catch a regression

### Code Quality
- Follow existing patterns in the codebase. Don't introduce new conventions without a reason.
- Keep modules focused. If a file is doing too many things, that's a flag — raise it, don't silently refactor.
- No unnecessary abstractions. Solve the problem in front of you.

### Ticket lifecycle

Every piece of work maps to a Linear ticket. Follow this flow without exception:

1. **Starting work** → mark the ticket **In Progress** in Linear before writing any code.
2. **Finishing work** → commit all changes, push the branch, open a GitHub PR with a description (what changed, why, how to test the acceptance criteria), then mark the ticket **In Review** in Linear.
3. **Never mark a ticket Done yourself** — that's the project owner's call after reviewing the PR.

### Commits
Use [Conventional Commits](https://www.conventionalcommits.org/) style:
- `feat: add spotify playlist download`
- `fix: handle missing track metadata`
- `chore: update dependencies`

Never stage, commit, or push without explicit approval from the project owner.

### Security
- Never hardcode credentials, tokens, or secrets. Use environment variables.
- `.env` files must never be committed (already in `.gitignore`).
- Any new third-party dependency should be noted with a brief rationale — this project processes music files and communicates with external services, so supply chain hygiene matters.

---

## Architecture

### Committed stack

| Concern | Choice |
|---|---|
| Runtime | Node.js ≥ 20 |
| Language | TypeScript 5.x, strict mode |
| Module system | ESM (`"type": "module"` in package.json) |
| TS module resolution | `"module": "NodeNext"` — **relative imports need `.js` extensions** |
| CLI framework | `commander` v12+ |
| Build | `tsc` (no bundler for v1; revisit if build time becomes an issue) |
| Test runner | Vitest 4.x (native ESM + Vite-based resolution) |
| Lint / format | Biome (single tool for both; `biome.json` at repo root) |

> **NodeNext import convention:** all relative imports in `src/` use `.js` extensions, e.g.
> `import { foo } from './util.js'`. TypeScript resolves to the `.ts` source at compile time;
> Node.js runs the emitted `.js`. Vitest (via Vite) handles the resolution transparently.

### Module layout

```
src/
├── index.ts           # Thin entrypoint — calls buildProgram().parseAsync(process.argv)
├── cli/               # CLI layer: command registration, arg parsing, output formatting
├── spotify/           # Spotify API client; implements the generic Source interface
├── backend/           # Pluggable DownloadBackend interface + yt-dlp implementation (v1)
├── db/                # SQLite state via better-sqlite3; migrations; PRAGMA foreign_keys ON
├── config/            # Config loading, XDG paths, env/flag/file precedence
└── tagging/           # ID3 read/write

bin/
└── spotify-sync       # Executable shim — dynamic-imports dist/index.js; no logic here
```

### Architectural decisions to preserve

**Core/CLI separation** (`prd/future/ui-app.md`): a future Electron UI sits on the same core.
- Business logic lives in domain modules (`spotify/`, `backend/`, `db/`, `config/`, `tagging/`).
- `src/cli/` is a thin formatting layer. It calls core functions, subscribes to their events, and prints output.
- Core functions **return data, not strings**. Long-running ops **emit structured events** (EventEmitter / async iterator) — never `console.log` inside core.
- `--json` output defines the data contract the future UI will consume; keep it complete.

**Generic type names** (`prd/future/multi-source.md`): don't bake Spotify into core type names.
- Use `Track`, `Playlist`, `Source` — never `SpotifyTrack`.
- `src/spotify/` implements a `Source` interface defined in core.
- CLI calls `source.listTracks()`, not `SpotifyClient.getPlaylist()` directly.

**Library ID scoping** (`prd/future/multi-library.md`): core APIs accept a `libraryId` from day one.
- Default value: `"default"`. v1 only ever passes this one value — no special-casing.
- The single configured library registers as one `libraries` row on first run.

**Source-agnostic DB schema** (`prd/01-download-sync.md`): identity is `(source, source_id)`.
- v1 always uses `source='spotify'`. Future sources are additive rows, not migrations.
- Always run `PRAGMA foreign_keys = ON` on every SQLite connection.

### External binaries (checked at startup)

- `yt-dlp` — download backend (v1 implementation)
- `ffmpeg` — audio transcoding (required for format conversion)

Both must be on `PATH`. `spotify-sync status` should print detected versions.

---

## PRD Directory

Product requirements live in `/prd/`. Each file describes one feature, user flow, or piece of shared product context.

### Layout

```
prd/
├── 00-product-overview.md      # always-relevant context; read first
├── 01-<feature>.md             # active PRDs (specced, in or near scope)
├── 02-<feature>.md             # additional active PRDs as they're added
└── future/
    └── <feature>.md            # stubs for known-planned features (not yet specced)
```

### Numbering convention

Files at the top level of `/prd/` are prefixed with a two-digit number:

- `00-` is reserved for the product overview — shared context every other PRD inherits.
- `01-` and up are individual feature PRDs. **The number reflects the order the feature entered active scope**, not implementation order, priority, or dependency. It's purely a stable, sortable identifier so file listings stay readable as the directory grows.
- Numbers are never reused or renumbered. If `02-foo.md` is deleted, the next new PRD is `03-...`, not a recycled `02-`.

Files in `future/` are **not numbered.** They're not promises about ordering or scope, just named directly after the feature (`set-export.md`, `ui-app.md`, etc.).

### The `future/` directory

`future/` holds stubs for features that are planned but not yet committed to scope. A stub is:

- A description of the problem the feature solves.
- A rough direction (not a spec — implementation details are deliberately omitted).
- Any constraints it places on *current* work (e.g. "v1's schema must leave room for X").
- Open questions worth answering before promoting it.

The point of these stubs is to keep the trail visible: agents working on active PRDs can see what's coming and avoid painting future work into a corner. They are intentionally short — if a `future/` file starts growing implementation-level detail, that's a signal it's ready to be promoted.

### Creating a new PRD

1. Decide whether the feature is **active** (you're about to spec it for real) or **planned** (known, but not scoped yet).
2. **Planned →** create `prd/future/<feature-slug>.md` using the existing stubs as a template. Keep it brief.
3. **Active →** create `prd/<NN>-<feature-slug>.md` where `NN` is the next unused two-digit number.
4. Add a one-line entry to the "PRD layout" section of `00-product-overview.md` so the new file is discoverable.
5. If the new PRD references or affects existing PRDs (schema changes, shared concepts), cross-link with relative paths (e.g. `See \`future/multi-source.md\``).

### Structure of an active PRD

Active PRDs (the top-level numbered files) should generally include:

- **Goal** — one or two sentences. What this feature accomplishes.
- **User stories** — concrete invocations / scenarios.
- **Out of scope** — explicit list with pointers to the PRDs that handle those concerns.
- **Stack / dependencies** — anything new this feature introduces; rationale per `Development Guidelines › Security`.
- **Behavior** — the actual spec. Commands, data model, file layout, error handling, etc. — whatever shape fits the feature.
- **Open questions** — known unknowns, decidable during implementation.

`01-download-sync.md` is the reference example. Match its level of detail when writing new active PRDs; copy section headings where they apply.

### Promoting a stub from `future/` to an active PRD

When a planned feature is ready to be built:

1. Pick the next unused number `NN` (highest existing top-level number + 1).
2. Move and rename: `git mv prd/future/<feature>.md prd/<NN>-<feature>.md`.
3. Expand the stub into a full active PRD using the structure above. Keep the original problem statement and "constraints on current work" — those are still load-bearing.
4. Update `00-product-overview.md`:
   - Move the entry from "Planned but not yet built" to the active list.
   - Update the PRD layout section.
5. Search `/prd/` for references to the old path and update them: `grep -r "future/<feature>.md" prd/`.

### Retiring or merging a PRD

- If a PRD is abandoned, leave the file in place and add a `> Status: **abandoned.** <one-line reason>` at the top. Don't reuse the number.
- If two PRDs merge, keep the lower-numbered one and add a similar `> Status: **merged into NN-other.md.**` banner on the other.

---

## Key External Integrations

- **Spotify API** — source of playlist and track metadata
- **Download backend** — TBD (yt-dlp is the leading candidate)
- **DJ software compatibility** — VirtualDJ is the primary target for metadata/tagging; others may be added later
