import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PruneResult } from '../../src/prune/index.js';
import type { SyncResult } from '../../src/sync/index.js';
import { getTracksByStatus, openSandboxDb } from './helpers/db.js';
import { buildChildEnv } from './helpers/env.js';
import { createFakeBins, type FakeBins } from './helpers/fake-bins.js';
import { runCliJson } from './helpers/run-cli.js';
import { createSandbox, type Sandbox } from './helpers/sandbox.js';
import { seedAuth } from './helpers/seed-auth.js';

// ---------------------------------------------------------------------------
// prune integration test
//
// Covers AC: "prune: removes a file whose track has been removed from the playlist"
//
// Strategy (no playlist editing required):
//   1. Sync against FULL playlist (SPOTIFY_PLAYLIST_URL).
//   2. Run `prune --yes` with the SUBSET playlist URL (SPOTIFY_PLAYLIST_URL_SUBSET).
//      Prune re-fetches the SUBSET playlist; tracks in FULL but not SUBSET are
//      `downloaded` in the DB and absent from the live playlist → prune candidates.
//   3. Assert: prunedCount ≥ 1, files are gone from disk.
//
// The FULL playlist must be a superset of SUBSET (i.e. SUBSET = FULL minus ≥1 track).
// See docs/integration-tests.md for playlist setup instructions.
// ---------------------------------------------------------------------------

type PruneCommandJsonResult = PruneResult & { confirmed: boolean; aborted: boolean };

const useRealDownloads = Boolean(process.env.INTEGRATION_REAL_DOWNLOADS);

describe('prune', () => {
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

  it('identifies and trashes files for tracks absent from the current playlist', async () => {
    // Step 1: sync against the FULL playlist so all tracks are downloaded
    const fullEnv = buildChildEnv(sandbox, fakeBins);
    const syncResult = await runCliJson<SyncResult>({ args: ['sync', '--json'], env: fullEnv });
    expect(syncResult.exitCode, `sync failed: ${syncResult.stderr}`).toBe(0);
    expect(syncResult.result.downloaded).toBeGreaterThanOrEqual(1);

    // Collect file paths before pruning so we can assert they're gone
    const db = openSandboxDb(sandbox.dbPath);
    const downloadedBeforePrune = getTracksByStatus(db, 'downloaded');
    db.close();
    expect(downloadedBeforePrune.length).toBeGreaterThanOrEqual(1);
    const filesBefore = downloadedBeforePrune
      .filter((r) => r.file_path)
      .map((r) => join(sandbox.libraryPath, r.file_path!));
    expect(filesBefore.every((p) => existsSync(p))).toBe(true);

    // Step 2: run prune with the SUBSET playlist URL.
    // Prune re-fetches SUBSET, finds tracks in FULL\SUBSET as prune candidates,
    // and with --yes trashes their files immediately.
    const subsetEnv = buildChildEnv(sandbox, fakeBins, {
      SPOTIFY_SYNC_SPOTIFY_PLAYLIST_URL: process.env.SPOTIFY_PLAYLIST_URL_SUBSET!,
    });
    const pruneResult = await runCliJson<PruneCommandJsonResult>({
      args: ['prune', '--yes', '--json'],
      env: subsetEnv,
    });

    expect(pruneResult.exitCode, `prune failed: ${pruneResult.stderr}`).toBe(0);
    expect(pruneResult.result.confirmed).toBe(true);
    expect(pruneResult.result.aborted).toBe(false);
    expect(pruneResult.result.prunedCount).toBeGreaterThanOrEqual(1);
    expect(pruneResult.result.failedCount).toBe(0);

    // Step 3: trashed files must no longer exist at their original absolute paths
    for (const outcome of pruneResult.result.outcomes) {
      if (outcome.status === 'trashed') {
        expect(
          existsSync(outcome.absolutePath),
          `expected trashed file to be gone: ${outcome.absolutePath}`,
        ).toBe(false);
      }
    }
  });
});
