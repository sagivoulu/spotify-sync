import { defineConfig } from 'vitest/config';

// ---------------------------------------------------------------------------
// Component test config.
//
// Run via `npm run test:component`. No environment variables or credentials are
// required — all external dependencies (Spotify API, yt-dlp, ffmpeg) are
// replaced by local fakes started by the global setup.
//
// "Component" means: the real built CLI binary is spawned as a subprocess (same
// external interface as a user), but every external service is mocked:
//   - Spotify API → local Node.js HTTP server (fake-spotify-server.ts)
//   - yt-dlp/ffmpeg → fake binaries written to a temp dir (fake-bins.ts)
//
// Tests run serially (fileParallelism: false) because each test spawns subprocesses
// and modifies an isolated sandbox directory; serial order avoids any accidental
// port or filesystem cross-contamination.
// ---------------------------------------------------------------------------

export default defineConfig({
  test: {
    include: ['tests/component/**/*.test.ts'],
    globalSetup: ['./tests/component/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
