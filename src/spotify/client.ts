import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import type { AccessToken, IAuthStrategy } from '@spotify/web-api-ts-sdk';
import { refreshAccessToken } from './auth.js';
import type { StoredToken } from './token-store.js';

// ---------------------------------------------------------------------------
// Types for Spotify's GET /v1/playlists/{id}/items endpoint.
//
// Spotify renamed /tracks → /items in 2024; the response shape also changed:
// each element now has an `item` field (singular) instead of `track`.
// The SDK v1.x still calls the old /tracks path (returning 403); we call
// /items directly via api.makeRequest which still goes through wrappedFetch.
// ---------------------------------------------------------------------------

interface SpotifyApiArtist {
  id: string;
  name: string;
}

interface SpotifyApiAlbum {
  id: string;
  name: string;
  release_date: string;
  images: { url: string; width: number; height: number }[];
}

interface SpotifyApiTrackItem {
  id: string;
  name: string;
  type: string;
  duration_ms: number;
  is_local: boolean;
  artists: SpotifyApiArtist[];
  album: SpotifyApiAlbum;
}

interface SpotifyApiPlaylistItem {
  added_at: string;
  is_local: boolean;
  /** The track or episode. null for tracks removed from Spotify's catalogue. */
  item: SpotifyApiTrackItem | null;
}

interface SpotifyApiPlaylistItemsPage {
  items: SpotifyApiPlaylistItem[];
  next: string | null;
  total: number;
  offset: number;
  limit: number;
}

/** Shape returned by GET /playlists/{id}?fields=name,tracks(total). */
interface SpotifyApiPlaylistMetadata {
  name: string;
  tracks: { total: number };
}

// ---------------------------------------------------------------------------
// Spotify client — playlist fetch with transparent token refresh.
//
// Design:
// - All auth logic lives in a `wrappedFetch` we inject into the SDK via SdkOptions.
//   The SDK only handles typed API calls; it never touches our token lifecycle.
// - Token refresh (proactive + 401-triggered) goes through our own refreshAccessToken()
//   using `baseFetch`, bypassing `wrappedFetch` to avoid recursion.
// - fetchFn and now() are injectable for tests; no live API calls in test suite.
// ---------------------------------------------------------------------------

/** How many seconds before expiry we proactively refresh. */
const REFRESH_SKEW_MS = 60_000;

/** Items per page — Spotify /items endpoint supports up to 100. */
const PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SpotifyTrack {
  /** Spotify track ID. */
  id: string;
  /** Track name. */
  title: string;
  /** Ordered list of artist names. */
  artists: string[];
  /**
   * Album info including images.
   * Kept as an object (not just a name string) so the tagging ticket can
   * consume album art URLs directly from the track without an extra API call.
   */
  album: {
    name: string;
    images: { url: string; width: number; height: number }[];
  };
  /** Four-digit release year parsed from album.release_date. */
  releaseYear: number;
  /** Track duration in milliseconds. */
  durationMs: number;
  /** ISO 8601 timestamp when the track was added to the playlist. */
  addedAt: string;
}

/**
 * A lightweight playlist summary — name, total track count, and a small
 * sample of tracks. Used by `fetchPlaylistSummary` for the doctor health check.
 */
export interface PlaylistSummary {
  /** Playlist display name. */
  name: string;
  /** Total number of tracks in the playlist (may include local/removed). */
  trackCount: number;
  /**
   * A sample of the first N playable tracks (non-local, non-removed, type=track).
   * May be shorter than `sampleSize` if the playlist has fewer eligible tracks.
   */
  tracks: SpotifyTrack[];
}

