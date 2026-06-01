import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// ---------------------------------------------------------------------------
// Global setup — runs once before any integration test.
//
// Validates that all required environment variables are present (fails loudly;
// no silent skips per AC) and that the built binary exists.
//
// The explicit env-var check is intentional: missing credentials should produce
// a clear error that names the missing variable, not a cryptic auth failure
// buried inside a test.
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const REQUIRED_ENV_VARS: string[] = [
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_CLIENT_SECRET',
  'SPOTIFY_REFRESH_TOKEN',
  'SPOTIFY_PLAYLIST_URL',
  'SPOTIFY_PLAYLIST_URL_SUBSET',
];

export default function setup(): void {
  const missing = REQUIRED_ENV_VARS.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      [
        'Integration suite is missing required environment variables:',
        ...missing.map((k) => `  ${k}`),
        '',
        'See docs/integration-tests.md for setup instructions.',
      ].join('\n'),
    );
  }

  const distIndex = resolve(REPO_ROOT, 'dist/index.js');
  if (!existsSync(distIndex)) {
    throw new Error(
      `Built binary not found at ${distIndex}.\n` +
        "Run `npm run build` first, or use `npm run test:integration` which builds automatically.",
    );
  }
}
