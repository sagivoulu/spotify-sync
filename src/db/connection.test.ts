import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'spotify-sync-db-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('openDatabase', () => {
  it('sets foreign_keys = ON on the returned connection', () => {
    const db = openDatabase(':memory:');
    const result = db.pragma('foreign_keys', { simple: true });
    db.close();
    expect(result).toBe(1);
  });

  it('creates the DB file and its parent directory when they do not exist', () => {
    const nestedDbPath = join(tmpDir, 'nested', 'deep', 'db.sqlite');
    expect(existsSync(nestedDbPath)).toBe(false);

    const db = openDatabase(nestedDbPath);
    db.close();

    expect(existsSync(nestedDbPath)).toBe(true);
  });

  it('opens an in-memory DB without touching the filesystem', () => {
    // No temp dir involvement — just confirm it opens and is queryable.
    const db = openDatabase(':memory:');
    const result = db.prepare('SELECT 1 AS n').get() as { n: number };
    db.close();
    expect(result.n).toBe(1);
  });

  it('opens successfully when the parent directory already exists', () => {
    // tmpDir already exists — should not error.
    const dbPath = join(tmpDir, 'db.sqlite');
    const db = openDatabase(dbPath);
    db.close();
    expect(existsSync(dbPath)).toBe(true);
  });
});
