#!/usr/bin/env node
// ---------------------------------------------------------------------------
// export-test-token.js — emit shell exports for the integration test suite.
//
// Usage:
//   source <(node scripts/export-test-token.js)
//   npm run test:integration
//
// Reads the access_token and its expiry from auth.json and exports them as
// INTEGRATION_SPOTIFY_ACCESS_TOKEN and INTEGRATION_SPOTIFY_ACCESS_TOKEN_EXPIRES_AT.
// This is the CORRECT way to run integration tests locally: it lets setup.ts
// use the access_token directly without calling the Spotify refresh endpoint,
// so the SPOTIFY_REFRESH_TOKEN stored in GitHub Actions secrets is never
// consumed or rotated.
//
// The access_token is valid for 1 hour (3600 s from when `spotify-sync auth`
// was last run). If it has expired, re-run `spotify-sync auth` first.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const configDir = process.env.XDG_CONFIG_HOME
  ? join(process.env.XDG_CONFIG_HOME, 'spotify-sync')
  : join(homedir(), '.config', 'spotify-sync');

const authPath = join(configDir, 'auth.json');

let token;
try {
  token = JSON.parse(readFileSync(authPath, 'utf-8'));
} catch {
  process.stderr.write(`Error: could not read ${authPath}\n`);
  process.stderr.write(`Run \`spotify-sync auth\` first to authenticate.\n`);
  process.exit(1);
}

if (!token.access_token || !token.expires_at) {
  process.stderr.write(`Error: auth.json is missing access_token or expires_at.\n`);
  process.stderr.write(`Run \`spotify-sync auth\` to re-authenticate.\n`);
  process.exit(1);
}

const nowMs = Date.now();
const remainingMs = token.expires_at - nowMs;

if (remainingMs <= 0) {
  process.stderr.write(`Error: access_token has expired (${Math.abs(remainingMs / 1000).toFixed(0)}s ago).\n`);
  process.stderr.write(`Run \`spotify-sync auth\` to re-authenticate.\n`);
  process.exit(1);
}

const remainingMin = (remainingMs / 60_000).toFixed(1);
process.stderr.write(`access_token valid for ${remainingMin} more minutes.\n`);

// Emit shell export statements — caller uses `source <(...)` to pick them up.
process.stdout.write(`export INTEGRATION_SPOTIFY_ACCESS_TOKEN='${token.access_token}'\n`);
process.stdout.write(`export INTEGRATION_SPOTIFY_ACCESS_TOKEN_EXPIRES_AT='${token.expires_at}'\n`);
