import NodeID3 from 'node-id3';

export interface AlbumImage {
  url: string;
  width?: number | null;
  height?: number | null;
}

export interface TaggableTrack {
  id: string;
  title: string;
  artists: string[];
  album: {
    id: string;
    name: string;
    images: AlbumImage[];
  };
  releaseYear: number;
  trackNumber?: number;
}

export interface CachedAlbumArt {
  imageBuffer: Buffer;
  mime: string;
}

export type AlbumArtCache = Map<string, CachedAlbumArt>;

export interface TagFileDeps {
  fetchFn?: typeof fetch;
  writeTags?: (tags: NodeID3.Tags, filePath: string) => true | Error;
  warn?: (message: string) => void;
}

export async function tagFile(
  filePath: string,
  track: TaggableTrack,
  albumArtCache: AlbumArtCache,
  deps: TagFileDeps = {},
): Promise<void> {
  const albumArt = await getAlbumArt(track, albumArtCache, deps);
  const year = String(track.releaseYear);

  const tags: NodeID3.Tags = {
    artist: track.artists[0] ?? '',
    performerInfo: track.artists.join(';'),
    title: track.title,
    album: track.album.name,
    year,
    recordingTime: year,
    userDefinedText: [
      { description: 'SyncSource', value: 'spotify' },
      { description: 'SyncSourceID', value: track.id },
    ],
  };

  if (track.trackNumber !== undefined) {
    tags.trackNumber = String(track.trackNumber);
  }

  if (albumArt !== undefined) {
    tags.image = {
      mime: albumArt.mime,
      type: { id: NodeID3.TagConstants.AttachedPicture.PictureType.FRONT_COVER },
      description: 'Front cover',
      imageBuffer: albumArt.imageBuffer,
    };
  }

  const writeTags = deps.writeTags ?? NodeID3.write;
  const result = writeTags(tags, filePath);
  if (result instanceof Error) {
    throw result;
  }
}

async function getAlbumArt(
  track: TaggableTrack,
  albumArtCache: AlbumArtCache,
  deps: TagFileDeps,
): Promise<CachedAlbumArt | undefined> {
  const cached = albumArtCache.get(track.album.id);
  if (cached !== undefined) {
    return cached;
  }

  const image = largestSpotifyImage(track.album.images);
  if (image === undefined) {
    if (track.album.images.length > 0) {
      warn(deps, `Skipping album art for album ${track.album.id}: no Spotify image URL`);
    }
    return undefined;
  }

  try {
    const fetchFn = deps.fetchFn ?? fetch;
    const response = await fetchFn(image.url);
    if (!response.ok) {
      warn(deps, `Album art fetch failed for album ${track.album.id}: HTTP ${response.status}`);
      return undefined;
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const mime = contentType(response.headers) ?? 'image/jpeg';
    const albumArt = { imageBuffer, mime };
    albumArtCache.set(track.album.id, albumArt);
    return albumArt;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warn(deps, `Album art fetch failed for album ${track.album.id}: ${reason}`);
    return undefined;
  }
}

function largestSpotifyImage(images: AlbumImage[]): AlbumImage | undefined {
  return images
    .filter((image) => isSpotifyImageUrl(image.url))
    .toSorted((a, b) => imageArea(b) - imageArea(a))[0];
}

function imageArea(image: AlbumImage): number {
  return (image.width ?? 0) * (image.height ?? 0);
}

function isSpotifyImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && isSpotifyImageHost(parsed.hostname);
  } catch {
    return false;
  }
}

function isSpotifyImageHost(hostname: string): boolean {
  return (
    hostname === 'i.scdn.co' ||
    hostname.endsWith('.scdn.co') ||
    hostname === 'image-cdn-ak.spotifycdn.com' ||
    hostname.endsWith('.spotifycdn.com')
  );
}

function contentType(headers: Headers): string | undefined {
  const value = headers.get('content-type')?.split(';', 1)[0]?.trim();
  return value === '' ? undefined : value;
}

function warn(deps: TagFileDeps, message: string): void {
  (deps.warn ?? console.warn)(message);
}
