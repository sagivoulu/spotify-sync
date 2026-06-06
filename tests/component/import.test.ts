import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ImportResult } from '../../src/import/index.js';
import type { SyncResult } from '../../src/sync/index.js';
import { getTracksByStatus, openSandboxDb, setTrackStatus } from './helpers/db.js';
import { buildChildEnv } from './helpers/env.js';
import { createFakeBins, type FakeBins, SILENCE_MP3_FIXTURE } from './helpers/fake-bins.js';
import { runCliJson } from './helpers/run-cli.js';
import { createSandbox, type Sandbox } from './helpers/sandbox.js';
import { seedAuth } from './helpers/seed-auth.js';

// ---------------------------------------------------------------------------
// import component test
//
// Covers AC: "import: imports a local file and registers it in the DB"
//
// Flow:
//   1. Sync to populate the DB with tracks having known source_ids (testtrack1/2/3).
//   2. Pick one downloaded track; set its status to needs_manual via direct DB update
//      and delete its file (simulates a track that could not be auto-downloaded).
//   3. Run `import <silence.mp3> --for <source_id> --json`.
//      The import command calls spotifyClient.fetchTrack(<source_id>) — the fake
//      Spotify server serves the track metadata — then copies + tags the file.
//   4. Assert: finalPath exists, DB row is downloaded.
// ---------------------------------------------------------------------------

const useRealDownloads = Boolean(process.env.COMPONENT_REAL_DOWNLOADS);

describe('import', () => {
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

  it('imports a local file and marks the track as downloaded', async () => {
    const env = buildChildEnv(sandbox, fakeBins);

    // Step 1: sync to populate the DB
    const syncResult = await runCliJson<SyncResult>({ args: ['sync', '--json'], env });
    expect(syncResult.exitCode, `sync failed: ${syncResult.stderr}`).toBe(0);

    // Step 2: pick a downloaded track and reset it to needs_manual
    const db = openSandboxDb(sandbox.dbPath);
    let targetSourceId: string;
    let targetId: number;
    try {
      const downloaded = getTracksByStatus(db, 'downloaded');
      expect(downloaded.length).toBeGreaterThanOrEqual(1);

      const target = downloaded[0];
      targetSourceId = target.source_id;
      targetId = target.id;

      // Set status to needs_manual (the import command resolves needs_manual tracks)
      setTrackStatus(db, targetId, 'needs_manual');
      // The file stays in place — import will overwrite it at the same destination path
    } finally {
      db.close();
    }

    // Step 3: import silence.mp3 for the target track
    const importResult = await runCliJson<ImportResult>({
      args: ['import', SILENCE_MP3_FIXTURE, '--for', targetSourceId, '--json'],
      env,
    });

    expect(importResult.exitCode, `import failed: ${importResult.stderr}`).toBe(0);
    expect(importResult.result.ok).toBe(true);
    expect(importResult.result.trackId).toBe(targetSourceId);
    expect(importResult.result.finalPath).toBeTruthy();

    // Step 4: file exists and DB row is downloaded
    expect(
      existsSync(importResult.result.finalPath),
      `imported file not found at ${importResult.result.finalPath}`,
    ).toBe(true);

    const dbCheck = openSandboxDb(sandbox.dbPath);
    try {
      const row = dbCheck
        .prepare('SELECT status FROM tracks WHERE id = ?')
        .get(targetId) as { status: string } | undefined;
      expect(row?.status).toBe('downloaded');
    } finally {
      dbCheck.close();
    }
  });
});
