// ---------------------------------------------------------------------------
// getStatus integration tests.
//
// These tests inject all external dependencies (runDoctor, DB, fileExists) so
// no real binaries, network, or filesystem are required.
//
// Scenarios covered:
// - Happy path: setup ok, live Spotify total, DB with mixed statuses, disk checks.
// - Offline / Spotify check fails → last-sync fallback.
// - Doctor fails (binary/auth) → setup not ok.
// - Config error → library.configured=false, DB section skipped.
// - DB file missing → dbInitialized=false.
// - DB schema not created (tracks table absent) → dbInitialized=false.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/connection.js';
import { registerLibrary } from '../db/index.js';
import { runMigrations } from '../db/migrations.js';
import { markDownloaded, markFailed, upsertTrack } from '../db/tracks.js';
import type { RunDoctorResult } from '../doctor/index.js';
import { getStatus } from './index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A canned RunDoctorResult where everything passes and Spotify returns live data. */
function makeOkDoctorResult(overrides: Partial<RunDoctorResult> = {}): RunDoctorResult {
  return {
    ok: true,
    results: [
      { name: 'Config', ok: true, detail: 'ok' },
      { name: 'Auth', ok: true, detail: 'ok' },
      {
        name: 'Spotify',
        ok: true,
        detail: '"My DJ Set" (52 tracks)',
        data: { playlistName: 'My DJ Set', trackCount: 52, sampleTracks: [] },
      },
      { name: 'yt-dlp', ok: true, detail: '2026.02.01', data: { version: '2026.02.01' } },
      { name: 'ffmpeg', ok: true, detail: '6.0', data: { version: '6.0' } },
    ],
    ...overrides,
  };
}

/** Doctor result where Spotify check failed (offline / unauthenticated). */
function makeOfflineDoctorResult(): RunDoctorResult {
  return {
    ok: false,
    results: [
      { name: 'Config', ok: true, detail: 'ok' },
      { name: 'Auth', ok: false, detail: 'auth.json not found' },
      { name: 'Spotify', ok: false, detail: 'skipped — Auth check failed' },
      { name: 'yt-dlp', ok: true, detail: '2026.02.01', data: { version: '2026.02.01' } },
      { name: 'ffmpeg', ok: true, detail: '6.0', data: { version: '6.0' } },
    ],
  };
}

const NOW = '2026-05-30T10:00:00.000Z';
const BASE_PARAMS = {
  libraryId: 'default',
  source: 'spotify',
  artist: 'Caro Emerald',
  title: 'Back It Up',
  album: 'Deleted Scenes',
  releaseYear: 2010,
  durationMs: 200_000,
  sourceAddedAt: NOW,
  now: NOW,
};

