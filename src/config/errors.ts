import type { ZodError } from 'zod';
import { fieldPathToEnvVar } from './schema.js';

// ---------------------------------------------------------------------------
// ConfigError — wraps all config-related failures with human-readable messages.
//
// Users should never see a raw zod issue array or a JSON.parse stack trace.
// Every error surface from the config layer goes through this class.
// ---------------------------------------------------------------------------

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }

  /**
   * Build a ConfigError from a ZodError returned by configSchema.safeParse().
   * Each issue becomes one bullet naming the field, the problem, and the env
   * var the user can set to fix it.
   *
   * Example output:
   *   Config validation failed:
   *     • spotify.client_id: Invalid input: expected string, received undefined
   *       (env var: SPOTIFY_SYNC_SPOTIFY_CLIENT_ID)
   */
  static fromZodError(error: ZodError): ConfigError {
    const lines = error.issues.map((issue) => {
      const path = issue.path.join('.');
      const envVar = path ? fieldPathToEnvVar(path) : '';
      const envHint = envVar ? `\n      (env var: ${envVar})` : '';
      return `  • ${path}: ${issue.message}${envHint}`;
    });
    return new ConfigError(`Config validation failed:\n${lines.join('\n')}`);
  }

  /**
   * Build a ConfigError for a malformed config file (JSON.parse threw).
   */
  static fromJsonParseError(filePath: string, cause: unknown): ConfigError {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return new ConfigError(`Failed to parse config file at ${filePath}: ${detail}`);
  }
}
