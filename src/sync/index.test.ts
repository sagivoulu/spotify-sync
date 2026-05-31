import { describe, expect, it } from 'vitest';
import type { DownloadResult } from '../backend/index.js';
import { BackendError } from '../backend/index.js';
import type { Config } from '../config/schema.js';
import { openDatabase } from '../db/connection.js';
import { initDb } from '../db/index.js';
import { registerLibrary } from '../db/index.js';
import { runMigrations } from '../db/migrations.js';
import { createNoopRunLogger } from '../logging/index.js';
import type { RunLogger } from '../logging/index.js';
import type { SpotifyClient, SpotifyTrack } from '../spotify/index.js';
import { createFakeBackend } from '../testing/fake-backend.js';
import { FatalSyncError, runSync } from './index.js';
import type { SyncEvent } from './index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    spotify: {
      client_id: 'test-id',
      client_secret: 'test-secret',
      playlist_url: 'https://open.spotify.com/playlist/test123',
    },
    library: {
      id: 'default',
      path: '/music/wcs',
    },
    data_dir: '/tmp/spotify-sync-test',
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
    ...overrides,
  };
}

function makeTrack(overrides: Partial<SpotifyTrack> = {}): SpotifyTrack {
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
    addedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSpotifyClient(tracks: SpotifyTrack[]): SpotifyClient {
  return {
    async fetchPlaylistTracks(_playlistId: string) {
      return tracks;
    },
    async fetchPlaylistSummary(_playlistId: string, _sampleSize: number) {
      return { name: 'Test Playlist', trackCount: tracks.length, tracks };
    },
  };
}

/** No-op tagFile — avoids real ID3 writes and network album-art fetches. */
const noopTagFile: typeof import('../tagging/index.js').tagFile = async () => {};

/** No-op placeFile — avoids real fs.renameSync. Returns the "placed" absolute path. */
function noopPlaceFile(tempPath: string, libraryPath: string, relativePath: string): string {
  return `${libraryPath}/${relativePath}`;
}

function makeInitDb(config: Config) {
  const db = openDatabase(':memory:');
  runMigrations(db);
  registerLibrary(db, config.library.id, config.library.path, '2026-01-01T00:00:00.000Z');
  return db;
}

/** Collect all sync events emitted during a run. */
function collectEvents(): { events: SyncEvent[]; onEvent: (e: SyncEvent) => void } {
  const events: SyncEvent[] = [];
  return { events, onEvent: (e) => events.push(e) };
}

// ---------------------------------------------------------------------------
// Core: shared RunSync opts with injected deps
// ---------------------------------------------------------------------------

function makeOpts(config: Config, tracks: SpotifyTrack[], backendOpts = {}) {
  const db = makeInitDb(config);
  return {
    config,
    db,
    spotifyClient: makeSpotifyClient(tracks),
    backend: createFakeBackend(backendOpts),
    tagFileFn: noopTagFile,
    placeFileFn: noopPlaceFile,
    // Since noopPlaceFile doesn't write real files, tell runSync all files exist
    // so the missing-file scan doesn't spuriously re-queue downloaded tracks.
    fileExists: () => true,
    now: () => '2026-05-30T10:00:00.000Z',
    tmpDir: '/tmp',
    // Inject a noop logger so tests don't create files in the real XDG state dir.
    createRunLogger: () => createNoopRunLogger(),
  };
}

/**
 * Create a recording RunLogger that captures all log calls for assertions.
 * Returns the logger and the entries it has recorded.
 */
function makeRecordingLogger(): {
  logger: RunLogger;
  closed: boolean;
  entries: Array<{ level: 'info' | 'warn' | 'error'; obj: Record<string, unknown>; msg?: string }>;
} {
  const entries: Array<{
    level: 'info' | 'warn' | 'error';
    obj: Record<string, unknown>;
    msg?: string;
  }> = [];
  let closed = false;
  const logger: RunLogger = {
    info: (obj, msg) => entries.push({ level: 'info', obj, msg }),
    warn: (obj, msg) => entries.push({ level: 'warn', obj, msg }),
    error: (obj, msg) => entries.push({ level: 'error', obj, msg }),
    close: () => {
      closed = true;
      return Promise.resolve();
    },
  };
  const result = {
    logger,
    entries,
    get closed() {
      return closed;
    },
  };
  return result;
}

// ---------------------------------------------------------------------------
// Acceptance criteria: new track → downloaded
// ---------------------------------------------------------------------------

describe('runSync — new track download', () => {
  it('transitions a new track from pending to downloaded', async () => {
    const config = makeConfig();
    const track = makeTrack();
    const { events, onEvent } = collectEvents();
    const opts = makeOpts(config, [track]);

    const result = await runSync({ ...opts, onEvent });

    // Result
    expect(result.added).toBe(1);
    expect(result.downloaded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.ok).toBe(true);

    // DB state
    const row = opts.db
      .prepare(
        'SELECT status, file_path, backend, backend_source, downloaded_at FROM tracks WHERE source_id=?',
      )
      .get('track-001') as {
      status: string;
      file_path: string;
      backend: string;
      backend_source: string;
      downloaded_at: string;
    };
    expect(row.status).toBe('downloaded');
    expect(row.file_path).toBeTruthy();
    expect(row.backend).toBe('fake');
    expect(row.backend_source).toBeTruthy();
    expect(row.downloaded_at).toBe('2026-05-30T10:00:00.000Z');

    // sync_runs row
    const run = opts.db
      .prepare('SELECT added, downloaded, failed, finished_at FROM sync_runs WHERE id=?')
      .get(result.runId) as {
      added: number;
      downloaded: number;
      failed: number;
      finished_at: string;
    };
    expect(run.added).toBe(1);
    expect(run.downloaded).toBe(1);
    expect(run.failed).toBe(0);
    expect(run.finished_at).toBe('2026-05-30T10:00:00.000Z');

    // Events: run-start + track-downloaded + run-finish
    expect(events.some((e) => e.type === 'run-start')).toBe(true);
    expect(events.some((e) => e.type === 'track-downloaded')).toBe(true);
    expect(events.some((e) => e.type === 'run-finish')).toBe(true);
    opts.db.close();
  });
});

// ---------------------------------------------------------------------------
// Acceptance criteria: removed track → removed_from_source
// ---------------------------------------------------------------------------

describe('runSync — removed track', () => {
  it('marks a track removed_from_source when absent from the playlist fetch', async () => {
    const config = makeConfig();
    const track = makeTrack();

    // First run: insert the track.
    const opts1 = makeOpts(config, [track]);
    await runSync(opts1);

    // Second run: same DB, but playlist is now empty → track should be marked removed.
    const opts2 = {
      ...opts1,
      spotifyClient: makeSpotifyClient([]), // empty playlist
    };
    const result = await runSync(opts2);

    expect(result.removedMarked).toBe(1);
    expect(result.ok).toBe(true);

    const row = opts1.db
      .prepare('SELECT status FROM tracks WHERE source_id=?')
      .get('track-001') as { status: string };
    expect(row.status).toBe('removed_from_source');
    opts1.db.close();
  });
});

// ---------------------------------------------------------------------------
// Acceptance criteria: download failure → failed after retries
// ---------------------------------------------------------------------------

describe('runSync — download failure and retry', () => {
  it('marks a track failed after exhausting retry_count attempts', async () => {
    const config = makeConfig({ download: { ...makeConfig().download, retry_count: 3 } });
    const track = makeTrack();
    const { events, onEvent } = collectEvents();

    const opts = makeOpts(config, [track], {
      downloadResult: { success: false, error: 'yt-dlp: HTTP 429 rate limited' } as DownloadResult,
    });

    const result = await runSync({ ...opts, onEvent });

    expect(result.failed).toBe(1);
    expect(result.downloaded).toBe(0);
    expect(result.ok).toBe(false);

    const row = opts.db
      .prepare('SELECT status, last_error, attempts FROM tracks WHERE source_id=?')
      .get('track-001') as { status: string; last_error: string; attempts: number };
    expect(row.status).toBe('failed');
    expect(row.last_error).toBe('yt-dlp: HTTP 429 rate limited');
    expect(row.attempts).toBe(3);

    // Should see 2 retry events + 1 failed event (3 attempts total).
    const retryEvents = events.filter((e) => e.type === 'track-retry');
    const failedEvents = events.filter((e) => e.type === 'track-failed');
    expect(retryEvents.length).toBe(2);
    expect(failedEvents.length).toBe(1);
    opts.db.close();
  });

  it('marks a track failed when search throws BackendError', async () => {
    const config = makeConfig({ download: { ...makeConfig().download, retry_count: 2 } });
    const track = makeTrack();

    const opts = makeOpts(config, [track], {
      searchError: 'Sign in to confirm',
    });

    const result = await runSync(opts);

    expect(result.failed).toBe(1);
    const row = opts.db
      .prepare('SELECT status, last_error FROM tracks WHERE source_id=?')
      .get('track-001') as { status: string; last_error: string };
    expect(row.status).toBe('failed');
    // FakeBackend constructs BackendError(searchError, 'fake stderr', 1); the sync
    // pipeline captures err.stderr.trim() (matching what real yt-dlp returns in stderr).
    expect(row.last_error).toBe('fake stderr');
    opts.db.close();
  });
});

// ---------------------------------------------------------------------------
// Acceptance criteria: concurrency limit respected
// ---------------------------------------------------------------------------

describe('runSync — concurrency', () => {
  it('never exceeds config.download.concurrency in-flight downloads', async () => {
    const config = makeConfig({ download: { ...makeConfig().download, concurrency: 2 } });
    const tracks = Array.from({ length: 6 }, (_, i) =>
      makeTrack({ id: `track-${i}`, title: `Track ${i}` }),
    );

    let inFlight = 0;
    let maxInFlight = 0;

    // Manually-resolved download: tracks in-flight count is instrumented.
    let resolveNext: (() => void) | undefined;
    const backend = createFakeBackend({
      downloadResult: undefined, // will override via custom backend below
    });

    // Build a custom backend that instruments concurrency.
    const instrumentedBackend = {
      name: 'instrumented',
      search: backend.search.bind(backend),
      async download(
        _candidate: Parameters<typeof backend.download>[0],
        opts: Parameters<typeof backend.download>[1],
      ): Promise<DownloadResult> {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        // Simulate async work with a microtask yield so concurrent slots fill up.
        await Promise.resolve();
        inFlight--;
        return {
          success: true,
          filePath: `${opts.outPath}.mp3`,
          candidate: { url: 'https://yt.com/watch?v=fake', sourceLabel: 'youtube' },
          backend: 'instrumented',
          stderr: '',
        };
      },
    };

    const db = makeInitDb(config);
    await runSync({
      config,
      db,
      spotifyClient: makeSpotifyClient(tracks),
      backend: instrumentedBackend,
      tagFileFn: noopTagFile,
      placeFileFn: noopPlaceFile,
      fileExists: () => true,
      now: () => '2026-05-30T10:00:00.000Z',
      tmpDir: '/tmp',
    });

    expect(maxInFlight).toBeLessThanOrEqual(2);
    db.close();

    // Resolved for linting — resolveNext isn't called but the pattern is sound.
    void resolveNext;
  });
});

// ---------------------------------------------------------------------------
// Acceptance criteria: idempotent no-op re-run
// ---------------------------------------------------------------------------

describe('runSync — idempotent re-run', () => {
  it('does not re-download tracks on a second run (no pending rows)', async () => {
    const config = makeConfig();
    const track = makeTrack();

    // Track download calls.
    let downloadCalls = 0;
    const backend = {
      ...createFakeBackend(),
      async download(
        candidate: Parameters<ReturnType<typeof createFakeBackend>['download']>[0],
        opts: Parameters<ReturnType<typeof createFakeBackend>['download']>[1],
      ): Promise<DownloadResult> {
        downloadCalls++;
        return {
          success: true,
          filePath: `${opts.outPath}.mp3`,
          candidate,
          backend: 'fake',
          stderr: '',
        };
      },
    };

    const db = makeInitDb(config);
    const sharedOpts = {
      config,
      db,
      spotifyClient: makeSpotifyClient([track]),
      backend,
      tagFileFn: noopTagFile,
      placeFileFn: noopPlaceFile,
      fileExists: () => true,
      now: () => '2026-05-30T10:00:00.000Z',
      tmpDir: '/tmp',
    };

    // First run: downloads the track.
    await runSync(sharedOpts);
    expect(downloadCalls).toBe(1);

    // Second run: same DB, same playlist — no pending rows left.
    const result2 = await runSync(sharedOpts);
    expect(downloadCalls).toBe(1); // no additional downloads
    expect(result2.downloaded).toBe(0);
    expect(result2.ok).toBe(true);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Acceptance criteria: exit-code mapping — ok=false when failed > 0
// ---------------------------------------------------------------------------

describe('runSync — result.ok reflects failures', () => {
  it('returns ok=false when at least one track failed', async () => {
    const config = makeConfig({ download: { ...makeConfig().download, retry_count: 1 } });
    const opts = makeOpts(config, [makeTrack()], {
      downloadResult: { success: false, error: 'timeout' } as DownloadResult,
    });

    const result = await runSync(opts);
    expect(result.ok).toBe(false);
    opts.db.close();
  });

  it('returns ok=true when all tracks download successfully', async () => {
    const config = makeConfig();
    const opts = makeOpts(config, [makeTrack()]);

    const result = await runSync(opts);
    expect(result.ok).toBe(true);
    opts.db.close();
  });
});

// ---------------------------------------------------------------------------
// Acceptance criteria: fatal error (binary missing → FatalSyncError)
// ---------------------------------------------------------------------------

describe('runSync — fatal errors', () => {
  it('throws FatalSyncError when binaryRunner reports yt-dlp unavailable', async () => {
    const config = makeConfig();
    const db = makeInitDb(config);

    // binaryRunner that simulates yt-dlp missing.
    const fakeBinaryRunner = async (binary: string) => {
      if (binary === 'yt-dlp') {
        throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
      }
      return { stdout: 'ffmpeg version 6.0', stderr: '', code: 0 };
    };

    await expect(
      runSync({
        config,
        db,
        spotifyClient: makeSpotifyClient([makeTrack()]),
        // No pre-built backend → binaryRunner probe runs
        binaryRunner: fakeBinaryRunner,
        backend: createFakeBackend(), // still inject backend so we don't need real yt-dlp to build it
        tagFileFn: noopTagFile,
        placeFileFn: noopPlaceFile,
        now: () => '2026-05-30T10:00:00.000Z',
      }),
    ).rejects.toThrow(FatalSyncError);

    db.close();
  });

  it('throws FatalSyncError when Spotify client throws during fetch', async () => {
    const config = makeConfig();
    const db = makeInitDb(config);

    const brokenClient: SpotifyClient = {
      async fetchPlaylistTracks() {
        throw new Error('401 Unauthorized');
      },
      async fetchPlaylistSummary() {
        throw new Error('401 Unauthorized');
      },
    };

    await expect(
      runSync({
        config,
        db,
        spotifyClient: brokenClient,
        backend: createFakeBackend(),
        tagFileFn: noopTagFile,
        placeFileFn: noopPlaceFile,
        now: () => '2026-05-30T10:00:00.000Z',
      }),
    ).rejects.toThrow(FatalSyncError);

    db.close();
  });
});

// ---------------------------------------------------------------------------
// sync_runs row is always inserted and finalized
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Missing file detection — re-queue downloaded tracks whose files are gone
// ---------------------------------------------------------------------------

describe('runSync — missing file re-download', () => {
  it('re-downloads a track whose file was deleted from disk', async () => {
    const config = makeConfig();
    const track = makeTrack();

    // First run: download the track (file "exists" via fileExists: () => true).
    const opts1 = makeOpts(config, [track]);
    await runSync(opts1);

    const rowAfterFirst = opts1.db
      .prepare('SELECT status FROM tracks WHERE source_id=?')
      .get('track-001') as { status: string };
    expect(rowAfterFirst.status).toBe('downloaded');

    // Second run: same DB + playlist, but the file is gone from disk.
    let downloadCalls = 0;
    const countingBackend = {
      ...createFakeBackend(),
      async download(
        candidate: Parameters<ReturnType<typeof createFakeBackend>['download']>[0],
        opts: Parameters<ReturnType<typeof createFakeBackend>['download']>[1],
      ): Promise<DownloadResult> {
        downloadCalls++;
        return {
          success: true,
          filePath: `${opts.outPath}.mp3`,
          candidate,
          backend: 'fake',
          stderr: '',
        };
      },
    };

    const result2 = await runSync({
      ...opts1,
      backend: countingBackend,
      fileExists: () => false, // simulate deleted file
    });

    expect(downloadCalls).toBe(1);
    expect(result2.downloaded).toBe(1);
    expect(result2.ok).toBe(true);

    const rowAfterSecond = opts1.db
      .prepare('SELECT status FROM tracks WHERE source_id=?')
      .get('track-001') as { status: string };
    expect(rowAfterSecond.status).toBe('downloaded');
    opts1.db.close();
  });

  it('includes restored count in the run-start event', async () => {
    const config = makeConfig();
    const track = makeTrack();

    const opts = makeOpts(config, [track]);
    await runSync(opts); // first run: downloads track

    const { events, onEvent } = collectEvents();
    await runSync({ ...opts, backend: createFakeBackend(), fileExists: () => false, onEvent });

    const startEvent = events.find((e) => e.type === 'run-start') as
      | import('./events.js').RunStartEvent
      | undefined;
    expect(startEvent?.restoredCount).toBe(1);
    opts.db.close();
  });
});

describe('runSync — sync_runs tracking', () => {
  it('inserts a sync_runs row even on an empty playlist', async () => {
    const config = makeConfig();
    const db = makeInitDb(config);

    const result = await runSync({
      config,
      db,
      spotifyClient: makeSpotifyClient([]),
      backend: createFakeBackend(),
      tagFileFn: noopTagFile,
      placeFileFn: noopPlaceFile,
      now: () => '2026-05-30T10:00:00.000Z',
      createRunLogger: () => createNoopRunLogger(),
    });

    const row = db
      .prepare('SELECT started_at, finished_at FROM sync_runs WHERE id=?')
      .get(result.runId) as { started_at: string; finished_at: string };

    expect(row.started_at).toBeTruthy();
    expect(row.finished_at).toBeTruthy();
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Per-run logging behaviour
// ---------------------------------------------------------------------------

describe('runSync — per-run logging', () => {
  it('calls logger.close() after a successful run', async () => {
    const config = makeConfig();
    const track = makeTrack();
    const recording = makeRecordingLogger();

    const opts = makeOpts(config, [track]);
    await runSync({ ...opts, createRunLogger: () => recording.logger });

    expect(recording.closed).toBe(true);
    opts.db.close();
  });

  it('logs download-success with stderr from the backend result', async () => {
    const config = makeConfig();
    const track = makeTrack();
    const recording = makeRecordingLogger();

    const opts = makeOpts(config, [track]);
    await runSync({ ...opts, createRunLogger: () => recording.logger });

    const successEntry = recording.entries.find((e) => e.msg === 'download-success');
    expect(successEntry).toBeDefined();
    // The fake backend returns 'fake download stderr' as the success stderr.
    expect(successEntry?.obj.stderr).toBe('fake download stderr');
    opts.db.close();
  });

  it('logs download-failed with error string when download returns success:false', async () => {
    const config = makeConfig({ download: { ...makeConfig().download, retry_count: 1 } });
    const track = makeTrack();
    const recording = makeRecordingLogger();

    const opts = makeOpts(config, [track], {
      downloadResult: { success: false, error: 'yt-dlp: HTTP 429 rate limited' } as DownloadResult,
    });
    await runSync({ ...opts, createRunLogger: () => recording.logger });

    const failEntry = recording.entries.find((e) => e.msg === 'download-failed');
    expect(failEntry).toBeDefined();
    expect(failEntry?.obj.error).toBe('yt-dlp: HTTP 429 rate limited');
    opts.db.close();
  });

  it('logs search-error with stderr when search throws BackendError', async () => {
    const config = makeConfig({ download: { ...makeConfig().download, retry_count: 1 } });
    const track = makeTrack();
    const recording = makeRecordingLogger();

    const opts = makeOpts(config, [track], { searchError: 'Sign in to confirm' });
    await runSync({ ...opts, createRunLogger: () => recording.logger });

    const searchErrEntry = recording.entries.find((e) => e.msg === 'search-error');
    expect(searchErrEntry).toBeDefined();
    expect(searchErrEntry?.obj.stderr).toBe('fake stderr');
    opts.db.close();
  });

  it('logs track-failed (error level) after all retry attempts exhausted', async () => {
    const config = makeConfig({ download: { ...makeConfig().download, retry_count: 2 } });
    const track = makeTrack();
    const recording = makeRecordingLogger();

    const opts = makeOpts(config, [track], {
      downloadResult: { success: false, error: 'timeout' } as DownloadResult,
    });
    await runSync({ ...opts, createRunLogger: () => recording.logger });

    const failedEntry = recording.entries.find((e) => e.msg === 'track-failed');
    expect(failedEntry).toBeDefined();
    expect(failedEntry?.level).toBe('error');
    expect(failedEntry?.obj.attempts).toBe(2);
    opts.db.close();
  });

  it('logs run-start and run-finish entries', async () => {
    const config = makeConfig();
    const recording = makeRecordingLogger();

    const db = makeInitDb(config);
    await runSync({
      config,
      db,
      spotifyClient: makeSpotifyClient([]),
      backend: createFakeBackend(),
      tagFileFn: noopTagFile,
      placeFileFn: noopPlaceFile,
      now: () => '2026-05-30T10:00:00.000Z',
      createRunLogger: () => recording.logger,
    });

    expect(recording.entries.some((e) => e.msg === 'run-start')).toBe(true);
    expect(recording.entries.some((e) => e.msg === 'run-finish')).toBe(true);
    db.close();
  });
});
