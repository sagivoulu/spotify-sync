// ---------------------------------------------------------------------------
// runDoctor — orchestrates all health checks.
//
// Check order:
//   Config → Auth → Spotify   (auth/Spotify skip when prerequisites fail)
//   yt-dlp → ffmpeg            (always run, independent of config/auth)
//
// The yt-dlp and ffmpeg checks are independent of the Spotify/config chain
// because the binaries are needed for downloads regardless of auth state.
// ---------------------------------------------------------------------------

import type { SubprocessRunner } from '../backend/yt-dlp.js';
import type { ConfigInput } from '../config/index.js';
import type { SpotifyClient } from '../spotify/index.js';
import { createSpotifyClientFromDisk } from '../spotify/index.js';
import { checkAuth, checkConfig, checkFfmpeg, checkSpotify, checkYtDlp } from './checks.js';
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
  /**
   * Injectable subprocess runner for the yt-dlp and ffmpeg binary checks.
   * When omitted, the real execFile-based runner is used.
   * Tests inject a fake runner to avoid requiring binaries in the test environment.
   */
  binaryRunner?: SubprocessRunner;
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
  const { cliFlags, env, spotifyClient, fetchFn, sampleSize = 2, binaryRunner } = opts;
  const results: CheckResult[] = [];

  // --- Check 1: Config ---
  const { result: configResult, config } = checkConfig({ cliFlags, env });
  results.push(configResult);

  if (configResult.ok && config !== null) {
    // --- Check 2: Auth (requires valid config) ---
    const { result: authResult } = checkAuth({ env });
    results.push(authResult);

    if (authResult.ok) {
      // --- Check 3: Spotify connectivity (requires valid auth) ---
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
    } else {
      results.push({ name: 'Spotify', ok: false, detail: 'skipped — Auth check failed' });
    }
  } else {
    // Config failed — Auth and Spotify cannot run.
    results.push({ name: 'Auth', ok: false, detail: 'skipped — Config check failed' });
    results.push({ name: 'Spotify', ok: false, detail: 'skipped — Config check failed' });
  }

  // --- Check 4 & 5: Binary checks — always run, independent of config/auth ---
  const ytDlpResult = await checkYtDlp({ runner: binaryRunner });
  results.push(ytDlpResult);

  const ffmpegResult = await checkFfmpeg({ runner: binaryRunner });
  results.push(ffmpegResult);

  const ok = results.every((r) => r.ok);
  return { results, ok };
}
