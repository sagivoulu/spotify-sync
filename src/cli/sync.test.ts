import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FatalSyncError } from '../sync/index.js';
import { type RunSyncCommandDeps, runSyncCommand } from './sync.js';

// ---------------------------------------------------------------------------
// runSyncCommand — CLI handler unit tests (WES-14)
//
// These tests exercise the CLI's exit-code mapping and stderr output for the
// binary-missing path. They inject a fake runSync so no real binaries, DB,
// or Spotify credentials are needed.
// ---------------------------------------------------------------------------

/** Capture writes to process.stderr during a test. */
function captureStderr(): { output: string; restore: () => void } {
  let output = '';
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk: string | Uint8Array) => {
    output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  };
  return {
    get output() {
      return output;
    },
    restore: () => {
      process.stderr.write = original;
    },
  };
}

/** Capture writes to process.stdout during a test. */
function captureStdout(): { output: string; restore: () => void } {
  let output = '';
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array) => {
    output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  };
  return {
    get output() {
      return output;
    },
    restore: () => {
      process.stdout.write = original;
    },
  };
}

describe('runSyncCommand — FatalSyncError → exit code 2', () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('sets exitCode=2 and writes binary name to stderr when yt-dlp is missing', async () => {
    const stderr = captureStderr();

    const deps: RunSyncCommandDeps = {
      runSync: async () => {
        throw new FatalSyncError('yt-dlp — not found on PATH\nInstall:  brew install yt-dlp');
      },
    };

    await runSyncCommand({ json: false, globals: {} }, deps);

    stderr.restore();

    expect(process.exitCode).toBe(2);
    // Must name the binary (acceptance criterion)
    expect(stderr.output).toMatch(/yt-dlp/);
    // Must include install instructions (mirrors doctor output)
    expect(stderr.output).toMatch(/not found on PATH/);
  });

  it('sets exitCode=2 and writes binary name to stderr when ffmpeg is missing', async () => {
    const stderr = captureStderr();

    const deps: RunSyncCommandDeps = {
      runSync: async () => {
        throw new FatalSyncError('ffmpeg — not found on PATH\nInstall:  brew install ffmpeg');
      },
    };

    await runSyncCommand({ json: false, globals: {} }, deps);

    stderr.restore();

    expect(process.exitCode).toBe(2);
    expect(stderr.output).toMatch(/ffmpeg/);
    expect(stderr.output).toMatch(/not found on PATH/);
  });

  it('sets exitCode=2 in --json mode too (no stdout printed)', async () => {
    let stdoutOutput = '';
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      stdoutOutput += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
      return true;
    };

    const stderr = captureStderr();

    const deps: RunSyncCommandDeps = {
      runSync: async () => {
        throw new FatalSyncError('yt-dlp — not found on PATH');
      },
    };

    await runSyncCommand({ json: true, globals: {} }, deps);

    stderr.restore();
    process.stdout.write = originalWrite;

    expect(process.exitCode).toBe(2);
    // No JSON printed to stdout on fatal error
    expect(stdoutOutput).toBe('');
  });
});

describe('runSyncCommand — log path output', () => {
  const originalExitCode = process.exitCode;
  const logPath = '/tmp/spotify-sync/logs/test-run.log';

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('prints the run log path once in human mode', async () => {
    const stdout = captureStdout();

    const deps: RunSyncCommandDeps = {
      runSync: async ({ onEvent }) => {
        onEvent?.({
          type: 'run-start',
          runId: 1,
          logPath,
          libraryPath: '/music/wcs',
          concurrency: 3,
          pendingCount: 1,
          addedCount: 1,
          removedMarkedCount: 0,
          restoredCount: 0,
        });
        onEvent?.({
          type: 'run-finish',
          runId: 1,
          added: 1,
          downloaded: 1,
          failed: 0,
          removedMarked: 0,
          ok: true,
        });
        return {
          runId: 1,
          logPath,
          added: 1,
          downloaded: 1,
          failed: 0,
          removedMarked: 0,
          ok: true,
        };
      },
    };

    await runSyncCommand({ json: false, globals: {} }, deps);

    stdout.restore();

    expect(stdout.output.match(/Logging to /g)).toHaveLength(1);
    expect(stdout.output).toContain(`Logging to ${logPath}`);
    expect(process.exitCode).toBe(0);
  });

  it('includes logPath in JSON mode without event lines', async () => {
    const stdout = captureStdout();

    const deps: RunSyncCommandDeps = {
      runSync: async ({ onEvent }) => {
        onEvent?.({
          type: 'run-start',
          runId: 1,
          logPath,
          libraryPath: '/music/wcs',
          concurrency: 3,
          pendingCount: 1,
          addedCount: 1,
          removedMarkedCount: 0,
          restoredCount: 0,
        });
        return {
          runId: 1,
          logPath,
          added: 1,
          downloaded: 1,
          failed: 0,
          removedMarked: 0,
          ok: true,
        };
      },
    };

    await runSyncCommand({ json: true, globals: {} }, deps);

    stdout.restore();

    expect(stdout.output).not.toContain('Logging to');
    expect(JSON.parse(stdout.output)).toMatchObject({ logPath });
    expect(process.exitCode).toBe(0);
  });
});
