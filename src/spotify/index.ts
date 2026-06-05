// ---------------------------------------------------------------------------
// Public surface of src/spotify/.
//
// The rest of the codebase imports from here — never from internal modules
// directly. The SDK, raw fetch helpers, and page-mapping internals stay hidden.
// ---------------------------------------------------------------------------

export type {
  PlaylistSummary,
  SpotifyClient,
  SpotifyTrack,
  SpotifyTrackMetadata,
} from './client.js';
export { createSpotifyClient } from './client.js';
export { parsePlaylistId } from './playlist-url.js';

import { createSpotifyClient } from './client.js';
import type { SpotifyClient } from './client.js';
import { loadToken, saveToken } from './token-store.js';

export interface CreateSpotifyClientFromDiskOptions {
  /** Spotify application client ID (from config). */
  clientId: string;
  /**
   * Underlying fetch implementation. Defaults to global fetch.
   * Useful in tests or for proxy setups.
   */
  fetchFn?: typeof fetch;
  /** Injectable environment for XDG path resolution. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Convenience factory that loads the stored token from auth.json and wires
 * saveToken as the onTokenRefreshed callback so refreshes are persisted.
 *
 * Throws a user-facing error (mentioning `spotify-sync auth`) if auth.json is
 * missing or corrupt — the CLI surfaces this directly to the user.
 *
 * When the SPOTIFY_SYNC_SPOTIFY_BASE_URL environment variable is set, it is
 * read from `env` and forwarded to createSpotifyClient as the `baseUrl` dep,
 * redirecting all API calls to that base (used by the component test suite
 * to point the binary at a local fake Spotify server).
 */
export function createSpotifyClientFromDisk(
  opts: CreateSpotifyClientFromDiskOptions,
): SpotifyClient {
  const { clientId, fetchFn, env } = opts;
  const token = loadToken({ env });
  // Read the base-URL override from the environment. This is set by the component
  // test harness (SPOTIFY_SYNC_SPOTIFY_BASE_URL) and is undefined in production.
  const baseUrl = env?.SPOTIFY_SYNC_SPOTIFY_BASE_URL || undefined;
  return createSpotifyClient({
    clientId,
    token,
    fetchFn,
    baseUrl,
    onTokenRefreshed: (t) => saveToken(t, { env }),
  });
}
