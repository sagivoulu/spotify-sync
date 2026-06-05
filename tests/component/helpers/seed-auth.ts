import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// seedAuth — write a fake StoredToken to the sandbox's auth.json.
//
// The token has a far-future expires_at so the Spotify client's proactive-
// refresh guard (now() >= expires_at - 60s) stays false for the entire test
// run. This means refreshAccessToken is never called — the token endpoint at
// accounts.spotify.com is never hit, and the fake Spotify server only needs to
// serve data-plane API routes (/v1/playlists/..., /v1/tracks/...).
//
// loadToken in src/spotify/token-store.ts validates:
//   - refresh_token truthy
//   - access_token truthy
//   - expires_at defined
// All three pass with the values below.
// ---------------------------------------------------------------------------

export function seedAuth(configDir: string): void {
  const token = {
    access_token: 'fake-access-token',
    refresh_token: 'fake-refresh-token',
    // Far future (24 hours from now): never triggers a proactive refresh.
    expires_at: Date.now() + 86_400_000,
    token_type: 'Bearer',
    scope: 'playlist-read-private playlist-read-collaborative',
    obtained_at: Date.now(),
  };

  const filePath = join(configDir, 'auth.json');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(token, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: 0o600,
  });
  chmodSync(filePath, 0o600);
}
