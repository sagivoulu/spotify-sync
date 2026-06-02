import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// FakeBins — hermetic yt-dlp and ffmpeg stand-ins.
//
// Used by default (skip when COMPONENT_REAL_DOWNLOADS=1 for opt-in real downloads).
// Both scripts are plain CommonJS Node programs written to a temp directory
// outside the project (so they don't inherit "type": "module" from package.json).
//
// Fake yt-dlp contract (mirrors src/backend/yt-dlp.ts expectations):
//   --version              → stdout: YYYY.MM.DD ≥ MINIMUM_YTDLP_VERSION; exit 0
//   --dump-json [search]   → stdout: one canned JSON object; exit 0
//   -x -o <template> [dl]  → copy silence.mp3 fixture to <template>.mp3; exit 0
//
// Fake ffmpeg:
//   -version               → stdout: version line; exit 0
//   (yt-dlp invokes ffmpeg for audio conversion internally; the fake yt-dlp
//    never actually shells out to ffmpeg, so only -version needs handling.)
//
// The fake yt-dlp version (2026.06.01) is ≥ MINIMUM_YTDLP_VERSION (2026.01.01).
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const SILENCE_MP3_FIXTURE = resolve(REPO_ROOT, 'src/tagging/fixtures/silence.mp3');

const FAKE_YTDLP_VERSION = '2026.06.01';

const FAKE_YTDLP_SCRIPT = `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);

if (args.includes('--version')) {
  process.stdout.write('${FAKE_YTDLP_VERSION}\\n');
  process.exit(0);
}

if (args.includes('--dump-json')) {
  process.stdout.write(JSON.stringify({
    webpage_url: 'https://www.youtube.com/watch?v=dGFSjKuJFrM',
    title: 'Fake Component Test Track',
    duration: 30,
    extractor: 'youtube',
    extractor_key: 'Youtube',
  }) + '\\n');
  process.exit(0);
}

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
process.stdout.write('ffmpeg version 6.1.1 Copyright (c) 2000-2023 the FFmpeg developers\\n');
process.exit(0);
`;

export interface FakeBins {
  binDir: string;
  env: Record<string, string>;
  teardown(): void;
}

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
