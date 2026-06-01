import type { FakeBins } from './fake-bins.js';
import type { Sandbox } from './sandbox.js';

// ---------------------------------------------------------------------------
// buildChildEnv — assemble the environment for a child CLI invocation.
//
// Translates the CI secret names (SPOTIFY_CLIENT_ID etc.) to the binary's
// SPOTIFY_SYNC_* config env var names (from src/config/schema.ts convention).
//
// The XDG_* variables isolate the child from the developer's real home dirs.
// SPOTIFY_SYNC_LIBRARY_PATH and SPOTIFY_SYNC_DB_PATH are set to the sandbox
// paths — no need for a config.json file.
//
// fakeBins injects a fake yt-dlp + ffmpeg on PATH.  Pass null (or omit) to
// use the real binaries (INTEGRATION_REAL_DOWNLOADS=1 scenarios).
//
// overrides are merged last, letting individual tests replace specific vars
// (e.g. a different playlist URL for the prune test's subset playlist).
// ---------------------------------------------------------------------------

export function buildChildEnv(
  sandbox: Sandbox,
  fakeBins: FakeBins | null,
  overrides: Record<string, string> = {},
): Record<string, string | undefined> {
  return {
    // XDG isolation — redirects all config/data/state out of $HOME
    XDG_CONFIG_HOME: sandbox.xdg.config,
    XDG_DATA_HOME: sandbox.xdg.data,
    XDG_STATE_HOME: sandbox.xdg.state,

    // Spotify application credentials → config env var names
    SPOTIFY_SYNC_SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
    SPOTIFY_SYNC_SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
    SPOTIFY_SYNC_SPOTIFY_PLAYLIST_URL: process.env.SPOTIFY_PLAYLIST_URL,

    // Storage paths — explicit overrides so there's no ambiguity
    SPOTIFY_SYNC_LIBRARY_PATH: sandbox.libraryPath,
    SPOTIFY_SYNC_DB_PATH: sandbox.dbPath,

    // Fake binary PATH + fixture path (when not doing real downloads)
    ...(fakeBins ? fakeBins.env : {}),

    // Per-test overrides (highest priority — applied last)
    ...overrides,
  };
}
