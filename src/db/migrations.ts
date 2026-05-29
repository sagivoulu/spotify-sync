import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Migration runner
//
// Each migration has an integer `version` and an `up` function that mutates a
// DB connection. Migrations are applied in version order and tracked via a
// single-row `schema_version` table.
//
// runMigrations() is safe to call on every startup — it is idempotent.
// ---------------------------------------------------------------------------

interface Migration {
  version: number;
  up: (db: Database.Database) => void;
}

// ---------------------------------------------------------------------------
// v1 schema — four tables as specified in prd/01-download-sync.md
// ---------------------------------------------------------------------------

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up(db) {
      db.exec(`
        CREATE TABLE libraries (
          id              TEXT PRIMARY KEY,
          path            TEXT NOT NULL,
          created_at      TEXT NOT NULL
        );

        CREATE TABLE tracks (
          id              INTEGER PRIMARY KEY,
          library_id      TEXT NOT NULL REFERENCES libraries(id),
          source          TEXT NOT NULL,
          source_id       TEXT,
          artist          TEXT NOT NULL,
          title           TEXT NOT NULL,
          album           TEXT,
          release_year    INTEGER,
          duration_ms     INTEGER,
          source_added_at TEXT,
          status          TEXT NOT NULL CHECK (status IN (
                            'pending', 'downloaded', 'failed', 'needs_manual', 'removed_from_source'
                          )),
          file_path       TEXT,
          backend         TEXT,
          backend_source  TEXT,
          last_error      TEXT,
          attempts        INTEGER NOT NULL DEFAULT 0,
          first_seen_at   TEXT NOT NULL,
          last_synced_at  TEXT NOT NULL,
          downloaded_at   TEXT,
          UNIQUE (library_id, source, source_id)
        );

        CREATE TABLE sync_runs (
          id              INTEGER PRIMARY KEY,
          library_id      TEXT NOT NULL REFERENCES libraries(id),
          source          TEXT NOT NULL,
          started_at      TEXT NOT NULL,
          finished_at     TEXT,
          added           INTEGER NOT NULL DEFAULT 0,
          downloaded      INTEGER NOT NULL DEFAULT 0,
          failed          INTEGER NOT NULL DEFAULT 0,
          removed_marked  INTEGER NOT NULL DEFAULT 0
        );
      `);
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSchemaVersion(db: Database.Database): number {
  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as
    | { version: number }
    | undefined;
  return row?.version ?? 0;
}

function setSchemaVersion(db: Database.Database, version: number): void {
  db.prepare('DELETE FROM schema_version').run();
  db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version);
}

// ---------------------------------------------------------------------------
// runMigrations — public entry point
// ---------------------------------------------------------------------------

/**
 * Ensure all migrations up to the latest version have been applied.
 *
 * - Creates `schema_version` if it doesn't exist.
 * - Applies each pending migration inside a transaction so failures leave the
 *   DB at a consistent version boundary.
 * - Safe to call on every startup — does nothing when already up to date.
 */
export function runMigrations(db: Database.Database): void {
  // Bootstrap the version table itself (safe to call even on a fresh DB).
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)');

  const current = getSchemaVersion(db);

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;

    db.transaction(() => {
      migration.up(db);
      setSchemaVersion(db, migration.version);
    })();
  }
}
