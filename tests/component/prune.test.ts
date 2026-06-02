import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PruneResult } from '../../src/prune/index.js';
import type { SyncResult } from '../../src/sync/index.js';
import { getTracksByStatus, openSandboxDb } from './helpers/db.js';
import { buildChildEnv } from './helpers/env.js';
import { createFakeBins, type FakeBins } from './helpers/fake-bins.js';
import { PLAYLIST_URL_SUBSET } from './helpers/fake-spotify-server.js';
import { runCliJson } from './helpers/run-cli.js';
import { createSandbox, type Sandbox } from './helpers/sandbox.js';
import { seedAuth } from './helpers/seed-auth.js';

// ---------------------------------------------------------------------------
// prune component test
//
// Covers AC: "prune: removes a file whose track has been removed from the playlist"
//
// Flow:
//   1. Sync against the FULL playlist (3 tracks) → all downloaded.
//   2. Run `prune --yes` with the SUBSET playlist URL (2 tracks).
//      Prune re-fetches the current playlist (SUBSET) and identifies track 3
//      as a prune candidate: it's downloaded in the DB but absent from SUBSET.
//   3. Assert: track 3's file is gone from disk, prunedCount ≥ 1.
//
// No playlist editing required — the fake server serves different track lists
// based on the playlist ID embedded in the URL.
// ---------------------------------------------------------------------------

type PruneCommandJsonResult = PruneResult & { confirmed: boolean; aborted: boolean };

const useRealDownloads = Boolean(process.env.COMPONENT_REAL_DOWNLOADS);

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
    // Step 1: sync all 3 tracks (FULL playlist is the default in buildChildEnv)
    const fullEnv = buildChildEnv(sandbox, fakeBins);
    const syncResult = await runCliJson<SyncResult>({ args: ['sync', '--json'], env: fullEnv });
    expect(syncResult.exitCode, `sync failed: ${syncResult.stderr}`).toBe(0);
    expect(syncResult.result.downloaded).toBeGreaterThanOrEqual(1);

    // Confirm all files exist before pruning
    const db = openSandboxDb(sandbox.dbPath);
    const downloadedBeforePrune = getTracksByStatus(db, 'downloaded');
    db.close();
    expect(downloadedBeforePrune.length).toBeGreaterThanOrEqual(1);
    for (const row of downloadedBeforePrune) {
      if (row.file_path) {
        expect(existsSync(join(sandbox.libraryPath, row.file_path))).toBe(true);
      }
    }

    // Step 2: prune with SUBSET playlist (track 3 is absent → prune candidate)
    const subsetEnv = buildChildEnv(sandbox, fakeBins, {
      SPOTIFY_SYNC_SPOTIFY_PLAYLIST_URL: PLAYLIST_URL_SUBSET,
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

    // Step 3: trashed files must not exist at their original library paths
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
