import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deriveCodeChallenge, generateCodeVerifier, generateState } from './pkce.js';

// base64url alphabet: A-Z a-z 0-9 - _  (no +, /, or = padding)
const BASE64URL_RE = /^[A-Za-z0-9\-_]+$/;

describe('generateCodeVerifier', () => {
  it('returns a base64url string of the expected length', () => {
    const verifier = generateCodeVerifier();
    // 32 random bytes → ceil(32 * 4 / 3) = 43 chars without padding
    expect(verifier).toHaveLength(43);
    expect(BASE64URL_RE.test(verifier)).toBe(true);
  });

  it('returns a different value on each call', () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toBe(b);
  });
});

describe('deriveCodeChallenge', () => {
  it('produces the base64url SHA-256 of the verifier', () => {
    const verifier = 'dGVzdHZlcmlmaWVyMTIzNDU2Nzg5MA'; // known input
    const expected = createHash('sha256')
      .update(verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    expect(deriveCodeChallenge(verifier)).toBe(expected);
  });

  it('is deterministic for the same input', () => {
    const v = generateCodeVerifier();
    expect(deriveCodeChallenge(v)).toBe(deriveCodeChallenge(v));
  });

  it('differs for different verifiers', () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(deriveCodeChallenge(a)).not.toBe(deriveCodeChallenge(b));
  });

  it('result is a valid base64url string', () => {
    expect(BASE64URL_RE.test(deriveCodeChallenge(generateCodeVerifier()))).toBe(true);
  });
});

describe('generateState', () => {
  it('returns a non-empty base64url string', () => {
    const state = generateState();
    expect(state.length).toBeGreaterThan(0);
    expect(BASE64URL_RE.test(state)).toBe(true);
  });

  it('returns a different value on each call', () => {
    const a = generateState();
    const b = generateState();
    expect(a).not.toBe(b);
  });
});
