import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SyncResult } from '../../src/sync/index.js';
import { getTracksByStatus, openSandboxDb } from './helpers/db.js';
import { buildChildEnv } from './helpers/env.js';
import { createFakeBins, type FakeBins } from './helpers/fake-bins.js';
import { runCliJson } from './helpers/run-cli.js';
import { createSandbox, type Sandbox } from './helpers/sandbox.js';
import { seedAuth } from './helpers/seed-auth.js';

// ---------------------------------------------------------------------------
// idempotency component test
//
// Covers AC: "a second sync run does not re-download an already-present track"
// ---------------------------------------------------------------------------

const useRealDownloads = Boolean(process.env.COMPONENT_REAL_DOWNLOADS);

describe('sync idempotency', () => {
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

  it('does not re-download tracks on a second sync run', async () => {
    const env = buildChildEnv(sandbox, fakeBins);

    // First sync — downloads the playlist
    const first = await runCliJson<SyncResult>({ args: ['sync', '--json'], env });
    expect(first.exitCode, `first sync failed: ${first.stderr}`).toBe(0);
    expect(first.result.downloaded).toBeGreaterThanOrEqual(1);
    const downloadedAfterFirstSync = first.result.downloaded;

    // Second sync — nothing new
    const second = await runCliJson<SyncResult>({ args: ['sync', '--json'], env });
    expect(second.exitCode, `second sync failed: ${second.stderr}`).toBe(0);
    expect(second.result.downloaded).toBe(0);
    expect(second.result.added).toBe(0);
    expect(second.result.failed).toBe(0);

    // DB: same number of downloaded rows, unchanged
    const db = openSandboxDb(sandbox.dbPath);
    try {
      const downloaded = getTracksByStatus(db, 'downloaded');
      expect(downloaded.length).toBe(downloadedAfterFirstSync);
    } finally {
      db.close();
    }
  });
});
