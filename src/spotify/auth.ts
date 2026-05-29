import * as http from 'node:http';
import { deriveCodeChallenge, generateCodeVerifier, generateState } from './pkce.js';
import type { StoredToken } from './token-store.js';

// ---------------------------------------------------------------------------
// Spotify PKCE Authorization Code Flow — core implementation.
//
// Design:
// - All functions are pure / injectable (no direct console.log, no process.env reads).
// - runAuthFlow accepts an onAuthorizeUrl callback so the CLI layer decides how to
//   open the browser and what to print — keeping core/CLI separation clean.
// - fetch is injectable for tests; defaults to global fetch (Node 24).
// ---------------------------------------------------------------------------

export const SCOPES = ['playlist-read-private', 'playlist-read-collaborative'] as const;

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthorizeUrlParams {
  clientId: string;
  redirectUri: string;
  scopes: readonly string[];
  state: string;
  codeChallenge: string;
}

export interface ExchangeParams {
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  fetchFn?: typeof fetch;
}

export interface RunAuthFlowParams {
  clientId: string;
  port: number;
  onAuthorizeUrl: (url: string) => void;
  fetchFn?: typeof fetch;
  /** Milliseconds to wait for the browser callback before rejecting. Default: 5 minutes. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// buildAuthorizeUrl
// ---------------------------------------------------------------------------

/**
 * Construct the Spotify authorization URL the user must visit to grant consent.
 * Uses S256 PKCE — client_secret is never included.
 */
export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const url = new URL(SPOTIFY_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', params.scopes.join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', params.codeChallenge);
  return url.toString();
}

// ---------------------------------------------------------------------------
// exchangeCodeForToken
// ---------------------------------------------------------------------------

/** Raw shape of Spotify's token endpoint response. */
interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token: string;
}

/**
 * Exchange an authorization code for tokens using the PKCE flow.
 *
 * IMPORTANT: this is a public-client exchange — client_id + code_verifier only.
 * The client_secret is intentionally NOT sent. This is correct PKCE behaviour and is
 * what keeps a future shared-app distribution model viable (a secret embedded in a
 * distributed CLI would be extractable by anyone). See discussion in chat and plan.
 */
export async function exchangeCodeForToken(params: ExchangeParams): Promise<StoredToken> {
  const fetchFn = params.fetchFn ?? fetch;
  const obtainedAt = Date.now();

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
    // No client_secret — intentional PKCE public-client behaviour.
  });

  const response = await fetchFn(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '(no body)');
    throw new Error(`Spotify token exchange failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as SpotifyTokenResponse;

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type,
    scope: data.scope,
    expires_at: obtainedAt + data.expires_in * 1000,
    obtained_at: obtainedAt,
  };
}

// ---------------------------------------------------------------------------
// runAuthFlow
// ---------------------------------------------------------------------------

/** HTML shown in the browser after a successful callback. */
const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>spotify-sync authenticated</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:4rem auto;text-align:center">
  <h2>✓ Authenticated</h2>
  <p>You can close this tab and return to the terminal.</p>
</body>
</html>`;

/** HTML shown in the browser when Spotify returns an error in the callback. */
function errorHtml(error: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>spotify-sync auth error</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:4rem auto;text-align:center">
  <h2>Authentication failed</h2>
  <p><code>${error}</code></p>
  <p>Return to the terminal for details.</p>
</body>
</html>`;
}

/**
 * Run the full PKCE OAuth flow and return a StoredToken.
 *
 * Steps:
 * 1. Generate PKCE verifier/challenge and state.
 * 2. Start a localhost HTTP server to receive the /callback redirect.
 * 3. Call onAuthorizeUrl() with the full authorize URL — caller opens the browser.
 * 4. Wait for Spotify to redirect back (with timeout).
 * 5. Validate state, extract code, close the server.
 * 6. Exchange the code for tokens and return.
 */
export async function runAuthFlow(params: RunAuthFlowParams): Promise<StoredToken> {
  const { clientId, port, onAuthorizeUrl, fetchFn, timeoutMs = 5 * 60 * 1000 } = params;

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = deriveCodeChallenge(codeVerifier);
  const state = generateState();
  const redirectUri = `http://localhost:${port}/callback`;

  const authorizeUrl = buildAuthorizeUrl({
    clientId,
    redirectUri,
    scopes: SCOPES,
    state,
    codeChallenge,
  });

  return new Promise<StoredToken>((resolve, reject) => {
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      server.close(() => fn());
    };

    const server = http.createServer((req, res) => {
      // Only handle GET /callback — ignore favicon etc.
      const reqUrl = new URL(req.url ?? '/', `http://localhost:${port}`);
      if (reqUrl.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }

      const returnedState = reqUrl.searchParams.get('state');
      const error = reqUrl.searchParams.get('error');
      const code = reqUrl.searchParams.get('code');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(errorHtml(error));
        settle(() => reject(new Error(`Spotify denied authorization: ${error}`)));
        return;
      }

      if (returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(errorHtml('state_mismatch'));
        settle(() => reject(new Error('OAuth state mismatch — possible CSRF; aborting')));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(errorHtml('missing_code'));
        settle(() => reject(new Error('Spotify callback missing authorization code')));
        return;
      }

      // Respond to the browser immediately, then do the async token exchange.
      res.writeHead(200, { 'Content-Type': 'text/html' }).end(SUCCESS_HTML);

      exchangeCodeForToken({ clientId, code, redirectUri, codeVerifier, fetchFn })
        .then((token) => settle(() => resolve(token)))
        .catch((err: unknown) => settle(() => reject(err)));
    });

    server.on('error', (err) => {
      settle(() => reject(new Error(`Failed to start auth callback server: ${err.message}`)));
    });

    // Timeout guard.
    const timer = setTimeout(() => {
      settle(() => reject(new Error(`Auth flow timed out after ${timeoutMs / 1000}s`)));
    }, timeoutMs);
    // Don't let the timer keep the process alive if something else resolves first.
    if (timer.unref) timer.unref();

    server.listen(port, 'localhost', () => {
      // Server is up — safe to direct the user to the authorize URL.
      onAuthorizeUrl(authorizeUrl);
    });
  });
}
