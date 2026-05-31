// ---------------------------------------------------------------------------
// StatusReport — the `--json` data contract for `spotify-sync status`.
//
// This is the single machine-readable shape: the CLI human formatter reads
// from it, the --json flag serialises it as-is, and a future UI consumes it.
// ---------------------------------------------------------------------------

/** A track entry in one of the problem-track lists. */
export interface TrackListItem {
  artist: string;
  title: string;
  sourceId: string;
  /** Present only on failed tracks. */
  error?: string;
}

/** Aggregate counts derived from the local DB. */
export interface LibraryCounts {
  /** Tracks whose file exists on disk (status=downloaded + file present). */
  downloaded: number;
  /** Tracks not yet downloaded (status=pending). */
  pending: number;
  /** Tracks whose DB status is downloaded but whose file is absent from disk. */
  missingFiles: number;
  /** Tracks that failed to download (status=failed). */
  failed: number;
  /** Tracks that require manual resolution (status=needs_manual). */
  needsManual: number;
  /**
   * Total tracks known to be in the playlist (all statuses except
   * removed_from_source): pending + downloaded + failed + needs_manual.
   */
  knownInPlaylist: number;
}

export interface LibraryStatus {
  /** False when the config file is missing or invalid. */
  configured: boolean;
  /** Absolute path to the library directory, or null when unconfigured. */
  downloadDir: string | null;
  /** Absolute path to the SQLite DB file, or null when unconfigured. */
  dbPath: string | null;
  /** False when the DB file or `tracks` table does not exist yet. */
  dbInitialized: boolean;
  /** Null when unconfigured or DB is not initialised. */
  counts: LibraryCounts | null;
  /**
   * max(0, playlist.total - counts.knownInPlaylist) — tracks in Spotify that
   * haven't been pulled into the local library yet. Null when playlist total
   * is unavailable (offline or unconfigured).
   */
  notYetSynced: number | null;
  /** Pending tracks (status=pending). Always populated when DB is initialised. */
  notDownloaded: TrackListItem[];
  /** Downloaded tracks whose file is missing from disk. */
  missingFiles: TrackListItem[];
  /** Tracks that failed to download, with last_error. */
  failed: TrackListItem[];
  /** Human-readable error detail when configured=false. */
  detail?: string;
}

export interface PlaylistStatus {
  /** Spotify playlist display name, or null when unavailable. */
  name: string | null;
  /**
   * Total tracks in the Spotify playlist (live) or the local DB count
   * (last-sync fallback). Null when neither is available.
   */
  total: number | null;
  /** Indicates whether `total` came from a live Spotify call or the local DB. */
  source: 'live' | 'last-sync';
}

export interface SetupStatus {
  /** True when all doctor checks passed. */
  ok: boolean;
  /** Names of checks that failed (e.g. ["Auth", "ffmpeg"]). */
  failedChecks: string[];
}

/**
 * Full status report returned by `getStatus` and serialised by `--json`.
 *
 * Schema notes:
 * - `setup.ok` drives the exit code: 0 = everything configured; 1 = problems.
 * - `playlist.total` uses live Spotify data when available, falls back to the
 *   local DB's `knownInPlaylist` count. The `source` field labels which.
 * - All list fields (`library.notDownloaded`, etc.) are always populated when
 *   the DB is initialised — the `--list` CLI flag only controls whether they're
 *   printed in human mode.
 */
export interface StatusReport {
  setup: SetupStatus;
  playlist: PlaylistStatus;
  library: LibraryStatus;
  /** True when setup.ok is true. */
  ok: boolean;
}
