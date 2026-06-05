import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// DB helpers — open a sandbox SQLite DB and query/mutate it for test setup
// and assertions. These helpers operate at the SQL level rather than via the
// application's own query functions so tests can set up arbitrary preconditions.
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

export function openSandboxDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  return db;
}

export function getAllTracks(db: Database.Database): TrackRow[] {
  return db.prepare('SELECT * FROM tracks ORDER BY id').all() as TrackRow[];
}

export function getTracksByStatus(db: Database.Database, status: string): TrackRow[] {
  return db
    .prepare('SELECT * FROM tracks WHERE status = ? ORDER BY id')
    .all(status) as TrackRow[];
}

/** Directly update a track's status (test setup — simulates app-produced state). */
export function setTrackStatus(db: Database.Database, id: number, status: string): void {
  db.prepare('UPDATE tracks SET status = ? WHERE id = ?').run(status, id);
}
