import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import { registerLibrary } from './index.js';
import { runMigrations } from './migrations.js';
import {
  countTracksByStatus,
  incrementAttempts,
  listDownloadedTracks,
  listPendingTracks,
  listTracksByStatus,
  markDownloaded,
  markFailed,
  markRemovedFromSource,
  resetPendingAttempts,
  resetToPending,
  upsertTrack,
} from './tracks.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeDb() {
  const db = openDatabase(':memory:');
  runMigrations(db);
  registerLibrary(db, 'default', '/music', '2026-01-01T00:00:00.000Z');
  return db;
}

const BASE_PARAMS = {
  libraryId: 'default',
  source: 'spotify',
  artist: 'Caro Emerald',
  title: 'Back It Up',
  album: 'Deleted Scenes from the Cutting Room Floor',
  releaseYear: 2010,
  durationMs: 200_000,
  sourceAddedAt: '2026-01-01T00:00:00.000Z',
  now: '2026-05-30T10:00:00.000Z',
};

// ---------------------------------------------------------------------------
// upsertTrack
// ---------------------------------------------------------------------------

describe('upsertTrack', () => {
  it('inserts a new row as pending with isNew=true', () => {
    const db = makeDb();
    const { id, isNew } = upsertTrack(db, { ...BASE_PARAMS, sourceId: 'track-001' });
    db.close();

    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    expect(isNew).toBe(true);
  });

  it('stores the correct status and attempts for a new row', () => {
    const db = makeDb();
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'track-001' });

    const row = db
      .prepare('SELECT status, attempts, artist, title FROM tracks WHERE source_id = ?')
      .get('track-001') as { status: string; attempts: number; artist: string; title: string };
    db.close();

    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(0);
    expect(row.artist).toBe('Caro Emerald');
    expect(row.title).toBe('Back It Up');
  });

  it('returns isNew=false and refreshes metadata on conflict', () => {
    const db = makeDb();
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'track-001', artist: 'Old Artist' });

    const { isNew } = upsertTrack(db, {
      ...BASE_PARAMS,
      sourceId: 'track-001',
      artist: 'New Artist',
      title: 'New Title',
      now: '2026-06-01T00:00:00.000Z',
    });

    const row = db
      .prepare('SELECT artist, title, last_synced_at, status FROM tracks WHERE source_id = ?')
      .get('track-001') as {
      artist: string;
      title: string;
      last_synced_at: string;
      status: string;
    };
    db.close();

    expect(isNew).toBe(false);
    expect(row.artist).toBe('New Artist');
    expect(row.title).toBe('New Title');
    expect(row.last_synced_at).toBe('2026-06-01T00:00:00.000Z');
    // Status must NOT be touched on conflict.
    expect(row.status).toBe('pending');
  });

  it('does not reset status/attempts/file_path on conflict when already downloaded', () => {
    const db = makeDb();
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'track-dl' });

    // Simulate a downloaded state.
    db.prepare(
      `UPDATE tracks SET status='downloaded', file_path='track.mp3', attempts=2 WHERE source_id=?`,
    ).run('track-dl');

    // Upsert again (same source_id) — should refresh metadata but not touch status/file_path/attempts.
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'track-dl', artist: 'Updated Artist' });

    const row = db
      .prepare('SELECT status, file_path, attempts, artist FROM tracks WHERE source_id=?')
      .get('track-dl') as {
      status: string;
      file_path: string;
      attempts: number;
      artist: string;
    };
    db.close();

    expect(row.status).toBe('downloaded');
    expect(row.file_path).toBe('track.mp3');
    expect(row.attempts).toBe(2);
    expect(row.artist).toBe('Updated Artist');
  });
});

// ---------------------------------------------------------------------------
// markRemovedFromSource
// ---------------------------------------------------------------------------

