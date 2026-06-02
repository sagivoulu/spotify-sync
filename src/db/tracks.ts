import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Track DB helpers — read/write operations on the `tracks` table.
//
// All functions take `db` + primitives (never a full Config) so they can be
// exercised in tests against ':memory:' DBs without a full environment.
// Timestamps are ISO strings passed in by the caller (injectable clock).
// ---------------------------------------------------------------------------

/** Shape returned by a SELECT on the tracks table for pending rows. */
export interface TrackRow {
  id: number;
  source_id: string;
  artist: string;
  title: string;
  album: string | null;
  release_year: number | null;
  duration_ms: number | null;
  attempts: number;
}

export interface ImportTargetRow {
  id: number;
  source_id: string;
  artist: string;
  title: string;
  file_path: string | null;
}

export interface PrunableTrackRow {
  id: number;
  source_id: string;
  artist: string;
  title: string;
  file_path: string;
}

// ---------------------------------------------------------------------------
// upsertTrack
// ---------------------------------------------------------------------------

export interface UpsertTrackParams {
  libraryId: string;
  source: string;
  sourceId: string;
  artist: string;
  title: string;
  album: string | null;
  releaseYear: number | null;
  durationMs: number | null;
  sourceAddedAt: string | null;
  now: string;
}

/**
 * Insert a new track row or, if one already exists for (library_id, source, source_id),
 * refresh its metadata fields and `last_synced_at`.
 *
 * Insert path → status='pending', attempts=0, first_seen_at=now, last_synced_at=now.
 * Conflict path → refresh artist/title/album/release_year/duration_ms + last_synced_at.
 *   Status, file_path, attempts, downloaded_at are intentionally left untouched:
 *   the tool never auto-retries failed rows, and it never renames files.
 *
 * Returns the row id and whether this was a new insertion.
 */
export function upsertTrack(
  db: Database.Database,
  params: UpsertTrackParams,
): { id: number; isNew: boolean } {
  const {
    libraryId,
    source,
    sourceId,
    artist,
    title,
    album,
    releaseYear,
    durationMs,
    sourceAddedAt,
    now,
  } = params;

  const result = db
    .prepare(
      `
      INSERT INTO tracks
        (library_id, source, source_id, artist, title, album, release_year, duration_ms,
         source_added_at, status, attempts, first_seen_at, last_synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
      ON CONFLICT (library_id, source, source_id) DO UPDATE SET
        artist         = excluded.artist,
        title          = excluded.title,
        album          = excluded.album,
        release_year   = excluded.release_year,
        duration_ms    = excluded.duration_ms,
        last_synced_at = excluded.last_synced_at
      RETURNING id, (first_seen_at = ?) AS is_new
    `,
    )
    .get(
      libraryId,
      source,
      sourceId,
      artist,
      title,
      album,
      releaseYear,
      durationMs,
      sourceAddedAt,
      now,
      now,
      // The final `now` is the binding for the RETURNING comparison:
      // is_new = 1 when the row's first_seen_at equals the now we just wrote (i.e. it's brand new).
      now,
    ) as { id: number; is_new: number };

  return { id: result.id, isNew: result.is_new === 1 };
}

// ---------------------------------------------------------------------------
// markRemovedFromSource
// ---------------------------------------------------------------------------

export interface MarkRemovedParams {
  libraryId: string;
  source: string;
  /** source_ids currently present in the upstream playlist. */
  presentSourceIds: string[];
}

/**
 * Mark any tracks in `pending` or `downloaded` status that are no longer
 * present in the upstream playlist as `removed_from_source`.
 *
 * Returns the number of rows updated.
 *
 * Edge case: if `presentSourceIds` is empty (the playlist is empty), all
 * pending/downloaded rows for this (library, source) pair are marked removed.
 */
