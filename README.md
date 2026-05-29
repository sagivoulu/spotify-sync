# spotify-sync

A tool for DJs to download and manage their Spotify music library locally, built for west coast swing socials.

## The Problem

The typical DJ workflow:
1. Collect songs on Spotify over time
2. Download new songs periodically to a local machine
3. Tag songs with energy and vibe metadata (VirtualDJ or similar)
4. Play at a social

The gap this tool fills: **easily syncing a Spotify library to local storage**, so the rest of the workflow can happen offline.

## Status

Early development. See `/prd/` for planned features.

## Requirements

- **Node.js ≥ 20** (`node --version` to check)
- `yt-dlp` and `ffmpeg` on `PATH` (required for download commands; checked at startup)

## Setup & build

```bash
npm install
npm run build
```

## Run

```bash
# Using the compiled binary directly:
./bin/spotify-sync --help

# Or install globally (after npm link or npm install -g):
spotify-sync --help
```

Available commands: `auth`, `sync`, `status`, `prune`, `import`

## Development

```bash
npm run build        # compile TypeScript → dist/
npm run typecheck    # type-check without emitting
npm test             # run tests with Vitest
npm run lint         # lint with Biome
npm run format       # auto-format with Biome
```

> **Import extension convention:** this project uses `"module": "NodeNext"` in `tsconfig.json`.
> All relative imports in `src/` must use `.js` extensions even though the source files are `.ts`
> (TypeScript resolves them correctly at compile time; Node.js runs the emitted `.js`).
> Example: `import { buildProgram } from './cli/program.js'`

This project is primarily vibe-coded with AI coding agents. See `AGENTS.md` for agent instructions and development guidelines.
