import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Sandbox — a per-test isolated scratch environment.
//
// Sets all three XDG base dirs to temporary subdirectories so the spawned
// binary writes config, auth, DB, and logs into a disposable area rather than
// the developer's real home directory.
// ---------------------------------------------------------------------------

export interface Sandbox {
  root: string;
  xdg: { config: string; data: string; state: string };
  /** Path for auth.json: <xdg.config>/spotify-sync/ */
  configDir: string;
  libraryPath: string;
  dbPath: string;
  teardown(): void;
}

export function createSandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), 'spotify-sync-ct-'));

  const xdgConfig = join(root, 'config');
  const xdgData = join(root, 'data');
  const xdgState = join(root, 'state');
  const configDir = join(xdgConfig, 'spotify-sync');
  const libraryPath = join(root, 'library');
  const dbPath = join(xdgData, 'spotify-sync', 'db.sqlite');

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
