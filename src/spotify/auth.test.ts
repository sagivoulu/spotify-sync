import * as http from 'node:http';
import { describe, expect, it } from 'vitest';
import { SCOPES, buildAuthorizeUrl, exchangeCodeForToken, runAuthFlow } from './auth.js';

// ---------------------------------------------------------------------------
// buildAuthorizeUrl
// ---------------------------------------------------------------------------

describe('buildAuthorizeUrl', () => {
  const params = {
    clientId: 'my-client-id',
    redirectUri: 'http://localhost:8888/callback',
    scopes: SCOPES,
    state: 'test-state',
    codeChallenge: 'test-challenge',
  };

  it('uses the Spotify authorize endpoint', () => {
    const url = new URL(buildAuthorizeUrl(params));
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
  });

  it('sets response_type=code', () => {
    const url = new URL(buildAuthorizeUrl(params));
    expect(url.searchParams.get('response_type')).toBe('code');
  });

  it('sets code_challenge_method=S256', () => {
    const url = new URL(buildAuthorizeUrl(params));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('includes both required scopes', () => {
    const url = new URL(buildAuthorizeUrl(params));
    const scope = url.searchParams.get('scope') ?? '';
    expect(scope).toContain('playlist-read-private');
    expect(scope).toContain('playlist-read-collaborative');
  });

  it('passes client_id, redirect_uri, state, and code_challenge', () => {
    const url = new URL(buildAuthorizeUrl(params));
    expect(url.searchParams.get('client_id')).toBe(params.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(params.redirectUri);
    expect(url.searchParams.get('state')).toBe(params.state);
    expect(url.searchParams.get('code_challenge')).toBe(params.codeChallenge);
  });
});

// ---------------------------------------------------------------------------
// exchangeCodeForToken
// ---------------------------------------------------------------------------

describe('exchangeCodeForToken', () => {
  const now = Date.now();

  /** Build a fake fetch that returns a Spotify-shaped token response. */
  function makeFakeFetch(overrides?: Partial<Record<string, unknown>>) {
    const body = {
      access_token: 'fake-access',
      refresh_token: 'fake-refresh',
      token_type: 'Bearer',
      scope: 'playlist-read-private playlist-read-collaborative',
      expires_in: 3600,
      ...overrides,
    };
    return async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
  }

  it('POSTs to the Spotify token endpoint', async () => {
    const calls: { url: string; body: string }[] = [];
    const fakeFetch = async (
      url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      calls.push({ url: String(url), body: String(init?.body ?? '') });
      return makeFakeFetch()(url, init);
    };

    await exchangeCodeForToken({
      clientId: 'cid',
      code: 'auth-code',
      redirectUri: 'http://localhost:8888/callback',
      codeVerifier: 'my-verifier',
      fetchFn: fakeFetch,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://accounts.spotify.com/api/token');
  });

  it('sends client_id and code_verifier in the body', async () => {
    const bodies: URLSearchParams[] = [];
    const fakeFetch = async (
      url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      bodies.push(new URLSearchParams(String(init?.body ?? '')));
      return makeFakeFetch()(url, init);
    };

    await exchangeCodeForToken({
      clientId: 'cid',
      code: 'auth-code',
      redirectUri: 'http://localhost:8888/callback',
      codeVerifier: 'my-verifier',
      fetchFn: fakeFetch,
    });

    const body = bodies[0];
    expect(body.get('client_id')).toBe('cid');
    expect(body.get('code_verifier')).toBe('my-verifier');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('redirect_uri')).toBe('http://localhost:8888/callback');
  });

  it('does NOT send client_secret in the body (pure PKCE)', async () => {
    const bodies: URLSearchParams[] = [];
    const fakeFetch = async (
      url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      bodies.push(new URLSearchParams(String(init?.body ?? '')));
      return makeFakeFetch()(url, init);
    };

    await exchangeCodeForToken({
      clientId: 'cid',
      code: 'auth-code',
      redirectUri: 'http://localhost:8888/callback',
      codeVerifier: 'my-verifier',
      fetchFn: fakeFetch,
    });

    expect(bodies[0].has('client_secret')).toBe(false);
  });

  it('maps the response to a StoredToken', async () => {
    const before = Date.now();
    const token = await exchangeCodeForToken({
      clientId: 'cid',
      code: 'auth-code',
      redirectUri: 'http://localhost:8888/callback',
      codeVerifier: 'my-verifier',
      fetchFn: makeFakeFetch(),
    });
    const after = Date.now();

    expect(token.access_token).toBe('fake-access');
    expect(token.refresh_token).toBe('fake-refresh');
    expect(token.token_type).toBe('Bearer');
    expect(token.scope).toBe('playlist-read-private playlist-read-collaborative');
    // expires_at should be approximately now + 3600s
    expect(token.expires_at).toBeGreaterThanOrEqual(before + 3600 * 1000);
    expect(token.expires_at).toBeLessThanOrEqual(after + 3600 * 1000);
    expect(token.obtained_at).toBeGreaterThanOrEqual(before);
    expect(token.obtained_at).toBeLessThanOrEqual(after);
  });

  it('throws when the token endpoint returns a non-2xx status', async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response('{"error":"invalid_client"}', { status: 400 });

    await expect(
      exchangeCodeForToken({
        clientId: 'cid',
        code: 'bad-code',
        redirectUri: 'http://localhost:8888/callback',
        codeVerifier: 'my-verifier',
        fetchFn: fakeFetch,
      }),
    ).rejects.toThrow(/400/);
  });
});

// ---------------------------------------------------------------------------
// runAuthFlow — integration tests driving the localhost callback server
// ---------------------------------------------------------------------------

/** Pick an ephemeral port to avoid conflicts (different per test). */
let nextPort = 19100;
function allocPort(): number {
  return nextPort++;
}

/** Drive the auth callback server with an HTTP GET to /callback. */
async function driveCallback(
  port: number,
  params: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const qs = new URLSearchParams(params).toString();
  const response = await fetch(`http://localhost:${port}/callback?${qs}`);
  const body = await response.text();
  return { status: response.status, body };
}

describe('runAuthFlow', () => {
  it('resolves with a StoredToken on a successful callback', async () => {
    const port = allocPort();
    let capturedState = '';

    const fakeFetch = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          access_token: 'at',
          refresh_token: 'rt',
          token_type: 'Bearer',
          scope: 'playlist-read-private',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    const flowPromise = runAuthFlow({
      clientId: 'cid',
      port,
      onAuthorizeUrl: (url) => {
        capturedState = new URL(url).searchParams.get('state') ?? '';
        // Drive the callback only after we know the correct state.
        setImmediate(() => {
          driveCallback(port, { code: 'auth-code', state: capturedState }).catch(() => {});
        });
      },
      fetchFn: fakeFetch,
      timeoutMs: 10_000,
    });

    const token = await flowPromise;
    expect(token.access_token).toBe('at');
    expect(token.refresh_token).toBe('rt');
  });

  it('rejects when the callback carries an error param', async () => {
    const port = allocPort();
    let capturedState = '';

    const flowPromise = runAuthFlow({
      clientId: 'cid',
      port,
      onAuthorizeUrl: (url) => {
        capturedState = new URL(url).searchParams.get('state') ?? '';
        setImmediate(() => {
          driveCallback(port, { error: 'access_denied', state: capturedState }).catch(() => {});
        });
      },
      timeoutMs: 10_000,
    });

    await expect(flowPromise).rejects.toThrow(/access_denied/);
  });

  it('rejects when the state does not match (CSRF protection)', async () => {
    const port = allocPort();

    const flowPromise = runAuthFlow({
      clientId: 'cid',
      port,
      onAuthorizeUrl: () => {
        setImmediate(() => {
          driveCallback(port, { code: 'auth-code', state: 'wrong-state' }).catch(() => {});
        });
      },
      timeoutMs: 10_000,
    });

    await expect(flowPromise).rejects.toThrow(/state mismatch/i);
  });

  it('rejects after timeoutMs elapses', async () => {
    const port = allocPort();

    // onAuthorizeUrl — intentionally never drives the callback.
    const flowPromise = runAuthFlow({
      clientId: 'cid',
      port,
      onAuthorizeUrl: () => {},
      timeoutMs: 100, // very short for test speed
    });

    await expect(flowPromise).rejects.toThrow(/timed out/i);
  });
});
