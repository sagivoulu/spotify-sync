import type Database from 'better-sqlite3';
import type { Config } from '../config/schema.js';
import { openDatabase } from './connection.js';
import { runMigrations } from './migrations.js';

// ---------------------------------------------------------------------------
// Public DB API
//
// Building-block functions take primitives rather than Config so they can be
// exercised in tests with ':memory:' DBs without a full Config object.
// ---------------------------------------------------------------------------

/**
 * Register a library in the `libraries` table, if not already present.
 *
 * Uses INSERT OR IGNORE so calling this on every startup (first-run or not)
 * is safe — subsequent calls for the same `id` are silently no-ops.
 */
export function registerLibrary(
  db: Database.Database,
  id: string,
  path: string,
  createdAt: string,
): void {
  db.prepare(`
    INSERT OR IGNORE INTO libraries (id, path, created_at)
    VALUES (?, ?, ?)
  `).run(id, path, createdAt);
}

/**
 * Open the DB at `config.db_path`, run all pending migrations, and
 * auto-register the configured library.
 *
 * Returns the open Database instance for use by the rest of the application.
 * Safe to call on every startup — migrations and library registration are both
 * idempotent.
 */
export function initDb(config: Config): Database.Database {
  const db = openDatabase(config.db_path);
  runMigrations(db);
  registerLibrary(db, config.library.id, config.library.path, new Date().toISOString());
  return db;
}
