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
