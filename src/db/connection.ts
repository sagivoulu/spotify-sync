import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// openDatabase — open (or create) a SQLite DB and apply required session PRAGMAs.
//
// Pass ':memory:' for in-process tests that don't touch the filesystem.
// ---------------------------------------------------------------------------

/**
 * Open a SQLite database at `dbPath`, creating the parent directory if needed.
 *
 * Always runs `PRAGMA foreign_keys = ON` — SQLite does not enforce FK constraints
 * by default; this must be set on every connection.
 */
export function openDatabase(dbPath: string): Database.Database {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  return db;
}
