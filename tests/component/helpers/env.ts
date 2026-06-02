import type { FakeBins } from './fake-bins.js';
import type { Sandbox } from './sandbox.js';

// ---------------------------------------------------------------------------
// buildChildEnv — assemble the environment for a child CLI invocation.
//
// All Spotify credentials are dummy values — no real account or tokens are
// needed. The fake Spotify server URL (started by setup.ts and inherited via
// process.env.COMPONENT_FAKE_SPOTIFY_BASE_URL) is injected as
// SPOTIFY_SYNC_SPOTIFY_BASE_URL, which triggers the URL-rewrite seam in
// src/spotify/client.ts (wrappedFetch) to redirect API calls to the fake server.
//
// XDG_* variables isolate the child from the developer's real home dirs.
// SPOTIFY_SYNC_LIBRARY_PATH and SPOTIFY_SYNC_DB_PATH are explicit overrides
// that pin storage to the sandbox without needing a config.json file.
// ---------------------------------------------------------------------------

export function buildChildEnv(
  sandbox: Sandbox,
  fakeBins: FakeBins | null,
  overrides: Record<string, string> = {},
): Record<string, string | undefined> {
  return {
    // XDG isolation
    XDG_CONFIG_HOME: sandbox.xdg.config,
    XDG_DATA_HOME: sandbox.xdg.data,
    XDG_STATE_HOME: sandbox.xdg.state,

    // Fake Spotify credentials — the config schema requires min(1) strings
    SPOTIFY_SYNC_SPOTIFY_CLIENT_ID: 'fake-client-id',
    SPOTIFY_SYNC_SPOTIFY_CLIENT_SECRET: 'fake-client-secret',
    // Default to the FULL playlist; tests that need SUBSET override this.
    SPOTIFY_SYNC_SPOTIFY_PLAYLIST_URL: 'https://open.spotify.com/playlist/testplayfull',

    // Redirect all Spotify API calls to the local fake server
    SPOTIFY_SYNC_SPOTIFY_BASE_URL: process.env.COMPONENT_FAKE_SPOTIFY_BASE_URL,

    // Explicit storage paths
    SPOTIFY_SYNC_LIBRARY_PATH: sandbox.libraryPath,
    SPOTIFY_SYNC_DB_PATH: sandbox.dbPath,

    // Fake yt-dlp / ffmpeg (null = use real binaries)
    ...(fakeBins ? fakeBins.env : {}),

    // Per-test overrides (highest priority)
    ...overrides,
  };
}
