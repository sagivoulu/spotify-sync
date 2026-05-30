// ---------------------------------------------------------------------------
// runDoctor integration tests.
//
// These tests wire up multiple checks together and verify the orchestration
// behaviour (skip logic, ok flag, result count) using a fake SpotifyClient.
// No real API calls or filesystem side-effects on the user's real config.
// ---------------------------------------------------------------------------

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SpotifyClient, SpotifyTrack } from '../spotify/index.js';
import type { StoredToken } from '../spotify/token-store.js';
import { runDoctor } from './index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_TOKEN: StoredToken = {
  access_token: 'acc',
  refresh_token: 'ref',
  expires_at: Date.now() + 3600_000,
  obtained_at: Date.now(),
  scope: 'playlist-read-private',
  token_type: 'Bearer',
};

const SAMPLE_TRACKS: SpotifyTrack[] = [
  {
    id: 't1',
    title: 'Track One',
    artists: ['Artist A'],
    album: { name: 'Album', images: [] },
    releaseYear: 2020,
    durationMs: 200000,
    addedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 't2',
    title: 'Track Two',
    artists: ['Artist B'],
    album: { name: 'Album 2', images: [] },
    releaseYear: 2021,
    durationMs: 180000,
    addedAt: '2024-02-01T00:00:00Z',
  },
];

const FAKE_CLIENT: SpotifyClient = {
  fetchPlaylistTracks: async () => [],
  fetchPlaylistSummary: async () => ({
    name: 'My DJ Set',
    trackCount: 50,
    tracks: SAMPLE_TRACKS,
  }),
};

/** Minimal valid config passed as cliFlags. */
const VALID_CONFIG_FLAGS = {
  spotify: {
    client_id: 'cid',
    client_secret: 'csecret',
    playlist_url: 'https://open.spotify.com/playlist/abc123',
  },
  library: { path: '/music' },
};

// ---------------------------------------------------------------------------
// Test setup helpers
// ---------------------------------------------------------------------------

/** Build a process.env that prevents leaking real config from the test machine. */
function makeIsolatedEnv(tmpDir: string): NodeJS.ProcessEnv {
  return {
    XDG_CONFIG_HOME: tmpDir,
    XDG_DATA_HOME: tmpDir,
    HOME: tmpDir,
    SPOTIFY_SYNC_SPOTIFY_CLIENT_ID: undefined,
    SPOTIFY_SYNC_SPOTIFY_CLIENT_SECRET: undefined,
    SPOTIFY_SYNC_SPOTIFY_PLAYLIST_URL: undefined,
    SPOTIFY_SYNC_LIBRARY_PATH: undefined,
  };
}

/** Write a valid auth.json into the XDG config dir under `dir`. */
function writeAuthJson(dir: string, token: StoredToken = VALID_TOKEN): void {
  const configDir = join(dir, 'spotify-sync');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'auth.json'), JSON.stringify(token), { mode: 0o600 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runDoctor', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'spotify-sync-test-'));
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns ok=true with 3 passing checks on a valid setup', async () => {
    writeAuthJson(tmpDir);

    const result = await runDoctor({
      cliFlags: VALID_CONFIG_FLAGS,
      env: makeIsolatedEnv(tmpDir),
      spotifyClient: FAKE_CLIENT,
    });

    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(3);
    expect(result.results.every((r) => r.ok)).toBe(true);
  });

  it('Spotify result includes playlist name, track count, and sample tracks on success', async () => {
    writeAuthJson(tmpDir);

    const result = await runDoctor({
      cliFlags: VALID_CONFIG_FLAGS,
      env: makeIsolatedEnv(tmpDir),
      spotifyClient: FAKE_CLIENT,
    });

    const spotifyCheck = result.results.find((r) => r.name === 'Spotify');
    expect(spotifyCheck?.ok).toBe(true);
    expect(spotifyCheck?.detail).toContain('My DJ Set');
    expect(spotifyCheck?.detail).toContain('50 tracks');
    expect(spotifyCheck?.data?.playlistName).toBe('My DJ Set');
    expect(spotifyCheck?.data?.trackCount).toBe(50);
    expect(spotifyCheck?.data?.sampleTracks).toEqual([
      'Track One — Artist A',
      'Track Two — Artist B',
    ]);
  });

  it('skips Auth and Spotify when Config fails, returns ok=false', async () => {
    // No config flags → loadConfig will fail
    const result = await runDoctor({
      env: makeIsolatedEnv(tmpDir),
      spotifyClient: FAKE_CLIENT,
    });

    expect(result.ok).toBe(false);
    expect(result.results).toHaveLength(3);

    const [config, auth, spotify] = result.results;
    expect(config.ok).toBe(false);
    expect(config.name).toBe('Config');

    expect(auth.ok).toBe(false);
    expect(auth.detail).toMatch(/skipped/i);

    expect(spotify.ok).toBe(false);
    expect(spotify.detail).toMatch(/skipped/i);
  });

  it('skips Spotify when Auth fails, returns ok=false', async () => {
    // No auth.json → Auth check fails
    const result = await runDoctor({
      cliFlags: VALID_CONFIG_FLAGS,
      env: makeIsolatedEnv(tmpDir),
      spotifyClient: FAKE_CLIENT,
    });

    expect(result.ok).toBe(false);
    expect(result.results).toHaveLength(3);

    const [config, auth, spotify] = result.results;
    expect(config.ok).toBe(true);
    expect(auth.ok).toBe(false);
    expect(auth.detail).toMatch(/spotify-sync auth/i);
    expect(spotify.ok).toBe(false);
    expect(spotify.detail).toMatch(/skipped/i);
  });

  it('returns ok=false when Spotify API call fails (Config + Auth pass)', async () => {
    writeAuthJson(tmpDir);

    const failingClient: SpotifyClient = {
      fetchPlaylistTracks: async () => [],
      fetchPlaylistSummary: async () => {
        throw new Error('Network error');
      },
    };

    const result = await runDoctor({
      cliFlags: VALID_CONFIG_FLAGS,
      env: makeIsolatedEnv(tmpDir),
      spotifyClient: failingClient,
    });

    expect(result.ok).toBe(false);
    const spotifyCheck = result.results.find((r) => r.name === 'Spotify');
    expect(spotifyCheck?.ok).toBe(false);
    expect(spotifyCheck?.detail).toContain('Network error');
  });

  it('uses default sampleSize of 2 when not specified', async () => {
    writeAuthJson(tmpDir);

    let capturedSampleSize = -1;
    const trackingClient: SpotifyClient = {
      fetchPlaylistTracks: async () => [],
      fetchPlaylistSummary: async (_id, size) => {
        capturedSampleSize = size;
        return { name: 'P', trackCount: 5, tracks: [] };
      },
    };

    await runDoctor({
      cliFlags: VALID_CONFIG_FLAGS,
      env: makeIsolatedEnv(tmpDir),
      spotifyClient: trackingClient,
    });

    expect(capturedSampleSize).toBe(2);
  });
});
