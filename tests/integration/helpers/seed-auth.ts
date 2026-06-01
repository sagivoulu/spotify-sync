import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// seedAuth — write a StoredToken to the sandbox's auth.json.
//
// Token source (in priority order):
//
// 1. INTEGRATION_TOKEN_CACHE_PATH (set by setup.ts globalSetup):
//    A pre-refreshed token written by the global setup.  All tests in a
//    single run share this token — it has a valid access_token (not expired)
//    so the binary never needs to call Spotify's refresh endpoint mid-test,
//    avoiding refresh-token rotation problems where the second test's seeded
//    original token has been invalidated by the first test's rotation.
//
// 2. Fallback — SPOTIFY_REFRESH_TOKEN with an expired placeholder access_token.
//    Used when running seedAuth outside of the vitest integration suite
//    (e.g. ad-hoc scripts).  In this case the binary will refresh on first
//    API call, which may trigger rotation.
// ---------------------------------------------------------------------------

interface CachedToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  scope: string;
  obtained_at: number;
}

function loadCachedToken(): CachedToken | null {
  const cachePath = process.env.INTEGRATION_TOKEN_CACHE_PATH;
  if (!cachePath) return null;
  try {
    if (!existsSync(cachePath)) return null;
    return JSON.parse(readFileSync(cachePath, 'utf-8')) as CachedToken;
  } catch {
    return null;
  }
}

export function seedAuth(configDir: string): void {
  const cached = loadCachedToken();

  const token: CachedToken = cached ?? {
    refresh_token: (() => {
      const t = process.env.SPOTIFY_REFRESH_TOKEN;
      if (!t) throw new Error('SPOTIFY_REFRESH_TOKEN is not set — cannot seed auth.json');
      return t;
    })(),
    // Non-empty placeholder — forces proactive refresh on first API call.
    // (loadToken in src/spotify/token-store.ts rejects empty access_token.)
    access_token: 'placeholder',
    expires_at: 0,
    token_type: 'Bearer',
    scope: 'playlist-read-private playlist-read-collaborative',
    obtained_at: 0,
  };

  const filePath = join(configDir, 'auth.json');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(token, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: 0o600,
  });
  chmodSync(filePath, 0o600);
}
