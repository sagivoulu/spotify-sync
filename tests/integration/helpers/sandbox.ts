import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Sandbox — a per-test isolated scratch environment.
//
// Sets all three XDG base dirs to temporary subdirectories so the spawned
// binary writes config, auth, DB, and logs into a disposable area rather than
// the developer's real home directory.
//
// Usage:
//   const sandbox = createSandbox();
//   // ... run tests ...
//   sandbox.teardown();  // removes the whole scratch tree
// ---------------------------------------------------------------------------

export interface Sandbox {
  /** Root of the scratch tree — parent of all subdirs. */
  root: string;
  /**
   * XDG overrides to pass as env vars to the child process.
   * - config → spotify-sync will write auth.json here
   * - data   → default DB location (overridden by SPOTIFY_SYNC_DB_PATH anyway)
   * - state  → per-run log files
   */
  xdg: {
    config: string;
    data: string;
    state: string;
  };
  /** Resolved path of `<xdg.config>/spotify-sync/`. Seed auth.json here. */
  configDir: string;
  /** Library directory for downloaded files. */
  libraryPath: string;
  /** Explicit DB path (avoids relying on XDG_DATA_HOME default). */
  dbPath: string;
  /** Remove the entire scratch tree. Call in afterEach. */
  teardown(): void;
}

export function createSandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), 'spotify-sync-it-'));

  const xdgConfig = join(root, 'config');
  const xdgData = join(root, 'data');
  const xdgState = join(root, 'state');
  const configDir = join(xdgConfig, 'spotify-sync');
  const libraryPath = join(root, 'library');
  const dbPath = join(xdgData, 'spotify-sync', 'db.sqlite');

  // Pre-create the directories the binary expects to exist (or will mkdirSync
  // itself, but being explicit avoids silent failures from missing parents).
  mkdirSync(configDir, { recursive: true });
  mkdirSync(libraryPath, { recursive: true });
  mkdirSync(join(xdgData, 'spotify-sync'), { recursive: true });
  mkdirSync(join(xdgState, 'spotify-sync', 'logs'), { recursive: true });

  return {
    root,
    xdg: { config: xdgConfig, data: xdgData, state: xdgState },
    configDir,
    libraryPath,
    dbPath,
    teardown: () => rmSync(root, { recursive: true, force: true }),
  };
}
