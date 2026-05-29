import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import { runMigrations } from './migrations.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshDb() {
  return openDatabase(':memory:');
}

/** Returns the sorted list of user table names in the DB. */
function tableNames(db: ReturnType<typeof freshDb>): string[] {
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

/** Returns column names for a given table. */
function columnNames(db: ReturnType<typeof freshDb>, table: string): string[] {
  const rows = db.pragma(`table_info(${table})`) as { name: string }[];
  return rows.map((r) => r.name);
}

/** Returns the current schema_version value (0 if table is empty). */
function schemaVersion(db: ReturnType<typeof freshDb>): number {
  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as
    | { version: number }
    | undefined;
  return row?.version ?? 0;
}

// ---------------------------------------------------------------------------
// Tables and schema_version
// ---------------------------------------------------------------------------

describe('runMigrations — from scratch', () => {
  it('creates all four expected tables', () => {
    const db = freshDb();
    runMigrations(db);
    const tables = tableNames(db);
    db.close();

    expect(tables).toContain('libraries');
    expect(tables).toContain('tracks');
    expect(tables).toContain('sync_runs');
    expect(tables).toContain('schema_version');
  });

  it('sets schema_version to 1 after migration', () => {
    const db = freshDb();
    runMigrations(db);
    const version = schemaVersion(db);
    db.close();
    expect(version).toBe(1);
  });

  it('libraries table has expected columns', () => {
    const db = freshDb();
    runMigrations(db);
    const cols = columnNames(db, 'libraries');
    db.close();
    expect(cols).toEqual(expect.arrayContaining(['id', 'path', 'created_at']));
  });

  it('tracks table has all expected columns', () => {
    const db = freshDb();
    runMigrations(db);
    const cols = columnNames(db, 'tracks');
    db.close();
    const expected = [
      'id',
      'library_id',
      'source',
      'source_id',
      'artist',
      'title',
      'album',
      'release_year',
      'duration_ms',
      'source_added_at',
      'status',
      'file_path',
      'backend',
      'backend_source',
      'last_error',
      'attempts',
      'first_seen_at',
      'last_synced_at',
      'downloaded_at',
    ];
    expect(cols).toEqual(expect.arrayContaining(expected));
  });

  it('sync_runs table has expected columns', () => {
    const db = freshDb();
    runMigrations(db);
    const cols = columnNames(db, 'sync_runs');
    db.close();
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'library_id',
        'source',
        'started_at',
        'finished_at',
        'added',
        'downloaded',
        'failed',
        'removed_marked',
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('runMigrations — idempotency', () => {
  it('calling runMigrations twice does not throw', () => {
    const db = freshDb();
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
    db.close();
  });

  it('calling runMigrations twice leaves schema_version at 1', () => {
    const db = freshDb();
    runMigrations(db);
    runMigrations(db);
    const version = schemaVersion(db);
    db.close();
    expect(version).toBe(1);
  });

  it('calling runMigrations twice does not duplicate tables', () => {
    const db = freshDb();
    runMigrations(db);
    runMigrations(db);
    const tables = tableNames(db);
    db.close();
    // Four distinct tables — no duplicates.
    const unique = new Set(tables);
    expect(unique.size).toBe(tables.length);
    expect(tables.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// status CHECK constraint
// ---------------------------------------------------------------------------

describe('tracks.status CHECK constraint', () => {
  function insertTrack(db: ReturnType<typeof freshDb>, status: string, libraryId = 'lib') {
    return db
      .prepare(`
        INSERT INTO tracks
          (library_id, source, source_id, artist, title, status, first_seen_at, last_synced_at)
        VALUES (?, 'spotify', 'track-1', 'Artist', 'Title', ?, datetime('now'), datetime('now'))
      `)
      .run(libraryId, status);
  }

  function setupLibrary(db: ReturnType<typeof freshDb>, id = 'lib') {
    db.prepare(
      `INSERT INTO libraries (id, path, created_at) VALUES (?, '/music', datetime('now'))`,
    ).run(id);
  }

  it('accepts all valid status values', () => {
    const db = freshDb();
    runMigrations(db);
    setupLibrary(db);

    const validStatuses = [
      'pending',
      'downloaded',
      'failed',
      'needs_manual',
      'removed_from_source',
    ];

    for (const [i, status] of validStatuses.entries()) {
      // Use distinct source_id to avoid the UNIQUE constraint
      db.prepare(`
        INSERT INTO tracks
          (library_id, source, source_id, artist, title, status, first_seen_at, last_synced_at)
        VALUES ('lib', 'spotify', ?, 'Artist', 'Title', ?, datetime('now'), datetime('now'))
      `).run(`track-${i}`, status);
    }

    const count = (db.prepare('SELECT COUNT(*) AS n FROM tracks').get() as { n: number }).n;
    db.close();
    expect(count).toBe(validStatuses.length);
  });

  it('rejects an invalid status value', () => {
    const db = freshDb();
    runMigrations(db);
    setupLibrary(db);

    expect(() => insertTrack(db, 'invalid-status')).toThrow();
    db.close();
  });

  it('rejects an empty string as status', () => {
    const db = freshDb();
    runMigrations(db);
    setupLibrary(db);

    expect(() => insertTrack(db, '')).toThrow();
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Foreign key enforcement
// ---------------------------------------------------------------------------

describe('foreign key enforcement', () => {
  it('rejects a tracks row with an unknown library_id (proves PRAGMA foreign_keys = ON)', () => {
    const db = freshDb();
    runMigrations(db);
    // Do NOT insert a libraries row — the FK should fire.

    expect(() => {
      db.prepare(`
        INSERT INTO tracks
          (library_id, source, source_id, artist, title, status, first_seen_at, last_synced_at)
        VALUES ('nonexistent-lib', 'spotify', 'track-1', 'Artist', 'Title', 'pending',
                datetime('now'), datetime('now'))
      `).run();
    }).toThrow();

    db.close();
  });

  it('rejects a sync_runs row with an unknown library_id', () => {
    const db = freshDb();
    runMigrations(db);

    expect(() => {
      db.prepare(`
        INSERT INTO sync_runs (library_id, source, started_at)
        VALUES ('ghost-lib', 'spotify', datetime('now'))
      `).run();
    }).toThrow();

    db.close();
  });
});
