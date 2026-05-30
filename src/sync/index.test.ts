import { describe, expect, it } from 'vitest';
import type { DownloadResult } from '../backend/index.js';
import { BackendError } from '../backend/index.js';
import type { SubprocessRunner } from '../backend/index.js';
import { MINIMUM_YTDLP_VERSION } from '../backend/yt-dlp.js';
import type { Config } from '../config/schema.js';
import { openDatabase } from '../db/connection.js';
import { initDb } from '../db/index.js';
import { registerLibrary } from '../db/index.js';
import { runMigrations } from '../db/migrations.js';
import { checkFfmpeg, checkYtDlp } from '../doctor/checks.js';
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
    logging: { level: 'info' },
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
  };
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
// Acceptance criteria: binary preflight checks (WES-14)
// ---------------------------------------------------------------------------

/** Build a SubprocessRunner that returns the given result for any invocation. */
function makeBinaryRunner(
  result: { stdout: string; stderr: string; code: number } | 'enoent',
): SubprocessRunner {
  return async (_binary, _args) => {
    if (result === 'enoent') {
      throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
    }
    return result;
  };
}

/** Runner where yt-dlp is present (current version) and ffmpeg is present. */
const bothPresentRunner: SubprocessRunner = async (binary, _args) => {
  if (binary === 'yt-dlp') return { stdout: '2026.03.17\n', stderr: '', code: 0 };
  // ffmpeg -version outputs its version on the first stdout line
  return { stdout: 'ffmpeg version 7.1 Copyright ...', stderr: '', code: 0 };
};

/** Runner where yt-dlp is missing (ENOENT) and ffmpeg is present. */
const ytDlpMissingRunner: SubprocessRunner = async (binary, _args) => {
  if (binary === 'yt-dlp') {
    throw Object.assign(new Error('spawn yt-dlp ENOENT'), { code: 'ENOENT' });
  }
  return { stdout: 'ffmpeg version 7.1', stderr: '', code: 0 };
};

/** Runner where ffmpeg is missing (ENOENT) and yt-dlp is present. */
const ffmpegMissingRunner: SubprocessRunner = async (binary, _args) => {
  if (binary === 'ffmpeg') {
    throw Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' });
  }
  return { stdout: '2026.03.17\n', stderr: '', code: 0 };
};