export function markRemovedFromSource(db: Database.Database, params: MarkRemovedParams): number {
  const { libraryId, source, presentSourceIds } = params;

  if (presentSourceIds.length === 0) {
    // Empty playlist — mark everything that was pending or downloaded.
    const result = db
      .prepare(
        `
        UPDATE tracks
        SET status = 'removed_from_source'
        WHERE library_id = ?
          AND source = ?
          AND status IN ('pending', 'downloaded')
      `,
      )
      .run(libraryId, source);
    return result.changes;
  }

  // SQLite doesn't support variable-length IN bindings directly via prepared
  // statements, so we build the placeholders dynamically.
  const placeholders = presentSourceIds.map(() => '?').join(', ');
  const result = db
    .prepare(
      `
      UPDATE tracks
      SET status = 'removed_from_source'
      WHERE library_id = ?
        AND source = ?
        AND status IN ('pending', 'downloaded')
        AND source_id NOT IN (${placeholders})
    `,
    )
    .run(libraryId, source, ...presentSourceIds);
  return result.changes;
}

// ---------------------------------------------------------------------------
// resetPendingAttempts
// ---------------------------------------------------------------------------

/**
 * Reset the `attempts` counter to 0 for all `pending` tracks in this library/source.
 *
 * Called at the start of each sync run so the retry budget is per-run, not lifetime.
 */
export function resetPendingAttempts(
  db: Database.Database,
  params: { libraryId: string; source: string },
): void {
  const { libraryId, source } = params;
  db.prepare(
    `UPDATE tracks SET attempts = 0 WHERE library_id = ? AND source = ? AND status = 'pending'`,
  ).run(libraryId, source);
}

// ---------------------------------------------------------------------------
// listPendingTracks
// ---------------------------------------------------------------------------

/**
 * Return all `pending` tracks for a given library/source, ordered by id
 * (insertion order — oldest-first, deterministic for tests).
 */
export function listPendingTracks(
  db: Database.Database,
  params: { libraryId: string; source: string },
): TrackRow[] {
  const { libraryId, source } = params;
  return db
    .prepare(
      `
      SELECT id, source_id, artist, title, album, release_year, duration_ms, attempts
      FROM tracks
      WHERE library_id = ? AND source = ? AND status = 'pending'
      ORDER BY id
    `,
    )
    .all(libraryId, source) as TrackRow[];
}

// ---------------------------------------------------------------------------
// listDownloadedTracks
// ---------------------------------------------------------------------------

export interface DownloadedTrackRow {
  id: number;
  source_id: string;
  file_path: string;
}

/**
 * Return all `downloaded` tracks for a given library/source, with their
 * relative file paths. Used to detect files that have been deleted from disk
 * so they can be reset to `pending` and re-downloaded.
 */
export function listDownloadedTracks(
  db: Database.Database,
  params: { libraryId: string; source: string },
): DownloadedTrackRow[] {
  const { libraryId, source } = params;
  return db
    .prepare(
      `
      SELECT id, source_id, file_path
      FROM tracks
      WHERE library_id = ? AND source = ? AND status = 'downloaded' AND file_path IS NOT NULL
      ORDER BY id
    `,
    )
    .all(libraryId, source) as DownloadedTrackRow[];
}

// ---------------------------------------------------------------------------
// getImportTarget
// ---------------------------------------------------------------------------

/**
 * Return the DB row targeted by `spotify-sync import`.
 *
 * Import intentionally works for any existing track status: it is the manual
 * recovery path for failed/needs_manual rows and the explicit replacement path
 * for already-downloaded rows.
 */
export function getImportTarget(
  db: Database.Database,
  params: { libraryId: string; source: string; sourceId: string },
): ImportTargetRow | null {
  const { libraryId, source, sourceId } = params;
  const row = db
    .prepare(
      `
      SELECT id, source_id, artist, title, file_path
      FROM tracks
      WHERE library_id = ? AND source = ? AND source_id = ?
      LIMIT 1
    `,
    )
    .get(libraryId, source, sourceId) as ImportTargetRow | undefined;

  return row ?? null;
}

// ---------------------------------------------------------------------------
// listPrunableTracks
// ---------------------------------------------------------------------------

/**
 * Return removed-from-source tracks that still point at a local file.
 *
 * These are the only rows `spotify-sync prune` may operate on. Rows whose
 * file_path is already NULL are clean and intentionally omitted.
 */
