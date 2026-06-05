import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// FakeBins — hermetic yt-dlp and ffmpeg stand-ins.
//
// Scripts live in tests/component/helpers/scripts/ as proper .cjs files (no
// embedded strings, full syntax highlighting). createFakeBins() reads them and
// copies them into a temp dir that is prepended to the child process PATH.
//
// Skip this and set COMPONENT_REAL_DOWNLOADS=1 to use the real binaries.
// ---------------------------------------------------------------------------

const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'scripts');

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const SILENCE_MP3_FIXTURE = resolve(REPO_ROOT, 'src/tagging/fixtures/silence.mp3');

export interface FakeBins {
  binDir: string;
  env: Record<string, string>;
  teardown(): void;
}

export function createFakeBins(): FakeBins {
  const binDir = mkdtempSync(join(tmpdir(), 'spotify-sync-fake-bins-'));

  const ytDlpPath = join(binDir, 'yt-dlp');
  const ffmpegPath = join(binDir, 'ffmpeg');

  writeFileSync(ytDlpPath, readFileSync(join(SCRIPTS_DIR, 'fake-yt-dlp.cjs')));
  writeFileSync(ffmpegPath, readFileSync(join(SCRIPTS_DIR, 'fake-ffmpeg.cjs')));
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
