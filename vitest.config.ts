import { defineConfig } from 'vitest/config';

// ---------------------------------------------------------------------------
// Default unit test config.
//
// Matches previous vitest defaults (auto-discovers *.test.ts in src/) with one
// explicit addition: exclude the component suite so `npm test` stays fast and
// hermetic (no fake server startup, no subprocess spawning).
//
// Component tests live in tests/component/ and are run separately via
// `npm run test:component` using vitest.component.config.ts.
// ---------------------------------------------------------------------------

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/component/**'],
  },
});
