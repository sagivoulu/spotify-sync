import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SpotifyClient, SpotifyTrack } from '../spotify/index.js';
import type { StoredToken } from '../spotify/token-store.js';
import { checkAuth, checkConfig, checkSpotify } from './checks.js';

// ---------------------------------------------------------------------------
// checkConfig
// ---------------------------------------------------------------------------

describe('checkConfig', () => {
  /**
   * Build a minimal env that redirects XDG config + data paths to a temp dir
   * where no config file exists, so the real user's config is never loaded.
   */
  function isolatedEnv(tmpDir: string): NodeJS.ProcessEnv {
    return {
      XDG_CONFIG_HOME: tmpDir,
      XDG_DATA_HOME: tmpDir,
      HOME: tmpDir,
      // Clear any SPOTIFY_SYNC_* vars that might leak in from the real env.
      SPOTIFY_SYNC_SPOTIFY_CLIENT_ID: undefined,
      SPOTIFY_SYNC_SPOTIFY_CLIENT_SECRET: undefined,
      SPOTIFY_SYNC_SPOTIFY_PLAYLIST_URL: undefined,
      SPOTIFY_SYNC_LIBRARY_PATH: undefined,
    };
  }

  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'spotify-sync-test-'));
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns ok=true when all required fields are provided via cliFlags', () => {
    const { result, config } = checkConfig({
      cliFlags: {
        spotify: {
          client_id: 'cid',
          client_secret: 'csecret',
          playlist_url: 'https://open.spotify.com/playlist/abc123',
        },
        library: { path: '/music' },
      },
      env: isolatedEnv(tmpDir),
    });

    expect(result.ok).toBe(true);
    expect(result.name).toBe('Config');
    expect(config).not.toBeNull();
    expect(config?.spotify.client_id).toBe('cid');
  });

  it('returns ok=false when no config is present (all fields missing)', () => {
    const { result, config } = checkConfig({ env: isolatedEnv(tmpDir) });

    expect(result.ok).toBe(false);
    expect(result.name).toBe('Config');
    expect(result.detail).toMatch(/spotify\.client_id/);
    expect(config).toBeNull();
  });

  it('returns ok=false and names the specific missing field', () => {
    const { result } = checkConfig({
      cliFlags: {
        spotify: {
          client_id: 'cid',
          client_secret: 'csecret',
          // playlist_url missing
        },
        library: { path: '/music' },
      },
      env: isolatedEnv(tmpDir),
    });

    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/spotify\.playlist_url/);
  });

  it('reads config from a file when it exists in the config dir', () => {
    // Write a valid config.json into the temp XDG dir
    const configDir = join(tmpDir, 'spotify-sync');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify({
        spotify: {
          client_id: 'file-cid',
          client_secret: 'file-secret',
          playlist_url: 'https://open.spotify.com/playlist/xyz',
        },
        library: { path: '/from-file' },
      }),
    );

    const { result, config } = checkConfig({ env: isolatedEnv(tmpDir) });

    expect(result.ok).toBe(true);
    expect(config?.spotify.client_id).toBe('file-cid');
    expect(config?.library.path).toBe('/from-file');
  });
});

// ---------------------------------------------------------------------------
// checkAuth
// ---------------------------------------------------------------------------

const VALID_TOKEN: StoredToken = {
  access_token: 'acc',
  refresh_token: 'ref',
  expires_at: Date.now() + 3600_000,
  obtained_at: Date.now(),
  scope: 'playlist-read-private',
  token_type: 'Bearer',
};

