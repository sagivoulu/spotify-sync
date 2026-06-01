import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// db helpers — open a sandbox SQLite DB and query it for test assertions.
//
// These helpers open the DB read-write so tests can also set up preconditions
// (e.g. changing a track's status to needs_manual for the import test).
// ---------------------------------------------------------------------------

export interface TrackRow {
  id: number;
  source_id: string;
  source: string;
  artist: string;
  title: string;
  status: string;
  file_path: string | null;
  library_id: string;
}

/**
 * Open the sandbox DB file.  The caller must call db.close() when done.
 */
export function openSandboxDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Return all rows in the `tracks` table.
 */
export function getAllTracks(db: Database.Database): TrackRow[] {
  return db.prepare('SELECT * FROM tracks ORDER BY id').all() as TrackRow[];
}

/**
 * Return rows whose status matches the given value.
 */
export function getTracksByStatus(db: Database.Database, status: string): TrackRow[] {
  return db
    .prepare('SELECT * FROM tracks WHERE status = ? ORDER BY id')
    .all(status) as TrackRow[];
}

/**
 * Directly update a track's status (for test setup — simulates the state
 * the app would produce without having to run the full flow that produces it).
 */
export function setTrackStatus(db: Database.Database, id: number, status: string): void {
  db.prepare('UPDATE tracks SET status = ? WHERE id = ?').run(status, id);
}
