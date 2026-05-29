import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigError } from './errors.js';
import { loadConfig } from './load.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid config that satisfies all required fields. */
const VALID_REQUIRED: Record<string, unknown> = {
  spotify: {
    client_id: 'test-client-id',
    client_secret: 'test-client-secret',
    playlist_url: 'https://open.spotify.com/playlist/abc',
  },
  library: {
    path: '/music/wcs',
  },
};

/** Env vars that satisfy all required fields (no config file needed). */
const VALID_REQUIRED_ENV: NodeJS.ProcessEnv = {
  SPOTIFY_SYNC_SPOTIFY_CLIENT_ID: 'env-client-id',
  SPOTIFY_SYNC_SPOTIFY_CLIENT_SECRET: 'env-client-secret',
  SPOTIFY_SYNC_SPOTIFY_PLAYLIST_URL: 'https://open.spotify.com/playlist/from-env',
  SPOTIFY_SYNC_LIBRARY_PATH: '/music/from-env',
};

// ---------------------------------------------------------------------------
// Fixtures: temporary config files
// ---------------------------------------------------------------------------

let tmpDir: string;
let tmpConfigPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'spotify-sync-test-'));
  tmpConfigPath = join(tmpDir, 'config.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeTmpConfig(content: unknown): void {
  writeFileSync(tmpConfigPath, JSON.stringify(content), 'utf-8');
}

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

describe('defaults', () => {
  it('applies default values for optional fields', () => {
    const config = loadConfig({
      env: VALID_REQUIRED_ENV,
      configPath: tmpConfigPath, // does not exist → skip gracefully
    });

    expect(config.library.id).toBe('default');
    expect(config.download.backend).toBe('yt-dlp');
    expect(config.download.format).toBe('mp3');
    expect(config.download.bitrate_kbps).toBe(320);
    expect(config.download.concurrency).toBe(3);
    expect(config.download.retry_count).toBe(3);
    expect(config.download.search_source).toBe('youtube-music');
    expect(config.logging.level).toBe('info');
  });

  it('resolves data_dir to XDG_DATA_HOME/spotify-sync when unset', () => {
    const config = loadConfig({
      env: { ...VALID_REQUIRED_ENV, XDG_DATA_HOME: '/test/data' },
      configPath: tmpConfigPath,
    });
    expect(config.data_dir).toBe('/test/data/spotify-sync');
  });

  it('resolves data_dir to ~/.local/share/spotify-sync on macOS when XDG_DATA_HOME unset', () => {
    const config = loadConfig({
      env: VALID_REQUIRED_ENV,
      configPath: tmpConfigPath,
    });
    // Should end with the expected suffix regardless of the actual home dir.
    expect(config.data_dir).toMatch(/\.local[/\\]share[/\\]spotify-sync$/);
  });
});

// ---------------------------------------------------------------------------
// Missing file — should skip gracefully
// ---------------------------------------------------------------------------