export function listPrunableTracks(
  db: Database.Database,
  params: { libraryId: string; source: string },
): PrunableTrackRow[] {
  const { libraryId, source } = params;
  return db
    .prepare(
      `
      SELECT id, source_id, artist, title, file_path
      FROM tracks
      WHERE library_id = ?
        AND source = ?
        AND status = 'removed_from_source'
        AND file_path IS NOT NULL
      ORDER BY id
    `,
    )
    .all(libraryId, source) as PrunableTrackRow[];
}

// ---------------------------------------------------------------------------
// listPruneCandidates
// ---------------------------------------------------------------------------

/**
 * Return tracks with files that are absent from the current upstream playlist.
 *
 * Used by `spotify-sync prune` after it refreshes the Spotify playlist. This
 * lets prune show candidates immediately after the user removes a track from
 * Spotify, without requiring a full sync/download run first.
 */
export function listPruneCandidates(
  db: Database.Database,
  params: { libraryId: string; source: string; presentSourceIds: string[] },
): PrunableTrackRow[] {
  const { libraryId, source, presentSourceIds } = params;

  if (presentSourceIds.length === 0) {
    return db
      .prepare(
        `
        SELECT id, source_id, artist, title, file_path
        FROM tracks
        WHERE library_id = ?
          AND source = ?
          AND status IN ('downloaded', 'removed_from_source')
          AND file_path IS NOT NULL
        ORDER BY id
      `,
      )
      .all(libraryId, source) as PrunableTrackRow[];
  }

  const placeholders = presentSourceIds.map(() => '?').join(', ');
  return db
    .prepare(
      `
      SELECT id, source_id, artist, title, file_path
      FROM tracks
      WHERE library_id = ?
        AND source = ?
        AND status IN ('downloaded', 'removed_from_source')
        AND file_path IS NOT NULL
        AND source_id NOT IN (${placeholders})
      ORDER BY id
    `,
    )
    .all(libraryId, source, ...presentSourceIds) as PrunableTrackRow[];
}

// ---------------------------------------------------------------------------
// clearRemovedTrackFilePath
// ---------------------------------------------------------------------------

/**
 * Clear the file path for a removed-from-source row after its file has either
 * been trashed or found missing on disk.
 */
export function clearRemovedTrackFilePath(db: Database.Database, id: number): void {
  db.prepare(
    `
    UPDATE tracks
    SET status = 'removed_from_source',
        file_path = NULL
    WHERE id = ?
  `,
  ).run(id);
}

// ---------------------------------------------------------------------------
// resetToPending
// ---------------------------------------------------------------------------

/**
 * Reset a `downloaded` track back to `pending` when its file has gone missing.
 * Clears the file location and download metadata so the next sync re-downloads it
 * as if it were new, while preserving the original `first_seen_at`.
 */
export function resetToPending(db: Database.Database, id: number): void {
  db.prepare(
    `
    UPDATE tracks
    SET status        = 'pending',
        file_path     = NULL,
        backend       = NULL,
        backend_source = NULL,
        downloaded_at = NULL,
        last_error    = NULL,
        attempts      = 0
    WHERE id = ?
  `,
  ).run(id);
}

// ---------------------------------------------------------------------------
// incrementAttempts
// ---------------------------------------------------------------------------

/**
 * Persist the incremented attempt count for a track mid-download.
 * The caller increments locally and passes the new value.
 */
export function incrementAttempts(db: Database.Database, id: number, attempts: number): void {
  db.prepare('UPDATE tracks SET attempts = ? WHERE id = ?').run(attempts, id);
}

// ---------------------------------------------------------------------------
// markDownloaded
// ---------------------------------------------------------------------------

export interface MarkDownloadedParams {
  id: number;
  filePath: string;
  backend: string;
  backendSource: string;
  now: string;
}

/**
 * Transition a track to `downloaded` and record where the file lives.
 * Clears `last_error` from any prior failure.
 */
