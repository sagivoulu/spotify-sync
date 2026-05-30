// ---------------------------------------------------------------------------
// Doctor checks — one exported function per check.
//
// Each function is independently unit-testable and returns a CheckResult plus
// any side-channel data the orchestrator (runDoctor) needs to continue (e.g.
// the loaded config or token). Core functions only; no printing here.
//
// Exit contract: checks never throw on expected failures (missing files,
// invalid config, etc.). They return ok=false with a human-readable `detail`.
// Unexpected I/O errors (permissions, filesystem corruption, etc.) propagate.
// ---------------------------------------------------------------------------

import { MINIMUM_YTDLP_VERSION, getFfmpegVersion, getYtDlpVersion } from '../backend/yt-dlp.js';
import type { SubprocessRunner } from '../backend/yt-dlp.js';
import { ConfigError, loadConfig } from '../config/index.js';
import type { Config, ConfigInput } from '../config/index.js';
import type { SpotifyClient } from '../spotify/index.js';
import { parsePlaylistId } from '../spotify/playlist-url.js';
import { loadToken } from '../spotify/token-store.js';
import type { StoredToken } from '../spotify/token-store.js';
import type { CheckResult } from './types.js';

// ---------------------------------------------------------------------------
// Config check
// ---------------------------------------------------------------------------

export interface CheckConfigOptions {
  /** Config override values (already mapped from CLI flags via mapCliFlags). */
  cliFlags?: ConfigInput;
  /** Injectable environment — defaults to process.env. */
  env?: NodeJS.ProcessEnv;
}

export interface CheckConfigResult {
  result: CheckResult;
  /** Non-null when ok=true; null on failure. */
  config: Config | null;
}

/**
 * Verify that all required config fields are present and non-empty.
 *
 * Uses loadConfig's existing schema validation — client_id, client_secret,
 * playlist_url, and library.path are all required with min-length-1 constraints.
 * A successful load guarantees all four are present.
 */
