import { defineConfig } from 'vitest/config';

// ---------------------------------------------------------------------------
// Default unit test config.
//
// Matches previous vitest defaults (auto-discovers *.test.ts in src/) with one
// explicit addition: exclude the integration suite so `npm test` stays fast and
// hermetic (no Spotify credentials or real yt-dlp required).
//
// Integration tests live in tests/integration/ and are run separately via
// `npm run test:integration` using vitest.integration.config.ts.
// ---------------------------------------------------------------------------

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/integration/**'],
  },
});
