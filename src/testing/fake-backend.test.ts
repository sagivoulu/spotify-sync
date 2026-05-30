// ---------------------------------------------------------------------------
// FakeBackend sanity tests.
//
// Verifies that FakeBackend correctly implements DownloadBackend and that
// its configurable overrides work as documented.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { BackendError } from '../backend/types.js';
import { createFakeBackend } from './fake-backend.js';

describe('createFakeBackend', () => {
  it('has name "fake"', () => {
    expect(createFakeBackend().name).toBe('fake');
  });

  it('search returns the default candidate when no opts given', async () => {
    const backend = createFakeBackend();
    const results = await backend.search({ artist: 'Any', title: 'Song' });

    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBeTruthy();
    expect(results[0]?.sourceLabel).toBeTruthy();
  });

  it('search returns custom searchResults when provided', async () => {
    const custom = [
      {
        url: 'https://custom.example/1',
        sourceLabel: 'youtube',
        title: 'Custom',
        durationMs: 120_000,
      },
    ];
    const backend = createFakeBackend({ searchResults: custom });
    const results = await backend.search({ artist: 'A', title: 'B' });

    expect(results).toEqual(custom);
  });

  it('search returns [] when searchResults is an empty array', async () => {
    const backend = createFakeBackend({ searchResults: [] });
    const results = await backend.search({ artist: 'A', title: 'B' });
    expect(results).toHaveLength(0);
  });

  it('search throws BackendError when searchError is set', async () => {
    const backend = createFakeBackend({ searchError: 'no results found' });
    await expect(backend.search({ artist: 'A', title: 'B' })).rejects.toThrow(BackendError);
    await expect(backend.search({ artist: 'A', title: 'B' })).rejects.toThrow('no results found');
  });

  it('download returns success with filePath = outPath + codec extension', async () => {
    const backend = createFakeBackend();
    const candidate = { url: 'https://yt.com/watch?v=1', sourceLabel: 'youtube' };

    const result = await backend.download(candidate, {
      outPath: '/music/track',
      format: { codec: 'mp3', bitrateKbps: 320 },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.filePath).toBe('/music/track.mp3');
      expect(result.backend).toBe('fake');
      expect(result.candidate).toBe(candidate);
    }
  });

  it('download returns the override downloadResult when set', async () => {
    const fixedResult = { success: false as const, error: 'forced failure' };
    const backend = createFakeBackend({ downloadResult: fixedResult });
    const candidate = { url: 'https://yt.com/watch?v=1', sourceLabel: 'youtube' };

    const result = await backend.download(candidate, {
      outPath: '/music/track',
      format: { codec: 'mp3', bitrateKbps: 320 },
    });

    expect(result).toEqual(fixedResult);
  });

  it('download uses m4a extension when format.codec is m4a', async () => {
    const backend = createFakeBackend();
    const candidate = { url: 'https://yt.com/watch?v=2', sourceLabel: 'youtube' };

    const result = await backend.download(candidate, {
      outPath: '/music/other',
      format: { codec: 'm4a' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.filePath).toBe('/music/other.m4a');
    }
  });
});
