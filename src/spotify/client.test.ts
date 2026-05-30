import { describe, expect, it } from 'vitest';
import { createSpotifyClient } from './client.js';
import type { StoredToken } from './token-store.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A non-expired token that won't trigger proactive refresh by default. */
const VALID_TOKEN: StoredToken = {
  access_token: 'initial-access-token',
  refresh_token: 'initial-refresh-token',
  expires_at: Date.now() + 3600 * 1000, // 1 hour from now
  obtained_at: Date.now(),
  scope: 'playlist-read-private playlist-read-collaborative',
  token_type: 'Bearer',
};

/** Build a minimal PlaylistedTrack item for use in Page fixtures. */
function makeTrackItem(overrides?: {
  id?: string;
  name?: string;
  artists?: string[];
  albumName?: string;
  releaseDate?: string;
  durationMs?: number;
  addedAt?: string;
  trackNumber?: number;
  type?: string;
  isLocal?: boolean;
  trackNull?: boolean;
}) {
  const {
    id = 'track-id-1',
    name = 'Test Track',
    artists = ['Artist One'],
    albumName = 'Test Album',
    releaseDate = '2020-06-15',
    durationMs = 210000,
    addedAt = '2024-01-01T00:00:00Z',
    trackNumber = 1,
    type = 'track',
    isLocal = false,
    trackNull = false,
  } = overrides ?? {};

  return {
    added_at: addedAt,
    added_by: { external_urls: {}, href: '', id: 'user', type: 'user', uri: '' },
    is_local: isLocal,
    primary_color: null,
    item: trackNull
      ? null
      : {
          id,
          name,
          type,
          duration_ms: durationMs,
          artists: artists.map((n) => ({
            name: n,
            id: n,
            href: '',
            uri: '',
            external_urls: {},
            type: 'artist',
          })),
          album: {
            id: 'album-id',
            name: albumName,
            release_date: releaseDate,
            release_date_precision: 'day',
            album_type: 'album',
            album_group: 'album',
            total_tracks: 10,
            images: [
              { url: 'https://i.scdn.co/image/large.jpg', width: 640, height: 640 },
              { url: 'https://i.scdn.co/image/small.jpg', width: 64, height: 64 },
            ],
            artists: [],
            available_markets: [],
            external_urls: { spotify: '' },
            href: '',
            restrictions: undefined,
            uri: '',
          },
          available_markets: [],
          disc_number: 1,
          episode: false,
          explicit: false,
          external_ids: { isrc: '', ean: '', upc: '' },
          external_urls: { spotify: '' },
          href: '',
          is_local: isLocal,
          popularity: 80,
          preview_url: null,
          track: true,
          track_number: trackNumber,
          uri: '',
        },
  };
}

/** Build a Spotify Page fixture. */
function makePage(
  items: ReturnType<typeof makeTrackItem>[],
  opts?: { offset?: number; total?: number; hasNext?: boolean },
): object {
  const { offset = 0, total = items.length, hasNext = false } = opts ?? {};
  return {
    href: `https://api.spotify.com/v1/playlists/pid/items?offset=${offset}&limit=100`,
    items,
    limit: 100,
    next: hasNext
      ? `https://api.spotify.com/v1/playlists/pid/items?offset=${offset + 100}&limit=100`
      : null,
    offset,
    previous: null,
    total,
  };
}

/** Build a successful token refresh response body. */
function makeRefreshBody(overrides?: Partial<Record<string, unknown>>): object {
  return {
    access_token: 'refreshed-access-token',
    token_type: 'Bearer',
    scope: 'playlist-read-private playlist-read-collaborative',
    expires_in: 3600,
    ...overrides,
  };
}

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

// ---------------------------------------------------------------------------
// fetchPlaylistTracks — basic field mapping
// ---------------------------------------------------------------------------

