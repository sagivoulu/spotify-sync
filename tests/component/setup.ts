import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFakeSpotifyServer } from './helpers/fake-spotify-server.js';
import type { FakeSpotifyServer } from './helpers/fake-spotify-server.js';

// ---------------------------------------------------------------------------
// Global setup — runs ONCE in the main process before any test worker starts.
//
// Responsibilities:
//   1. Verify dist/index.js exists (build must have run before tests).
//   2. Start the fake Spotify HTTP server.
//   3. Expose its base URL via process.env.COMPONENT_FAKE_SPOTIFY_BASE_URL so
//      test workers (forked from this process) inherit it.
//
// NO credentials or environment variables are required. All external services
// (Spotify API, yt-dlp, ffmpeg) are replaced by local fakes.
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

let fakeServer: FakeSpotifyServer | null = null;

export async function setup(): Promise<void> {
  // 1. Confirm the binary is built
  const distIndex = resolve(REPO_ROOT, 'dist/index.js');
  if (!existsSync(distIndex)) {
    throw new Error(
      `Built binary not found at ${distIndex}.\n` +
        'Run `npm run build` first, or use `npm run test:component` which builds automatically.',
    );
  }

  // 2. Start the fake Spotify server
  fakeServer = await startFakeSpotifyServer();

  // 3. Expose the base URL to worker processes (forked workers inherit process.env)
  process.env.COMPONENT_FAKE_SPOTIFY_BASE_URL = fakeServer.baseUrl;

  console.log(`[component setup] Fake Spotify server started at ${fakeServer.baseUrl}`);
}

export async function teardown(): Promise<void> {
  if (fakeServer) {
    await fakeServer.close();
    fakeServer = null;
    console.log('[component setup] Fake Spotify server stopped.');
  }
}
