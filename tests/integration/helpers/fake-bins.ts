import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// FakeBins — hermetic yt-dlp and ffmpeg stand-ins.
//
// Used when INTEGRATION_REAL_DOWNLOADS is not set (the default in CI).
// Both scripts are plain CommonJS Node programs written to a temp directory
// (outside the project, so they don't inherit "type": "module").
//
// Fake yt-dlp contract (mirrors src/backend/yt-dlp.ts expectations):
//   --version              → stdout: YYYY.MM.DD date ≥ MINIMUM_YTDLP_VERSION; exit 0
//   --dump-json [search]   → stdout: one JSON line with webpage_url/title/duration; exit 0
//   -x -o <outPath> [dl]   → copy silence.mp3 fixture to <outPath>.mp3; exit 0
//
// Fake ffmpeg contract:
//   -version               → stdout: version line; exit 0
//   (yt-dlp invokes ffmpeg internally for -x --audio-format; when yt-dlp is faked
//    it never actually shells out to ffmpeg, so the fake only needs -version for
//    the `doctor` check.)
//
// The path to silence.mp3 is injected via FAKE_YTDLP_FIXTURE_PATH in the child env.
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const SILENCE_MP3_FIXTURE = resolve(REPO_ROOT, 'src/tagging/fixtures/silence.mp3');

// The fake version string must be ≥ MINIMUM_YTDLP_VERSION = '2026.01.01'
const FAKE_YTDLP_VERSION = '2026.06.01';

const FAKE_YTDLP_SCRIPT = `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);

// --version probe (used by doctor and sync preflight)
if (args.includes('--version')) {
  process.stdout.write('${FAKE_YTDLP_VERSION}\\n');
  process.exit(0);
}

// Search mode: --dump-json is present
if (args.includes('--dump-json')) {
  process.stdout.write(JSON.stringify({
    webpage_url: 'https://www.youtube.com/watch?v=dGFSjKuJFrM',
    title: 'Fake Integration Test Track',
    duration: 30,
    extractor: 'youtube',
    extractor_key: 'Youtube',
  }) + '\\n');
  process.exit(0);
}

// Download mode: find -o arg, derive output path, copy fixture
const oIdx = args.indexOf('-o');
if (oIdx === -1 || oIdx + 1 >= args.length) {
  process.stderr.write('fake-yt-dlp: expected -o <outPath>.%(ext)s\\n');
  process.exit(1);
}
const outTemplate = args[oIdx + 1];
const outPath = outTemplate.replace('%(ext)s', 'mp3');
const fixturePath = process.env.FAKE_YTDLP_FIXTURE_PATH;
if (!fixturePath) {
  process.stderr.write('fake-yt-dlp: FAKE_YTDLP_FIXTURE_PATH not set\\n');
  process.exit(1);
}
try {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.copyFileSync(fixturePath, outPath);
} catch (err) {
  process.stderr.write('fake-yt-dlp: ' + err.message + '\\n');
  process.exit(1);
}
process.exit(0);
`;

const FAKE_FFMPEG_SCRIPT = `#!/usr/bin/env node
'use strict';
// Respond to -version (used by doctor's ffmpeg check).
// All other invocations (audio conversion) are irrelevant when yt-dlp is faked.
process.stdout.write('ffmpeg version 6.1.1 Copyright (c) 2000-2023 the FFmpeg developers\\n');
process.exit(0);
`;

export interface FakeBins {
  /** Absolute path to the temp dir that contains the fake binaries. */
  binDir: string;
  /**
   * Env vars to merge into the child env:
   *   PATH: binDir prepended so fake binaries shadow the real ones
   *   FAKE_YTDLP_FIXTURE_PATH: path to silence.mp3 used as the "downloaded" file
   */
  env: Record<string, string>;
  /** Remove the temp dir. Call in afterEach. */
  teardown(): void;
}

/**
 * Create hermetic fake yt-dlp and ffmpeg binaries in a temp directory.
 *
 * Skip this and set INTEGRATION_REAL_DOWNLOADS=1 to use the real binaries.
 */
export function createFakeBins(): FakeBins {
  const binDir = mkdtempSync(join(tmpdir(), 'spotify-sync-fake-bins-'));

  const ytDlpPath = join(binDir, 'yt-dlp');
  const ffmpegPath = join(binDir, 'ffmpeg');

  writeFileSync(ytDlpPath, FAKE_YTDLP_SCRIPT, { encoding: 'utf-8' });
  writeFileSync(ffmpegPath, FAKE_FFMPEG_SCRIPT, { encoding: 'utf-8' });
  chmodSync(ytDlpPath, 0o755);
  chmodSync(ffmpegPath, 0o755);

  return {
    binDir,
    env: {
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      FAKE_YTDLP_FIXTURE_PATH: SILENCE_MP3_FIXTURE,
    },
    teardown: () => rmSync(binDir, { recursive: true, force: true }),
  };
}
