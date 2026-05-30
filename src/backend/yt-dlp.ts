// ---------------------------------------------------------------------------
// YtDlpBackend — the v1 DownloadBackend implementation.
//
// Design decisions:
// - Subprocess runner is injected (default: node:child_process execFile, not
//   exec/shell) so args are passed as an array and never shell-interpolated.
//   This also makes the implementation unit-testable without a real binary.
// - search() never prints to the console; stderr is captured into BackendError.
// - download() never throws; failures are returned as { success: false }.
// - search_source is passed at factory time and drives ytmsearch vs ytsearch.
// ---------------------------------------------------------------------------

import { execFile } from 'node:child_process';
import { BackendError } from './types.js';
import type {
  AudioFormat,
  Candidate,
  DownloadBackend,
  DownloadResult,
  SearchQuery,
} from './types.js';

// ---------------------------------------------------------------------------
// Subprocess runner — injectable for tests
// ---------------------------------------------------------------------------

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Runs a binary with the given args. Resolves with { stdout, stderr, code }
 * when the process exits (including non-zero exit codes).
 * Rejects for OS-level errors (e.g. ENOENT — binary not found on PATH).
 */
export type SubprocessRunner = (binary: string, args: string[]) => Promise<RunResult>;

/** Default runner using node:child_process execFile (no shell — safe for untrusted args). */
export const defaultRunner: SubprocessRunner = (
  binary: string,
  args: string[],
): Promise<RunResult> =>
  new Promise((resolve, reject) => {
    execFile(binary, args, { encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err === null) {
        resolve({ stdout, stderr, code: 0 });
        return;
      }
      // OS-level errors (ENOENT = binary not found, etc.) have a string err.code.
      // Propagate them so callers can detect "not installed" vs "exited non-zero".
      if (typeof err.code === 'string') {
        reject(err);
        return;
      }
      // Process ran but exited non-zero — resolve so callers can inspect the output.
      resolve({
        stdout,
        stderr,
        code: typeof err.code === 'number' ? err.code : 1,
      });
    });
  });

// ---------------------------------------------------------------------------
// Search target builder — maps search_source + query to a yt-dlp target.
// ---------------------------------------------------------------------------

/**
 * Build the yt-dlp target argument for the given search source and query.
 *
 * Adding a new search source means adding one case here — nothing else changes.
 *
 * @throws Error when searchSource is unrecognised.
 */
export function buildSearchTarget(searchSource: string, query: SearchQuery): string {
  const q = `${query.artist} ${query.title}`;
  switch (searchSource) {
    case 'youtube-music':
      // music.youtube.com/search treated as a playlist of results; -I 1 takes the first.
      return `https://music.youtube.com/search?q=${encodeURIComponent(q)}`;
    case 'youtube':
      // yt-dlp built-in YouTube search prefix; `1` means top 1 result.
      return `ytsearch1:${q}`;
    default:
      throw new Error(
        `Unknown search_source "${searchSource}". Supported values: "youtube-music", "youtube".`,
      );
  }
}

/**
 * Return the yt-dlp args for a search based on the search source.
 * Separated from buildSearchTarget so tests can inspect both the target and flags.
 */
export function buildSearchArgs(searchSource: string, query: SearchQuery): string[] {
  const target = buildSearchTarget(searchSource, query);
  const baseArgs = ['--dump-json', '--no-playlist', '--quiet'];
  if (searchSource === 'youtube-music') {
    // -I 1 (--playlist-items 1) restricts the search playlist to the first result.
    return [...baseArgs, '-I', '1', target];
  }
  return [...baseArgs, target];
}

// ---------------------------------------------------------------------------
// yt-dlp JSON output → Candidate
// ---------------------------------------------------------------------------

interface YtDlpDumpJson {
  webpage_url?: string;
  url?: string;
  title?: string;
  duration?: number;
  extractor?: string;
  extractor_key?: string;
}

