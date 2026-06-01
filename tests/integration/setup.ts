import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Global setup — runs ONCE in the main process before any test worker starts.
//
// Token acquisition strategy:
//
//   LOCAL DEV (INTEGRATION_SPOTIFY_ACCESS_TOKEN set):
//     Use the access_token directly — no refresh call, no rotation risk.
//     Workflow: export INTEGRATION_SPOTIFY_ACCESS_TOKEN from auth.json before
//     running tests.  See docs/integration-tests.md for the one-liner.
//
//   CI (SPOTIFY_REFRESH_TOKEN set; INTEGRATION_SPOTIFY_ACCESS_TOKEN not set):
//     The CI workflow already refreshed the token in a dedicated step, stored
//     the result in INTEGRATION_SPOTIFY_ACCESS_TOKEN, and (if Spotify rotated
//     the refresh_token) updated the GitHub secret for the next run.
//     setup.ts falls through to the same INTEGRATION_SPOTIFY_ACCESS_TOKEN path
//     once that step has run.
//
// WHY the separation:
//   Spotify rotates PKCE refresh tokens on every call to the token endpoint.
//   If local test runs call the refresh endpoint with the same token stored in
//   GitHub Actions secrets, CI breaks the next run.  Separating local dev
//   (access_token, no refresh call) from CI (refresh in a CI step that also
//   self-updates the secret) prevents that.
//
// The obtained token is written to a temp file and its path exposed via
// INTEGRATION_TOKEN_CACHE_PATH so all test worker processes (forked after
// this setup runs and therefore inheriting process.env) share it.
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const REQUIRED_ENV_VARS: string[] = [
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_CLIENT_SECRET',
  'SPOTIFY_PLAYLIST_URL',
  'SPOTIFY_PLAYLIST_URL_SUBSET',
];

const TOKEN_CACHE_PATH = resolve(tmpdir(), `spotify-sync-it-token-${process.pid}.json`);

export async function setup(): Promise<void> {
  // 1. Validate always-required env vars
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

  // 2. Check dist
  const distIndex = resolve(REPO_ROOT, 'dist/index.js');
  if (!existsSync(distIndex)) {
    throw new Error(
      `Built binary not found at ${distIndex}.\n` +
        "Run `npm run build` first, or use `npm run test:integration` which builds automatically.",
    );
  }

  // 3. Obtain/validate a Spotify access_token
  const accessToken = process.env.INTEGRATION_SPOTIFY_ACCESS_TOKEN;
  const expiresAt = process.env.INTEGRATION_SPOTIFY_ACCESS_TOKEN_EXPIRES_AT;

  if (!accessToken) {
    // Neither local-dev token nor CI pre-refresh token is set.
    throw new Error(
      [
        'No Spotify access token available.',
        '',
        'For LOCAL development, export the access_token from your existing auth:',
        '  source <(node scripts/export-test-token.js)',
        '  (or see docs/integration-tests.md → "Local development")',
        '',
        'For CI, ensure the "Refresh Spotify token" workflow step ran before this job.',
      ].join('\n'),
    );
  }

  const expiresAtMs = expiresAt ? Number(expiresAt) : Date.now() + 3_600_000;

  console.log('[integration setup] Using provided access_token, writing to cache…');

  const token = {
    access_token: accessToken,
    // Refresh tokens are managed by the CI workflow step (not by setup.ts).
    // The binary won't try to refresh during a run: expires_at is at least an
    // hour from now, so the proactive-refresh guard (now >= expires_at - 60 s)
    // stays false for the entire test run.
    refresh_token: 'managed-by-ci-workflow',
    expires_at: expiresAtMs,
    token_type: 'Bearer',
    scope: 'playlist-read-private playlist-read-collaborative',
    obtained_at: Date.now(),
  };

  writeFileSync(TOKEN_CACHE_PATH, JSON.stringify(token, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });

  // Expose to test workers via process.env (forked workers inherit from parent).
  process.env.INTEGRATION_TOKEN_CACHE_PATH = TOKEN_CACHE_PATH;

  const remainingMinutes = ((expiresAtMs - Date.now()) / 60_000).toFixed(1);
  console.log(`[integration setup] Token cached (${remainingMinutes} min remaining, path: ${TOKEN_CACHE_PATH})`);
}

export async function teardown(): Promise<void> {
  try {
    unlinkSync(TOKEN_CACHE_PATH);
  } catch {
    // File may already be gone — not an error.
  }
}
