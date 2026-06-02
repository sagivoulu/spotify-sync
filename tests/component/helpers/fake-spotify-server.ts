import * as http from 'node:http';

// ---------------------------------------------------------------------------
// Fake Spotify HTTP server for the component test suite.
//
// The binary is pointed at this server via SPOTIFY_SYNC_SPOTIFY_BASE_URL (which
// triggers the wrappedFetch URL-rewrite seam in src/spotify/client.ts).
// The server understands two playlist IDs:
//
//   testplayfull   — 3 tracks (the "FULL" playlist)
//   testplaysubset — 2 tracks (the "SUBSET" playlist, missing testtrack3)
//
// The prune flow syncs against testplayfull, then prunes with testplaysubset:
// track 3 is downloaded in the DB but absent from the current playlist → candidate.
//
// Playlist IDs are alphanumeric only because parsePlaylistId uses [A-Za-z0-9]+.
//
// Routes served:
//   GET /v1/playlists/:id            → SpotifyApiPlaylistMetadata shape
//   GET /v1/playlists/:id/items      → SpotifyApiPlaylistItemsPage shape
//   GET /v1/tracks/:id               → SpotifyApiTrackItem shape (for import)
//   * anything else                  → 404
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fake track data — matches SpotifyApiTrackItem shape in src/spotify/client.ts
// ---------------------------------------------------------------------------

interface FakeAlbum {
  id: string;
  name: string;
  release_date: string;
  images: { url: string; width: number; height: number }[];
}

interface FakeTrack {
  id: string;
  name: string;
  type: 'track';
  duration_ms: number;
  is_local: false;
  track_number: number;
  artists: { id: string; name: string }[];
  album: FakeAlbum;
}

const FAKE_ALBUM: FakeAlbum = {
  id: 'testalbum1',
  name: 'Test Album',
  release_date: '2024-01-01',
  images: [{ url: 'https://example.com/cover.jpg', width: 300, height: 300 }],
};

export const FAKE_TRACKS: FakeTrack[] = [
  {
    id: 'testtrack1',
    name: 'Test Track One',
    type: 'track',
    duration_ms: 30_000,
    is_local: false,
    track_number: 1,
    artists: [{ id: 'testartist1', name: 'Test Artist One' }],
    album: FAKE_ALBUM,
  },
  {
    id: 'testtrack2',
    name: 'Test Track Two',
    type: 'track',
    duration_ms: 30_000,
    is_local: false,
    track_number: 2,
    artists: [{ id: 'testartist2', name: 'Test Artist Two' }],
    album: FAKE_ALBUM,
  },
  {
    id: 'testtrack3',
    name: 'Test Track Three',
    type: 'track',
    duration_ms: 30_000,
    is_local: false,
    track_number: 3,
    artists: [{ id: 'testartist3', name: 'Test Artist Three' }],
    album: FAKE_ALBUM,
  },
];

// ---------------------------------------------------------------------------
// Playlist definitions
// ---------------------------------------------------------------------------

const PLAYLISTS: Record<
  string,
  { name: string; tracks: FakeTrack[] }
> = {
  testplayfull: {
    name: 'CI Component Test Playlist — Full',
    tracks: FAKE_TRACKS,
  },
  testplaysubset: {
    name: 'CI Component Test Playlist — Subset',
    tracks: FAKE_TRACKS.slice(0, 2), // testtrack1 + testtrack2 only
  },
};

function makePlaylistItem(track: FakeTrack, index: number) {
  return {
    added_at: `2024-0${index + 1}-01T00:00:00Z`,
    is_local: false,
    item: track,
  };
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? '/', `http://localhost`);
  const path = url.pathname;

  function json(status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
  }

  // GET /v1/playlists/:id/items  — paginated playlist items
  const itemsMatch = /^\/v1\/playlists\/([A-Za-z0-9]+)\/items$/.exec(path);
  if (itemsMatch && req.method === 'GET') {
    const playlistId = itemsMatch[1];
    const playlist = PLAYLISTS[playlistId];
    if (!playlist) {
      json(404, { error: { status: 404, message: `Playlist ${playlistId} not found` } });
      return;
    }
    const items = playlist.tracks.map((t, i) => makePlaylistItem(t, i));
    json(200, {
      items,
      next: null,
      total: items.length,
      offset: 0,
      limit: 100,
    });
    return;
  }

  // GET /v1/playlists/:id  — playlist metadata (used by doctor + fetchPlaylistSummary)
  const playlistMatch = /^\/v1\/playlists\/([A-Za-z0-9]+)$/.exec(path);
  if (playlistMatch && req.method === 'GET') {
    const playlistId = playlistMatch[1];
    const playlist = PLAYLISTS[playlistId];
    if (!playlist) {
      json(404, { error: { status: 404, message: `Playlist ${playlistId} not found` } });
      return;
    }
    const items = playlist.tracks.map((t, i) => makePlaylistItem(t, i));
    // Shape: SpotifyApiPlaylistMetadata (see src/spotify/client.ts)
    json(200, {
      name: playlist.name,
      items: { total: playlist.tracks.length, items },
    });
    return;
  }

  // GET /v1/tracks/:id  — single track (used by import command)
  const trackMatch = /^\/v1\/tracks\/([A-Za-z0-9]+)$/.exec(path);
  if (trackMatch && req.method === 'GET') {
    const trackId = trackMatch[1];
    const track = FAKE_TRACKS.find((t) => t.id === trackId);
    if (!track) {
      json(404, { error: { status: 404, message: `Track ${trackId} not found` } });
      return;
    }
    json(200, track);
    return;
  }

  // Anything else
  json(404, { error: { status: 404, message: `Not found: ${path}` } });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FakeSpotifyServer {
  /** Base URL of the fake server, e.g. 'http://127.0.0.1:49821'. */
  baseUrl: string;
  /** Shut down the server and release the port. */
  close(): Promise<void>;
}

/**
 * Start the fake Spotify HTTP server on a random available port.
 *
 * Pass the returned `baseUrl` to child processes via SPOTIFY_SYNC_SPOTIFY_BASE_URL
 * so the binary rewrites its API calls to this server.
 */
export function startFakeSpotifyServer(): Promise<FakeSpotifyServer> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handleRequest);

    server.once('error', reject);

    // Port 0 → OS assigns a free port.
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Unexpected server address'));
        return;
      }
      const baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve({
        baseUrl,
        close: () =>
          new Promise<void>((res, rej) => {
            server.closeAllConnections?.();
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}

// Playlist URL helpers — use these in test files to keep the IDs in one place.
export const PLAYLIST_URL_FULL = 'https://open.spotify.com/playlist/testplayfull';
export const PLAYLIST_URL_SUBSET = 'https://open.spotify.com/playlist/testplaysubset';
