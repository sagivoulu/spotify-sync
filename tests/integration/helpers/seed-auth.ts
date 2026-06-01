import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// seedAuth — write a StoredToken to the sandbox's auth.json.
//
// Seeds the SPOTIFY_REFRESH_TOKEN from the environment as the stored refresh
// token. The access_token is set to a non-empty placeholder and expires_at to
// 0 so the Spotify client proactively refreshes on the first API call (since
// 0 is always < now() - REFRESH_SKEW_MS of 60 s).
//
// loadToken (src/spotify/token-store.ts) validates that access_token is
// non-empty — hence "placeholder" rather than an empty string.
//
// The scope string matches the SCOPES constant in src/spotify/auth.ts.
// ---------------------------------------------------------------------------

export function seedAuth(configDir: string): void {
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error('SPOTIFY_REFRESH_TOKEN is not set — cannot seed auth.json');
  }

  const token = {
    refresh_token: refreshToken,
    // Non-empty placeholder — the proactive-refresh path replaces it before
    // any real API call (expires_at: 0 ensures now() >= 0 - 60000 is always true).
    access_token: 'placeholder',
    expires_at: 0,
    token_type: 'Bearer',
    scope: 'playlist-read-private playlist-read-collaborative',
    obtained_at: 0,
  };

  const filePath = join(configDir, 'auth.json');
  // configDir is pre-created by createSandbox; mkdirSync is defensive.
  mkdirSync(configDir, { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(token, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: 0o600,
  });
  chmodSync(filePath, 0o600);
}