describe('markRemovedFromSource', () => {
  it('marks pending tracks not in presentSourceIds as removed_from_source', () => {
    const db = makeDb();
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'present-1' });
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'present-2' });
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'gone-1' });
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'gone-2' });

    const count = markRemovedFromSource(db, {
      libraryId: 'default',
      source: 'spotify',
      presentSourceIds: ['present-1', 'present-2'],
    });

    const gone = db
      .prepare(`SELECT source_id, status FROM tracks WHERE source_id IN ('gone-1','gone-2')`)
      .all() as { source_id: string; status: string }[];
    const still = db
      .prepare(`SELECT source_id, status FROM tracks WHERE source_id IN ('present-1','present-2')`)
      .all() as { source_id: string; status: string }[];
    db.close();

    expect(count).toBe(2);
    for (const row of gone) expect(row.status).toBe('removed_from_source');
    for (const row of still) expect(row.status).toBe('pending');
  });

  it('marks downloaded tracks (not just pending) as removed_from_source', () => {
    const db = makeDb();
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'dl-track' });
    db.prepare(`UPDATE tracks SET status='downloaded' WHERE source_id='dl-track'`).run();

    markRemovedFromSource(db, {
      libraryId: 'default',
      source: 'spotify',
      presentSourceIds: [],
    });

    const row = db.prepare('SELECT status FROM tracks WHERE source_id=?').get('dl-track') as {
      status: string;
    };
    db.close();
    expect(row.status).toBe('removed_from_source');
  });

  it('does not touch already failed or removed_from_source rows', () => {
    const db = makeDb();
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'failed-track' });
    db.prepare(`UPDATE tracks SET status='failed' WHERE source_id='failed-track'`).run();

    markRemovedFromSource(db, {
      libraryId: 'default',
      source: 'spotify',
      presentSourceIds: [],
    });

    const row = db.prepare('SELECT status FROM tracks WHERE source_id=?').get('failed-track') as {
      status: string;
    };
    db.close();
    expect(row.status).toBe('failed'); // untouched
  });

  it('returns 0 when all tracks are still present', () => {
    const db = makeDb();
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'a' });
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'b' });

    const count = markRemovedFromSource(db, {
      libraryId: 'default',
      source: 'spotify',
      presentSourceIds: ['a', 'b'],
    });
    db.close();
    expect(count).toBe(0);
  });

  it('handles empty presentSourceIds (marks all pending/downloaded as removed)', () => {
    const db = makeDb();
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'x' });
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'y' });

    const count = markRemovedFromSource(db, {
      libraryId: 'default',
      source: 'spotify',
      presentSourceIds: [],
    });
    db.close();
    expect(count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// resetPendingAttempts
// ---------------------------------------------------------------------------

describe('resetPendingAttempts', () => {
  it('resets attempts to 0 for all pending tracks', () => {
    const db = makeDb();
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'p1' });
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'p2' });
    db.prepare('UPDATE tracks SET attempts=2').run();

    resetPendingAttempts(db, { libraryId: 'default', source: 'spotify' });

    const rows = db.prepare(`SELECT attempts FROM tracks WHERE status='pending'`).all() as {
      attempts: number;
    }[];
    db.close();
    for (const row of rows) expect(row.attempts).toBe(0);
  });

  it('does not touch non-pending rows', () => {
    const db = makeDb();
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'dl' });
    db.prepare(`UPDATE tracks SET status='downloaded', attempts=5 WHERE source_id='dl'`).run();

    resetPendingAttempts(db, { libraryId: 'default', source: 'spotify' });

    const row = db.prepare(`SELECT attempts FROM tracks WHERE source_id='dl'`).get() as {
      attempts: number;
    };
    db.close();
    expect(row.attempts).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// listPendingTracks
// ---------------------------------------------------------------------------

