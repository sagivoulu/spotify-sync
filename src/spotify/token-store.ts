import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { authFilePath, configDir } from '../config/index.js';

// ---------------------------------------------------------------------------
// StoredToken — the shape written to auth.json.
//
// Fields are kept generic (no Spotify-specific names) so the file format can
// accommodate other auth flows in the future.
// ---------------------------------------------------------------------------

export interface StoredToken {
  /** Long-lived token used to obtain new access tokens without re-authentication. */
  refresh_token: string;
  /** Short-lived bearer token for API calls. */
  access_token: string;
  /** Unix epoch milliseconds when the access_token expires. */
  expires_at: number;
  /** Space-separated list of granted scopes. */
  scope: string;
  /** Always "Bearer" for Spotify. */
  token_type: string;
  /** Unix epoch milliseconds when this token was obtained. */
  obtained_at: number;
}

export interface SaveTokenOptions {
  /** Override the file path (default: authFilePath(env)). Used in tests. */
  path?: string;
  /** Injectable environment for XDG path resolution. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Persist a token to auth.json with strict 0600 permissions.
 *
 * Security notes:
 * - mkdirSync ensures the config dir exists before writing.
 * - writeFileSync `mode` option is silently ignored when the file already exists on
 *   most Unix implementations, so we follow with an explicit chmodSync to guarantee
 *   0600 on both first write and overwrite (AC: re-running auth must overwrite safely).
 * - The token is never logged or printed; callers must not expose it.
 */
export function saveToken(token: StoredToken, options?: SaveTokenOptions): void {
  const env = options?.env ?? process.env;
  const filePath = options?.path ?? authFilePath(env);

  // Ensure the directory exists (idempotent — no-op if already present).
  mkdirSync(dirname(filePath), { recursive: true });

  writeFileSync(filePath, `${JSON.stringify(token, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: 0o600,
  });

  // Explicit chmod guarantees 0600 even when overwriting an existing file,
  // since `mode` in writeFileSync only applies on creation.
  chmodSync(filePath, 0o600);
}

/**
 * Load a previously saved token from auth.json.
 *
 * Throws a user-facing error (mentioning `spotify-sync auth`) when:
 * - The file is missing (ENOENT) — user hasn't authenticated yet.
 * - The file cannot be parsed or is missing required fields — corrupted.
 */
export function loadToken(options?: SaveTokenOptions): StoredToken {
  const env = options?.env ?? process.env;
  const filePath = options?.path ?? authFilePath(env);

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `No saved credentials found at ${filePath}. Run \`spotify-sync auth\` to authenticate.`,
      );
    }
    throw err;
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `auth.json at ${filePath} is corrupt or incomplete. Run \`spotify-sync auth\` to re-authenticate.`,
    );
  }

  const token = data as Partial<StoredToken>;
  if (!token.refresh_token || !token.access_token || token.expires_at === undefined) {
    throw new Error(
      `auth.json at ${filePath} is corrupt or incomplete. Run \`spotify-sync auth\` to re-authenticate.`,
    );
  }

  return data as StoredToken;
}
