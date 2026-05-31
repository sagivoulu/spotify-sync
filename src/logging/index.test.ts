import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileRunLogger, createNoopRunLogger, pruneRunLogs } from './index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(() => {
  // Each test gets its own isolated temp directory.
  testDir = join(tmpdir(), `spotify-sync-log-test-${Date.now()}-${Math.random()}`);
});

// No afterEach cleanup — temp dirs are small and OS-managed.

/** Build a fake XDG env that puts state under testDir. */
function makeEnv(): NodeJS.ProcessEnv {
  return { XDG_STATE_HOME: testDir };
}

/** Read all lines from a log file and parse them as JSON objects. */
function readLogLines(filePath: string): Record<string, unknown>[] {
  const content = readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// pruneRunLogs
// ---------------------------------------------------------------------------

describe('pruneRunLogs', () => {
  it('does nothing when the directory does not exist', () => {
    // Should not throw.
    pruneRunLogs(join(testDir, 'nonexistent'), 5);
  });

  it('does not prune when file count is below the cap', () => {
    const dir = join(testDir, 'logs');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '1.log'), '');
    writeFileSync(join(dir, '2.log'), '');

    pruneRunLogs(dir, 5); // cap=5, keep 4 before new, have 2 → nothing deleted

    expect(readFileSync(join(dir, '1.log'), 'utf-8')).toBe('');
    expect(readFileSync(join(dir, '2.log'), 'utf-8')).toBe('');
  });

  it('prunes oldest files to stay within keep - 1 before new file', () => {
    const dir = join(testDir, 'logs');
    mkdirSync(dir, { recursive: true });
    for (const id of [1, 2, 3, 4, 5]) {
      writeFileSync(join(dir, `${id}.log`), '');
    }

    pruneRunLogs(dir, 4); // keep = 4: delete oldest until 3 remain → delete 1, 2

    expect(() => readFileSync(join(dir, '1.log'), 'utf-8')).toThrow();
    expect(() => readFileSync(join(dir, '2.log'), 'utf-8')).toThrow();
    expect(readFileSync(join(dir, '3.log'), 'utf-8')).toBe('');
    expect(readFileSync(join(dir, '4.log'), 'utf-8')).toBe('');
    expect(readFileSync(join(dir, '5.log'), 'utf-8')).toBe('');
  });

  it('ignores files that do not match <number>.log', () => {
    const dir = join(testDir, 'logs');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'readme.txt'), 'keep me');
    writeFileSync(join(dir, '1.log'), '');
    writeFileSync(join(dir, '2.log'), '');

    pruneRunLogs(dir, 2); // keep=2 → delete all but 1 numeric log (keep 1.log or 2.log)

    // The non-matching readme.txt must survive.
    expect(readFileSync(join(dir, 'readme.txt'), 'utf-8')).toBe('keep me');
  });
});

// ---------------------------------------------------------------------------
// createFileRunLogger
// ---------------------------------------------------------------------------

describe('createFileRunLogger', () => {
  it('creates the logs directory and file automatically', async () => {
    const env = makeEnv();
    const logger = createFileRunLogger({ runId: 1, env, level: 'info' });
    logger.info({ msg: 'hello' }, 'test message');
    await logger.close();

    const logPath = join(testDir, 'spotify-sync', 'logs', '1.log');
    const lines = readLogLines(logPath);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0]).toMatchObject({ runId: 1, msg: 'test message' });
  });

  it('writes info, warn, and error entries', async () => {
    const env = makeEnv();
    const logger = createFileRunLogger({ runId: 2, env, level: 'debug' });
    logger.info({ phase: 'start' }, 'run started');
    logger.warn({ attempt: 1 }, 'retry');
    logger.error({ error: 'boom' }, 'failed');
    await logger.close();

    const logPath = join(testDir, 'spotify-sync', 'logs', '2.log');
    const lines = readLogLines(logPath);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ level: 30, msg: 'run started' }); // pino info=30
    expect(lines[1]).toMatchObject({ level: 40, msg: 'retry' }); // pino warn=40
    expect(lines[2]).toMatchObject({ level: 50, msg: 'failed' }); // pino error=50
  });

  it('binds the runId on every log entry', async () => {
    const env = makeEnv();
    const logger = createFileRunLogger({ runId: 99, env });
    logger.info({}, 'bound');
    await logger.close();

    const logPath = join(testDir, 'spotify-sync', 'logs', '99.log');
    const lines = readLogLines(logPath);
    expect(lines[0]).toMatchObject({ runId: 99 });
  });

  it('prunes old log files according to maxRunLogs', async () => {
    const env = makeEnv();
    const logsPath = join(testDir, 'spotify-sync', 'logs');

    // Pre-populate 5 old log files.
    mkdirSync(logsPath, { recursive: true });
    for (const id of [1, 2, 3, 4, 5]) {
      writeFileSync(join(logsPath, `${id}.log`), '');
    }

    // Create run 6 with maxRunLogs=4:
    //   Before creating file 6 we prune to keep-1=3 files: delete oldest 2 (1, 2).
    //   After creation of file 6: files 3, 4, 5, 6 = exactly 4 total.
    const logger = createFileRunLogger({ runId: 6, env, maxRunLogs: 4 });
    await logger.close();

    // Files 1 and 2 should be gone (oldest pruned).
    expect(() => readFileSync(join(logsPath, '1.log'))).toThrow();
    expect(() => readFileSync(join(logsPath, '2.log'))).toThrow();
    // Files 3, 4, 5 should remain (kept as the 3 oldest surviving files).
    expect(readFileSync(join(logsPath, '3.log'), 'utf-8')).toBe('');
    expect(readFileSync(join(logsPath, '4.log'), 'utf-8')).toBe('');
    expect(readFileSync(join(logsPath, '5.log'), 'utf-8')).toBe('');
    // File 6 is the new one — it should exist (pino creates it on flush/close).
    expect(readFileSync(join(logsPath, '6.log'), 'utf-8')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// createNoopRunLogger
// ---------------------------------------------------------------------------

describe('createNoopRunLogger', () => {
  it('does not throw when logging anything', () => {
    const logger = createNoopRunLogger();
    expect(() => logger.info({ x: 1 }, 'hi')).not.toThrow();
    expect(() => logger.warn({ x: 2 })).not.toThrow();
    expect(() => logger.error({ x: 3 }, 'err')).not.toThrow();
  });

  it('close() resolves without error', async () => {
    const logger = createNoopRunLogger();
    await expect(logger.close()).resolves.toBeUndefined();
  });
});