describe('missing config file', () => {
  it('does not throw when the config file is absent; required fields supplied via env', () => {
    expect(() =>
      loadConfig({
        env: VALID_REQUIRED_ENV,
        configPath: join(tmpDir, 'nonexistent.json'),
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Malformed JSON
// ---------------------------------------------------------------------------

describe('malformed config file', () => {
  it('throws ConfigError on malformed JSON', () => {
    writeFileSync(tmpConfigPath, '{ this is not json }', 'utf-8');
    expect(() =>
      loadConfig({
        env: VALID_REQUIRED_ENV,
        configPath: tmpConfigPath,
      }),
    ).toThrow(ConfigError);
  });

  it('error message names the file path', () => {
    writeFileSync(tmpConfigPath, 'not json at all', 'utf-8');
    try {
      loadConfig({ env: VALID_REQUIRED_ENV, configPath: tmpConfigPath });
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as ConfigError).message).toContain(tmpConfigPath);
    }
  });
});

// ---------------------------------------------------------------------------
// Missing required field
// ---------------------------------------------------------------------------

describe('missing required field', () => {
  it('throws ConfigError when spotify.client_id is absent', () => {
    expect(() =>
      loadConfig({
        env: {},
        configPath: tmpConfigPath, // no file, no env → schema fails
      }),
    ).toThrow(ConfigError);
  });

  it('error message is human-readable and names the missing field', () => {
    try {
      loadConfig({ env: {}, configPath: tmpConfigPath });
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const msg = (e as ConfigError).message;
      expect(msg).toContain('spotify.client_id');
      // Must not just be a raw zod dump — should contain our formatted header
      expect(msg).toContain('Config validation failed');
    }
  });

  it('error message includes the env var name for the missing field', () => {
    try {
      loadConfig({ env: {}, configPath: tmpConfigPath });
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as ConfigError).message).toContain('SPOTIFY_SYNC_SPOTIFY_CLIENT_ID');
    }
  });
});

// ---------------------------------------------------------------------------
// Precedence: default < file < env < CLI
// ---------------------------------------------------------------------------

describe('precedence: three fields across all four layers', () => {
  // Field 1: library.path (string)
  // Field 2: download.bitrate_kbps (number — coerced from strings in env/CLI)
  // Field 3: logging.level (enum)

  it('file overrides default', () => {
    writeTmpConfig({
      ...VALID_REQUIRED,
      library: { path: '/from-file' },
      download: { bitrate_kbps: 192 },
      logging: { level: 'debug' },
    });

    const config = loadConfig({
      env: {},
      configPath: tmpConfigPath,
    });

    expect(config.library.path).toBe('/from-file');
    expect(config.download.bitrate_kbps).toBe(192);
    expect(config.logging.level).toBe('debug');
  });

  it('env overrides file', () => {
    writeTmpConfig({
      ...VALID_REQUIRED,
      library: { path: '/from-file' },
      download: { bitrate_kbps: 192 },
      logging: { level: 'debug' },
    });

    const config = loadConfig({
      env: {
        ...VALID_REQUIRED_ENV,
        SPOTIFY_SYNC_LIBRARY_PATH: '/from-env',
        SPOTIFY_SYNC_DOWNLOAD_BITRATE_KBPS: '256',
        SPOTIFY_SYNC_LOGGING_LEVEL: 'warn',
      },
      configPath: tmpConfigPath,
    });

    expect(config.library.path).toBe('/from-env');
    expect(config.download.bitrate_kbps).toBe(256);
    expect(config.logging.level).toBe('warn');
  });

  it('CLI flag overrides env var', () => {
    writeTmpConfig({
      ...VALID_REQUIRED,
      library: { path: '/from-file' },
    });

    const config = loadConfig({
      env: {
        ...VALID_REQUIRED_ENV,
        SPOTIFY_SYNC_LIBRARY_PATH: '/from-env',
      },
      configPath: tmpConfigPath,
      cliFlags: { library: { path: '/from-cli' } },
    });

    expect(config.library.path).toBe('/from-cli');
  });

  it('CLI flag overrides file when env is unset for that field', () => {
    writeTmpConfig({
      ...VALID_REQUIRED,
      library: { path: '/from-file' },
    });

    const config = loadConfig({
      env: VALID_REQUIRED_ENV,
      configPath: tmpConfigPath,
      cliFlags: { library: { path: '/from-cli' } },
    });

    expect(config.library.path).toBe('/from-cli');
  });

  it('fields not supplied by a higher layer keep the lower-layer value', () => {
    writeTmpConfig({
      ...VALID_REQUIRED,
      download: { bitrate_kbps: 192 },
    });

    const config = loadConfig({
      env: {
        ...VALID_REQUIRED_ENV,
        // Only override logging.level via env — bitrate_kbps stays from file.
        SPOTIFY_SYNC_LOGGING_LEVEL: 'warn',
      },
      configPath: tmpConfigPath,
    });

    expect(config.download.bitrate_kbps).toBe(192); // from file
    expect(config.logging.level).toBe('warn'); // from env
  });
});

// ---------------------------------------------------------------------------
// Env var coercion (number fields arrive as strings)
// ---------------------------------------------------------------------------

describe('env var coercion', () => {
  it('coerces SPOTIFY_SYNC_DOWNLOAD_BITRATE_KBPS string to number', () => {
    const config = loadConfig({
      env: {
        ...VALID_REQUIRED_ENV,
        SPOTIFY_SYNC_DOWNLOAD_BITRATE_KBPS: '256',
      },
      configPath: tmpConfigPath,
    });
    expect(config.download.bitrate_kbps).toBe(256);
    expect(typeof config.download.bitrate_kbps).toBe('number');
  });

  it('coerces SPOTIFY_SYNC_DOWNLOAD_CONCURRENCY string to number', () => {
    const config = loadConfig({
      env: { ...VALID_REQUIRED_ENV, SPOTIFY_SYNC_DOWNLOAD_CONCURRENCY: '5' },
      configPath: tmpConfigPath,
    });
    expect(config.download.concurrency).toBe(5);
    expect(typeof config.download.concurrency).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// data_dir config field
// ---------------------------------------------------------------------------

describe('data_dir config field', () => {
  it('uses data_dir from config file when set', () => {
    writeTmpConfig({ ...VALID_REQUIRED, data_dir: '/explicit/data' });

    const config = loadConfig({
      env: {},
      configPath: tmpConfigPath,
    });

    expect(config.data_dir).toBe('/explicit/data');
  });

  it('env var SPOTIFY_SYNC_DATA_DIR overrides file data_dir', () => {
    writeTmpConfig({ ...VALID_REQUIRED, data_dir: '/from-file/data' });

    const config = loadConfig({
      env: { SPOTIFY_SYNC_DATA_DIR: '/from-env/data', ...VALID_REQUIRED_ENV },
      configPath: tmpConfigPath,
    });

    expect(config.data_dir).toBe('/from-env/data');
  });
});

// ---------------------------------------------------------------------------
// db_path config field
// ---------------------------------------------------------------------------

describe('db_path config field', () => {
  it('derives db_path from data_dir when db_path is not set', () => {
    const config = loadConfig({
      env: { ...VALID_REQUIRED_ENV, XDG_DATA_HOME: '/test/data' },
      configPath: tmpConfigPath,
    });
    // data_dir = /test/data/spotify-sync → db.sqlite appended
    expect(config.db_path).toBe('/test/data/spotify-sync/db.sqlite');
  });

  it('derives db_path from ~/.local/share/spotify-sync when XDG_DATA_HOME is unset', () => {
    const config = loadConfig({
      env: VALID_REQUIRED_ENV,
      configPath: tmpConfigPath,
    });
    expect(config.db_path).toMatch(/\.local[/\\]share[/\\]spotify-sync[/\\]db\.sqlite$/);
  });

  it('uses an explicit db_path from the config file', () => {
    writeTmpConfig({ ...VALID_REQUIRED, db_path: '/explicit/path/mydb.sqlite' });

    const config = loadConfig({
      env: {},
      configPath: tmpConfigPath,
    });

    expect(config.db_path).toBe('/explicit/path/mydb.sqlite');
  });

  it('env var SPOTIFY_SYNC_DB_PATH overrides file db_path', () => {
    writeTmpConfig({ ...VALID_REQUIRED, db_path: '/from-file/db.sqlite' });

    const config = loadConfig({
      env: { ...VALID_REQUIRED_ENV, SPOTIFY_SYNC_DB_PATH: '/from-env/db.sqlite' },
      configPath: tmpConfigPath,
    });

    expect(config.db_path).toBe('/from-env/db.sqlite');
  });

  it('CLI flag dbPath overrides env var db_path', () => {
    const config = loadConfig({
      env: { ...VALID_REQUIRED_ENV, SPOTIFY_SYNC_DB_PATH: '/from-env/db.sqlite' },
      configPath: tmpConfigPath,
      cliFlags: { db_path: '/from-cli/db.sqlite' },
    });

    expect(config.db_path).toBe('/from-cli/db.sqlite');
  });

  it('an explicit db_path is independent of data_dir', () => {
    // Changing data_dir should not affect an explicitly set db_path.
    const config = loadConfig({
      env: { ...VALID_REQUIRED_ENV, SPOTIFY_SYNC_DB_PATH: '/my/custom.sqlite' },
      configPath: tmpConfigPath,
      cliFlags: {},
    });

    expect(config.db_path).toBe('/my/custom.sqlite');
  });
});