export function markDownloaded(db: Database.Database, params: MarkDownloadedParams): void {
  const { id, filePath, backend, backendSource, now } = params;
  db.prepare(
    `
    UPDATE tracks
    SET status        = 'downloaded',
        file_path     = ?,
        backend       = ?,
        backend_source = ?,
        downloaded_at = ?,
        last_error    = NULL
    WHERE id = ?
  `,
  ).run(filePath, backend, backendSource, now, id);
}

// ---------------------------------------------------------------------------
// markFailed
// ---------------------------------------------------------------------------

export interface MarkFailedParams {
  id: number;
  lastError: string;
  attempts: number;
}

/**
 * Transition a track to `failed` after exhausting the retry budget.
 * Records the final error message and the attempt count.
 */
export function markFailed(db: Database.Database, params: MarkFailedParams): void {
  const { id, lastError, attempts } = params;
  db.prepare(
    `
    UPDATE tracks
    SET status     = 'failed',
        last_error = ?,
        attempts   = ?
    WHERE id = ?
  `,
  ).run(lastError, attempts, id);
}

// ---------------------------------------------------------------------------
// TrackStatus
// ---------------------------------------------------------------------------

/** All valid values for the `tracks.status` column. */
export type TrackStatus =
  | 'pending'
  | 'downloaded'
  | 'failed'
  | 'needs_manual'
  | 'removed_from_source';

// ---------------------------------------------------------------------------
// countTracksByStatus
// ---------------------------------------------------------------------------

/**
 * Return the count of tracks in this library grouped by status.
 *
 * All five statuses are always present in the result — statuses with no rows
 * are zero-filled so callers never need to handle absent keys.
 *
 * Scoped to `libraryId` only (counts across all sources — v1 is Spotify-only).
 */
export function countTracksByStatus(
  db: Database.Database,
  params: { libraryId: string },
): Record<TrackStatus, number> {
  const { libraryId } = params;

  const zero: Record<TrackStatus, number> = {
    pending: 0,
    downloaded: 0,
    failed: 0,
    needs_manual: 0,
    removed_from_source: 0,
  };

  const rows = db
    .prepare('SELECT status, COUNT(*) AS n FROM tracks WHERE library_id = ? GROUP BY status')
    .all(libraryId) as { status: TrackStatus; n: number }[];

  for (const row of rows) {
    zero[row.status] = row.n;
  }

  return zero;
}

// ---------------------------------------------------------------------------
// listTracksByStatus
// ---------------------------------------------------------------------------

/** A track row used by the status command for listing and disk-existence checks. */
export interface StatusTrackRow {
  id: number;
  source_id: string;
  artist: string;
  title: string;
  /** Relative path stored in tracks.file_path (present for downloaded rows). */
  file_path: string | null;
  /** Last error message (present for failed rows). */
  last_error: string | null;
}

/**
 * Return all tracks with the given status in this library, ordered by id
 * (insertion order — deterministic for tests and display).
 *
 * Scoped to `libraryId` only (counts across all sources — v1 is Spotify-only).
 */
export function listTracksByStatus(
  db: Database.Database,
  params: { libraryId: string; status: TrackStatus },
): StatusTrackRow[] {
  const { libraryId, status } = params;
  return db
    .prepare(
      `
      SELECT id, source_id, artist, title, file_path, last_error
      FROM tracks
      WHERE library_id = ? AND status = ?
      ORDER BY id
    `,
    )
    .all(libraryId, status) as StatusTrackRow[];
}

// ---------------------------------------------------------------------------
// listTrackedFilePaths
// ---------------------------------------------------------------------------

/**
 * Return every DB-registered local file path for this library, regardless of
 * track status. Used by `status` to distinguish local files unknown to the DB
 * from files that are tracked but missing, failed, or removed from source.
 */
export function listTrackedFilePaths(
  db: Database.Database,
  params: { libraryId: string },
): string[] {
  const { libraryId } = params;
  const rows = db
    .prepare(
      `
      SELECT file_path
      FROM tracks
      WHERE library_id = ? AND file_path IS NOT NULL
      ORDER BY file_path
    `,
    )
    .all(libraryId) as { file_path: string }[];

  return rows.map((row) => row.file_path);
}
