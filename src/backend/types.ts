// ---------------------------------------------------------------------------
// Core types for the download backend abstraction.
//
// All names are source-agnostic (no "Spotify*") per prd/future/multi-source.md.
// The DownloadBackend interface is the only thing imported by the sync pipeline;
// YtDlpBackend is never referenced outside src/backend/.
// ---------------------------------------------------------------------------

export interface AudioFormat {
  codec: 'mp3' | 'm4a';
  /**
   * Target bitrate in kbps. Only applicable to mp3.
   * Omit for m4a passthrough — yt-dlp/ffmpeg selects the best available quality.
   */
  bitrateKbps?: number;
}

export interface SearchQuery {
  artist: string;
  title: string;
  /**
   * Track duration hint in milliseconds. Passed to the backend as context;
   * v1 does not use it for ranking (match-quality validation is future scope).
   */
  durationMs?: number;
}

export interface Candidate {
  /** Canonical URL of the result (e.g. a YouTube watch URL). */
  url: string;
  /**
   * Source platform label, e.g. "youtube" or "youtube-music".
   * Stored in tracks.backend_source for traceability.
   */
  sourceLabel: string;
  /** Duration of the candidate in milliseconds, if known. */
  durationMs?: number;
  /** Title as reported by the source platform. */
  title?: string;
}

export type DownloadResult =
  | {
      success: true;
      filePath: string;
      candidate: Candidate;
      backend: string;
      /**
       * Raw stderr captured from the subprocess, even on success.
       * yt-dlp writes progress/warning lines to stderr regardless of exit code;
       * the sync pipeline forwards this to the per-run log file.
       */
      stderr: string;
    }
  | { success: false; error: string };

export interface DownloadBackend {
  /**
   * Stable identifier for this backend, e.g. "yt-dlp".
   * Stored in tracks.backend after a successful download.
   */
  name: string;

  /**
   * Search for candidates matching the query.
   *
   * Returns an array of candidates. v1 always returns 0 or 1 element (the top result).
   * An empty array means no match was found.
   *
   * Throws BackendError when the underlying subprocess exits non-zero unexpectedly.
   */
  search(query: SearchQuery): Promise<Candidate[]>;

  /**
   * Download the given candidate to outPath.
   *
   * Never throws — subprocess failures are captured and returned as
   * { success: false, error }. On success, raw stderr is included in the
   * result (yt-dlp writes progress/warnings to stderr even on code 0).
   * Neither case prints to the console — the sync pipeline writes stderr to
   * the per-run log file.
   */
  download(
    candidate: Candidate,
    opts: { outPath: string; format: AudioFormat },
  ): Promise<DownloadResult>;
}

/**
 * Thrown by search() when the backend subprocess exits non-zero.
 *
 * Carries the captured stderr and exit code so callers can record last_error
 * in the DB without emitting raw subprocess noise to the console.
 */
export class BackendError extends Error {
  readonly stderr: string;
  readonly exitCode: number;

  constructor(message: string, stderr = '', exitCode = -1) {
    super(message);
    this.name = 'BackendError';
    this.stderr = stderr;
    this.exitCode = exitCode;
  }
}