export function checkConfig(opts?: CheckConfigOptions): CheckConfigResult {
  try {
    const config = loadConfig({ cliFlags: opts?.cliFlags, env: opts?.env });
    return {
      result: {
        name: 'Config',
        ok: true,
        detail: 'client_id, client_secret, playlist_url, library.path all present',
      },
      config,
    };
  } catch (err) {
    if (err instanceof ConfigError) {
      return {
        result: { name: 'Config', ok: false, detail: err.message },
        config: null,
      };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Auth check
// ---------------------------------------------------------------------------

export interface CheckAuthOptions {
  /** Injectable environment — used to resolve the auth.json path via XDG dirs. */
  env?: NodeJS.ProcessEnv;
}

export interface CheckAuthResult {
  result: CheckResult;
  /** Non-null when ok=true; null on failure. */
  token: StoredToken | null;
}

/**
 * Verify that auth.json exists, can be parsed, and contains the required
 * fields (refresh_token, access_token, expires_at).
 *
 * Surfaces loadToken's user-facing error messages directly — they already
 * point to `spotify-sync auth` for missing or corrupt files.
 */
export function checkAuth(opts?: CheckAuthOptions): CheckAuthResult {
  try {
    const token = loadToken({ env: opts?.env });
    return {
      result: { name: 'Auth', ok: true, detail: 'auth.json found and valid' },
      token,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      result: { name: 'Auth', ok: false, detail: message },
      token: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Spotify connectivity check
// ---------------------------------------------------------------------------

export interface CheckSpotifyOptions {
  /** Spotify client to use — injected so tests can pass a fake. */
  client: SpotifyClient;
  /** Raw playlist URL or URI from config (e.g. https://open.spotify.com/playlist/...). */
  playlistUrl: string;
  /** Number of sample tracks to fetch. Default: 2. */
  sampleSize?: number;
}

// ---------------------------------------------------------------------------
// Binary checks — yt-dlp and ffmpeg
// ---------------------------------------------------------------------------

export interface CheckBinaryOptions {
  /** Injectable subprocess runner — defaults to the real execFile-based runner. */
  runner?: SubprocessRunner;
}

const YTDLP_INSTALL_INSTRUCTIONS = [
  'not found on PATH',
  'Install:  brew install yt-dlp              (macOS / Homebrew)',
  '          pipx install yt-dlp              (cross-platform, requires pipx)',
  '          pip install yt-dlp               (cross-platform, requires pip)',
  '          https://github.com/yt-dlp/yt-dlp#installation',
].join('\n');

const FFMPEG_INSTALL_INSTRUCTIONS = [
  'not found on PATH',
  'Install:  brew install ffmpeg              (macOS / Homebrew)',
  '          sudo apt install ffmpeg          (Debian / Ubuntu)',
  '          https://ffmpeg.org/download.html',
].join('\n');

const YTDLP_OUTDATED_INSTRUCTIONS = (version: string) =>
  [
    `${version} — too old (minimum tested: ${MINIMUM_YTDLP_VERSION})`,
    'Older versions are blocked by YouTube bot detection and will fail silently.',
    'Upgrade:  brew upgrade yt-dlp             (macOS / Homebrew)',
    '          pipx upgrade yt-dlp              (cross-platform, requires pipx)',
    '          pip install -U yt-dlp            (cross-platform, requires pip)',
    '          https://github.com/yt-dlp/yt-dlp#installation',
  ].join('\n');

/**
 * Verify that yt-dlp is present on PATH, report its version, and confirm it
 * meets the minimum tested version.
 *
 * Returns ok=false with upgrade instructions when missing or outdated.
 * An outdated yt-dlp is treated the same as missing because older versions
 * hit YouTube's bot detection and fail silently during downloads.
 * Never throws — all errors are captured as ok=false CheckResult.
 */
export async function checkYtDlp(opts?: CheckBinaryOptions): Promise<CheckResult> {
  const versionResult = await getYtDlpVersion(opts?.runner);

  if (!versionResult.available) {
    return { name: 'yt-dlp', ok: false, detail: YTDLP_INSTALL_INSTRUCTIONS };
  }

  const { version } = versionResult;

  // yt-dlp uses YYYY.MM.DD versioning with zero-padded month/day,
  // so lexicographic comparison is equivalent to chronological order.
  if (version < MINIMUM_YTDLP_VERSION) {
    return {
      name: 'yt-dlp',
      ok: false,
      detail: YTDLP_OUTDATED_INSTRUCTIONS(version),
      data: { version, minimumTestedVersion: MINIMUM_YTDLP_VERSION, versionTooOld: true },
    };
  }

  return {
    name: 'yt-dlp',
    ok: true,
    detail: version,
    data: { version },
  };
}

/**
 * Verify that ffmpeg is present on PATH and report its version.
 *
 * Returns ok=false with platform-aware install instructions when missing.
 * Never throws — all errors are captured as ok=false CheckResult.
 */
export async function checkFfmpeg(opts?: CheckBinaryOptions): Promise<CheckResult> {
  const versionResult = await getFfmpegVersion(opts?.runner);
  if (versionResult.available) {
    return {
      name: 'ffmpeg',
      ok: true,
      detail: versionResult.version,
      data: { version: versionResult.version },
    };
  }
  return {
    name: 'ffmpeg',
    ok: false,
    detail: FFMPEG_INSTALL_INSTRUCTIONS,
  };
}

// ---------------------------------------------------------------------------
// Spotify connectivity check
// ---------------------------------------------------------------------------

/**
 * Verify live Spotify connectivity:
 * 1. Parse the playlist URL to extract the ID.
 * 2. Call fetchPlaylistSummary — exercises token refresh + two real API calls.
 * 3. Return the playlist name, track count, and first N tracks as structured data.
 *
 * Any API or auth error is returned as ok=false with the error message as detail.
 */
export async function checkSpotify(opts: CheckSpotifyOptions): Promise<CheckResult> {
  const { client, playlistUrl, sampleSize = 2 } = opts;

  // Parse the playlist ID before making any network calls.
  let playlistId: string;
  try {
    playlistId = parsePlaylistId(playlistUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { name: 'Spotify', ok: false, detail: message };
  }

  try {
    const summary = await client.fetchPlaylistSummary(playlistId, sampleSize);
    const sampleTracks = summary.tracks.map((t) => `${t.title} — ${t.artists.join(', ')}`);
    return {
      name: 'Spotify',
      ok: true,
      detail: `"${summary.name}" (${summary.trackCount} tracks)`,
      data: {
        playlistName: summary.name,
        trackCount: summary.trackCount,
        sampleTracks,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { name: 'Spotify', ok: false, detail: message };
  }
}
