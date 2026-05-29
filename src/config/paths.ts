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
