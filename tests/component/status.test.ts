import { existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SyncResult } from '../../src/sync/index.js';
import { getTracksByStatus, openSandboxDb } from './helpers/db.js';
import { buildChildEnv } from './helpers/env.js';
import { createFakeBins, type FakeBins } from './helpers/fake-bins.js';
import { runCli, runCliJson } from './helpers/run-cli.js';
import { createSandbox, type Sandbox } from './helpers/sandbox.js';
import { seedAuth } from './helpers/seed-auth.js';

// ---------------------------------------------------------------------------
// status component test
//
// Covers AC: "status shows untracked local files alongside tracked file state"
//
// Flow:
//   1. Sync against the full fake playlist to create tracked files in the DB.
//   2. Remove one downloaded file to create a missing tracked file.
//   3. Add two manual audio files plus a non-audio file under the library root.
//   4. Run `status`, `status --list`, and `status --json` against the real CLI.
//   5. Assert that tracked missing files and untracked local files are reported
//      separately, with the untracked paths shown relative to the library root.
// ---------------------------------------------------------------------------

const useRealDownloads = Boolean(process.env.COMPONENT_REAL_DOWNLOADS);

describe('status', () => {
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

  it('reports missing tracked files separately from untracked local audio files', async () => {
    const env = buildChildEnv(sandbox, fakeBins);

    const syncResult = await runCliJson<SyncResult>({ args: ['sync', '--json'], env });
    expect(syncResult.exitCode, `sync failed: ${syncResult.stderr}`).toBe(0);
    expect(syncResult.result.downloaded).toBeGreaterThanOrEqual(1);

    const db = openSandboxDb(sandbox.dbPath);
    let trackedPathToRemove: string | null = null;
    let trackedArtist = '';
    let trackedTitle = '';
    try {
      const downloaded = getTracksByStatus(db, 'downloaded');
      expect(downloaded.length).toBeGreaterThanOrEqual(1);
      trackedPathToRemove = downloaded[0]?.file_path ?? null;
      trackedArtist = downloaded[0]?.artist ?? '';
      trackedTitle = downloaded[0]?.title ?? '';
    } finally {
      db.close();
    }

    if (trackedPathToRemove === null) {
      throw new Error('Expected at least one downloaded track with a file_path');
    }

    unlinkSync(join(sandbox.libraryPath, trackedPathToRemove));

    mkdirSync(join(sandbox.libraryPath, 'manual', 'nested'), { recursive: true });
    writeFileSync(join(sandbox.libraryPath, 'manual', 'manual-only.m4a'), 'manual audio');
    writeFileSync(
      join(sandbox.libraryPath, 'manual', 'nested', 'case-insensitive.MP3'),
      'manual audio',
    );
    writeFileSync(join(sandbox.libraryPath, 'manual', 'ignore.txt'), 'not audio');

    const human = await runCli({ args: ['status'], env });
    expect(human.exitCode, `status failed: ${human.stderr}`).toBe(0);
    expect(human.stdout).toContain('Setup:    ✓ everything looks good');
    expect(human.stdout).toContain('Downloaded:       3 / 3');
    expect(human.stdout).toContain('Missing files:    1');
    expect(human.stdout).toContain('Untracked files:  2');
    expect(human.stdout).not.toContain('Untracked files (');

    const listed = await runCli({ args: ['status', '--list'], env });
    expect(listed.exitCode, `status --list failed: ${listed.stderr}`).toBe(0);
    expect(listed.stdout).toContain('Missing files (1):');
    expect(listed.stdout).toContain(`${trackedArtist} — ${trackedTitle}`);
    expect(listed.stdout).toContain('Untracked files (2):');
    expect(listed.stdout).toContain('manual/manual-only.m4a');
    expect(listed.stdout).toContain('manual/nested/case-insensitive.MP3');
    expect(listed.stdout).not.toContain('ignore.txt');

    const json = await runCliJson<{
      setup: { ok: boolean };
      library: {
        counts: { missingFiles: number; untrackedFiles: number };
        missingFiles: Array<{ title: string }>;
        untrackedFiles: string[];
      };
    }>({ args: ['status', '--json'], env });
    expect(json.exitCode, `status --json failed: ${json.stderr}`).toBe(0);
    expect(json.result.setup.ok).toBe(true);
    expect(json.result.library.counts.missingFiles).toBe(1);
    expect(json.result.library.counts.untrackedFiles).toBe(2);
    expect(json.result.library.untrackedFiles).toEqual([
      'manual/manual-only.m4a',
      'manual/nested/case-insensitive.MP3',
    ]);
    expect(json.result.library.missingFiles[0]?.title).toBe(trackedTitle);
  });
});
