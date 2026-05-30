import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import { registerLibrary } from './index.js';
import { runMigrations } from './migrations.js';
import { finalizeSyncRun, insertSyncRun } from './sync-runs.js';

function makeDb() {
  const db = openDatabase(':memory:');
  runMigrations(db);
  registerLibrary(db, 'default', '/music', '2026-01-01T00:00:00.000Z');
  return db;
}

describe('insertSyncRun', () => {
  it('inserts a row and returns a positive id', () => {
    const db = makeDb();
    const id = insertSyncRun(db, {
      libraryId: 'default',
      source: 'spotify',
      startedAt: '2026-05-30T10:00:00.000Z',
    });
    db.close();

    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('stores the correct fields with null finished_at and zero counters', () => {
    const db = makeDb();
    const id = insertSyncRun(db, {
      libraryId: 'default',
      source: 'spotify',
      startedAt: '2026-05-30T10:00:00.000Z',
    });

    const row = db.prepare('SELECT * FROM sync_runs WHERE id = ?').get(id) as {
      library_id: string;
      source: string;
      started_at: string;
      finished_at: string | null;
      added: number;
      downloaded: number;
      failed: number;
      removed_marked: number;
    };
    db.close();

    expect(row.library_id).toBe('default');
    expect(row.source).toBe('spotify');
    expect(row.started_at).toBe('2026-05-30T10:00:00.000Z');
    expect(row.finished_at).toBeNull();
    expect(row.added).toBe(0);
    expect(row.downloaded).toBe(0);
    expect(row.failed).toBe(0);
    expect(row.removed_marked).toBe(0);
  });

  it('increments id for successive calls', () => {
    const db = makeDb();
    const id1 = insertSyncRun(db, {
      libraryId: 'default',
      source: 'spotify',
      startedAt: '2026-05-30T10:00:00.000Z',
    });
    const id2 = insertSyncRun(db, {
      libraryId: 'default',
      source: 'spotify',
      startedAt: '2026-05-30T11:00:00.000Z',
    });
    db.close();

    expect(id2).toBeGreaterThan(id1);
  });
});

describe('finalizeSyncRun', () => {
  it('populates finished_at and counters', () => {
    const db = makeDb();
    const id = insertSyncRun(db, {
      libraryId: 'default',
      source: 'spotify',
      startedAt: '2026-05-30T10:00:00.000Z',
    });

    finalizeSyncRun(db, {
      id,
      finishedAt: '2026-05-30T10:05:00.000Z',
      added: 3,
      downloaded: 2,
      failed: 1,
      removedMarked: 4,
    });

    const row = db
      .prepare(
        'SELECT finished_at, added, downloaded, failed, removed_marked FROM sync_runs WHERE id = ?',
      )
      .get(id) as {
      finished_at: string;
      added: number;
      downloaded: number;
      failed: number;
      removed_marked: number;
    };
    db.close();

    expect(row.finished_at).toBe('2026-05-30T10:05:00.000Z');
    expect(row.added).toBe(3);
    expect(row.downloaded).toBe(2);
    expect(row.failed).toBe(1);
    expect(row.removed_marked).toBe(4);
  });
});
