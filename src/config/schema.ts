import { z } from 'zod';

// ---------------------------------------------------------------------------
// Zod schema — defines the canonical config shape, defaults, and coercions.
//
// Numeric fields use z.coerce.number() so values arriving as strings from env
// vars or CLI options parse cleanly; the defaults remain proper numbers.
// ---------------------------------------------------------------------------

// z.preprocess(v => v ?? {}, z.object(...)) on nested sections:
// In zod v4, .default({}) bypasses inner schema execution and doesn't cascade
// field-level defaults. Using preprocess converts an absent/null section to an
// empty object first, so the inner schema runs and applies field defaults correctly.
// This also surfaces leaf-level errors (e.g. "spotify.client_id: Required") rather
// than stopping at the parent ("spotify: expected object, received undefined").
const pre = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v == null ? {} : v), schema);

export const configSchema = z.object({
  spotify: pre(
    z.object({
      client_id: z.string().min(1),
      client_secret: z.string().min(1),
      playlist_url: z.string().min(1),
    }),
  ),
  library: pre(
    z.object({
      id: z.string().default('default'),
      path: z.string().min(1),
    }),
  ),
  // null = not set; loadConfig resolves to the XDG data dir before returning.
  data_dir: z.string().nullable().default(null),
  // null = not set; loadConfig derives <data_dir>/db.sqlite before returning.
  // An explicit path takes precedence over the data_dir-derived default.
  db_path: z.string().nullable().default(null),
  download: pre(
    z.object({
      backend: z.string().default('yt-dlp'),
      format: z.string().default('mp3'),
      bitrate_kbps: z.coerce.number().int().positive().default(320),
      concurrency: z.coerce.number().int().positive().default(3),
      retry_count: z.coerce.number().int().nonnegative().default(3),
      search_source: z.string().default('youtube-music'),
    }),
  ),
  logging: pre(
    z.object({
      level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
      /**
       * Maximum number of per-run log files to keep in the logs dir.
       * Oldest files (by numeric runId) are pruned at the start of each sync.
       */
      max_run_logs: z.coerce.number().int().positive().default(20),
    }),
  ),
});

// ConfigRaw is what zod emits (data_dir and db_path still nullable).
type ConfigRaw = z.infer<typeof configSchema>;

// Config is the resolved output from loadConfig — data_dir and db_path are always strings.
export type Config = Omit<ConfigRaw, 'data_dir' | 'db_path'> & {
  data_dir: string;
  db_path: string;
};

// ConfigInput is the partial shape accepted by each merge layer. All fields
// are optional because any given layer may only supply a subset. Numeric fields
// accept string | number to accommodate env vars and CLI flags arriving as strings.
export type ConfigInput = {
  spotify?: {
    client_id?: string;
    client_secret?: string;
    playlist_url?: string;
  };
  library?: {
    id?: string;
    path?: string;
  };
  data_dir?: string | null;
  db_path?: string | null;
  download?: {
    backend?: string;
    format?: string;
    bitrate_kbps?: number | string;
    concurrency?: number | string;
    retry_count?: number | string;
    search_source?: string;
  };
  logging?: {
    level?: string;
    max_run_logs?: number | string;
  };
};

// ---------------------------------------------------------------------------
// Dotted paths of every leaf field — single source of truth for env var names.
// The convention is: SPOTIFY_SYNC_ + path.replace(/\./g, '_').toUpperCase()
// e.g. "spotify.client_id" → SPOTIFY_SYNC_SPOTIFY_CLIENT_ID
//      "download.bitrate_kbps" → SPOTIFY_SYNC_DOWNLOAD_BITRATE_KBPS
// ---------------------------------------------------------------------------
export const CONFIG_FIELD_PATHS = [
  'spotify.client_id',
  'spotify.client_secret',
  'spotify.playlist_url',
  'library.id',
  'library.path',
  'data_dir',
  'db_path',
  'download.backend',
  'download.format',
  'download.bitrate_kbps',
  'download.concurrency',
  'download.retry_count',
  'download.search_source',
  'logging.level',
  'logging.max_run_logs',
] as const;

export type ConfigFieldPath = (typeof CONFIG_FIELD_PATHS)[number];

/** Convert a dotted config path to its SPOTIFY_SYNC_* env var name. */
export function fieldPathToEnvVar(fieldPath: ConfigFieldPath | string): string {
  return `SPOTIFY_SYNC_${fieldPath.replace(/\./g, '_').toUpperCase()}`;
}
