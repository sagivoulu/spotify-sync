import { mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileRunLogger, createNoopRunLogger, pruneRunLogs } from './index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `spotify-sync-log-test-${Date.now()}-${Math.random()}`);
});

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

/**
 * Write a UUID-named log file with an explicit mtime so tests can rely on a
 * deterministic sort order without sleeping between writes.
 */
function writeLogFile(dir: string, uuid: string, mtimeOffsetMs: number): void {
  const path = join(dir, `${uuid}.log`);
  writeFileSync(path, '');
  const t = new Date(1_700_000_000_000 + mtimeOffsetMs);
  utimesSync(path, t, t);
}

// A set of fixed UUIDs for use across tests.
const UUID = [
  'aaaaaaaa-0000-4000-8000-000000000001',
  'aaaaaaaa-0000-4000-8000-000000000002',
  'aaaaaaaa-0000-4000-8000-000000000003',
  'aaaaaaaa-0000-4000-8000-000000000004',
  'aaaaaaaa-0000-4000-8000-000000000005',
  'aaaaaaaa-0000-4000-8000-000000000006',
];

// ---------------------------------------------------------------------------
// pruneRunLogs
// ---------------------------------------------------------------------------

describe('pruneRunLogs', () => {
  it('does nothing when the directory does not exist', () => {
    pruneRunLogs(join(testDir, 'nonexistent'), 5);
  });

  it('does not prune when file count is below the cap', () => {
    const dir = join(testDir, 'logs');
    mkdirSync(dir, { recursive: true });
    writeLogFile(dir, UUID[0], 0);
    writeLogFile(dir, UUID[1], 1000);

    pruneRunLogs(dir, 5); // cap=5: need 4 before new, have 2 → nothing deleted

    expect(readFileSync(join(dir, `${UUID[0]}.log`), 'utf-8')).toBe('');
    expect(readFileSync(join(dir, `${UUID[1]}.log`), 'utf-8')).toBe('');
  });

  it('prunes oldest files (by mtime) to stay within keep - 1 before new file', () => {
    const dir = join(testDir, 'logs');
    mkdirSync(dir, { recursive: true });
    // Create 5 files with ascending mtimes (UUID[0] is oldest, UUID[4] is newest).
    for (let i = 0; i < 5; i++) {
      writeLogFile(dir, UUID[i], i * 1000);
    }

    pruneRunLogs(dir, 4); // keep=4: delete oldest until 3 remain → delete UUID[0], UUID[1]

    expect(() => readFileSync(join(dir, `${UUID[0]}.log`))).toThrow();
    expect(() => readFileSync(join(dir, `${UUID[1]}.log`))).toThrow();
    expect(readFileSync(join(dir, `${UUID[2]}.log`), 'utf-8')).toBe('');
    expect(readFileSync(join(dir, `${UUID[3]}.log`), 'utf-8')).toBe('');
    expect(readFileSync(join(dir, `${UUID[4]}.log`), 'utf-8')).toBe('');
  });

  it('ignores non-UUID files (readme.txt, old numeric logs)', () => {
    const dir = join(testDir, 'logs');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'readme.txt'), 'keep me');
    writeFileSync(join(dir, '1.log'), 'old numeric log');
    writeLogFile(dir, UUID[0], 0);
    writeLogFile(dir, UUID[1], 1000);

    // cap=2: keep 1 UUID log before new → delete UUID[0]. Non-UUID files untouched.
    pruneRunLogs(dir, 2);

    expect(readFileSync(join(dir, 'readme.txt'), 'utf-8')).toBe('keep me');
    expect(readFileSync(join(dir, '1.log'), 'utf-8')).toBe('old numeric log');
    expect(() => readFileSync(join(dir, `${UUID[0]}.log`))).toThrow();
    expect(readFileSync(join(dir, `${UUID[1]}.log`), 'utf-8')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// createFileRunLogger
// ---------------------------------------------------------------------------

describe('createFileRunLogger', () => {
  it('creates the logs directory and UUID-named file automatically', async () => {
    const env = makeEnv();
    const runUuid = UUID[0];
    const logger = createFileRunLogger({ runId: 1, runUuid, env, level: 'info' });
    logger.info({ msg: 'hello' }, 'test message');
    await logger.close();

    const logPath = join(testDir, 'spotify-sync', 'logs', `${runUuid}.log`);
    const lines = readLogLines(logPath);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0]).toMatchObject({ runId: 1, runUuid, msg: 'test message' });
  });

  it('writes info, warn, and error entries', async () => {
    const env = makeEnv();
    const runUuid = UUID[1];
    const logger = createFileRunLogger({ runId: 2, runUuid, env, level: 'debug' });
    logger.info({ phase: 'start' }, 'run started');
    logger.warn({ attempt: 1 }, 'retry');
    logger.error({ error: 'boom' }, 'failed');
    await logger.close();

    const logPath = join(testDir, 'spotify-sync', 'logs', `${runUuid}.log`);
    const lines = readLogLines(logPath);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ level: 30, msg: 'run started' }); // pino info=30
    expect(lines[1]).toMatchObject({ level: 40, msg: 'retry' }); // pino warn=40
    expect(lines[2]).toMatchObject({ level: 50, msg: 'failed' }); // pino error=50
  });

  it('binds both runId and runUuid on every log entry', async () => {
    const env = makeEnv();
    const runUuid = UUID[2];
    const logger = createFileRunLogger({ runId: 99, runUuid, env });
    logger.info({}, 'bound');
    await logger.close();

    const logPath = join(testDir, 'spotify-sync', 'logs', `${runUuid}.log`);
    const lines = readLogLines(logPath);
    expect(lines[0]).toMatchObject({ runId: 99, runUuid });
  });

  it('prunes old log files according to maxRunLogs', async () => {
    const env = makeEnv();
    const logsPath = join(testDir, 'spotify-sync', 'logs');

    // Pre-populate 5 old UUID log files with explicit ascending mtimes.
    mkdirSync(logsPath, { recursive: true });
    for (let i = 0; i < 5; i++) {
      writeLogFile(logsPath, UUID[i], i * 1000);
    }

    // Create run with UUID[5], maxRunLogs=4:
    //   Before creating the file, prune to keep-1=3: delete oldest 2 (UUID[0], UUID[1]).
    //   After creation of UUID[5]: UUID[2], UUID[3], UUID[4], UUID[5] = exactly 4 total.
    const logger = createFileRunLogger({ runId: 6, runUuid: UUID[5], env, maxRunLogs: 4 });
    await logger.close();

    expect(() => readFileSync(join(logsPath, `${UUID[0]}.log`))).toThrow();
    expect(() => readFileSync(join(logsPath, `${UUID[1]}.log`))).toThrow();
    expect(readFileSync(join(logsPath, `${UUID[2]}.log`), 'utf-8')).toBe('');
    expect(readFileSync(join(logsPath, `${UUID[3]}.log`), 'utf-8')).toBe('');
    expect(readFileSync(join(logsPath, `${UUID[4]}.log`), 'utf-8')).toBe('');
    expect(readFileSync(join(logsPath, `${UUID[5]}.log`), 'utf-8')).toBeDefined();
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
