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

- **Node.js 24** (`node --version` to check; `.nvmrc` pins the version)
- `yt-dlp` and `ffmpeg` on `PATH` (required for download commands; checked at startup)

## New workspace setup

A fresh superset worktree (or plain clone) has no `node_modules/` or `dist/` — both are
gitignored. Run these once before using the CLI:

```bash
nvm use          # activate Node 24 from .nvmrc
npm run setup    # npm install && npm run build
./bin/spotify-sync --help   # verify it works
```

> **Superset users:** setup runs automatically when superset creates the workspace
> (via `.superset/config.json`). You don't need to run this manually.

**Spotify credentials & authentication:**

spotify-sync authenticates with Spotify on your behalf via OAuth 2.0 (PKCE flow). This is a one-time setup:

1. **Register a Spotify developer app** at [developer.spotify.com](https://developer.spotify.com/dashboard).
   - Under *Redirect URIs*, add: `http://localhost:8888/callback`
   - If Spotify rejects `localhost`, try `http://127.0.0.1:8888/callback` — Spotify has been moving
     some plans to require the explicit loopback IP.
   - Note your **Client ID** and **Client Secret** from the app settings.

2. **Add credentials to your config file** at `~/.config/spotify-sync/config.json`:
   ```json
   {
     "spotify": {
       "client_id": "YOUR_CLIENT_ID",
       "client_secret": "YOUR_CLIENT_SECRET",
       "playlist_url": "https://open.spotify.com/playlist/..."
     },
     "library": {
       "path": "/path/to/your/music/library"
     }
   }
   ```
   Or use env vars: `SPOTIFY_SYNC_SPOTIFY_CLIENT_ID` and `SPOTIFY_SYNC_SPOTIFY_CLIENT_SECRET`.

3. **Run the auth command:**
   ```bash
   ./bin/spotify-sync auth
   ```
   Your browser will open for Spotify's consent page. After approving, the terminal prints success.
   The refresh token is saved to `~/.config/spotify-sync/auth.json` with `0600` permissions
   (readable only by you). Re-running `spotify-sync auth` overwrites it cleanly.

> **Port override:** if port 8888 is in use, pass `--port <n>` and update the redirect URI in your
> Spotify app settings to match.

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