export interface SpotifyClient {
  /**
   * Fetch all tracks in a Spotify playlist, handling pagination and token
   * refresh transparently.
   *
   * @param playlistId  Spotify playlist ID (not URL).
   */
  fetchPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]>;

  /**
   * Fetch a lightweight playlist summary: name, total track count, and a
   * small sample of the first `sampleSize` playable tracks.
   *
   * Makes two API calls (metadata + one items page) instead of paginating the
   * full playlist — suitable for health checks that only need a quick sanity
   * check, not the full track list.
   *
   * @param playlistId  Spotify playlist ID (not URL).
   * @param sampleSize  Maximum number of sample tracks to return.
   */
  fetchPlaylistSummary(playlistId: string, sampleSize: number): Promise<PlaylistSummary>;
}

export interface SpotifyClientDeps {
  /** Spotify application client ID. */
  clientId: string;
  /** Initial token — typically loaded from auth.json by the caller. */
  token: StoredToken;
  /**
   * Underlying fetch implementation. Defaults to global fetch.
   * Tests inject a fake here; token refresh calls also use this.
   */
  fetchFn?: typeof fetch;
  /**
   * Called whenever a token refresh produces a new StoredToken.
   * The CLI wires this to saveToken() so auth.json stays up to date.
   */
  onTokenRefreshed?: (token: StoredToken) => void;
  /**
   * Current-time provider. Defaults to Date.now.
   * Tests inject a fixed timestamp to exercise expiry logic without real waits.
   */
  now?: () => number;
}

// ---------------------------------------------------------------------------
// Item mapping helper (module-level — shared by fetchPlaylistTracks and
// fetchPlaylistSummary to keep filtering and field mapping in one place).
// ---------------------------------------------------------------------------

/**
 * Map a raw Spotify playlist item to a SpotifyTrack, or null if the item
 * should be skipped (local file, null/removed track, or non-track type).
 */
