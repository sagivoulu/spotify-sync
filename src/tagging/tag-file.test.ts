import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import NodeID3 from 'node-id3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tagFile } from './tag-file.js';
import type { TaggableTrack } from './tag-file.js';

const FIXTURE_MP3 = fileURLToPath(new URL('./fixtures/silence.mp3', import.meta.url));
const PNG_BYTES = Buffer.from('89504e470d0a1a0a', 'hex');

function makeTrack(overrides?: Partial<TaggableTrack>): TaggableTrack {
  return {
    id: 'spotify-track-id',
    title: 'Canonical Title',
    artists: ['Primary Artist', 'Featured Artist'],
    album: {
      id: 'spotify-album-id',
      name: 'Canonical Album',
      images: [
        { url: 'https://i.scdn.co/image/small', width: 64, height: 64 },
        { url: 'https://i.scdn.co/image/large', width: 640, height: 640 },
      ],
    },
    releaseYear: 2024,
    trackNumber: 7,
    ...overrides,
  };
}

function successfulImageFetch(): Promise<Response> {
  return Promise.resolve(
    new Response(PNG_BYTES, {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    }),
  );
}

function getWrittenTags(writes: NodeID3.Tags[]): NodeID3.Tags {
  expect(writes).toHaveLength(1);
  const [tags] = writes;
  expect(tags).toBeDefined();
  return tags;
}

function expectImage(tags: NodeID3.Tags): Extract<NodeID3.Tags['image'], object> {
  expect(tags.image).toBeDefined();
  expect(typeof tags.image).toBe('object');
  if (tags.image === undefined || typeof tags.image !== 'object') {
    throw new Error('expected image tag object');
  }
  return tags.image;
}

function syncSourceValue(tags: NodeID3.Tags, description: string): string | undefined {
  return tags.userDefinedText?.find((entry) => entry.description === description)?.value;
}

describe('tagFile', () => {
  it('writes Spotify metadata and album art to the expected ID3 fields', async () => {
    const writes: NodeID3.Tags[] = [];
    const fetchUrls: string[] = [];

    await tagFile('/tmp/song.mp3', makeTrack(), new Map(), {
      fetchFn: async (url) => {
        fetchUrls.push(String(url));
        return successfulImageFetch();
      },
      writeTags: (tags) => {
        writes.push(tags);
        return true;
      },
    });

    expect(fetchUrls).toEqual(['https://i.scdn.co/image/large']);
    const tags = getWrittenTags(writes);
    expect(tags.artist).toBe('Primary Artist');
    expect(tags.performerInfo).toBe('Primary Artist;Featured Artist');
    expect(tags.title).toBe('Canonical Title');
    expect(tags.album).toBe('Canonical Album');
    expect(tags.year).toBe('2024');
    expect(tags.recordingTime).toBe('2024');
    expect(tags.trackNumber).toBe('7');
    expect(syncSourceValue(tags, 'SyncSource')).toBe('spotify');
    expect(syncSourceValue(tags, 'SyncSourceID')).toBe('spotify-track-id');

    const image = expectImage(tags);
    expect(image.mime).toBe('image/png');
    expect(image.description).toBe('Front cover');
    expect(image.imageBuffer).toEqual(PNG_BYTES);
  });

  it('does not write track number when Spotify does not provide one', async () => {
    const writes: NodeID3.Tags[] = [];

    await tagFile(
      '/tmp/song.mp3',
      makeTrack({ trackNumber: undefined, album: { ...makeTrack().album, images: [] } }),
      new Map(),
      {
        writeTags: (tags) => {
          writes.push(tags);
          return true;
        },
      },
    );

    expect(getWrittenTags(writes).trackNumber).toBeUndefined();
  });

  it('caches album art by Spotify album ID', async () => {
    const cache = new Map();
    let fetchCount = 0;

    const deps = {
      fetchFn: async () => {
        fetchCount++;
        return successfulImageFetch();
      },
      writeTags: () => true as const,
    };

    await tagFile('/tmp/first.mp3', makeTrack({ id: 'track-1' }), cache, deps);
    await tagFile('/tmp/second.mp3', makeTrack({ id: 'track-2' }), cache, deps);

    expect(fetchCount).toBe(1);
  });

  it('warns and still writes non-art tags when album art fetch returns non-2xx', async () => {
    const warnings: string[] = [];
    const writes: NodeID3.Tags[] = [];

    await tagFile('/tmp/song.mp3', makeTrack(), new Map(), {
      fetchFn: async () => new Response('not found', { status: 404 }),
      warn: (message) => warnings.push(message),
      writeTags: (tags) => {
        writes.push(tags);
        return true;
      },
    });

    expect(warnings).toEqual(['Album art fetch failed for album spotify-album-id: HTTP 404']);
    const tags = getWrittenTags(writes);
    expect(tags.image).toBeUndefined();
    expect(syncSourceValue(tags, 'SyncSource')).toBe('spotify');
    expect(syncSourceValue(tags, 'SyncSourceID')).toBe('spotify-track-id');
  });

  it('does not fetch arbitrary album image URLs', async () => {
    const warnings: string[] = [];
    const writes: NodeID3.Tags[] = [];
    let fetchCount = 0;

    await tagFile(
      '/tmp/song.mp3',
      makeTrack({
        album: {
          ...makeTrack().album,
          images: [{ url: 'https://example.com/cover.jpg', width: 640, height: 640 }],
        },
      }),
      new Map(),
      {
        fetchFn: async () => {
          fetchCount++;
          return successfulImageFetch();
        },
        warn: (message) => warnings.push(message),
        writeTags: (tags) => {
          writes.push(tags);
          return true;
        },
      },
    );

    expect(fetchCount).toBe(0);
    expect(warnings).toEqual([
      'Skipping album art for album spotify-album-id: no Spotify image URL',
    ]);
    expect(getWrittenTags(writes).image).toBeUndefined();
  });

  it('throws when the ID3 writer fails', async () => {
    const writeError = new Error('write failed');

    await expect(
      tagFile(
        '/tmp/song.mp3',
        makeTrack({ album: { ...makeTrack().album, images: [] } }),
        new Map(),
        {
          writeTags: () => writeError,
        },
      ),
    ).rejects.toThrow(writeError);
  });
});