/** Minimal valid config-like cliFlags that would pass loadConfig when set. */
const VALID_CLI_FLAGS = {
  spotify: {
    client_id: 'cid',
    client_secret: 'csecret',
    playlist_url: 'https://open.spotify.com/playlist/abc123',
  },
  library: { path: '/music/wcs' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSeededDb() {
  const db = openDatabase(':memory:');
  runMigrations(db);
  registerLibrary(db, 'default', '/music/wcs', NOW);

  // 1 downloaded track (file exists — simulated by fileExists returning true by default)
  const { id: dlId } = upsertTrack(db, { ...BASE_PARAMS, sourceId: 'track-dl' });
  markDownloaded(db, {
    id: dlId,
    filePath: 'caro-emerald-back-it-up.mp3',
    backend: 'yt-dlp',
    backendSource: 'https://youtube.com/watch?v=fake',
    now: NOW,
  });

  // 1 downloaded track whose file will be "missing" (fileExists returns false for it)
  const { id: missingId } = upsertTrack(db, {
    ...BASE_PARAMS,
    sourceId: 'track-missing',
    title: 'Missing Song',
  });
  markDownloaded(db, {
    id: missingId,
    filePath: 'missing-song.mp3',
    backend: 'yt-dlp',
    backendSource: 'https://youtube.com/watch?v=fake2',
    now: NOW,
  });

  // 2 pending tracks
  upsertTrack(db, { ...BASE_PARAMS, sourceId: 'track-p1', title: 'Pending One' });
  upsertTrack(db, { ...BASE_PARAMS, sourceId: 'track-p2', title: 'Pending Two' });

  // 1 failed track
  const { id: failId } = upsertTrack(db, {
    ...BASE_PARAMS,
    sourceId: 'track-f1',
    title: 'Failed Track',
  });
  markFailed(db, { id: failId, lastError: 'No candidates found', attempts: 3 });

  return db;
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('getStatus — happy path', () => {
  let db: ReturnType<typeof makeSeededDb>;

  beforeEach(() => {
    db = makeSeededDb();
  });

  afterEach(() => {
    db.close();
  });

  it('reports setup ok when doctor passes', async () => {
    const report = await getStatus({
      cliFlags: VALID_CLI_FLAGS,
      db,
      runDoctorFn: async () => makeOkDoctorResult(),
      fileExists: (path) => !path.includes('missing-song'),
    });

    expect(report.setup.ok).toBe(true);
    expect(report.setup.failedChecks).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('uses live Spotify playlist data when available', async () => {
    const report = await getStatus({
      cliFlags: VALID_CLI_FLAGS,
      db,
      runDoctorFn: async () => makeOkDoctorResult(),
      fileExists: () => true,
    });

    expect(report.playlist.name).toBe('My DJ Set');
    expect(report.playlist.total).toBe(52);
    expect(report.playlist.source).toBe('live');
  });

  it('reports correct track counts from the DB', async () => {
    const report = await getStatus({
      cliFlags: VALID_CLI_FLAGS,
      db,
      runDoctorFn: async () => makeOkDoctorResult(),
      fileExists: (path) => !path.includes('missing-song'),
    });

    const { counts } = report.library;
    expect(counts).not.toBeNull();
    expect(counts?.downloaded).toBe(2); // 2 rows with status=downloaded
    expect(counts?.pending).toBe(2); // track-p1, track-p2
    expect(counts?.failed).toBe(1); // track-f1
    expect(counts?.missingFiles).toBe(1); // missing-song.mp3 absent on disk
    expect(counts?.knownInPlaylist).toBe(5); // 2+2+1+0
  });

  it('detects notYetSynced as liveTotal - knownInPlaylist', async () => {
    const report = await getStatus({
      cliFlags: VALID_CLI_FLAGS,
      db,
      runDoctorFn: async () => makeOkDoctorResult(), // liveTotal = 52
      fileExists: () => true,
    });

    // 52 live - 5 known = 47
    expect(report.library.notYetSynced).toBe(47);
  });

  it('populates notDownloaded list with pending tracks', async () => {
    const report = await getStatus({
      cliFlags: VALID_CLI_FLAGS,
      db,
      runDoctorFn: async () => makeOkDoctorResult(),
      fileExists: () => true,
    });

    expect(report.library.notDownloaded).toHaveLength(2);
    const titles = report.library.notDownloaded.map((t) => t.title);
    expect(titles).toContain('Pending One');
    expect(titles).toContain('Pending Two');
  });

  it('populates missingFiles list for downloaded tracks with absent files', async () => {
    const report = await getStatus({
      cliFlags: VALID_CLI_FLAGS,
      db,
      runDoctorFn: async () => makeOkDoctorResult(),
      fileExists: (path) => !path.includes('missing-song'),
    });

    expect(report.library.missingFiles).toHaveLength(1);
    expect(report.library.missingFiles[0]?.title).toBe('Missing Song');
  });

  it('populates failed list with last_error', async () => {
    const report = await getStatus({
      cliFlags: VALID_CLI_FLAGS,
      db,
      runDoctorFn: async () => makeOkDoctorResult(),
      fileExists: () => true,
    });

    expect(report.library.failed).toHaveLength(1);
    expect(report.library.failed[0]?.title).toBe('Failed Track');
    expect(report.library.failed[0]?.error).toBe('No candidates found');
  });
});

// ---------------------------------------------------------------------------
// Offline / Spotify unavailable
// ---------------------------------------------------------------------------

describe('getStatus — offline / Spotify unavailable', () => {
  let db: ReturnType<typeof makeSeededDb>;

  beforeEach(() => {
    db = makeSeededDb();
  });
  afterEach(() => {
    db.close();
  });

  it('falls back to last-sync DB count when Spotify check failed', async () => {
    const report = await getStatus({
      cliFlags: VALID_CLI_FLAGS,
      db,
      runDoctorFn: async () => makeOfflineDoctorResult(),
      fileExists: () => true,
    });

    expect(report.playlist.source).toBe('last-sync');
    // total = knownInPlaylist from DB (5 tracks seeded)
    expect(report.playlist.total).toBe(5);
    expect(report.playlist.name).toBeNull();
    expect(report.library.notYetSynced).toBeNull();
  });

  it('reports setup.ok = false when doctor fails', async () => {
    const report = await getStatus({
      cliFlags: VALID_CLI_FLAGS,
      db,
      runDoctorFn: async () => makeOfflineDoctorResult(),
      fileExists: () => true,
    });

    expect(report.setup.ok).toBe(false);
    expect(report.setup.failedChecks).toContain('Auth');
    expect(report.setup.failedChecks).toContain('Spotify');
    expect(report.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Config error → library section degraded
// ---------------------------------------------------------------------------

describe('getStatus — config error', () => {
  it('reports library.configured=false and skips DB when config is invalid', async () => {
    const report = await getStatus({
      // No cliFlags → loadConfig will fail (no config file + missing required fields).
      // We override runDoctorFn so doctor itself doesn't fail on config.
      runDoctorFn: async () => ({
        ok: false,
        results: [
          { name: 'Config', ok: false, detail: 'spotify.client_id: Required' },
          { name: 'Auth', ok: false, detail: 'skipped — Config check failed' },
          { name: 'Spotify', ok: false, detail: 'skipped — Config check failed' },
          { name: 'yt-dlp', ok: true, detail: '2026.02.01', data: { version: '2026.02.01' } },
          { name: 'ffmpeg', ok: true, detail: '6.0', data: { version: '6.0' } },
        ],
      }),
      // Isolate from the developer's real config via a temp env.
      env: { XDG_CONFIG_HOME: '/tmp/no-such-dir', HOME: '/tmp/no-such-dir' },
      fileExists: () => false,
    });

    expect(report.library.configured).toBe(false);
    expect(report.library.dbInitialized).toBe(false);
    expect(report.library.counts).toBeNull();
    expect(report.library.downloadDir).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DB not initialised
// ---------------------------------------------------------------------------

describe('getStatus — DB not initialised', () => {
  it('returns dbInitialized=false when the DB file does not exist', async () => {
    const report = await getStatus({
      cliFlags: {
        ...VALID_CLI_FLAGS,
        db_path: '/tmp/no-such-spotify-sync.db',
      },
      runDoctorFn: async () => makeOkDoctorResult(),
      fileExists: (p) => !p.includes('no-such-spotify-sync'),
    });

    expect(report.library.dbInitialized).toBe(false);
    expect(report.library.counts).toBeNull();
  });

  it('returns dbInitialized=false when DB exists but tracks table is absent', async () => {
    // Open a DB with only the schema_version table (no migrations run).
    const emptyDb = openDatabase(':memory:');
    emptyDb.exec('CREATE TABLE schema_version (version INTEGER PRIMARY KEY)');

    const report = await getStatus({
      cliFlags: VALID_CLI_FLAGS,
      db: emptyDb,
      runDoctorFn: async () => makeOkDoctorResult(),
      fileExists: () => true,
    });

    emptyDb.close();

    expect(report.library.dbInitialized).toBe(false);
    expect(report.library.counts).toBeNull();
  });
});
