import { ConfigError, loadConfig, mapCliFlags } from '../config/index.js';
import { runAuthFlow } from '../spotify/auth.js';
import { saveToken } from '../spotify/token-store.js';
import { openBrowser } from './open-browser.js';

// ---------------------------------------------------------------------------
// runAuthCommand — thin CLI handler for `spotify-sync auth`.
//
// Responsibilities:
// 1. Load and validate config (errors out clearly before any browser interaction).
// 2. Drive the PKCE flow, opening the browser and printing status to the terminal.
// 3. Persist the resulting token to auth.json.
// 4. Print a success message (or structured JSON for --json).
//
// Error handling:
// - ConfigError → stderr + process.exitCode 2 (fatal, per PRD exit-code contract).
// - Auth errors (port in use, Spotify denied, timeout) → same: stderr + exit 2.
// - Unexpected errors propagate to the bin shim (which exits 1).
//
// Core functions (runAuthFlow, saveToken) are never passed console.log — this
// file is the only place that prints.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Setup guide — shown when Spotify credentials are missing from config.
// ---------------------------------------------------------------------------

const SPOTIFY_SETUP_GUIDE = (port: number) => `
Spotify credentials not configured.

To use spotify-sync you need to register a Spotify developer app:

  1. Go to https://developer.spotify.com/dashboard and click "Create app".

     Suggested values:
       App name:                                  spotify-sync
       App description:                           CLI tool to sync a Spotify playlist to a local music library
       Website:                                   (leave blank)
       Which API/SDKs are you planning to use?    Web API  ← select this one only
       ☑ I understand and agree with Spotify's Developer Terms of Service and Design Guidelines

  2. In the app's Settings → Redirect URIs, add:
       http://127.0.0.1:${port}/callback

     Note: use the IP address 127.0.0.1, not "localhost" — Spotify requires
     the explicit loopback IP. Spotify will show a "not secure" warning because
     the URI uses http:// rather than https://; this warning is expected and safe
     to ignore for loopback addresses (traffic never leaves your machine).

  3. Copy the Client ID and Client Secret from the app settings.

  4. Create ~/.config/spotify-sync/config.json:

       {
         "spotify": {
           "client_id": "YOUR_CLIENT_ID",
           "client_secret": "YOUR_CLIENT_SECRET",
           "playlist_url": "https://open.spotify.com/playlist/..."
         },
         "library": {
           "path": "/path/to/your/music"
         }
       }

     Or set env vars instead:
       SPOTIFY_SYNC_SPOTIFY_CLIENT_ID=...
       SPOTIFY_SYNC_SPOTIFY_CLIENT_SECRET=...

  5. Re-run: spotify-sync auth

`;

export interface RunAuthCommandOptions {
  /** Whether to emit JSON output instead of human-readable text. */
  json: boolean;
  /** Localhost port for the OAuth callback server. */
  port: number;
  /** Global CLI flags (from cmd.optsWithGlobals()). */
  globals: { libraryPath?: string; dbPath?: string };
}

/**
 * Run the `spotify-sync auth` command.
 * Exported for testing; `src/cli/program.ts` calls this from the .action() handler.
 */
export async function runAuthCommand(options: RunAuthCommandOptions): Promise<void> {
  const { json, port, globals } = options;

  // --- Step 1: Validate config before touching the browser ---
  // loadConfig throws ConfigError with a clear message if client_id, client_secret,
  // or any other required field is missing. We catch it here so we can set exit code 2.
  //
  // Note on client_secret: required by the config schema and the acceptance criteria,
  // but intentionally NOT sent in the PKCE token exchange. This is by design — the
  // public-client PKCE flow uses only client_id + code_verifier. The secret is
  // validated here so that (a) this ticket's AC is met and (b) future features that
  // need it (e.g. Web API calls that require client credentials) have it available
  // without a separate config migration. See WES-8 discussion in chat.
  let config: Awaited<ReturnType<typeof loadConfig>>;
  try {
    config = loadConfig({ cliFlags: mapCliFlags(globals) });
  } catch (err) {
    if (err instanceof ConfigError) {
      const isCredentialsMissing =
        err.message.includes('spotify.client_id') || err.message.includes('spotify.client_secret');
      if (isCredentialsMissing && !json) {
        process.stderr.write(SPOTIFY_SETUP_GUIDE(port));
      } else {
        process.stderr.write(`${err.message}\n`);
      }
      process.exitCode = 2;
      return;
    }
    throw err;
  }

  const { client_id: clientId } = config.spotify;

  // --- Step 2: Run the PKCE flow ---
  let token: Awaited<ReturnType<typeof runAuthFlow>>;
  try {
    token = await runAuthFlow({
      clientId,
      port,
      onAuthorizeUrl: (url) => {
        if (!json) {
          process.stdout.write('Opening browser for Spotify authorization…\n');
          process.stdout.write(
            `If the browser does not open, visit this URL manually:\n  ${url}\n`,
          );
        }
        openBrowser(url);
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Auth flow failed: ${message}\n`);
    process.exitCode = 2;
    return;
  }

  // --- Step 3: Persist the token ---
  // saveToken writes auth.json with 0600 permissions and is idempotent (overwrites).
  // We do not catch here — a filesystem error is unexpected and should propagate.
  saveToken(token);

  // --- Step 4: Print success ---
  // Never print the token values themselves.
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ success: true, scope: token.scope, expires_at: token.expires_at })}\n`,
    );
  } else {
    process.stdout.write('\n✓ Authenticated successfully. Token saved to auth.json.\n');
    process.stdout.write(`  Scopes granted: ${token.scope}\n`);
  }
}
