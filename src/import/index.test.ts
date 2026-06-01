import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Config } from '../config/index.js';
import { openDatabase } from '../db/connection.js';
import { registerLibrary } from '../db/index.js';
import { runMigrations } from '../db/migrations.js';
import { upsertTrack } from '../db/tracks.js';
import type { SpotifyClient, SpotifyTrackMetadata } from '../spotify/index.js';
import { ImportError, runImport } from './index.js';

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
    logging: { level: 'info' },
  };
}

function makeTrack(overrides: Partial<SpotifyTrackMetadata> = {}): SpotifyTrackMetadata {
  return {
    id: 'track-001',
    title: 'Back It Up',
    artists: ['Caro Emerald'],
    album: {
      id: 'album-001',
      name: 'Deleted Scenes',
      images: [],
    },
    releaseYear: 2010,
    trackNumber: 1,
    durationMs: 200_000,
    ...overrides,
  };
}

function makeSpotifyClient(track = makeTrack()): SpotifyClient {
  return {
    async fetchTrack(trackId: string) {
      return { ...track, id: trackId };
    },
    async fetchPlaylistTracks() {
      throw new Error('not used');
    },
    async fetchPlaylistSummary() {
      throw new Error('not used');
    },
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
  overrides: { sourceId?: string; status?: string; filePath?: string | null } = {},
): number {
  const sourceId = overrides.sourceId ?? 'track-001';
  const { id } = upsertTrack(db, {
    libraryId: 'default',
    source: 'spotify',
    sourceId,
    artist: 'Caro Emerald',
    title: 'Back It Up',
    album: 'Deleted Scenes',
    releaseYear: 2010,
    durationMs: 200_000,
    sourceAddedAt: '2026-01-01T00:00:00.000Z',
    now: '2026-05-30T10:00:00.000Z',
  });

  if (overrides.status !== undefined || overrides.filePath !== undefined) {
    db.prepare('UPDATE tracks SET status = COALESCE(?, status), file_path = ? WHERE id = ?').run(
      overrides.status ?? null,
      overrides.filePath ?? null,
      id,
    );
  }

  return id;
}

const noopTagFile: typeof import('../tagging/index.js').tagFile = async () => {};

describe('runImport', () => {
  let tmpDir: string;
  let db: ReturnType<typeof makeDb>;
  let config: Config;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'spotify-sync-import-test-'));
    config = makeConfig(tmpDir);
    db = makeDb(tmpDir);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('copy mode leaves the source file intact and updates the DB row', async () => {
    insertTrack(db, { status: 'failed' });
    const sourcePath = join(tmpDir, 'manual-source.mp3');
    writeFileSync(sourcePath, 'manual audio');

    const result = await runImport({
      filePath: sourcePath,
      trackId: 'track-001',
      config,
      db,
      spotifyClient: makeSpotifyClient(),
      tagFileFn: noopTagFile,
      now: () => '2026-05-30T12:00:00.000Z',
    });

    expect(existsSync(sourcePath)).toBe(true);
    expect(readFileSync(result.finalPath, 'utf8')).toBe('manual audio');
    expect(result.filePath).toBe('Caro Emerald - Back It Up.mp3');
    expect(result.mode).toBe('copy');

    const row = db
      .prepare(
        'SELECT status, file_path, backend, backend_source, downloaded_at, last_error FROM tracks WHERE source_id = ?',
      )
      .get('track-001') as {
      status: string;
      file_path: string;
      backend: string;
      backend_source: string;
      downloaded_at: string;
      last_error: string | null;
    };

    expect(row.status).toBe('downloaded');
    expect(row.file_path).toBe('Caro Emerald - Back It Up.mp3');
    expect(row.backend).toBe('manual');
    expect(row.backend_source).toBe(resolve(sourcePath));
    expect(row.downloaded_at).toBe('2026-05-30T12:00:00.000Z');
    expect(row.last_error).toBeNull();
  });

  it('move mode deletes the source file after a successful import', async () => {
    insertTrack(db);
    const sourcePath = join(tmpDir, 'manual-source.mp3');
    writeFileSync(sourcePath, 'manual audio');

    const result = await runImport({
      filePath: sourcePath,
      trackId: 'track-001',
      move: true,
      config,
      db,
      spotifyClient: makeSpotifyClient(),
      tagFileFn: noopTagFile,
    });

    expect(existsSync(sourcePath)).toBe(false);
    expect(readFileSync(result.finalPath, 'utf8')).toBe('manual audio');
    expect(result.mode).toBe('move');
  });

  it('overwrites an existing destination file without error', async () => {
    insertTrack(db);
    const sourcePath = join(tmpDir, 'manual-source.mp3');
    const finalPath = join(tmpDir, 'Caro Emerald - Back It Up.mp3');
    writeFileSync(sourcePath, 'new audio');
    writeFileSync(finalPath, 'old audio');

    await runImport({
      filePath: sourcePath,
      trackId: 'track-001',
      config,
      db,
      spotifyClient: makeSpotifyClient(),
      tagFileFn: noopTagFile,
    });

    expect(readFileSync(finalPath, 'utf8')).toBe('new audio');
  });

  it('preserves an existing file_path instead of recomputing a canonical path', async () => {
    insertTrack(db, { status: 'downloaded', filePath: 'Existing Name.mp3' });
    const sourcePath = join(tmpDir, 'manual-source.mp3');
    writeFileSync(sourcePath, 'manual audio');

    const result = await runImport({
      filePath: sourcePath,
      trackId: 'track-001',
      config,
      db,
      spotifyClient: makeSpotifyClient(makeTrack({ title: 'Different Title' })),
      tagFileFn: noopTagFile,
    });

    expect(result.filePath).toBe('Existing Name.mp3');
    expect(readFileSync(join(tmpDir, 'Existing Name.mp3'), 'utf8')).toBe('manual audio');
  });

  it('throws a clear error for an unknown track ID without writing a file', async () => {
    const sourcePath = join(tmpDir, 'manual-source.mp3');
    writeFileSync(sourcePath, 'manual audio');

    await expect(
      runImport({
        filePath: sourcePath,
        trackId: 'missing-track',
        config,
        db,
        spotifyClient: makeSpotifyClient(),
        tagFileFn: noopTagFile,
      }),
    ).rejects.toThrow(/Track not found in DB/);

    expect(existsSync(join(tmpDir, 'Caro Emerald - Back It Up.mp3'))).toBe(false);
  });

  it('throws a clear source-file error before changing the DB row', async () => {
    insertTrack(db, { status: 'failed' });
    db.prepare("UPDATE tracks SET last_error = 'previous failure' WHERE source_id = ?").run(
      'track-001',
    );

    await expect(
      runImport({
        filePath: join(tmpDir, 'missing.mp3'),
        trackId: 'track-001',
        config,
        db,
        spotifyClient: makeSpotifyClient(),
        tagFileFn: noopTagFile,
      }),
    ).rejects.toThrow(/Source file not found/);

    const row = db
      .prepare('SELECT status, file_path, backend, last_error FROM tracks WHERE source_id = ?')
      .get('track-001') as {
      status: string;
      file_path: string | null;
      backend: string | null;
      last_error: string | null;
    };

    expect(row.status).toBe('failed');
    expect(row.file_path).toBeNull();
    expect(row.backend).toBeNull();
    expect(row.last_error).toBe('previous failure');
  });

  it('does not delete the source or update the DB when tagging fails in move mode', async () => {
    insertTrack(db, { status: 'needs_manual' });
    const sourcePath = join(tmpDir, 'manual-source.mp3');
    writeFileSync(sourcePath, 'manual audio');

    await expect(
      runImport({
        filePath: sourcePath,
        trackId: 'track-001',
        move: true,
        config,
        db,
        spotifyClient: makeSpotifyClient(),
        tagFileFn: async () => {
          throw new Error('tag write failed');
        },
      }),
    ).rejects.toThrow(ImportError);

    const row = db
      .prepare('SELECT status, file_path, backend FROM tracks WHERE source_id = ?')
      .get('track-001') as {
      status: string;
      file_path: string | null;
      backend: string | null;
    };

    expect(existsSync(sourcePath)).toBe(true);
    expect(existsSync(join(tmpDir, 'Caro Emerald - Back It Up.mp3'))).toBe(false);
    expect(row.status).toBe('needs_manual');
    expect(row.file_path).toBeNull();
    expect(row.backend).toBeNull();
  });
});