describe('listPendingTracks', () => {
  it('returns only pending tracks in insertion order', () => {
    const db = makeDb();
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'a' });
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'b' });
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'c' });
    db.prepare(`UPDATE tracks SET status='downloaded' WHERE source_id='b'`).run();

    const rows = listPendingTracks(db, { libraryId: 'default', source: 'spotify' });
    db.close();

    expect(rows.map((r) => r.source_id)).toEqual(['a', 'c']);
  });

  it('returns an empty array when no pending tracks exist', () => {
    const db = makeDb();
    const rows = listPendingTracks(db, { libraryId: 'default', source: 'spotify' });
    db.close();
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// incrementAttempts
// ---------------------------------------------------------------------------

describe('incrementAttempts', () => {
  it('persists the new attempt count', () => {
    const db = makeDb();
    const { id } = upsertTrack(db, { ...BASE_PARAMS, sourceId: 'inc-test' });

    incrementAttempts(db, id, 1);
    const row = db.prepare('SELECT attempts FROM tracks WHERE id=?').get(id) as {
      attempts: number;
    };
    db.close();
    expect(row.attempts).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// markDownloaded
// ---------------------------------------------------------------------------

describe('markDownloaded', () => {
  it('transitions status and populates file_path/backend/backend_source/downloaded_at', () => {
    const db = makeDb();
    const { id } = upsertTrack(db, { ...BASE_PARAMS, sourceId: 'dl-test' });

    markDownloaded(db, {
      id,
      filePath: 'Caro Emerald - Back It Up.mp3',
      backend: 'yt-dlp',
      backendSource: 'https://www.youtube.com/watch?v=abc123',
      now: '2026-05-30T12:00:00.000Z',
    });

    const row = db
      .prepare(
        'SELECT status, file_path, backend, backend_source, downloaded_at, last_error FROM tracks WHERE id=?',
      )
      .get(id) as {
      status: string;
      file_path: string;
      backend: string;
      backend_source: string;
      downloaded_at: string;
      last_error: string | null;
    };
    db.close();

    expect(row.status).toBe('downloaded');
    expect(row.file_path).toBe('Caro Emerald - Back It Up.mp3');
    expect(row.backend).toBe('yt-dlp');
    expect(row.backend_source).toBe('https://www.youtube.com/watch?v=abc123');
    expect(row.downloaded_at).toBe('2026-05-30T12:00:00.000Z');
    expect(row.last_error).toBeNull();
  });

  it('clears last_error from a prior failure', () => {
    const db = makeDb();
    const { id } = upsertTrack(db, { ...BASE_PARAMS, sourceId: 'dl-clear-err' });
    db.prepare(`UPDATE tracks SET last_error='prior error' WHERE id=?`).run(id);

    markDownloaded(db, {
      id,
      filePath: 'track.mp3',
      backend: 'yt-dlp',
      backendSource: 'https://yt.com/watch?v=x',
      now: '2026-05-30T12:00:00.000Z',
    });

    const row = db.prepare('SELECT last_error FROM tracks WHERE id=?').get(id) as {
      last_error: string | null;
    };
    db.close();
    expect(row.last_error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// markFailed
// ---------------------------------------------------------------------------

describe('markFailed', () => {
  it('transitions status to failed and records last_error and attempts', () => {
    const db = makeDb();
    const { id } = upsertTrack(db, { ...BASE_PARAMS, sourceId: 'fail-test' });

    markFailed(db, { id, lastError: 'No candidates found', attempts: 3 });

    const row = db
      .prepare('SELECT status, last_error, attempts FROM tracks WHERE id=?')
      .get(id) as { status: string; last_error: string; attempts: number };
    db.close();

    expect(row.status).toBe('failed');
    expect(row.last_error).toBe('No candidates found');
    expect(row.attempts).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// listDownloadedTracks
// ---------------------------------------------------------------------------

describe('listDownloadedTracks', () => {
  it('returns only downloaded tracks with their file paths', () => {
    const db = makeDb();
    const { id: id1 } = upsertTrack(db, { ...BASE_PARAMS, sourceId: 'dl-1' });
    const { id: id2 } = upsertTrack(db, { ...BASE_PARAMS, sourceId: 'dl-2' });
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'pending-1' });

    markDownloaded(db, {
      id: id1,
      filePath: 'track1.mp3',
      backend: 'yt-dlp',
      backendSource: 'https://yt.com/1',
      now: '2026-05-30T12:00:00.000Z',
    });
    markDownloaded(db, {
      id: id2,
      filePath: 'track2.mp3',
      backend: 'yt-dlp',
      backendSource: 'https://yt.com/2',
      now: '2026-05-30T12:00:00.000Z',
    });

    const rows = listDownloadedTracks(db, { libraryId: 'default', source: 'spotify' });
    db.close();

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.file_path)).toEqual(
      expect.arrayContaining(['track1.mp3', 'track2.mp3']),
    );
  });

  it('returns an empty array when no downloaded tracks exist', () => {
    const db = makeDb();
    const rows = listDownloadedTracks(db, { libraryId: 'default', source: 'spotify' });
    db.close();
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resetToPending
// ---------------------------------------------------------------------------

describe('resetToPending', () => {
  it('resets a downloaded track back to pending and clears download metadata', () => {
    const db = makeDb();
    const { id } = upsertTrack(db, { ...BASE_PARAMS, sourceId: 'reset-test' });
    markDownloaded(db, {
      id,
      filePath: 'track.mp3',
      backend: 'yt-dlp',
      backendSource: 'https://yt.com/v=x',
      now: '2026-05-30T12:00:00.000Z',
    });

    resetToPending(db, id);

    const row = db
      .prepare(
        'SELECT status, file_path, backend, backend_source, downloaded_at, attempts FROM tracks WHERE id=?',
      )
      .get(id) as {
      status: string;
      file_path: string | null;
      backend: string | null;
      backend_source: string | null;
      downloaded_at: string | null;
      attempts: number;
    };
    db.close();

    expect(row.status).toBe('pending');
    expect(row.file_path).toBeNull();
    expect(row.backend).toBeNull();
    expect(row.backend_source).toBeNull();
    expect(row.downloaded_at).toBeNull();
    expect(row.attempts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// countTracksByStatus
// ---------------------------------------------------------------------------

describe('countTracksByStatus', () => {
  it('zero-fills all five statuses when no tracks exist', () => {
    const db = makeDb();
    const counts = countTracksByStatus(db, { libraryId: 'default' });
    db.close();

    expect(counts).toEqual({
      pending: 0,
      downloaded: 0,
      failed: 0,
      needs_manual: 0,
      removed_from_source: 0,
    });
  });

  it('counts correctly across multiple statuses', () => {
    const db = makeDb();

    // Insert 2 pending tracks.
    const { id: id1 } = upsertTrack(db, { ...BASE_PARAMS, sourceId: 'track-001' });
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'track-002' });

    // Mark one downloaded.
    markDownloaded(db, {
      id: id1,
      filePath: 'track-001.mp3',
      backend: 'yt-dlp',
      backendSource: 'https://youtube.com/watch?v=fake',
      now: BASE_PARAMS.now,
    });

    const counts = countTracksByStatus(db, { libraryId: 'default' });
    db.close();

    expect(counts.downloaded).toBe(1);
    expect(counts.pending).toBe(1);
    expect(counts.failed).toBe(0);
    expect(counts.needs_manual).toBe(0);
    expect(counts.removed_from_source).toBe(0);
  });

  it('scopes to libraryId — does not count tracks from other libraries', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    registerLibrary(db, 'lib-a', '/music/a', '2026-01-01T00:00:00.000Z');
    registerLibrary(db, 'lib-b', '/music/b', '2026-01-01T00:00:00.000Z');

    upsertTrack(db, { ...BASE_PARAMS, libraryId: 'lib-a', sourceId: 'track-a1' });
    upsertTrack(db, { ...BASE_PARAMS, libraryId: 'lib-b', sourceId: 'track-b1' });
    upsertTrack(db, { ...BASE_PARAMS, libraryId: 'lib-b', sourceId: 'track-b2' });

    expect(countTracksByStatus(db, { libraryId: 'lib-a' }).pending).toBe(1);
    expect(countTracksByStatus(db, { libraryId: 'lib-b' }).pending).toBe(2);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// listTracksByStatus
// ---------------------------------------------------------------------------

describe('listTracksByStatus', () => {
  it('returns an empty array when no tracks match the status', () => {
    const db = makeDb();
    const rows = listTracksByStatus(db, { libraryId: 'default', status: 'failed' });
    db.close();
    expect(rows).toEqual([]);
  });

  it('returns pending rows with correct fields', () => {
    const db = makeDb();
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'track-001' });

    const rows = listTracksByStatus(db, { libraryId: 'default', status: 'pending' });
    db.close();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source_id: 'track-001',
      artist: BASE_PARAMS.artist,
      title: BASE_PARAMS.title,
      file_path: null,
      last_error: null,
    });
  });

  it('returns failed rows with last_error populated', () => {
    const db = makeDb();
    const { id } = upsertTrack(db, { ...BASE_PARAMS, sourceId: 'track-001' });
    markFailed(db, { id, lastError: 'No candidates found', attempts: 3 });

    const rows = listTracksByStatus(db, { libraryId: 'default', status: 'failed' });
    db.close();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.last_error).toBe('No candidates found');
  });

  it('returns downloaded rows with file_path populated', () => {
    const db = makeDb();
    const { id } = upsertTrack(db, { ...BASE_PARAMS, sourceId: 'track-001' });
    markDownloaded(db, {
      id,
      filePath: 'caro-emerald-back-it-up.mp3',
      backend: 'yt-dlp',
      backendSource: 'https://youtube.com/watch?v=fake',
      now: BASE_PARAMS.now,
    });

    const rows = listTracksByStatus(db, { libraryId: 'default', status: 'downloaded' });
    db.close();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.file_path).toBe('caro-emerald-back-it-up.mp3');
  });

  it('does not include removed_from_source rows when querying pending', () => {
    const db = makeDb();
    upsertTrack(db, { ...BASE_PARAMS, sourceId: 'track-001' });
    markRemovedFromSource(db, {
      libraryId: 'default',
      source: 'spotify',
      presentSourceIds: [], // empty = mark all removed
    });

    const rows = listTracksByStatus(db, { libraryId: 'default', status: 'pending' });
    db.close();

    expect(rows).toHaveLength(0);
  });
});
