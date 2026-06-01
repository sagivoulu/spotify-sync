import { afterEach, describe, expect, it } from 'vitest';
import { ImportError, type ImportResult } from '../import/index.js';
import { type RunImportCommandDeps, runImportCommand } from './import.js';

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

function makeResult(overrides: Partial<ImportResult> = {}): ImportResult {
  return {
    ok: true,
    trackId: 'track-001',
    sourcePath: '/downloads/manual.mp3',
    filePath: 'Artist - Title.mp3',
    finalPath: '/music/Artist - Title.mp3',
    mode: 'copy',
    ...overrides,
  };
}

describe('runImportCommand', () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('delegates options and prints a human confirmation', async () => {
    const stdout = captureStdout();
    let capturedArgs: unknown;
    const deps: RunImportCommandDeps = {
      runImport: async (args) => {
        capturedArgs = args;
        return makeResult();
      },
    };

    await runImportCommand(
      {
        filePath: 'manual.mp3',
        trackId: 'track-001',
        move: true,
        json: false,
        globals: { libraryPath: '/music', dbPath: '/tmp/db.sqlite' },
      },
      deps,
    );

    stdout.restore();

    expect(capturedArgs).toMatchObject({
      filePath: 'manual.mp3',
      trackId: 'track-001',
      move: true,
      cliFlags: { library: { path: '/music' }, db_path: '/tmp/db.sqlite' },
    });
    expect(stdout.output).toContain('Imported track-001 -> /music/Artist - Title.mp3');
    expect(process.exitCode).toBe(0);
  });

  it('prints one structured object in JSON mode', async () => {
    const stdout = captureStdout();
    const deps: RunImportCommandDeps = {
      runImport: async () => makeResult({ mode: 'move' }),
    };

    await runImportCommand(
      { filePath: 'manual.mp3', trackId: 'track-001', move: true, json: true, globals: {} },
      deps,
    );

    stdout.restore();

    expect(JSON.parse(stdout.output)).toMatchObject({
      ok: true,
      trackId: 'track-001',
      filePath: 'Artist - Title.mp3',
      mode: 'move',
    });
    expect(process.exitCode).toBe(0);
  });

  it('maps ImportError to stderr and exitCode=1', async () => {
    const stderr = captureStderr();
    const deps: RunImportCommandDeps = {
      runImport: async () => {
        throw new ImportError('Track not found in DB for Spotify track ID "missing"');
      },
    };

    await runImportCommand(
      { filePath: 'manual.mp3', trackId: 'missing', move: false, json: false, globals: {} },
      deps,
    );

    stderr.restore();

    expect(stderr.output).toContain('Track not found in DB');
    expect(process.exitCode).toBe(1);
  });
});
