import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SyncResult } from '../../src/sync/index.js';
import { getTracksByStatus, openSandboxDb } from './helpers/db.js';
import { buildChildEnv } from './helpers/env.js';
import { createFakeBins, type FakeBins } from './helpers/fake-bins.js';
import { runCliJson } from './helpers/run-cli.js';
import { createSandbox, type Sandbox } from './helpers/sandbox.js';
import { seedAuth } from './helpers/seed-auth.js';

// ---------------------------------------------------------------------------
// sync component test
//
// Covers AC: "sync: downloads at least one track, creates the DB row, places
// the file in the library dir"
//
// The fake Spotify server returns 3 tracks for testplayfull. Fake yt-dlp copies
// silence.mp3 as the "downloaded" file for each track.
// ---------------------------------------------------------------------------

const useRealDownloads = Boolean(process.env.COMPONENT_REAL_DOWNLOADS);

describe('sync', () => {
  let sandbox: Sandbox;
  let fakeBins: FakeBins | null = null;

  beforeEach(() => {
    sandbox = createSandbox();
    if (!useRealDownloads) {
      fakeBins = createFakeBins();
    }
    seedAuth(sandbox.configDir);
  });

  afterEach(() => {
    sandbox.teardown();
    fakeBins?.teardown();
    fakeBins = null;
  });

  it('downloads pending tracks, creates DB rows, and places files in the library dir', async () => {
    const env = buildChildEnv(sandbox, fakeBins);

    const { result, exitCode, stderr } = await runCliJson<SyncResult>({
      args: ['sync', '--json'],
      env,
    });

    expect(exitCode, `stderr: ${stderr}`).toBe(0);
    expect(result.ok, `sync not ok, stderr: ${stderr}`).toBe(true);
    expect(result.added).toBeGreaterThanOrEqual(1);
    expect(result.downloaded).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);

    // Verify DB state
    const db = openSandboxDb(sandbox.dbPath);
    try {
      const downloaded = getTracksByStatus(db, 'downloaded');
      expect(downloaded.length).toBeGreaterThanOrEqual(1);

      for (const row of downloaded) {
        expect(row.file_path, `track ${row.source_id} missing file_path`).toBeTruthy();
        const absolutePath = join(sandbox.libraryPath, row.file_path!);
        expect(
          existsSync(absolutePath),
          `file missing for track ${row.source_id}: ${absolutePath}`,
        ).toBe(true);
      }
    } finally {
      db.close();
    }
  });

  it('records a run ID and log path in the result', async () => {
    const env = buildChildEnv(sandbox, fakeBins);
    const { result } = await runCliJson<SyncResult>({ args: ['sync', '--json'], env });
    expect(result.runId).toBeGreaterThan(0);
    expect(result.logPath).toBeTruthy();
  });
});
