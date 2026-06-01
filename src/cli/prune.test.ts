import { afterEach, describe, expect, it } from 'vitest';
import { PruneError, type PruneResult } from '../prune/index.js';
import { type RunPruneCommandDeps, isConfirmedAnswer, runPruneCommand } from './prune.js';

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

function makeResult(overrides: Partial<PruneResult> = {}): PruneResult {
  const candidates = [
    {
      id: 1,
      sourceId: 'track-001',
      artist: 'Caro Emerald',
      title: 'Back It Up',
      filePath: 'Caro Emerald - Back It Up.mp3',
      absolutePath: '/music/Caro Emerald - Back It Up.mp3',
    },
  ];

  return {
    ok: true,
    dryRun: true,
    candidates,
    outcomes: [{ ...candidates[0], status: 'would-trash' }],
    prunedCount: 0,
    missingCount: 0,
    failedCount: 0,
    ...overrides,
  };
}

describe('runPruneCommand', () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('dry-run prints candidates and does not prompt', async () => {
    const stdout = captureStdout();
    let promptCalled = false;
    const calls: unknown[] = [];
    const deps: RunPruneCommandDeps = {
      runPrune: async (args) => {
        calls.push(args);
        return makeResult();
      },
      confirmDeletion: async () => {
        promptCalled = true;
        return true;
      },
    };

    await runPruneCommand(
      { dryRun: true, yes: false, json: false, globals: { libraryPath: '/music' } },
      deps,
    );

    stdout.restore();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ dryRun: true, cliFlags: { library: { path: '/music' } } });
    expect(promptCalled).toBe(false);
    expect(stdout.output).toContain('Would move 1 file(s) to trash');
    expect(stdout.output).toContain('/music/Caro Emerald - Back It Up.mp3');
    expect(stdout.output).toContain('Dry run: no files were touched.');
    expect(process.exitCode).toBe(0);
  });

  it('confirmation defaults to abort when confirmDeletion returns false', async () => {
    const stdout = captureStdout();
    const calls: unknown[] = [];
    const deps: RunPruneCommandDeps = {
      runPrune: async (args) => {
        calls.push(args);
        return makeResult();
      },
      confirmDeletion: async () => false,
    };

    await runPruneCommand({ dryRun: false, yes: false, json: false, globals: {} }, deps);

    stdout.restore();

    expect(calls).toHaveLength(1);
    expect(stdout.output).toContain('Will move 1 file(s) to trash');
    expect(stdout.output).toContain('Aborted. No files were touched.');
    expect(process.exitCode).toBe(0);
  });

  it('--yes bypasses the prompt and executes prune', async () => {
    const stdout = captureStdout();
    let promptCalled = false;
    const calls: unknown[] = [];
    const deps: RunPruneCommandDeps = {
      runPrune: async (args) => {
        calls.push(args);
        if (calls.length === 1) return makeResult();
        return makeResult({
          dryRun: false,
          outcomes: [
            {
              id: 1,
              sourceId: 'track-001',
              artist: 'Caro Emerald',
              title: 'Back It Up',
              filePath: 'Caro Emerald - Back It Up.mp3',
              absolutePath: '/music/Caro Emerald - Back It Up.mp3',
              status: 'trashed',
            },
          ],
          prunedCount: 1,
        });
      },
      confirmDeletion: async () => {
        promptCalled = true;
        return false;
      },
    };

    await runPruneCommand({ dryRun: false, yes: true, json: false, globals: {} }, deps);

    stdout.restore();

    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ dryRun: false });
    expect(promptCalled).toBe(false);
    expect(stdout.output).toContain('Trashed: Caro Emerald - Back It Up');
    expect(stdout.output).toContain('Done. trashed=1 missing=0 failed=0');
    expect(process.exitCode).toBe(0);
  });

  it('emits one parseable JSON object', async () => {
    const stdout = captureStdout();
    const deps: RunPruneCommandDeps = {
      runPrune: async (args) => {
        if (args.dryRun) return makeResult();
        return makeResult({ dryRun: false, outcomes: [], prunedCount: 0 });
      },
      confirmDeletion: async () => true,
    };

    await runPruneCommand({ dryRun: false, yes: false, json: true, globals: {} }, deps);

    stdout.restore();

    const parsed = JSON.parse(stdout.output) as PruneResult & {
      confirmed: boolean;
      aborted: boolean;
    };
    expect(parsed.dryRun).toBe(false);
    expect(parsed.confirmed).toBe(true);
    expect(parsed.aborted).toBe(false);
    expect(process.exitCode).toBe(0);
  });

  it('maps PruneError to stderr and exitCode=1', async () => {
    const stderr = captureStderr();
    const deps: RunPruneCommandDeps = {
      runPrune: async () => {
        throw new PruneError('Configuration error: missing config');
      },
    };

    await runPruneCommand({ dryRun: true, yes: false, json: false, globals: {} }, deps);

    stderr.restore();

    expect(stderr.output).toContain('Configuration error: missing config');
    expect(process.exitCode).toBe(1);
  });
});

describe('isConfirmedAnswer', () => {
  it('confirms only explicit yes answers', () => {
    expect(isConfirmedAnswer('y')).toBe(true);
    expect(isConfirmedAnswer('yes')).toBe(true);
    expect(isConfirmedAnswer(' YES ')).toBe(true);
    expect(isConfirmedAnswer('')).toBe(false);
    expect(isConfirmedAnswer('\n')).toBe(false);
    expect(isConfirmedAnswer('n')).toBe(false);
  });
});
