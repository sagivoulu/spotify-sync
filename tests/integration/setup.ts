import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Global setup — runs ONCE in the main process before any test worker starts.
//
// Two responsibilities:
//
// 1. Validate env vars — fail loudly with a list of missing names so the
//    error is immediately actionable (no silent skips per AC).
//
// 2. Pre-refresh the Spotify token — this is the critical architectural fix
//    for refresh-token rotation.
//
//    Problem: each test creates an isolated sandbox and seeds auth.json with
//    the static SPOTIFY_REFRESH_TOKEN.  If Spotify rotates the refresh token
//    on the first use (issuing a new one and revoking the original), every
//    subsequent test that also seeds the original token gets a 400 invalid_grant.
//
//    Fix: refresh the token ONCE here, store the result in a temp file, and set
//    INTEGRATION_TOKEN_CACHE_PATH so all test workers (forked after this setup
//    runs, so they inherit process.env) find the cached token via seedAuth.
//    Since access_tokens are valid for 1 hour and integration runs take <10 min,
//    no test will need to refresh mid-run — so only this single rotation event
//    matters per CI run.
//
//    If the refresh itself fails (e.g. token revoked), setup throws immediately
//    with a clear message pointing to the re-mint steps in the docs rather than
//    letting each test fail independently with a cryptic 400.
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const REQUIRED_ENV_VARS: string[] = [
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_CLIENT_SECRET',
  'SPOTIFY_REFRESH_TOKEN',
  'SPOTIFY_PLAYLIST_URL',
  'SPOTIFY_PLAYLIST_URL_SUBSET',
];

const TOKEN_CACHE_PATH = resolve(tmpdir(), `spotify-sync-it-token-${process.pid}.json`);

export async function setup(): Promise<void> {
  // 1. Validate env vars
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

  // 3. Pre-refresh the Spotify token (once per test run)
  console.log('[integration setup] Refreshing Spotify token…');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: process.env.SPOTIFY_REFRESH_TOKEN!,
    client_id: process.env.SPOTIFY_CLIENT_ID!,
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '(no body)');
    throw new Error(
      [
        `Spotify token refresh failed (${response.status}): ${text}`,
        '',
        'The SPOTIFY_REFRESH_TOKEN is invalid or revoked.',
        'To fix: run `spotify-sync auth` locally, copy the new refresh_token from',
        '  ~/.config/spotify-sync/auth.json',
        'then update the SPOTIFY_REFRESH_TOKEN GitHub Actions secret.',
        'See docs/integration-tests.md → "Minting a refresh token".',
      ].join('\n'),
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope: string;
  };

  const obtainedAt = Date.now();
  const token = {
    access_token: data.access_token,
    // Carry forward the original if Spotify omits a new one (no rotation).
    refresh_token: data.refresh_token ?? process.env.SPOTIFY_REFRESH_TOKEN!,
    expires_at: obtainedAt + data.expires_in * 1000,
    token_type: data.token_type ?? 'Bearer',
    scope: data.scope,
    obtained_at: obtainedAt,
  };

  writeFileSync(TOKEN_CACHE_PATH, JSON.stringify(token, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });

  // Expose to test workers — forks inherit process.env from the main process,
  // so this value is visible in all seedAuth() calls during this run.
  process.env.INTEGRATION_TOKEN_CACHE_PATH = TOKEN_CACHE_PATH;

  console.log('[integration setup] Token cached, expires_in:', data.expires_in, 's');
}

export async function teardown(): Promise<void> {
  try {
    unlinkSync(TOKEN_CACHE_PATH);
  } catch {
    // File may already be gone — not an error.
  }
}
