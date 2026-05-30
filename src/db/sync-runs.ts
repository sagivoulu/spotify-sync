import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// sync_runs DB helpers — insert and finalize rows in the `sync_runs` table.
// ---------------------------------------------------------------------------

export interface InsertSyncRunParams {
  libraryId: string;
  source: string;
  startedAt: string;
}

/**
 * Insert a new sync_run row at the start of a sync operation.
 *
 * Returns the synthetic integer id of the inserted row (`lastInsertRowid`).
 * The caller uses this id to finalize the row when the run completes.
 */
export function insertSyncRun(db: Database.Database, params: InsertSyncRunParams): number {
  const { libraryId, source, startedAt } = params;
  const result = db
    .prepare(
      `
      INSERT INTO sync_runs (library_id, source, started_at, added, downloaded, failed, removed_marked)
      VALUES (?, ?, ?, 0, 0, 0, 0)
    `,
    )
    .run(libraryId, source, startedAt);
  return Number(result.lastInsertRowid);
}

export interface FinalizeSyncRunParams {
  id: number;
  finishedAt: string;
  added: number;
  downloaded: number;
  failed: number;
  removedMarked: number;
}

/**
 * Update a sync_run row with the final counters and finish timestamp.
 * Called once the download phase and all DB updates are complete.
 */
export function finalizeSyncRun(db: Database.Database, params: FinalizeSyncRunParams): void {
  const { id, finishedAt, added, downloaded, failed, removedMarked } = params;
  db.prepare(
    `
    UPDATE sync_runs
    SET finished_at    = ?,
        added          = ?,
        downloaded     = ?,
        failed         = ?,
        removed_marked = ?
    WHERE id = ?
  `,
  ).run(finishedAt, added, downloaded, failed, removedMarked, id);
}
