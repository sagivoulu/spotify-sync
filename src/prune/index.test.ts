import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Config } from '../config/index.js';
import { openDatabase } from '../db/connection.js';
import { registerLibrary } from '../db/index.js';
import { runMigrations } from '../db/migrations.js';
import { upsertTrack } from '../db/tracks.js';
import { type RunPruneOptions, runPrune } from './index.js';

function makeConfig(libraryPath: string): Config {
  return {
    spotify: {
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
      playlist_url: 'https://open.spotify.com/playlist/test-playlist',
    },
    library: {
      id: 'default',
      path: libraryPath,
    },
    data_dir: tmpdir(),
    db_path: ':memory:',
    download: {
      backend: 'yt-dlp',
      format: 'mp3',
      bitrate_kbps: 320,
      concurrency: 3,
      retry_count: 3,
      search_source: 'youtube-music',
    },
    logging: { level: 'info', max_run_logs: 20 },
  };
}

function makeDb(libraryPath: string) {
  const db = openDatabase(':memory:');
  runMigrations(db);
  registerLibrary(db, 'default', libraryPath, '2026-01-01T00:00:00.000Z');
  return db;
}

function insertTrack(
  db: ReturnType<typeof makeDb>,
  overrides: {
    sourceId: string;
    title?: string;
    status?: string;
    filePath?: string | null;
  },
): number {
  const { id } = upsertTrack(db, {
    libraryId: 'default',
    source: 'spotify',
    sourceId: overrides.sourceId,
    artist: 'Caro Emerald',
    title: overrides.title ?? 'Back It Up',
    album: 'Deleted Scenes',
    releaseYear: 2010,
    durationMs: 200_000,
    sourceAddedAt: '2026-01-01T00:00:00.000Z',
    now: '2026-05-30T10:00:00.000Z',
  });

  db.prepare('UPDATE tracks SET status = ?, file_path = ? WHERE id = ?').run(
    overrides.status ?? 'removed_from_source',
    overrides.filePath ?? 'Caro Emerald - Back It Up.mp3',
    id,
  );

  return id;
}

function filePathFor(db: ReturnType<typeof makeDb>, sourceId: string): string | null {
  const row = db.prepare('SELECT file_path FROM tracks WHERE source_id = ?').get(sourceId) as {
    file_path: string | null;
  };
  return row.file_path;
}

describe('runPrune', () => {
  let tmpDir: string;
  let db: ReturnType<typeof makeDb>;
  let config: Config;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'spotify-sync-prune-test-'));
    config = makeConfig(tmpDir);
    db = makeDb(tmpDir);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('dry-run lists candidates without touching trash or the DB', async () => {
    insertTrack(db, { sourceId: 'track-001', filePath: 'gone.mp3' });
    const trashCalls: unknown[] = [];

    const result = await runPrune({
      dryRun: true,
      config,
      db,
      trashFn: async (...args) => {
        trashCalls.push(args);
      },
    });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      sourceId: 'track-001',
      filePath: 'gone.mp3',
      absolutePath: join(tmpDir, 'gone.mp3'),
    });
    expect(result.outcomes[0]?.status).toBe('would-trash');
    expect(trashCalls).toEqual([]);
    expect(filePathFor(db, 'track-001')).toBe('gone.mp3');
  });

  it('moves existing files to trash and clears the DB path after success', async () => {
    insertTrack(db, { sourceId: 'track-001', filePath: 'gone.mp3' });
    const trashCalls: Parameters<NonNullable<RunPruneOptions['trashFn']>>[] = [];

    const result = await runPrune({
      config,
      db,
      fileExists: () => true,
      trashFn: async (...args) => {
        trashCalls.push(args);
      },
    });

    expect(result.ok).toBe(true);
    expect(result.prunedCount).toBe(1);
    expect(result.outcomes[0]?.status).toBe('trashed');
    expect(trashCalls).toEqual([[[join(tmpDir, 'gone.mp3')], { glob: false }]]);
    expect(filePathFor(db, 'track-001')).toBeNull();
  });

  it('clears the DB path when the file is already missing', async () => {
    insertTrack(db, { sourceId: 'track-001', filePath: 'missing.mp3' });
    const trashCalls: unknown[] = [];

    const result = await runPrune({
      config,
      db,
      fileExists: () => false,
      trashFn: async (...args) => {
        trashCalls.push(args);
      },
    });

    expect(result.ok).toBe(true);
    expect(result.missingCount).toBe(1);
    expect(result.outcomes[0]?.status).toBe('missing');
    expect(trashCalls).toEqual([]);
    expect(filePathFor(db, 'track-001')).toBeNull();
  });

  it('leaves the DB path intact when trash fails', async () => {
    insertTrack(db, { sourceId: 'track-001', filePath: 'gone.mp3' });

    const result = await runPrune({
      config,
      db,
      fileExists: () => true,
      trashFn: async () => {
        throw new Error('trash unavailable');
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failedCount).toBe(1);
    expect(result.outcomes[0]).toMatchObject({
      status: 'failed',
      error: 'trash unavailable',
    });
    expect(filePathFor(db, 'track-001')).toBe('gone.mp3');
  });

  it('keeps partial completion consistent across success, missing, and failure', async () => {
    insertTrack(db, { sourceId: 'success', title: 'Success', filePath: 'success.mp3' });
    insertTrack(db, { sourceId: 'missing', title: 'Missing', filePath: 'missing.mp3' });
    insertTrack(db, { sourceId: 'failed', title: 'Failed', filePath: 'failed.mp3' });

    const result = await runPrune({
      config,
      db,
      fileExists: (path) => !path.endsWith('missing.mp3'),
      trashFn: async (paths) => {
        if (paths[0].endsWith('failed.mp3')) {
          throw new Error('trash failed');
        }
      },
    });

    expect(result.ok).toBe(false);
    expect(result.prunedCount).toBe(1);
    expect(result.missingCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(filePathFor(db, 'success')).toBeNull();
    expect(filePathFor(db, 'missing')).toBeNull();
    expect(filePathFor(db, 'failed')).toBe('failed.mp3');
  });
});
