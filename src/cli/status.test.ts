// ---------------------------------------------------------------------------
// runStatusCommand — CLI handler unit tests.
//
// Uses injectable deps to avoid any real network, filesystem, or binary calls.
// ---------------------------------------------------------------------------

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StatusReport } from '../status/types.js';
import { type RunStatusCommandDeps, runStatusCommand } from './status.js';

// ---------------------------------------------------------------------------
// Canned reports
// ---------------------------------------------------------------------------

const OK_REPORT: StatusReport = {
  setup: { ok: true, failedChecks: [] },
  playlist: { name: 'My DJ Set', total: 52, source: 'live' },
  library: {
    configured: true,
    downloadDir: '/music/wcs',
    dbPath: '/data/db.sqlite',
    dbInitialized: true,
    counts: {
      downloaded: 45,
      pending: 3,
      missingFiles: 1,
      failed: 2,
      needsManual: 0,
      knownInPlaylist: 50,
    },
    notYetSynced: 2,
    notDownloaded: [
      { artist: 'Caro Emerald', title: 'Pending One', sourceId: 'p1' },
      { artist: 'Caro Emerald', title: 'Pending Two', sourceId: 'p2' },
      { artist: 'Caro Emerald', title: 'Pending Three', sourceId: 'p3' },
    ],
    missingFiles: [{ artist: 'Artist', title: 'Missing Song', sourceId: 'm1' }],
    failed: [
      { artist: 'Caro Emerald', title: 'Failed Track', sourceId: 'f1', error: 'No candidates' },
      { artist: 'Caro Emerald', title: 'Failed Track 2', sourceId: 'f2', error: 'Timeout' },
    ],
  },
  ok: true,
};

const NOT_OK_REPORT: StatusReport = {
  ...OK_REPORT,
  setup: { ok: false, failedChecks: ['Auth', 'ffmpeg'] },
  ok: false,
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function captureStdout(): { lines: () => string[]; restore: () => void } {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
    return true;
  };
  return {
    lines: () =>
      chunks
        .join('')
        .split('\n')
        .filter((l) => l.length > 0),
    restore: () => {
      process.stdout.write = original;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runStatusCommand', () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it('prints a human-readable report and sets exitCode=0 when ok', async () => {
    const out = captureStdout();
    const deps: RunStatusCommandDeps = { getStatus: async () => OK_REPORT };

    await runStatusCommand({ json: false, list: false, globals: {} }, deps);

    out.restore();
    const text = out.lines().join('\n');

    expect(text).toContain('Setup:    ✓ everything looks good');
    expect(text).toContain('"My DJ Set"');
    expect(text).toContain('/music/wcs');
    expect(text).toContain('45 / 52');
    expect(process.exitCode).toBe(0);
  });

  it('prints the setup failure line and sets exitCode=1 when not ok', async () => {
    const out = captureStdout();
    const deps: RunStatusCommandDeps = { getStatus: async () => NOT_OK_REPORT };

    await runStatusCommand({ json: false, list: false, globals: {} }, deps);

    out.restore();
    const text = out.lines().join('\n');

    expect(text).toMatch(/✗ problems found \(Auth, ffmpeg\)/);
    expect(text).toContain('spotify-sync doctor');
    expect(process.exitCode).toBe(1);
  });

  it('does NOT print track lists when --list is omitted', async () => {
    const out = captureStdout();
    const deps: RunStatusCommandDeps = { getStatus: async () => OK_REPORT };

    await runStatusCommand({ json: false, list: false, globals: {} }, deps);

    out.restore();
    const text = out.lines().join('\n');

    // Section headers (with count in parens) only appear with --list.
    expect(text).not.toContain('Not downloaded (');
    expect(text).not.toContain('Missing files (');
    expect(text).not.toContain('Failed (');
    expect(text).not.toContain('Pending One');
  });

  it('prints track lists in separate sections with --list', async () => {
    const out = captureStdout();
    const deps: RunStatusCommandDeps = { getStatus: async () => OK_REPORT };

    await runStatusCommand({ json: false, list: true, globals: {} }, deps);

    out.restore();
    const text = out.lines().join('\n');

    expect(text).toContain('Not downloaded (3)');
    expect(text).toContain('Pending One');
    expect(text).toContain('Pending Two');
    expect(text).toContain('Missing files (1)');
    expect(text).toContain('Missing Song');
    expect(text).toContain('Failed (2)');
    expect(text).toContain('No candidates');
  });

  it('emits one parseable JSON line with --json and sets exitCode=0', async () => {
    const out = captureStdout();
    const deps: RunStatusCommandDeps = { getStatus: async () => OK_REPORT };

    await runStatusCommand({ json: true, list: false, globals: {} }, deps);

    out.restore();
    const raw = out.lines().join('\n').trim();

    const parsed = JSON.parse(raw) as StatusReport;
    expect(parsed).toEqual(OK_REPORT);
    expect(process.exitCode).toBe(0);
  });

  it('emits JSON with exitCode=1 when not ok', async () => {
    const out = captureStdout();
    const deps: RunStatusCommandDeps = { getStatus: async () => NOT_OK_REPORT };

    await runStatusCommand({ json: true, list: false, globals: {} }, deps);

    out.restore();
    const parsed = JSON.parse(out.lines().join('\n').trim()) as StatusReport;

    expect(parsed.ok).toBe(false);
    expect(process.exitCode).toBe(1);
  });
});
