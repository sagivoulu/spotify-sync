// ---------------------------------------------------------------------------
// yt-dlp backend unit tests.
//
// All subprocess calls use an injected mock runner — no real yt-dlp or ffmpeg
// binary is required. One optional live test is gated behind LIVE_BACKEND_TEST=1.
// ---------------------------------------------------------------------------

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BackendError } from './types.js';
import {
  buildSearchArgs,
  buildSearchTarget,
  createYtDlpBackend,
  getFfmpegVersion,
  getYtDlpVersion,
} from './yt-dlp.js';
import type { RunResult, SubprocessRunner } from './yt-dlp.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a runner that returns the given result for any binary/args. */
function makeRunner(result: RunResult): SubprocessRunner {
  return async (_binary, _args) => result;
}

/** Runner that throws ENOENT (simulates binary not found). */
const enoentRunner: SubprocessRunner = async () => {
  const err = Object.assign(new Error('spawn yt-dlp ENOENT'), { code: 'ENOENT' });
  throw err;
};

/** Minimal yt-dlp --dump-json output for a YouTube Music result. */
const FAKE_YT_DUMP = JSON.stringify({
  id: 'abc123',
  title: 'Fake Song',
  webpage_url: 'https://www.youtube.com/watch?v=abc123',
  duration: 210.5,
  extractor: 'youtube',
  extractor_key: 'Youtube',
});

// ---------------------------------------------------------------------------
// buildSearchTarget
// ---------------------------------------------------------------------------

describe('buildSearchTarget', () => {
  it('youtube-music returns a music.youtube.com search URL with encoded query', () => {
    const target = buildSearchTarget('youtube-music', { artist: 'Test Artist', title: 'My Song' });
    expect(target).toBe('https://music.youtube.com/search?q=Test%20Artist%20My%20Song');
  });

  it('youtube returns a ytsearch1: prefix', () => {
    const target = buildSearchTarget('youtube', { artist: 'Test Artist', title: 'My Song' });
    expect(target).toBe('ytsearch1:Test Artist My Song');
  });

  it('throws a clear error for unknown search_source', () => {
    expect(() => buildSearchTarget('soundcloud', { artist: 'A', title: 'B' })).toThrow(
      /Unknown search_source "soundcloud"/,
    );
  });
});

// ---------------------------------------------------------------------------
// buildSearchArgs
// ---------------------------------------------------------------------------

