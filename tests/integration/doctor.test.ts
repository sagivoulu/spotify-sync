import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CheckResult } from '../../src/doctor/types.js';
import { buildChildEnv } from './helpers/env.js';
import { createFakeBins, type FakeBins } from './helpers/fake-bins.js';
import { runCliJson } from './helpers/run-cli.js';
import { createSandbox, type Sandbox } from './helpers/sandbox.js';
import { seedAuth } from './helpers/seed-auth.js';

// ---------------------------------------------------------------------------
// doctor integration test
//
// Covers AC: "status / doctor: correct dependency detection and version output"
//
// Runs `spotify-sync doctor --json` against real Spotify and fake yt-dlp/ffmpeg.
// All five checks (Config, Auth, yt-dlp, ffmpeg, Spotify) should pass.
// ---------------------------------------------------------------------------

const useRealDownloads = Boolean(process.env.INTEGRATION_REAL_DOWNLOADS);

describe('doctor', () => {
  let sandbox: Sandbox;
  let fakeBins: FakeBins | null = null;

  beforeEach(() => {
    sandbox = createSandbox();
    if (!useRealDownloads) {
      fakeBins = createFakeBins();
    }
    seedAuth(sandbox.configDir);
  });

  afterEach(() => {
    sandbox.teardown();
    fakeBins?.teardown();
    fakeBins = null;
  });

  it('reports ok=true with all checks passing when setup is correct', async () => {
    const { result, exitCode, stderr } = await runCliJson<{ ok: boolean; checks: CheckResult[] }>({
      args: ['doctor', '--json'],
      env: buildChildEnv(sandbox, fakeBins),
    });

    expect(exitCode, `doctor exited ${exitCode}, stderr: ${stderr}`).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.checks).toHaveLength(5); // Config, Auth, yt-dlp, ffmpeg, Spotify

    for (const check of result.checks) {
      expect(check.ok, `check "${check.name}" failed: ${check.detail}`).toBe(true);
    }

    // Binary checks carry version data
    const ytDlp = result.checks.find((c) => c.name === 'yt-dlp');
    expect(ytDlp?.data?.version).toBeTruthy();

    const ffmpeg = result.checks.find((c) => c.name === 'ffmpeg');
    expect(ffmpeg?.data?.version).toBeTruthy();

    // Spotify check carries playlist data
    const spotify = result.checks.find((c) => c.name === 'Spotify');
    expect(spotify?.data?.playlistName).toBeTruthy();
    expect(spotify?.data?.trackCount).toBeGreaterThan(0);
  });
});