function mapPlaylistItem(item: SpotifyApiPlaylistItem): SpotifyTrack | null {
  if (item.is_local || item.item == null || item.item.type !== 'track') {
    return null;
  }
  const track = item.item;
  return {
    id: track.id,
    title: track.name,
    artists: track.artists.map((a) => a.name),
    album: {
      name: track.album.name,
      images: track.album.images.map((img) => ({
        url: img.url,
        width: img.width,
        height: img.height,
      })),
    },
    releaseYear: Number.parseInt(track.album.release_date.slice(0, 4), 10),
    durationMs: track.duration_ms,
    addedAt: item.added_at,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSpotifyClient(deps: SpotifyClientDeps): SpotifyClient {
  const { clientId, onTokenRefreshed } = deps;
  const baseFetch = deps.fetchFn ?? fetch;
  const now = deps.now ?? (() => Date.now());

  // Mutable — updated on every successful refresh.
  let current = deps.token;

  // ---------------------------------------------------------------------------
  // Token refresh — uses baseFetch directly to avoid re-entering wrappedFetch.
  // ---------------------------------------------------------------------------

  async function doRefresh(): Promise<void> {
    current = await refreshAccessToken({
      clientId,
      refreshToken: current.refresh_token,
      fetchFn: baseFetch,
    });
    onTokenRefreshed?.(current);
  }

  // ---------------------------------------------------------------------------
  // Wrapped fetch — injected into the SDK so all HTTP goes through here.
  // Responsibilities:
  //   1. Proactive token refresh when the token is close to expiry.
  //   2. Override the Authorization header with the current access token
  //      (the SDK's cached token may be stale after a refresh).
  //   3. On 401: refresh once and retry; on a second 401 throw a clear error.
  // ---------------------------------------------------------------------------

  const wrappedFetch: typeof fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    // Proactive refresh: if the token expires within REFRESH_SKEW_MS, refresh now.
    if (now() >= current.expires_at - REFRESH_SKEW_MS) {
      await doRefresh();
    }

    // Build headers with our authoritative access token.
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${current.access_token}`);

    const response = await baseFetch(input, { ...init, headers });

    if (response.status !== 401) {
      return response;
    }

    // 401 — refresh once and retry.
    try {
      await doRefresh();
    } catch {
      throw new Error('Re-authentication required. Run `spotify-sync auth`.');
    }

    headers.set('Authorization', `Bearer ${current.access_token}`);
    const retryResponse = await baseFetch(input, { ...init, headers });

    if (retryResponse.status === 401) {
      throw new Error('Re-authentication required. Run `spotify-sync auth`.');
    }

    return retryResponse;
  };

  // ---------------------------------------------------------------------------
  // Custom auth strategy — the SDK asks this for the access token on every
  // request. We always return the current token and never set a real `expires`,
  // so the SDK never triggers its own internal refresh via AccessTokenHelpers
  // (which uses the global fetch and bypasses our wrappedFetch / doRefresh).
  // All refresh logic is owned entirely by wrappedFetch above.
  // ---------------------------------------------------------------------------

  function currentAccessToken(): AccessToken {
    return {
      access_token: current.access_token,
      token_type: current.token_type,
      expires_in: 3600, // informational; SDK doesn't use this to drive refresh here
      refresh_token: current.refresh_token,
      // expires = far future so ProvidedAccessTokenStrategy never thinks the
      // token is stale and short-circuits to its own (global-fetch) refresh path.
      expires: Number.MAX_SAFE_INTEGER,
    };
  }

  const authStrategy: IAuthStrategy = {
    setConfiguration: () => {},
    getOrCreateAccessToken: async (): Promise<AccessToken> => currentAccessToken(),
    getAccessToken: async (): Promise<AccessToken | null> => currentAccessToken(),
    removeAccessToken: () => {},
  };

  const api = new SpotifyApi(authStrategy, { fetch: wrappedFetch });

  // ---------------------------------------------------------------------------
  // SpotifyClient implementation
  // ---------------------------------------------------------------------------

  return {
    async fetchPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
      const tracks: SpotifyTrack[] = [];
      let offset = 0;

      for (;;) {
        // Use api.makeRequest so the call goes through wrappedFetch (auth +
        // refresh). The old /tracks endpoint returns 403 since Spotify renamed
        // it to /items in 2024; the response shape also changed (item vs track).
        const page = await api.makeRequest<SpotifyApiPlaylistItemsPage>(
          'GET',
          `playlists/${playlistId}/items?limit=${PAGE_SIZE}&offset=${offset}`,
        );

        for (const item of page.items) {
          const track = mapPlaylistItem(item);
          if (track !== null) {
            tracks.push(track);
          }
        }

        if (page.next === null) break;
        offset += PAGE_SIZE;
      }

      return tracks;
    },

    async fetchPlaylistSummary(playlistId: string, sampleSize: number): Promise<PlaylistSummary> {
      // Step 1: Fetch playlist metadata (name + total track count).
      // Note: do NOT use the ?fields= filter here. The parenthesis syntax
      // Spotify uses for nested field filters (e.g. tracks(total)) gets
      // URL-encoded by api.makeRequest as tracks%28total%29, which Spotify
      // doesn't recognise as a field filter — it omits `tracks` from the
      // response entirely, causing metadata.tracks to be undefined.
      // The unfiltered response is small (first 20 items by default) and
      // provides tracks.total reliably.
      const metadata = await api.makeRequest<SpotifyApiPlaylistMetadata>(
        'GET',
        `playlists/${playlistId}`,
      );

      // Step 2: Fetch a small page of items for the sample tracks.
      // We request exactly sampleSize items; mapPlaylistItem filters out
      // local/removed/non-track items, so we may get fewer than sampleSize.
      const page = await api.makeRequest<SpotifyApiPlaylistItemsPage>(
        'GET',
        `playlists/${playlistId}/items?limit=${sampleSize}&offset=0`,
      );

      const tracks: SpotifyTrack[] = [];
      for (const item of page.items) {
        const track = mapPlaylistItem(item);
        if (track !== null) {
          tracks.push(track);
          if (tracks.length >= sampleSize) break;
        }
      }

      return {
        name: metadata.name,
        trackCount: metadata.tracks.total,
        tracks,
      };
    },
  };
}
