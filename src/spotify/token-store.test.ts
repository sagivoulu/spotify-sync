import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StoredToken } from './token-store.js';
import { saveToken } from './token-store.js';

const SAMPLE_TOKEN: StoredToken = {
  refresh_token: 'test-refresh-token',
  access_token: 'test-access-token',
  expires_at: 9999999999999,
  scope: 'playlist-read-private playlist-read-collaborative',
  token_type: 'Bearer',
  obtained_at: 1000000000000,
};

describe('saveToken', () => {
  let tmpDir: string;
  let tokenPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'spotify-sync-test-'));
    tokenPath = join(tmpDir, 'auth.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes valid JSON matching the token', () => {
    saveToken(SAMPLE_TOKEN, { path: tokenPath });

    const contents = readFileSync(tokenPath, 'utf-8');
    const parsed = JSON.parse(contents) as StoredToken;

    expect(parsed.refresh_token).toBe(SAMPLE_TOKEN.refresh_token);
    expect(parsed.access_token).toBe(SAMPLE_TOKEN.access_token);
    expect(parsed.scope).toBe(SAMPLE_TOKEN.scope);
    expect(parsed.token_type).toBe(SAMPLE_TOKEN.token_type);
    expect(parsed.expires_at).toBe(SAMPLE_TOKEN.expires_at);
    expect(parsed.obtained_at).toBe(SAMPLE_TOKEN.obtained_at);
  });

  it('sets file permissions to 0600', () => {
    saveToken(SAMPLE_TOKEN, { path: tokenPath });

    const stat = statSync(tokenPath);
    // Mask to the low 9 permission bits.
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('re-applies 0600 permissions when overwriting an existing file', () => {
    // First write — might be any mode.
    saveToken(SAMPLE_TOKEN, { path: tokenPath });

    // Second write (overwrite).
    const updated: StoredToken = { ...SAMPLE_TOKEN, access_token: 'new-access-token' };
    saveToken(updated, { path: tokenPath });

    const stat = statSync(tokenPath);
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);

    // Also verify the new content was written.
    const parsed = JSON.parse(readFileSync(tokenPath, 'utf-8')) as StoredToken;
    expect(parsed.access_token).toBe('new-access-token');
  });

  it('creates parent directories if they do not exist', () => {
    const nestedPath = join(tmpDir, 'nested', 'dir', 'auth.json');
    saveToken(SAMPLE_TOKEN, { path: nestedPath });

    const contents = readFileSync(nestedPath, 'utf-8');
    expect(JSON.parse(contents)).toMatchObject({ refresh_token: SAMPLE_TOKEN.refresh_token });
  });
});