describe('fetchPlaylistTracks — field mapping', () => {
  it('maps a single track page to SpotifyTrack[]', async () => {
    const item = makeTrackItem({
      id: 'track-abc',
      name: 'My Song',
      artists: ['Alice', 'Bob'],
      albumName: 'Great Album',
      releaseDate: '2019-03-25',
      durationMs: 180000,
      addedAt: '2024-06-01T12:00:00Z',
      trackNumber: 7,
    });
    const page = makePage([item]);

    const fakeFetch = async (): Promise<Response> =>
      new Response(JSON.stringify(page), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const client = createSpotifyClient({ clientId: 'cid', token: VALID_TOKEN, fetchFn: fakeFetch });
    const tracks = await client.fetchPlaylistTracks('playlist-id');

    expect(tracks).toHaveLength(1);
    const [track] = tracks;
    expect(track.id).toBe('track-abc');
    expect(track.title).toBe('My Song');
    expect(track.artists).toEqual(['Alice', 'Bob']);
    expect(track.album.id).toBe('album-id');
    expect(track.album.name).toBe('Great Album');
    expect(track.album.images).toHaveLength(2);
    expect(track.album.images[0]).toMatchObject({
      url: 'https://i.scdn.co/image/large.jpg',
      width: 640,
      height: 640,
    });
    expect(track.releaseYear).toBe(2019);
    expect(track.trackNumber).toBe(7);
    expect(track.durationMs).toBe(180000);
    expect(track.addedAt).toBe('2024-06-01T12:00:00Z');
  });
});

// ---------------------------------------------------------------------------
// fetchPlaylistTracks — pagination
// ---------------------------------------------------------------------------

describe('fetchPlaylistTracks — pagination', () => {
  it('follows next pages until null, returning all tracks', async () => {
    const page1Items = [
      makeTrackItem({ id: 'track-1', name: 'Song 1' }),
      makeTrackItem({ id: 'track-2', name: 'Song 2' }),
    ];
    const page2Items = [makeTrackItem({ id: 'track-3', name: 'Song 3' })];

    const page1 = makePage(page1Items, { offset: 0, total: 3, hasNext: true });
    const page2 = makePage(page2Items, { offset: 100, total: 3, hasNext: false });

    let callCount = 0;
    const fakeFetch = async (url: string | URL | Request): Promise<Response> => {
      const urlStr = String(url);
      callCount++;
      if (urlStr.includes('offset=0') || callCount === 1) {
        return new Response(JSON.stringify(page1), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(page2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = createSpotifyClient({ clientId: 'cid', token: VALID_TOKEN, fetchFn: fakeFetch });
    const tracks = await client.fetchPlaylistTracks('playlist-id');

    expect(tracks).toHaveLength(3);
    expect(tracks.map((t) => t.id)).toEqual(['track-1', 'track-2', 'track-3']);
  });

  it('makes a second API call with offset=100 for the second page', async () => {
    const page1 = makePage([makeTrackItem({ id: 't1' })], { offset: 0, total: 2, hasNext: true });
    const page2 = makePage([makeTrackItem({ id: 't2' })], {
      offset: 100,
      total: 2,
      hasNext: false,
    });

    const requestedUrls: string[] = [];
    const fakeFetch = async (url: string | URL | Request): Promise<Response> => {
      const urlStr = String(url);
      requestedUrls.push(urlStr);
      const isPage2 = urlStr.includes('offset=100');
      return new Response(JSON.stringify(isPage2 ? page2 : page1), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = createSpotifyClient({ clientId: 'cid', token: VALID_TOKEN, fetchFn: fakeFetch });
    await client.fetchPlaylistTracks('playlist-id');

    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[1]).toContain('offset=100');
  });
});

// ---------------------------------------------------------------------------
// fetchPlaylistTracks — item filtering
// ---------------------------------------------------------------------------

describe('fetchPlaylistTracks — item filtering', () => {
  it('skips is_local tracks', async () => {
    const items = [
      makeTrackItem({ id: 'real', name: 'Real Track' }),
      makeTrackItem({ id: 'local', name: 'Local File', isLocal: true }),
    ];
    const page = makePage(items);

    const client = createSpotifyClient({
      clientId: 'cid',
      token: VALID_TOKEN,
      fetchFn: async () =>
        new Response(JSON.stringify(page), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    const tracks = await client.fetchPlaylistTracks('pid');

    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe('real');
  });

  it('skips items where track is null (removed from Spotify)', async () => {
    const items = [
      makeTrackItem({ id: 'live', name: 'Live Track' }),
      makeTrackItem({ trackNull: true }),
    ];
    const page = makePage(items);

    const client = createSpotifyClient({
      clientId: 'cid',
      token: VALID_TOKEN,
      fetchFn: async () =>
        new Response(JSON.stringify(page), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    const tracks = await client.fetchPlaylistTracks('pid');

    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe('live');
  });

  it('skips episode items (type !== "track")', async () => {
    const items = [
      makeTrackItem({ id: 'song', name: 'A Song', type: 'track' }),
      makeTrackItem({ id: 'ep', name: 'A Podcast Episode', type: 'episode' }),
    ];
    const page = makePage(items);

    const client = createSpotifyClient({
      clientId: 'cid',
      token: VALID_TOKEN,
      fetchFn: async () =>
        new Response(JSON.stringify(page), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    const tracks = await client.fetchPlaylistTracks('pid');

    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe('song');
  });
});

// ---------------------------------------------------------------------------
// Token refresh — proactive (expiry-based)
// ---------------------------------------------------------------------------

describe('fetchPlaylistTracks — proactive token refresh', () => {
  it('refreshes before the first API call when the token is already expired', async () => {
    const expiredToken: StoredToken = {
      ...VALID_TOKEN,
      expires_at: Date.now() - 1000, // already expired
    };

    const refreshed: StoredToken[] = [];
    const calls: string[] = [];

    const fakeFetch = async (
      url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const urlStr = String(url);
      calls.push(urlStr);

      if (urlStr === SPOTIFY_TOKEN_URL) {
        // Token refresh call
        return new Response(JSON.stringify(makeRefreshBody()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Playlist items call — return a single-page result
      return new Response(JSON.stringify(makePage([makeTrackItem()])), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = createSpotifyClient({
      clientId: 'cid',
      token: expiredToken,
      fetchFn: fakeFetch,
      onTokenRefreshed: (t) => refreshed.push(t),
    });
    await client.fetchPlaylistTracks('pid');

    // Refresh must have happened before the playlist call
    expect(refreshed).toHaveLength(1);
    expect(refreshed[0].access_token).toBe('refreshed-access-token');
    // The first call should be the token refresh
    expect(calls[0]).toBe(SPOTIFY_TOKEN_URL);
  });

  it('does not refresh when the token is still valid', async () => {
    const calls: string[] = [];
    const fakeFetch = async (url: string | URL | Request): Promise<Response> => {
      calls.push(String(url));
      return new Response(JSON.stringify(makePage([makeTrackItem()])), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = createSpotifyClient({ clientId: 'cid', token: VALID_TOKEN, fetchFn: fakeFetch });
    await client.fetchPlaylistTracks('pid');

    // No call to the token endpoint
    expect(calls.every((u) => u !== SPOTIFY_TOKEN_URL)).toBe(true);
  });

  it('fires onTokenRefreshed with the new token after a proactive refresh', async () => {
    const expiredToken: StoredToken = { ...VALID_TOKEN, expires_at: Date.now() - 1000 };
    const fired: StoredToken[] = [];

    const fakeFetch = async (url: string | URL | Request): Promise<Response> => {
      if (String(url) === SPOTIFY_TOKEN_URL) {
        return new Response(JSON.stringify(makeRefreshBody()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(makePage([makeTrackItem()])), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = createSpotifyClient({
      clientId: 'cid',
      token: expiredToken,
      fetchFn: fakeFetch,
      onTokenRefreshed: (t) => fired.push(t),
    });
    await client.fetchPlaylistTracks('pid');

    expect(fired).toHaveLength(1);
    expect(fired[0].access_token).toBe('refreshed-access-token');
  });
});

// ---------------------------------------------------------------------------
// fetchPlaylistSummary — playlist metadata + sample tracks
// ---------------------------------------------------------------------------

/**
 * Minimal playlist metadata response for GET /playlists/{id}.
 * Mirrors the 2024 Spotify API shape: top-level `items` paging object
 * (renamed from `tracks`) with embedded first-page items array.
 */
function makePlaylistMetadata(
  name: string,
  total: number,
  items: ReturnType<typeof makeTrackItem>[] = [],
): object {
  return {
    name,
    items: {
      href: 'https://api.spotify.com/v1/playlists/pid/items?offset=0&limit=100',
      items,
      limit: 100,
      next: null,
      offset: 0,
      previous: null,
      total,
    },
  };
}

describe('fetchPlaylistSummary — basic behaviour', () => {
  it('returns name, trackCount, and sample tracks', async () => {
    const trackItems = [
      makeTrackItem({ id: 't1', name: 'Song One', artists: ['Alice'] }),
      makeTrackItem({ id: 't2', name: 'Song Two', artists: ['Bob', 'Carol'] }),
    ];
    // Items are embedded in the playlist metadata response (2024 API shape).
    const metadata = makePlaylistMetadata('My Playlist', 42, trackItems);

    const fakeFetch = async (): Promise<Response> =>
      new Response(JSON.stringify(metadata), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const client = createSpotifyClient({ clientId: 'cid', token: VALID_TOKEN, fetchFn: fakeFetch });
    const summary = await client.fetchPlaylistSummary('playlist-id', 2);

    expect(summary.name).toBe('My Playlist');
    expect(summary.trackCount).toBe(42);
    expect(summary.tracks).toHaveLength(2);
    expect(summary.tracks[0].id).toBe('t1');
    expect(summary.tracks[0].title).toBe('Song One');
    expect(summary.tracks[0].artists).toEqual(['Alice']);
    expect(summary.tracks[1].id).toBe('t2');
    expect(summary.tracks[1].artists).toEqual(['Bob', 'Carol']);
  });

  it('truncates sample to sampleSize even if the embedded items has more', async () => {
    const trackItems = [
      makeTrackItem({ id: 't1' }),
      makeTrackItem({ id: 't2' }),
      makeTrackItem({ id: 't3' }),
    ];
    const metadata = makePlaylistMetadata('Big Playlist', 100, trackItems);

    const client = createSpotifyClient({
      clientId: 'cid',
      token: VALID_TOKEN,
      fetchFn: async () =>
        new Response(JSON.stringify(metadata), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    const summary = await client.fetchPlaylistSummary('pid', 2);

    expect(summary.tracks).toHaveLength(2);
    expect(summary.tracks.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('skips local and null items in the sample', async () => {
    const trackItems = [
      makeTrackItem({ id: 'local', isLocal: true }),
      makeTrackItem({ id: 'removed', trackNull: true }),
      makeTrackItem({ id: 'real', name: 'Real Song' }),
    ];
    const metadata = makePlaylistMetadata('Playlist', 10, trackItems);

    const client = createSpotifyClient({
      clientId: 'cid',
      token: VALID_TOKEN,
      fetchFn: async () =>
        new Response(JSON.stringify(metadata), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    const summary = await client.fetchPlaylistSummary('pid', 5);

    expect(summary.tracks).toHaveLength(1);
    expect(summary.tracks[0].id).toBe('real');
  });

  it('makes a single API call to GET /playlists/{id}', async () => {
    const capturedUrls: string[] = [];
    const metadata = makePlaylistMetadata('Test', 5, [makeTrackItem()]);

    const fakeFetch = async (url: string | URL | Request): Promise<Response> => {
      capturedUrls.push(String(url));
      return new Response(JSON.stringify(metadata), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = createSpotifyClient({ clientId: 'cid', token: VALID_TOKEN, fetchFn: fakeFetch });
    await client.fetchPlaylistSummary('pid', 2);

    // One call only — items are embedded in the playlist metadata response.
    expect(capturedUrls).toHaveLength(1);
    expect(capturedUrls[0]).toMatch(/\/playlists\/pid$/);
  });
});

// ---------------------------------------------------------------------------
// Token refresh — 401-triggered
// ---------------------------------------------------------------------------

describe('fetchPlaylistTracks — 401 refresh-and-retry', () => {
  it('refreshes and retries once on a 401 response', async () => {
    let playlistCallCount = 0;
    let refreshCallCount = 0;

    const fakeFetch = async (url: string | URL | Request): Promise<Response> => {
      const urlStr = String(url);

      if (urlStr === SPOTIFY_TOKEN_URL) {
        refreshCallCount++;
        return new Response(JSON.stringify(makeRefreshBody()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // First playlist call → 401; subsequent → success.
      playlistCallCount++;
      if (playlistCallCount === 1) {
        return new Response('Unauthorized', { status: 401 });
      }
      return new Response(JSON.stringify(makePage([makeTrackItem({ id: 'retried-track' })])), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const refreshed: StoredToken[] = [];
    const client = createSpotifyClient({
      clientId: 'cid',
      token: VALID_TOKEN,
      fetchFn: fakeFetch,
      onTokenRefreshed: (t) => refreshed.push(t),
    });
    const tracks = await client.fetchPlaylistTracks('pid');

    expect(refreshCallCount).toBe(1);
    expect(refreshed).toHaveLength(1);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe('retried-track');
  });

  it('throws a spotify-sync auth error when the retry also returns 401', async () => {
    let refreshCallCount = 0;

    const fakeFetch = async (url: string | URL | Request): Promise<Response> => {
      if (String(url) === SPOTIFY_TOKEN_URL) {
        refreshCallCount++;
        return new Response(JSON.stringify(makeRefreshBody()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Both the original and the retry return 401.
      return new Response('Unauthorized', { status: 401 });
    };

    const client = createSpotifyClient({ clientId: 'cid', token: VALID_TOKEN, fetchFn: fakeFetch });

    await expect(client.fetchPlaylistTracks('pid')).rejects.toThrow(/spotify-sync auth/i);
    expect(refreshCallCount).toBe(1); // refresh only once, not in a loop
  });

  it('throws a spotify-sync auth error when the refresh itself fails', async () => {
    const fakeFetch = async (url: string | URL | Request): Promise<Response> => {
      if (String(url) === SPOTIFY_TOKEN_URL) {
        return new Response('{"error":"invalid_grant"}', { status: 400 });
      }
      return new Response('Unauthorized', { status: 401 });
    };

    const client = createSpotifyClient({ clientId: 'cid', token: VALID_TOKEN, fetchFn: fakeFetch });

    await expect(client.fetchPlaylistTracks('pid')).rejects.toThrow(/spotify-sync auth/i);
  });
});
