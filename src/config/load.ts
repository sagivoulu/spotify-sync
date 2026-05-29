import { readFileSync } from 'node:fs';
import { ConfigError } from './errors.js';
import { configFilePath, defaultDataDir, defaultDbPath } from './paths.js';
import { CONFIG_FIELD_PATHS, configSchema, fieldPathToEnvVar } from './schema.js';
import type { Config, ConfigInput } from './schema.js';

// ---------------------------------------------------------------------------
// loadConfig — merges all configuration layers and returns a validated Config.
//
// Precedence (highest wins): CLI flag > env var > config file > defaults
// ---------------------------------------------------------------------------

export interface LoadConfigOptions {
  /** Already-mapped partial overrides from CLI flags (highest precedence). */
  cliFlags?: ConfigInput;
  /** Environment to read SPOTIFY_SYNC_* vars from. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Override the config file path (else derived from XDG). */
  configPath?: string;
}

// ---------------------------------------------------------------------------
// CLI flag mapping
// ---------------------------------------------------------------------------

/** Commander camelCase keys for the CLI flags we expose on the root program. */
export interface CliFlags {
  libraryPath?: string;
  dbPath?: string;
}

/**
 * Convert a commander options object into a ConfigInput partial.
 * Called by command actions: loadConfig({ cliFlags: mapCliFlags(cmd.optsWithGlobals()) })
 */
export function mapCliFlags(flags: CliFlags): ConfigInput {
  const partial: ConfigInput = {};
  if (flags.libraryPath !== undefined) {
    partial.library = { path: flags.libraryPath };
  }
  if (flags.dbPath !== undefined) {
    partial.db_path = flags.dbPath;
  }
  return partial;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Walk a dotted path (e.g. "download.bitrate_kbps") and write the value into
 * a plain nested object. Creates intermediate objects as needed.
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (cursor[key] === undefined || cursor[key] === null || typeof cursor[key] !== 'object') {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

/**
 * Build the env-var partial by scanning CONFIG_FIELD_PATHS against the given
 * environment. String values are written as-is; coerce.number() in the schema
 * will handle the string → number conversion during safeParse.
 */
function buildEnvPartial(env: NodeJS.ProcessEnv): ConfigInput {
  const partial: Record<string, unknown> = {};
  for (const fieldPath of CONFIG_FIELD_PATHS) {
    const value = env[fieldPathToEnvVar(fieldPath)];
    if (value !== undefined) {
      setNestedValue(partial, fieldPath, value);
    }
  }
  return partial as ConfigInput;
}

/**
 * Deep-merge two-level plain objects, skipping undefined values.
 * Later sources win over earlier ones. Plain objects at the same key are merged
 * recursively (one level deep is sufficient for our two-tier config shape).
 */
function deepMerge(...sources: (ConfigInput | undefined)[]): ConfigInput {
  const result: Record<string, unknown> = {};
  for (const source of sources) {
    if (source == null) continue;
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) continue;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const existing = result[key];
        result[key] = deepMerge(
          (typeof existing === 'object' && existing !== null ? existing : {}) as ConfigInput,
          value as ConfigInput,
        );
      } else {
        result[key] = value;
      }
    }
  }
  return result as ConfigInput;
}

// ---------------------------------------------------------------------------
// loadConfig
// ---------------------------------------------------------------------------

/**
 * Load, merge, and validate the full configuration.
 *
 * Steps:
 * 1. Read the config file (missing → empty partial; malformed JSON → ConfigError)
 * 2. Overlay env vars (SPOTIFY_SYNC_*)
 * 3. Overlay CLI flags
 * 4. Validate the merged result with the zod schema (fills defaults)
 * 5. Resolve data_dir: null/empty → defaultDataDir(env)
 */
export function loadConfig(options?: LoadConfigOptions): Config {
  const env = options?.env ?? process.env;
  const filePath = options?.configPath ?? configFilePath(env);

  // --- Layer 1: config file ---
  let filePartial: ConfigInput = {};
  try {
    const raw = readFileSync(filePath, 'utf-8');
    try {
      filePartial = JSON.parse(raw) as ConfigInput;
    } catch (e) {
      throw ConfigError.fromJsonParseError(filePath, e);
    }
  } catch (e) {
    if (e instanceof ConfigError) throw e;
    // File not found / unreadable — skip gracefully; defaults + other layers apply.
  }

  // --- Layer 2: env vars ---
  const envPartial = buildEnvPartial(env);

  // --- Layer 3: CLI flags ---
  const merged = deepMerge(filePartial, envPartial, options?.cliFlags);

  // --- Validate and fill defaults ---
  const result = configSchema.safeParse(merged);
  if (!result.success) {
    throw ConfigError.fromZodError(result.error);
  }

  // --- Resolve data_dir ---
  const data_dir = result.data.data_dir || defaultDataDir(env);

  // --- Resolve db_path ---
  // Explicit db_path (CLI flag > env var > config file) wins; else derive from data_dir.
  const db_path = result.data.db_path || defaultDbPath(data_dir);

  return { ...result.data, data_dir, db_path };
}
