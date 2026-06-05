# spotify-sync

A tool for DJs to download and manage their Spotify music library locally, built for west coast swing socials.

## Documentation

**[https://sagivoulu.github.io/spotify-sync/](https://sagivoulu.github.io/spotify-sync/)**

Full getting-started guide, configuration reference, command docs, and troubleshooting are on the docs site.

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

- **Node.js 24** (`node --version` to check; `.nvmrc` pins the version)
- **yt-dlp** ≥ `2026.01.01` and **ffmpeg** on `PATH` (required for download commands)

## Quick start

```bash
nvm use
npm run setup
./bin/spotify-sync --help
```

Then follow the [Getting Started guide](https://sagivoulu.github.io/spotify-sync/getting-started).

## Development

```bash
npm run build        # compile TypeScript → dist/
npm run typecheck    # type-check without emitting
npm test             # run unit tests with Vitest
npm run test:component  # run component tests (hermetic, no credentials needed)
npm run lint         # lint with Biome
npm run format       # auto-format with Biome
npm run docs:dev     # local docs dev server
npm run docs:build   # build docs for production
```

> **Import extension convention:** this project uses `"module": "NodeNext"` in `tsconfig.json`.
> All relative imports in `src/` must use `.js` extensions even though the source files are `.ts`
> (TypeScript resolves them correctly at compile time; Node.js runs the emitted `.js`).
> Example: `import { buildProgram } from './cli/program.js'`

This project is primarily vibe-coded with AI coding agents. See `AGENTS.md` for agent instructions and development guidelines.
