// ---------------------------------------------------------------------------
// runDoctor — orchestrates all health checks in dependency order.
//
// Check order: Config → Auth → Spotify.
// If Config fails, Auth and Spotify are reported as skipped (they can't run
// without a valid config). If Auth fails, Spotify is skipped (no token).
//
// The Spotify client is injectable for tests; production builds it from disk
// via createSpotifyClientFromDisk.
// ---------------------------------------------------------------------------

import type { ConfigInput } from '../config/index.js';
import type { SpotifyClient } from '../spotify/index.js';
import { createSpotifyClientFromDisk } from '../spotify/index.js';
import { checkAuth, checkConfig, checkSpotify } from './checks.js';
import type { CheckResult } from './types.js';

export type { CheckResult } from './types.js';

export interface RunDoctorOptions {
  /** Config overrides from CLI flags (already mapped via mapCliFlags). */
  cliFlags?: ConfigInput;
  /** Injectable environment — defaults to process.env. Used to resolve XDG paths. */
  env?: NodeJS.ProcessEnv;
  /**
   * Injectable Spotify client — used in tests to avoid live API calls.
   * When omitted, the production path builds a client via createSpotifyClientFromDisk.
   */
  spotifyClient?: SpotifyClient;
  /**
   * Injectable fetch — forwarded to createSpotifyClientFromDisk when no
   * spotifyClient is provided. Tests can use this to intercept API calls.
   */
  fetchFn?: typeof fetch;
  /** Number of sample tracks for the Spotify check. Default: 2. */
  sampleSize?: number;
}

export interface RunDoctorResult {
  results: CheckResult[];
  /** true if every check passed. */
  ok: boolean;
}

/**
 * Run all doctor health checks and return structured results.
 *
 * Never throws on expected failures — all diagnostic errors are captured as
 * CheckResult.ok = false. Only unexpected I/O errors propagate.
 */
export async function runDoctor(opts: RunDoctorOptions = {}): Promise<RunDoctorResult> {
  const { cliFlags, env, spotifyClient, fetchFn, sampleSize = 2 } = opts;
  const results: CheckResult[] = [];

  // --- Check 1: Config ---
  const { result: configResult, config } = checkConfig({ cliFlags, env });
  results.push(configResult);

  if (!configResult.ok) {
    // Auth and Spotify both require a valid config.
    results.push({ name: 'Auth', ok: false, detail: 'skipped — Config check failed' });
    results.push({ name: 'Spotify', ok: false, detail: 'skipped — Config check failed' });
    return { results, ok: false };
  }

  // --- Check 2: Auth ---
  const { result: authResult } = checkAuth({ env });
  results.push(authResult);

  if (!authResult.ok) {
    // Spotify check requires a valid token.
    results.push({ name: 'Spotify', ok: false, detail: 'skipped — Auth check failed' });
    return { results, ok: false };
  }

  // --- Check 3: Spotify connectivity ---
  // config is guaranteed non-null here because we returned early when configResult.ok
  // was false. TypeScript can't narrow through result.ok, so we use a guard.
  if (config === null) {
    // Unreachable: configResult.ok=true always means config is non-null.
    results.push({ name: 'Spotify', ok: false, detail: 'skipped — Config check failed' });
    return { results, ok: false };
  }

  // Use the injected client (tests) or build one from disk (production).
  const client =
    spotifyClient ??
    createSpotifyClientFromDisk({
      clientId: config.spotify.client_id,
      fetchFn,
      env,
    });

  const spotifyResult = await checkSpotify({
    client,
    playlistUrl: config.spotify.playlist_url,
    sampleSize,
  });
  results.push(spotifyResult);

  const ok = results.every((r) => r.ok);
  return { results, ok };
}
