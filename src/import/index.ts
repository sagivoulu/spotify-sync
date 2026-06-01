import { copyFileSync, mkdtempSync, renameSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type Database from 'better-sqlite3';
import { configToAudioFormat } from '../backend/index.js';
import type { Config, ConfigInput } from '../config/index.js';
import { loadConfig } from '../config/index.js';
import { getImportTarget, initDb, markDownloaded } from '../db/index.js';
import { composeAbsolutePath, resolveRelativePath } from '../library/index.js';
import type { SpotifyClient, SpotifyTrackMetadata } from '../spotify/index.js';
import { createSpotifyClientFromDisk } from '../spotify/index.js';
import type { AlbumArtCache } from '../tagging/index.js';
import { tagFile } from '../tagging/index.js';

export class ImportError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

export interface ImportResult {
  ok: true;
  trackId: string;
  sourcePath: string;
  filePath: string;
  finalPath: string;
  mode: 'copy' | 'move';
}

interface ImportFileStat {
  isFile(): boolean;
}

export interface ImportFileOps {
  stat: (path: string) => ImportFileStat;
  copyFile: (source: string, destination: string) => void;
  rename: (source: string, destination: string) => void;
  unlink: (path: string) => void;
  mkdtemp: (prefix: string) => string;
  rm: (path: string, options: { recursive: boolean; force: boolean }) => void;
}

export interface RunImportOptions {
  filePath: string;
  trackId: string;
  move?: boolean;
  cliFlags?: ConfigInput;
  env?: NodeJS.ProcessEnv;
  config?: Config;
  db?: Database.Database;
  spotifyClient?: SpotifyClient;
  fetchFn?: typeof fetch;
  tagFileFn?: typeof tagFile;
  fileOps?: ImportFileOps;
  now?: () => string;
}

const DEFAULT_FILE_OPS: ImportFileOps = {
  stat: statSync,
  copyFile: copyFileSync,
  rename: renameSync,
  unlink: unlinkSync,
  mkdtemp: mkdtempSync,
  rm: rmSync,
};

export async function runImport(opts: RunImportOptions): Promise<ImportResult> {
  const {
    filePath,
    trackId,
    move = false,
    env,
    fetchFn,
    fileOps = DEFAULT_FILE_OPS,
    now = () => new Date().toISOString(),
  } = opts;

  let config: Config;
  try {
    config = opts.config ?? loadConfig({ cliFlags: opts.cliFlags, env });
  } catch (err) {
    throw new ImportError(`Configuration error: ${(err as Error).message}`, err);
  }

  const sourcePath = resolve(filePath);
  assertSourceFile(fileOps, sourcePath);

  const db = opts.db ?? initDb(config);
  const source = 'spotify';
  const libraryId = config.library.id;

  const target = getImportTarget(db, { libraryId, source, sourceId: trackId });
  if (target === null) {
    throw new ImportError(`Track not found in DB for Spotify track ID "${trackId}"`);
  }

  const spotifyClient = createClient(opts, config, env, fetchFn);
  const track = await fetchTrackForImport(spotifyClient, trackId);

  const relativePath =
    target.file_path ??
    resolveRelativePath(db, {
      libraryId,
      source,
      sourceId: trackId,
      artist: track.artists[0] ?? 'Unknown Artist',
      title: track.title,
      ext: configToAudioFormat(config.download).codec,
    });

  const finalPath = composeAbsolutePath(config.library.path, relativePath);
  const tempDir = fileOps.mkdtemp(join(config.library.path, '.spotify-sync-import-'));
  const tempPath = join(tempDir, `${basename(relativePath)}.tmp`);
  const albumArtCache: AlbumArtCache = new Map();

  try {
    fileOps.copyFile(sourcePath, tempPath);
    await (opts.tagFileFn ?? tagFile)(tempPath, track, albumArtCache, { fetchFn });
    fileOps.rename(tempPath, finalPath);

    markDownloaded(db, {
      id: target.id,
      filePath: relativePath,
      backend: 'manual',
      backendSource: sourcePath,
      now: now(),
    });

    if (move && sourcePath !== finalPath) {
      fileOps.unlink(sourcePath);
    }
  } catch (err) {
    throw new ImportError(`Import failed: ${(err as Error).message}`, err);
  } finally {
    fileOps.rm(tempDir, { recursive: true, force: true });
  }

  return {
    ok: true,
    trackId,
    sourcePath,
    filePath: relativePath,
    finalPath,
    mode: move ? 'move' : 'copy',
  };
}

function assertSourceFile(fileOps: ImportFileOps, sourcePath: string): void {
  let stat: ImportFileStat;
  try {
    stat = fileOps.stat(sourcePath);
  } catch (err) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : undefined;
    if (code === 'ENOENT') {
      throw new ImportError(`Source file not found: ${sourcePath}`, err);
    }
    throw new ImportError(`Unable to read source file: ${sourcePath}`, err);
  }

  if (!stat.isFile()) {
    throw new ImportError(`Source path is not a file: ${sourcePath}`);
  }
}

function createClient(
  opts: RunImportOptions,
  config: Config,
  env: NodeJS.ProcessEnv | undefined,
  fetchFn: typeof fetch | undefined,
): SpotifyClient {
  try {
    return (
      opts.spotifyClient ??
      createSpotifyClientFromDisk({
        clientId: config.spotify.client_id,
        fetchFn,
        env,
      })
    );
  } catch (err) {
    throw new ImportError(
      `Spotify auth error: ${(err as Error).message}. Run "spotify-sync auth" to authenticate.`,
      err,
    );
  }
}

async function fetchTrackForImport(
  spotifyClient: SpotifyClient,
  trackId: string,
): Promise<SpotifyTrackMetadata> {
  try {
    return await spotifyClient.fetchTrack(trackId);
  } catch (err) {
    throw new ImportError(
      `Failed to fetch Spotify track ${trackId}: ${(err as Error).message}`,
      err,
    );
  }
}