describe('runSync — binary preflight (WES-14)', () => {
  it('throws FatalSyncError naming yt-dlp with install instructions when yt-dlp is missing', async () => {
    const config = makeConfig();
    const db = makeInitDb(config);

    await expect(
      runSync({
        config,
        db,
        spotifyClient: makeSpotifyClient([makeTrack()]),
        binaryRunner: ytDlpMissingRunner,
        backend: createFakeBackend(),
        tagFileFn: noopTagFile,
        placeFileFn: noopPlaceFile,
        now: () => '2026-05-30T10:00:00.000Z',
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        name: 'FatalSyncError',
        // Message must name the binary (acceptance criterion)
        message: expect.stringMatching(/yt-dlp/),
      }),
    );

    db.close();
  });

  it('error message includes install instructions (mirrors doctor output)', async () => {
    const config = makeConfig();
    const db = makeInitDb(config);

    let thrownError: unknown;
    try {
      await runSync({
        config,
        db,
        spotifyClient: makeSpotifyClient([makeTrack()]),
        binaryRunner: ytDlpMissingRunner,
        backend: createFakeBackend(),
        tagFileFn: noopTagFile,
        placeFileFn: noopPlaceFile,
        now: () => '2026-05-30T10:00:00.000Z',
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(FatalSyncError);
    // Must carry doctor's install instructions, not a bare error message
    expect((thrownError as FatalSyncError).message).toMatch(/not found on PATH/);

    db.close();
  });

  it('throws FatalSyncError naming ffmpeg when ffmpeg is missing', async () => {
    const config = makeConfig();
    const db = makeInitDb(config);

    await expect(
      runSync({
        config,
        db,
        spotifyClient: makeSpotifyClient([makeTrack()]),
        binaryRunner: ffmpegMissingRunner,
        backend: createFakeBackend(),
        tagFileFn: noopTagFile,
        placeFileFn: noopPlaceFile,
        now: () => '2026-05-30T10:00:00.000Z',
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        name: 'FatalSyncError',
        message: expect.stringMatching(/ffmpeg/),
      }),
    );

    db.close();
  });

  it('probe runs before any DB write — sync_runs is empty and Spotify is never called', async () => {
    const config = makeConfig();
    const db = makeInitDb(config);

    let spotifyCallCount = 0;
    const trackingClient: SpotifyClient = {
      async fetchPlaylistTracks() {
        spotifyCallCount++;
        return [makeTrack()];
      },
      async fetchPlaylistSummary() {
        spotifyCallCount++;
        return { name: 'Test', trackCount: 1, tracks: [makeTrack()] };
      },
    };

    await expect(
      runSync({
        config,
        db,
        spotifyClient: trackingClient,
        binaryRunner: ytDlpMissingRunner,
        backend: createFakeBackend(),
        tagFileFn: noopTagFile,
        placeFileFn: noopPlaceFile,
        now: () => '2026-05-30T10:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(FatalSyncError);

    // Spotify must not have been called
    expect(spotifyCallCount).toBe(0);

    // No sync_runs row should have been inserted
    const runCount = (db.prepare('SELECT COUNT(*) as n FROM sync_runs').get() as { n: number }).n;
    expect(runCount).toBe(0);

    db.close();
  });

  it('throws FatalSyncError for an outdated yt-dlp (misconfigured binary)', async () => {
    const config = makeConfig();
    const db = makeInitDb(config);

    // Version older than MINIMUM_YTDLP_VERSION
    const outdatedRunner: SubprocessRunner = async (binary, _args) => {
      if (binary === 'yt-dlp') return { stdout: '2025.01.01\n', stderr: '', code: 0 };
      return { stdout: 'ffmpeg version 7.1', stderr: '', code: 0 };
    };

    await expect(
      runSync({
        config,
        db,
        spotifyClient: makeSpotifyClient([makeTrack()]),
        binaryRunner: outdatedRunner,
        backend: createFakeBackend(),
        tagFileFn: noopTagFile,
        placeFileFn: noopPlaceFile,
        now: () => '2026-05-30T10:00:00.000Z',
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        name: 'FatalSyncError',
        message: expect.stringMatching(/yt-dlp/),
      }),
    );

    db.close();
  });

  it('does not throw when both binaries are present and up to date', async () => {
    const config = makeConfig();
    const opts = makeOpts(config, [makeTrack()]);

    // Swap opts.backend for one with an explicit binaryRunner so the probe runs
    // but is satisfied. makeOpts injects a backend without binaryRunner (skips probe).
    // We pass binaryRunner here to trigger the probe path.
    const result = await runSync({
      ...opts,
      binaryRunner: bothPresentRunner,
    });

    expect(result.ok).toBe(true);
    opts.db.close();
  });

  it('versions are accessible for status output via checkYtDlp/checkFfmpeg with the same runner', async () => {
    // WES-14 acceptance criterion: "versions are captured and accessible for status output".
    // status (WES-15) will re-probe live — confirm the shared probe functions return version data.
    const ytDlp = await checkYtDlp({ runner: bothPresentRunner });
    const ffmpeg = await checkFfmpeg({ runner: bothPresentRunner });

    expect(ytDlp.ok).toBe(true);
    expect(ytDlp.data?.version).toBeTruthy();

    expect(ffmpeg.ok).toBe(true);
    expect(ffmpeg.data?.version).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Acceptance criteria: fatal error (Spotify / other)
// ---------------------------------------------------------------------------

describe('runSync — fatal errors', () => {
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
        return { success: true, filePath: `${opts.outPath}.mp3`, candidate, backend: 'fake' };
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
    });

    const row = db
      .prepare('SELECT started_at, finished_at FROM sync_runs WHERE id=?')
      .get(result.runId) as { started_at: string; finished_at: string };

    expect(row.started_at).toBeTruthy();
    expect(row.finished_at).toBeTruthy();
    db.close();
  });
});