describe('tagFile MP3 integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'spotify-sync-tagging-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes tags to an MP3 and reads them back from the file', async () => {
    const filePath = join(tmpDir, 'tagged.mp3');
    copyFileSync(FIXTURE_MP3, filePath);

    await tagFile(filePath, makeTrack(), new Map(), {
      fetchFn: successfulImageFetch,
    });

    const tags = NodeID3.read(filePath);
    expect(tags.title).toBe('Canonical Title');
    expect(tags.artist).toBe('Primary Artist');
    expect(tags.performerInfo).toBe('Primary Artist;Featured Artist');
    expect(tags.album).toBe('Canonical Album');
    expect(tags.year).toBe('2024');
    expect(tags.recordingTime).toBe('2024');
    expect(tags.trackNumber).toBe('7');
    expect(tags.userDefinedText).toEqual(
      expect.arrayContaining([
        { description: 'SyncSource', value: 'spotify' },
        { description: 'SyncSourceID', value: 'spotify-track-id' },
      ]),
    );
    expect(tags.image).toMatchObject({
      mime: 'image/png',
      description: 'Front cover',
      type: { id: NodeID3.TagConstants.AttachedPicture.PictureType.FRONT_COVER },
    });
    expect(tags.image?.imageBuffer).toEqual(PNG_BYTES);

    const raw = tags.raw as Record<string, unknown>;
    expect(raw.TPE1).toBe('Primary Artist');
    expect(raw.TPE2).toBe('Primary Artist;Featured Artist');
    expect(raw.TIT2).toBe('Canonical Title');
    expect(raw.TALB).toBe('Canonical Album');
    expect(raw.TYER).toBe('2024');
    expect(raw.TDRC).toBe('2024');
    expect(raw.TRCK).toBe('7');
    expect(raw.TXXX).toEqual(
      expect.arrayContaining([
        { description: 'SyncSource', value: 'spotify' },
        { description: 'SyncSourceID', value: 'spotify-track-id' },
      ]),
    );
    expect(raw.APIC).toMatchObject({
      mime: 'image/png',
      description: 'Front cover',
    });
  });
});
