import { defineConfig } from 'vitest/config';

// ---------------------------------------------------------------------------
// Integration test config.
//
// Run via `npm run test:integration`. Requires:
//   - `npm run build` to have been run first (the suite spawns the real binary)
//   - SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN,
//     SPOTIFY_PLAYLIST_URL, and SPOTIFY_PLAYLIST_URL_SUBSET env vars set
//     (validated in the global setup; see tests/integration/setup.ts)
//
// Tests run serially (fileParallelism: false, singleThread: true) because they
// share the real Spotify API and network. Each test creates its own isolated
// sandbox directory (scratch library + DB) that is torn down after the test.
//
// Timeout is generous (90 s) to accommodate real Spotify API calls + yt-dlp
// (or its fake) completing within a single test. The global setup has its own
// one-off timeout that applies before any test runs.
// ---------------------------------------------------------------------------

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['./tests/integration/setup.ts'],
    testTimeout: 90_000,
    hookTimeout: 30_000,
    // Run all test files serially — tests share the real Spotify API/network
    // and network contention is more painful than parallelism is valuable.
    fileParallelism: false,
    // Disable intra-file test concurrency too (each test modifies a sandbox but
    // tests in a single file share the describe-scope beforeEach/afterEach).
    sequence: { concurrent: false },
  },
});