function parseCandidate(json: YtDlpDumpJson): Candidate {
  const url = json.webpage_url ?? json.url ?? '';
  const sourceLabel = (json.extractor ?? 'youtube').toLowerCase();
  return {
    url,
    sourceLabel,
    title: json.title,
    durationMs: json.duration !== undefined ? Math.round(json.duration * 1000) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Version probes — exported for src/doctor/checks.ts
// ---------------------------------------------------------------------------

export type VersionResult =
  | { available: true; version: string }
  | { available: false; error: string };

/**
 * Probe whether yt-dlp is available on PATH and return its version string.
 * Never throws — ENOENT and non-zero exits are both mapped to available:false.
 */
export async function getYtDlpVersion(
  runner: SubprocessRunner = defaultRunner,
): Promise<VersionResult> {
  try {
    const { stdout, code } = await runner('yt-dlp', ['--version']);
    if (code !== 0) {
      return { available: false, error: `yt-dlp exited with code ${code}` };
    }
    return { available: true, version: stdout.trim() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { available: false, error: msg };
  }
}

/**
 * Probe whether ffmpeg is available on PATH and return its version string.
 * Never throws — ENOENT and non-zero exits are both mapped to available:false.
 */
export async function getFfmpegVersion(
  runner: SubprocessRunner = defaultRunner,
): Promise<VersionResult> {
  try {
    // ffmpeg -version outputs "ffmpeg version <ver> ..." on the first line (stdout, exit 0).
    const { stdout, code } = await runner('ffmpeg', ['-version']);
    if (code !== 0) {
      return { available: false, error: `ffmpeg exited with code ${code}` };
    }
    const firstLine = stdout.split('\n')[0] ?? '';
    const match = firstLine.match(/ffmpeg version (\S+)/);
    return { available: true, version: match?.[1] ?? firstLine.trim() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { available: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// YtDlpBackend factory
// ---------------------------------------------------------------------------

export interface YtDlpBackendOpts {
  /**
   * config.download.search_source — which platform to search on.
   * Supported: "youtube-music" (default), "youtube".
   */
  searchSource?: string;
  /** Injectable subprocess runner. Defaults to the real execFile-based runner. */
  runner?: SubprocessRunner;
}

/**
 * Create a DownloadBackend backed by yt-dlp.
 *
 * The returned object is the only thing the sync pipeline should reference.
 * YtDlpBackend is never imported directly outside src/backend/.
 */
export function createYtDlpBackend(opts: YtDlpBackendOpts = {}): DownloadBackend {
  const searchSource = opts.searchSource ?? 'youtube-music';
  const runner = opts.runner ?? defaultRunner;

  return {
    name: 'yt-dlp',

    async search(query: SearchQuery): Promise<Candidate[]> {
      const args = buildSearchArgs(searchSource, query);
      const { stdout, stderr, code } = await runner('yt-dlp', args);

      if (code !== 0) {
        throw new BackendError(`yt-dlp search failed (exit ${code})`, stderr, code);
      }

      // yt-dlp --dump-json outputs one JSON object per line.
      // We take the first parseable entry with a url/webpage_url field.
      const candidates: Candidate[] = [];
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as YtDlpDumpJson;
          if (parsed.webpage_url ?? parsed.url) {
            candidates.push(parseCandidate(parsed));
            break; // v1: top result only
          }
        } catch {
          // Skip non-JSON lines (e.g. yt-dlp progress/warning lines)
        }
      }
      return candidates;
    },

    async download(
      candidate: Candidate,
      opts: { outPath: string; format: AudioFormat },
    ): Promise<DownloadResult> {
      const { outPath, format } = opts;

      // Pass outPath as a template so yt-dlp appends the correct extension.
      const outputTemplate = `${outPath}.%(ext)s`;
      const args = [candidate.url, '-x', '--audio-format', format.codec];

      if (format.codec === 'mp3' && format.bitrateKbps !== undefined) {
        args.push('--audio-quality', `${format.bitrateKbps}k`);
      }

      args.push('-o', outputTemplate);

      try {
        const { stderr, code } = await runner('yt-dlp', args);

        if (code !== 0) {
          // Capture stderr into the result — don't print it; the sync pipeline
          // writes it to the log file and records it in tracks.last_error.
          return {
            success: false,
            error: stderr.trim() || `yt-dlp exited with code ${code}`,
          };
        }

        return {
          success: true,
          filePath: `${outPath}.${format.codec}`,
          candidate,
          backend: 'yt-dlp',
        };
      } catch (err) {
        // OS-level errors (e.g. ENOENT — yt-dlp not installed). Return as failure
        // rather than throwing, because the caller expects a DownloadResult.
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg };
      }
    },
  };
}
