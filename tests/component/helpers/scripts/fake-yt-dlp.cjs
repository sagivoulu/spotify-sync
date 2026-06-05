#!/usr/bin/env node
// Fake yt-dlp binary used by the component test suite.
// Copied into a temp dir and placed on PATH so the binary finds it instead of the real yt-dlp.
//
// Handles the three invocation patterns spotify-sync uses:
//   --version           → print a version ≥ MINIMUM_YTDLP_VERSION (2026.01.01); exit 0
//   --dump-json <url>   → print one JSON object on stdout (search result); exit 0
//   -x -o <template>    → copy the MP3 fixture to <template>.mp3 (download); exit 0
//
// FAKE_YTDLP_FIXTURE_PATH must be set in the environment — it points to silence.mp3.
// This file is intentionally CommonJS (.cjs) so it runs standalone without needing
// a package.json with "type": "module".

'use strict';
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);

// --version probe (used by doctor and the sync preflight check)
if (args.includes('--version')) {
  process.stdout.write('2026.06.01\n');
  process.exit(0);
}

// Search mode: --dump-json is present
if (args.includes('--dump-json')) {
  process.stdout.write(
    JSON.stringify({
      webpage_url: 'https://www.youtube.com/watch?v=dGFSjKuJFrM',
      title: 'Fake Component Test Track',
      duration: 30,
      extractor: 'youtube',
      extractor_key: 'Youtube',
    }) + '\n',
  );
  process.exit(0);
}

// Download mode: find the -o argument and copy the fixture to the resolved path
const oIdx = args.indexOf('-o');
if (oIdx === -1 || oIdx + 1 >= args.length) {
  process.stderr.write('fake-yt-dlp: expected -o <outPath>.%(ext)s\n');
  process.exit(1);
}

const outTemplate = args[oIdx + 1];
const outPath = outTemplate.replace('%(ext)s', 'mp3');
const fixturePath = process.env.FAKE_YTDLP_FIXTURE_PATH;

if (!fixturePath) {
  process.stderr.write('fake-yt-dlp: FAKE_YTDLP_FIXTURE_PATH is not set\n');
  process.exit(1);
}

try {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.copyFileSync(fixturePath, outPath);
} catch (err) {
  process.stderr.write('fake-yt-dlp: ' + err.message + '\n');
  process.exit(1);
}

process.exit(0);
