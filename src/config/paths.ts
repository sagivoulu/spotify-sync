import { homedir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// XDG-respecting path helpers.
//
// All functions accept an injectable `env` so tests can pass a synthetic
// environment without touching process.env or touching the filesystem.
// ---------------------------------------------------------------------------

type Env = Record<string, string | undefined>;

/**
 * Returns the spotify-sync config directory.
 * Respects $XDG_CONFIG_HOME; falls back to ~/.config on all platforms.
 */
export function configDir(env: Env = process.env): string {
  const base = env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(base, 'spotify-sync');
}

/**
 * Returns the full path to the config file.
 * e.g. ~/.config/spotify-sync/config.json
 */
export function configFilePath(env: Env = process.env): string {
  return join(configDir(env), 'config.json');
}

/**
 * Returns the full path to the cached OAuth token file.
 * e.g. ~/.config/spotify-sync/auth.json
 *
 * File must be written with 0600 permissions — it contains the refresh token.
 */
export function authFilePath(env: Env = process.env): string {
  return join(configDir(env), 'auth.json');
}

/**
 * Returns the default data directory when `data_dir` is null in the config.
 * Respects $XDG_DATA_HOME; falls back to ~/.local/share on all platforms.
 * e.g. ~/.local/share/spotify-sync
 */
export function defaultDataDir(env: Env = process.env): string {
  const base = env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
  return join(base, 'spotify-sync');
}

/**
 * Returns the default DB file path derived from a resolved data directory.
 * e.g. ~/.local/share/spotify-sync/db.sqlite
 *
 * Accepts a resolved `dataDir` string (already computed by loadConfig) rather
 * than env — keeping the 'db.sqlite' literal in one place so loadConfig doesn't
 * need to import from the db module.
 */
export function defaultDbPath(dataDir: string): string {
  return join(dataDir, 'db.sqlite');
}

/**
 * Returns the spotify-sync state directory.
 * Respects $XDG_STATE_HOME; falls back to ~/.local/state on all platforms.
 * e.g. ~/.local/state/spotify-sync
 *
 * XDG state is the right base for per-run log files (transient runtime data that
 * should survive reboots but is not user-portable config or application data).
 */
export function defaultStateDir(env: Env = process.env): string {
  const base = env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state');
  return join(base, 'spotify-sync');
}

/**
 * Returns the directory where per-run log files are stored.
 * e.g. ~/.local/state/spotify-sync/logs
 */
export function logsDir(env: Env = process.env): string {
  return join(defaultStateDir(env), 'logs');
}

/**
 * Returns the full path for a specific sync run's log file.
 * e.g. ~/.local/state/spotify-sync/logs/550e8400-e29b-41d4-a716-446655440000.log
 *
 * The logId is a UUID v4 generated at run start — globally unique so filenames
 * never collide even when the database is reset.
 */
export function runLogPath(logId: string, env: Env = process.env): string {
  return join(logsDir(env), `${logId}.log`);
}