describe('buildSearchArgs', () => {
  it('youtube-music args include -I 1 and --dump-json and the music.youtube.com URL', () => {
    const args = buildSearchArgs('youtube-music', { artist: 'Alice', title: 'Wonder' });
    expect(args).toContain('--dump-json');
    expect(args).toContain('-I');
    expect(args).toContain('1');
    const urlArg = args.find((a) => a.startsWith('https://music.youtube.com'));
    expect(urlArg).toBeDefined();
  });

  it('youtube args include --dump-json and ytsearch1: target, no -I flag', () => {
    const args = buildSearchArgs('youtube', { artist: 'Bob', title: 'Dylan' });
    expect(args).toContain('--dump-json');
    expect(args.includes('-I')).toBe(false);
    const searchArg = args.find((a) => a.startsWith('ytsearch1:'));
    expect(searchArg).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// createYtDlpBackend — search()
// ---------------------------------------------------------------------------

describe('YtDlpBackend.search', () => {
  it('parses a successful yt-dlp JSON response into a Candidate', async () => {
    const backend = createYtDlpBackend({
      searchSource: 'youtube-music',
      runner: makeRunner({ stdout: FAKE_YT_DUMP, stderr: '', code: 0 }),
    });

    const results = await backend.search({ artist: 'Test Artist', title: 'Fake Song' });

    expect(results).toHaveLength(1);
    const candidate = results[0];
    expect(candidate?.url).toBe('https://www.youtube.com/watch?v=abc123');
    expect(candidate?.title).toBe('Fake Song');
    expect(candidate?.sourceLabel).toBe('youtube');
    // duration: 210.5s → 210500ms (rounded)
    expect(candidate?.durationMs).toBe(210500);
  });

  it('returns [] for empty stdout (no results)', async () => {
    const backend = createYtDlpBackend({
      runner: makeRunner({ stdout: '', stderr: '', code: 0 }),
    });
    const results = await backend.search({ artist: 'A', title: 'B' });
    expect(results).toHaveLength(0);
  });

  it('returns [] for stdout with only whitespace/non-JSON lines', async () => {
    const backend = createYtDlpBackend({
      runner: makeRunner({ stdout: '\n  \n\n', stderr: '', code: 0 }),
    });
    const results = await backend.search({ artist: 'A', title: 'B' });
    expect(results).toHaveLength(0);
  });

  it('throws BackendError with captured stderr on non-zero exit', async () => {
    const backend = createYtDlpBackend({
      runner: makeRunner({ stdout: '', stderr: 'ERROR: No results', code: 1 }),
    });

    await expect(backend.search({ artist: 'X', title: 'Y' })).rejects.toThrow(BackendError);

    try {
      await backend.search({ artist: 'X', title: 'Y' });
    } catch (err) {
      expect(err).toBeInstanceOf(BackendError);
      expect((err as BackendError).stderr).toBe('ERROR: No results');
      expect((err as BackendError).exitCode).toBe(1);
    }
  });

  it('uses youtube search (ytsearch1:) when searchSource is "youtube"', async () => {
    let capturedArgs: string[] = [];
    const runner: SubprocessRunner = async (_binary, args) => {
      capturedArgs = args;
      return { stdout: FAKE_YT_DUMP, stderr: '', code: 0 };
    };

    const backend = createYtDlpBackend({ searchSource: 'youtube', runner });
    await backend.search({ artist: 'Bob', title: 'Song' });

    const searchTarget = capturedArgs.find((a) => a.startsWith('ytsearch1:'));
    expect(searchTarget).toBeDefined();
    expect(searchTarget).toContain('Bob');
    expect(searchTarget).toContain('Song');
  });

  it('uses music.youtube.com URL when searchSource is "youtube-music"', async () => {
    let capturedArgs: string[] = [];
    const runner: SubprocessRunner = async (_binary, args) => {
      capturedArgs = args;
      return { stdout: FAKE_YT_DUMP, stderr: '', code: 0 };
    };

    const backend = createYtDlpBackend({ searchSource: 'youtube-music', runner });
    await backend.search({ artist: 'Alice', title: 'Track' });

    const urlArg = capturedArgs.find((a) => a.startsWith('https://music.youtube.com'));
    expect(urlArg).toBeDefined();
  });

  it('only returns the top result when stdout has multiple JSON lines', async () => {
    const line2 = JSON.stringify({
      webpage_url: 'https://www.youtube.com/watch?v=second',
      title: 'Second Result',
      duration: 180,
      extractor: 'youtube',
    });
    const backend = createYtDlpBackend({
      runner: makeRunner({ stdout: `${FAKE_YT_DUMP}\n${line2}`, stderr: '', code: 0 }),
    });

    const results = await backend.search({ artist: 'A', title: 'B' });
    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe('https://www.youtube.com/watch?v=abc123');
  });
});

// ---------------------------------------------------------------------------
// createYtDlpBackend — download()
// ---------------------------------------------------------------------------

describe('YtDlpBackend.download', () => {
  const FAKE_CANDIDATE = {
    url: 'https://www.youtube.com/watch?v=abc123',
    sourceLabel: 'youtube',
    durationMs: 210_000,
    title: 'Fake Song',
  };

  it('returns success:true with filePath = outPath + .mp3 on exit 0', async () => {
    const backend = createYtDlpBackend({
      runner: makeRunner({ stdout: '', stderr: '', code: 0 }),
    });

    const result = await backend.download(FAKE_CANDIDATE, {
      outPath: '/tmp/test-track',
      format: { codec: 'mp3', bitrateKbps: 320 },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.filePath).toBe('/tmp/test-track.mp3');
      expect(result.backend).toBe('yt-dlp');
      expect(result.candidate).toBe(FAKE_CANDIDATE);
    }
  });

  it('returns success:false with captured stderr on non-zero exit', async () => {
    const backend = createYtDlpBackend({
      runner: makeRunner({
        stdout: '',
        stderr: 'ERROR: This video is unavailable.',
        code: 1,
      }),
    });

    const result = await backend.download(FAKE_CANDIDATE, {
      outPath: '/tmp/fail-track',
      format: { codec: 'mp3', bitrateKbps: 320 },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('This video is unavailable');
    }
  });

  it('includes --audio-quality flag for mp3 with bitrate', async () => {
    let capturedArgs: string[] = [];
    const runner: SubprocessRunner = async (_binary, args) => {
      capturedArgs = args;
      return { stdout: '', stderr: '', code: 0 };
    };

    const backend = createYtDlpBackend({ runner });
    await backend.download(FAKE_CANDIDATE, {
      outPath: '/tmp/test',
      format: { codec: 'mp3', bitrateKbps: 320 },
    });

    const qualityIdx = capturedArgs.indexOf('--audio-quality');
    expect(qualityIdx).toBeGreaterThan(-1);
    expect(capturedArgs[qualityIdx + 1]).toBe('320k');
  });

  it('omits --audio-quality for m4a (passthrough)', async () => {
    let capturedArgs: string[] = [];
    const runner: SubprocessRunner = async (_binary, args) => {
      capturedArgs = args;
      return { stdout: '', stderr: '', code: 0 };
    };

    const backend = createYtDlpBackend({ runner });
    await backend.download(FAKE_CANDIDATE, {
      outPath: '/tmp/test',
      format: { codec: 'm4a' },
    });

    expect(capturedArgs.includes('--audio-quality')).toBe(false);
    expect(capturedArgs).toContain('m4a');
  });

  it('passes the correct output template to yt-dlp', async () => {
    let capturedArgs: string[] = [];
    const runner: SubprocessRunner = async (_binary, args) => {
      capturedArgs = args;
      return { stdout: '', stderr: '', code: 0 };
    };

    const backend = createYtDlpBackend({ runner });
    await backend.download(FAKE_CANDIDATE, {
      outPath: '/tmp/my track',
      format: { codec: 'mp3', bitrateKbps: 192 },
    });

    const oIdx = capturedArgs.indexOf('-o');
    expect(oIdx).toBeGreaterThan(-1);
    expect(capturedArgs[oIdx + 1]).toBe('/tmp/my track.%(ext)s');
  });

  it('returns success:false (not throws) when runner throws ENOENT', async () => {
    const backend = createYtDlpBackend({ runner: enoentRunner });

    const result = await backend.download(FAKE_CANDIDATE, {
      outPath: '/tmp/test',
      format: { codec: 'mp3', bitrateKbps: 320 },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/ENOENT/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Version probes
// ---------------------------------------------------------------------------

describe('getYtDlpVersion', () => {
  it('returns available:true and parsed version on exit 0', async () => {
    const result = await getYtDlpVersion(
      makeRunner({ stdout: '2024.12.13\n', stderr: '', code: 0 }),
    );
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.version).toBe('2024.12.13');
    }
  });

  it('returns available:false on non-zero exit', async () => {
    const result = await getYtDlpVersion(makeRunner({ stdout: '', stderr: 'error', code: 1 }));
    expect(result.available).toBe(false);
  });

  it('returns available:false when runner throws ENOENT', async () => {
    const result = await getYtDlpVersion(enoentRunner);
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.error).toBeTruthy();
    }
  });
});

describe('getFfmpegVersion', () => {
  it('parses the version from ffmpeg -version stdout', async () => {
    const stdout =
      'ffmpeg version 6.0 Copyright (c) 2000-2023 the FFmpeg developers\n' +
      '  built with Apple clang version 14.0.3\n';
    const result = await getFfmpegVersion(makeRunner({ stdout, stderr: '', code: 0 }));
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.version).toBe('6.0');
    }
  });

  it('returns available:false when runner throws ENOENT', async () => {
    const result = await getFfmpegVersion(enoentRunner);
    expect(result.available).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Live test — gated behind LIVE_BACKEND_TEST=1
// Exercises the real yt-dlp binary and requires both yt-dlp and ffmpeg on PATH.
// ---------------------------------------------------------------------------

const LIVE = process.env.LIVE_BACKEND_TEST === '1';

describe.skipIf(!LIVE)('live yt-dlp backend (LIVE_BACKEND_TEST=1)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'spotify-sync-live-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('searches YouTube Music and finds a top candidate', async () => {
    const backend = createYtDlpBackend({ searchSource: 'youtube-music' });
    // "Numb" by Linkin Park — highly stable, available on YouTube Music
    const results = await backend.search({ artist: 'Linkin Park', title: 'Numb' });

    expect(results.length).toBeGreaterThan(0);
    const candidate = results[0];
    expect(candidate?.url).toBeTruthy();
    expect(candidate?.url).toMatch(/youtube/);
  }, 30_000);

  it('downloads a short track to a temp file', async () => {
    const { existsSync } = await import('node:fs');

    const backend = createYtDlpBackend({ searchSource: 'youtube' });
    // A very short known-stable video on YouTube: "Never Gonna Give You Up" – Rick Astley
    // We search and take the first result to keep the test realistic.
    const results = await backend.search({
      artist: 'Rick Astley',
      title: 'Never Gonna Give You Up',
    });
    expect(results.length).toBeGreaterThan(0);

    const topResult = results[0];
    if (!topResult) throw new Error('Expected at least one search result');

    const outPath = join(tmpDir, 'test-track');
    const result = await backend.download(topResult, {
      outPath,
      format: { codec: 'mp3', bitrateKbps: 128 },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(existsSync(result.filePath)).toBe(true);
      expect(result.backend).toBe('yt-dlp');
    }
  }, 120_000);
});
