import { describe, expect, it } from 'vitest';
import type { Config } from '../config/schema.js';
import { openDatabase } from './connection.js';
import { initDb, registerLibrary } from './index.js';
import { runMigrations } from './migrations.js';

// ---------------------------------------------------------------------------
// Minimal Config fixture for initDb tests.
// We use ':memory:' as db_path to avoid touching the filesystem.
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    spotify: {
      client_id: 'test-id',
      client_secret: 'test-secret',
      playlist_url: 'https://open.spotify.com/playlist/test',
    },
    library: {
      id: 'default',
      path: '/music/wcs',
    },
    data_dir: '/tmp/spotify-sync-test',
    db_path: ':memory:',
    download: {
      backend: 'yt-dlp',
      format: 'mp3',
      bitrate_kbps: 320,
      concurrency: 3,
      retry_count: 3,
      search_source: 'youtube-music',
    },
    logging: {
      level: 'info',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// registerLibrary (unit tests against a bare migrated DB)
// ---------------------------------------------------------------------------

describe('registerLibrary', () => {
  it('inserts a library row on first call', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    registerLibrary(db, 'default', '/music/wcs', '2026-01-01T00:00:00.000Z');

    const row = db
      .prepare('SELECT id, path, created_at FROM libraries WHERE id = ?')
      .get('default') as { id: string; path: string; created_at: string } | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(row?.id).toBe('default');
    expect(row?.path).toBe('/music/wcs');
    expect(row?.created_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('is idempotent — calling twice does not error or duplicate the row', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    registerLibrary(db, 'default', '/music/wcs', '2026-01-01T00:00:00.000Z');
    expect(() =>
      registerLibrary(db, 'default', '/music/wcs', '2026-06-01T00:00:00.000Z'),
    ).not.toThrow();

    const count = (
      db.prepare('SELECT COUNT(*) AS n FROM libraries WHERE id = ?').get('default') as { n: number }
    ).n;
    db.close();
    expect(count).toBe(1);
  });

  it('does not overwrite an existing library path on second call', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    registerLibrary(db, 'default', '/original/path', '2026-01-01T00:00:00.000Z');
    registerLibrary(db, 'default', '/new/path', '2026-06-01T00:00:00.000Z');

    const row = db.prepare('SELECT path FROM libraries WHERE id = ?').get('default') as {
      path: string;
    };
    db.close();
    // INSERT OR IGNORE — the original path is preserved.
    expect(row.path).toBe('/original/path');
  });
});

// ---------------------------------------------------------------------------
// initDb (integration: open + migrate + register)
// ---------------------------------------------------------------------------

describe('initDb', () => {
  it('returns an open database', () => {
    const config = makeConfig();
    const db = initDb(config);
    const result = db.prepare('SELECT 1 AS n').get() as { n: number };
    db.close();
    expect(result.n).toBe(1);
  });

  it('creates all four tables', () => {
    const config = makeConfig();
    const db = initDb(config);
    const rows = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all() as { name: string }[];
    const tables = rows.map((r) => r.name);
    db.close();

    expect(tables).toContain('libraries');
    expect(tables).toContain('tracks');
    expect(tables).toContain('sync_runs');
    expect(tables).toContain('schema_version');
  });

  it('registers the configured library with the default id', () => {
    const config = makeConfig();
    const db = initDb(config);
    const row = db.prepare('SELECT id, path FROM libraries WHERE id = ?').get('default') as
      | { id: string; path: string }
      | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(row?.id).toBe('default');
    expect(row?.path).toBe('/music/wcs');
  });

  it('registers a non-default library.id when configured', () => {
    const config = makeConfig({ library: { id: 'wcs', path: '/music/wcs' } });
    const db = initDb(config);
    const row = db.prepare('SELECT id FROM libraries WHERE id = ?').get('wcs') as
      | { id: string }
      | undefined;
    db.close();
    expect(row?.id).toBe('wcs');
  });

  it('is safe to call twice (idempotent init)', () => {
    const config = makeConfig();
    const db1 = initDb(config);
    db1.close();

    // Second initDb call on the same :memory: address won't share state (new in-memory DB),
    // but the important thing is that it doesn't throw.
    expect(() => {
      const db2 = initDb(config);
      db2.close();
    }).not.toThrow();
  });

  it('enables foreign key enforcement on the returned connection', () => {
    const config = makeConfig();
    const db = initDb(config);
    const result = db.pragma('foreign_keys', { simple: true });
    db.close();
    expect(result).toBe(1);
  });
});
