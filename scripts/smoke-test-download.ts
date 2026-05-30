/**
 * WES-23 — M3 smoke test: end-to-end single-track download
 *
 * Exercises WES-10 (download backend), WES-11 (filename/placement), and
 * WES-12 (ID3 tagging) together against real infrastructure.
 *
 * NOT part of the test suite. NOT run in CI. Manual validation only.
 *
 * Usage:
 *   npx tsx scripts/smoke-test-download.ts
 *
 * Env overrides (all optional):
 *   SMOKE_TRACK_ID   — Spotify track ID (default: Uptown Funk)
 *   SMOKE_ARTIST     — artist name
 *   SMOKE_TITLE      — track title
 *   SMOKE_ALBUM      — album name
 *   SMOKE_YEAR       — release year (integer string)
 *   SMOKE_DURATION   — track duration in ms (used as search hint)
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import NodeID3 from 'node-id3';
import { createYtDlpBackend } from '../src/backend/yt-dlp.js';
import { buildFilename, placeDownloadedFile } from '../src/library/index.js';
import { tagFile } from '../src/tagging/index.js';
import type { AlbumArtCache, TaggableTrack } from '../src/tagging/index.js';
import type { AudioFormat } from '../src/backend/index.js';

// ---------------------------------------------------------------------------
// Hardcoded track — Uptown Funk (feat. Bruno Mars) by Mark Ronson
// Real Spotify metadata; album art URL verified against i.scdn.co CDN.
// Override any field via env vars documented at the top of this file.
// ---------------------------------------------------------------------------
const TRACK: TaggableTrack = {
  id: process.env.SMOKE_TRACK_ID ?? '32OlwWuMpZ6b0aN2RZOeMS',
  title: process.env.SMOKE_TITLE ?? 'Uptown Funk (feat. Bruno Mars)',
  artists: [process.env.SMOKE_ARTIST ?? 'Mark Ronson'],
  album: {
    // Album ID is only a cache key within this run — exact value doesn't matter.
    id: 'album_uptown_special',
    name: process.env.SMOKE_ALBUM ?? 'Uptown Special',
    images: [
      // 640×640 — verified live 2026-05-30
      {
        url: 'https://i.scdn.co/image/ab67616d0000b2739860171ddfee17f77a570cf6',
        width: 640,
        height: 640,
      },
    ],
  },
  releaseYear: process.env.SMOKE_YEAR ? Number(process.env.SMOKE_YEAR) : 2015,
  trackNumber: 4,
  durationMs: process.env.SMOKE_DURATION ? Number(process.env.SMOKE_DURATION) : 269000,
};

const FORMAT: AudioFormat = { codec: 'mp3', bitrateKbps: 320 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Runs a named stage; on error prints which module failed and exits non-zero. */
async function stage<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ ${label} failed: ${msg}`);
    process.exit(1);
  }
}

function hr() {
  console.log('─'.repeat(60));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const artist = TRACK.artists[0] ?? '';
  const { title } = TRACK;

  console.log('\n🎵  spotify-sync M3 smoke test — single-track download\n');
  hr();
  console.log(`  Artist  : ${artist}`);
  console.log(`  Title   : ${title}`);
  console.log(`  Track ID: ${TRACK.id}`);
  console.log(`  Format  : ${FORMAT.codec.toUpperCase()} @ ${FORMAT.bitrateKbps ?? 'native'} kbps`);
  hr();
  console.log();

  // ── 1. Setup temp dirs ─────────────────────────────────────────────────────
  const tmpBase = os.tmpdir();
  const downloadDir = fs.mkdtempSync(path.join(tmpBase, 'spotify-sync-smoke-dl-'));
  const libraryDir = fs.mkdtempSync(path.join(tmpBase, 'spotify-sync-smoke-lib-'));
  console.log(`  Temp download dir : ${downloadDir}`);
  console.log(`  Temp library dir  : ${libraryDir}\n`);

  // ── 2. Search ──────────────────────────────────────────────────────────────
  const backend = createYtDlpBackend();
  process.stdout.write(`[1/5] Searching via ${backend.name}...`);

  const candidates = await stage('search (backend)', async () => {
    const results = await backend.search({ artist, title, durationMs: TRACK.durationMs });
    if (results.length === 0) throw new Error('search returned no candidates');
    return results;
  });

  const top = candidates[0];
  console.log(' done');
  console.log(`       ↳ "${top.title ?? '(untitled)'}" via ${top.sourceLabel}`);
  if (top.durationMs !== undefined) {
    const s = (top.durationMs / 1000).toFixed(0);
    console.log(`       ↳ duration: ${s}s`);
  }

  // ── 3. Download ────────────────────────────────────────────────────────────
  const outPath = path.join(downloadDir, 'download');
  process.stdout.write('\n[2/5] Downloading (this may take a while)...');

  const downloadResult = await stage('download (backend)', async () => {
    const result = await backend.download(top, { outPath, format: FORMAT });
    if (!result.success) throw new Error(result.error);
    return result;
  });

  console.log(' done');
  console.log(`       ↳ ${downloadResult.filePath}`);
  console.log(`       ↳ size: ${(fs.statSync(downloadResult.filePath).size / 1024).toFixed(1)} KB`);

  // ── 4. Build filename ──────────────────────────────────────────────────────
  process.stdout.write('\n[3/5] Building filename...');

  const filename = buildFilename({ artist, title, ext: 'mp3' });

  console.log(' done');
  console.log(`       ↳ ${filename}`);

  // ── 5. Place file ──────────────────────────────────────────────────────────
  process.stdout.write('\n[4/5] Placing file into library dir...');

  const finalPath = await stage('file placement (library)', async () => {
    return placeDownloadedFile(downloadResult.filePath, libraryDir, filename);
  });

  console.log(' done');
  console.log(`       ↳ ${finalPath}`);

  // ── 6. Tag ─────────────────────────────────────────────────────────────────
  const albumArtCache: AlbumArtCache = new Map();
  process.stdout.write('\n[5/5] Writing ID3 tags...');

  await stage('tagging', async () => {
    await tagFile(finalPath, TRACK, albumArtCache, {
      warn: (msg) => process.stdout.write(`\n       ⚠  ${msg}`),
    });
  });

  console.log(' done');

  // ── 7. Verify ──────────────────────────────────────────────────────────────
  console.log('\n');
  hr();
  console.log('  Verification — reading tags back');
  hr();

  const stat = fs.statSync(finalPath);
  console.log(`  File path : ${finalPath}`);
  console.log(`  File size : ${(stat.size / 1024).toFixed(1)} KB`);
  console.log();

  const tags = NodeID3.read(finalPath);
  const userDefined = Object.fromEntries(
    (tags.userDefinedText ?? []).map((f) => [f.description, f.value]),
  );

  type Check = [label: string, pass: boolean, detail: string];
  const checks: Check[] = [
    [
      'title',
      tags.title === title,
      `"${tags.title}" (expected "${title}")`,
    ],
    [
      'artist',
      tags.artist === artist,
      `"${tags.artist}" (expected "${artist}")`,
    ],
    [
      'album',
      tags.album === TRACK.album.name,
      `"${tags.album}"`,
    ],
    [
      'year',
      tags.year === String(TRACK.releaseYear),
      `"${tags.year}"`,
    ],
    [
      'SyncSource = spotify',
      userDefined['SyncSource'] === 'spotify',
      `"${userDefined['SyncSource'] ?? '(missing)'}"`,
    ],
    [
      'SyncSourceID matches track ID',
      userDefined['SyncSourceID'] === TRACK.id,
      `"${userDefined['SyncSourceID'] ?? '(missing)'}"`,
    ],
    [
      'album art embedded',
      tags.image !== undefined,
      tags.image !== undefined ? 'yes' : 'not embedded (art fetch may have failed)',
    ],
  ];

  let allPassed = true;
  for (const [label, pass, detail] of checks) {
    const icon = pass ? '✓' : '✗';
    console.log(`  ${icon}  ${label}: ${detail}`);
    if (!pass) allPassed = false;
  }

  console.log();
  hr();

  if (!allPassed) {
    console.error('\n✗  Some assertions failed — see above.\n');
    process.exit(1);
  }

  console.log('\n✓  All checks passed — M3 pipeline is green! 🎉\n');
}

main().catch((err: unknown) => {
  console.error('\nUnexpected error:', err);
  process.exit(1);
});
