// ---------------------------------------------------------------------------
// CheckResult — the extensible contract for a single health check.
//
// Every check in `spotify-sync doctor` produces one CheckResult. New checks
// (yt-dlp, ffmpeg, DB, …) add to the list without touching existing code.
// ---------------------------------------------------------------------------

export interface CheckResult {
  /** Human-readable check name, e.g. "Config", "Auth", "Spotify". */
  name: string;
  /** true = check passed, false = check failed or was skipped. */
  ok: boolean;
  /**
   * One-line summary displayed next to the ✓/✗ icon:
   * - On failure: the failure reason (or "skipped — <reason>").
   * - On success: a brief human-readable summary (e.g. playlist name + count).
   */
  detail: string;
  /**
   * Optional structured data for --json consumers.
   * Only present on checks that have meaningful structured output on success
   * (e.g. the Spotify check attaches playlistName, trackCount, sampleTracks).
   */
  data?: Record<string, unknown>;
}