describe('checkAuth', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'spotify-sync-test-'));
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function authEnv(dir: string): NodeJS.ProcessEnv {
    return { XDG_CONFIG_HOME: dir, HOME: dir };
  }

  it('returns ok=true when auth.json exists and is valid', () => {
    const configDir = join(tmpDir, 'spotify-sync');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'auth.json'), JSON.stringify(VALID_TOKEN), { mode: 0o600 });

    const { result, token } = checkAuth({ env: authEnv(tmpDir) });

    expect(result.ok).toBe(true);
    expect(result.name).toBe('Auth');
    expect(token?.access_token).toBe('acc');
  });

  it('returns ok=false when auth.json is missing, mentioning spotify-sync auth', () => {
    const { result, token } = checkAuth({ env: authEnv(tmpDir) });

    expect(result.ok).toBe(false);
    expect(result.name).toBe('Auth');
    expect(result.detail).toMatch(/spotify-sync auth/i);
    expect(token).toBeNull();
  });

  it('returns ok=false when auth.json is invalid JSON', () => {
    const configDir = join(tmpDir, 'spotify-sync');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'auth.json'), 'not valid json', { mode: 0o600 });

    const { result } = checkAuth({ env: authEnv(tmpDir) });

    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/spotify-sync auth/i);
  });

  it('returns ok=false when auth.json is missing required fields', () => {
    const configDir = join(tmpDir, 'spotify-sync');
    mkdirSync(configDir, { recursive: true });
    // Missing refresh_token
    writeFileSync(
      join(configDir, 'auth.json'),
      JSON.stringify({ access_token: 'acc', expires_at: Date.now() + 1000 }),
      { mode: 0o600 },
    );

    const { result } = checkAuth({ env: authEnv(tmpDir) });

    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/spotify-sync auth/i);
  });
});

// ---------------------------------------------------------------------------
// checkSpotify
// ---------------------------------------------------------------------------

/** Minimal fake SpotifyClient for testing checkSpotify. */
function makeFakeClient(overrides?: {
  fetchPlaylistSummary?: SpotifyClient['fetchPlaylistSummary'];
}): SpotifyClient {
  return {
    fetchPlaylistTracks: async () => [],
    fetchPlaylistSummary:
      overrides?.fetchPlaylistSummary ??
      (async () => ({
        name: 'Test Playlist',
        trackCount: 10,
        tracks: [
          {
            id: 't1',
            title: 'Song One',
            artists: ['Artist A'],
            album: { name: 'Album', images: [] },
            releaseYear: 2020,
            durationMs: 200000,
            addedAt: '2024-01-01T00:00:00Z',
          } satisfies SpotifyTrack,
          {
            id: 't2',
            title: 'Song Two',
            artists: ['Artist B', 'Artist C'],
            album: { name: 'Album 2', images: [] },
            releaseYear: 2021,
            durationMs: 180000,
            addedAt: '2024-02-01T00:00:00Z',
          } satisfies SpotifyTrack,
        ],
      })),
  };
}

describe('checkSpotify', () => {
  it('returns ok=true with playlist name, track count, and sample tracks', async () => {
    const result = await checkSpotify({
      client: makeFakeClient(),
      playlistUrl: 'https://open.spotify.com/playlist/abc123',
    });

    expect(result.ok).toBe(true);
    expect(result.name).toBe('Spotify');
    expect(result.detail).toContain('Test Playlist');
    expect(result.detail).toContain('10 tracks');
    expect(result.data?.playlistName).toBe('Test Playlist');
    expect(result.data?.trackCount).toBe(10);
    expect(result.data?.sampleTracks).toEqual([
      'Song One — Artist A',
      'Song Two — Artist B, Artist C',
    ]);
  });

  it('returns ok=false when the playlist URL is invalid', async () => {
    const result = await checkSpotify({
      client: makeFakeClient(),
      playlistUrl: 'not-a-url',
    });

    expect(result.ok).toBe(false);
    expect(result.name).toBe('Spotify');
    expect(result.detail).toMatch(/Cannot parse playlist ID/);
  });

  it('returns ok=false when the Spotify API call throws', async () => {
    const client = makeFakeClient({
      fetchPlaylistSummary: async () => {
        throw new Error('Re-authentication required. Run `spotify-sync auth`.');
      },
    });

    const result = await checkSpotify({
      client,
      playlistUrl: 'https://open.spotify.com/playlist/abc123',
    });

    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/Re-authentication required/);
  });

  it('returns ok=false when the API returns a generic error', async () => {
    const client = makeFakeClient({
      fetchPlaylistSummary: async () => {
        throw new Error('Unexpected server error (500)');
      },
    });

    const result = await checkSpotify({
      client,
      playlistUrl: 'spotify:playlist:abc123',
    });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('500');
  });

  it('passes the sampleSize to fetchPlaylistSummary', async () => {
    let capturedSampleSize = -1;
    const client = makeFakeClient({
      fetchPlaylistSummary: async (_id, size) => {
        capturedSampleSize = size;
        return { name: 'P', trackCount: 5, tracks: [] };
      },
    });

    await checkSpotify({
      client,
      playlistUrl: 'https://open.spotify.com/playlist/abc',
      sampleSize: 3,
    });

    expect(capturedSampleSize).toBe(3);
  });
});
