import { existsSync } from 'node:fs';
import type Database from 'better-sqlite3';
import trash from 'trash';
import type { Config, ConfigInput } from '../config/index.js';
import { loadConfig } from '../config/index.js';
import { openDatabase } from '../db/connection.js';
import {
  clearRemovedTrackFilePath,
  initDb,
  listPrunableTracks,
  listPruneCandidates,
} from '../db/index.js';
import type { PrunableTrackRow } from '../db/index.js';
import { composeAbsolutePath } from '../library/index.js';
import type { SpotifyClient } from '../spotify/index.js';
import { createSpotifyClientFromDisk, parsePlaylistId } from '../spotify/index.js';

export class PruneError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PruneError';
  }
}

export interface PrunableTrack {
  id: number;
  sourceId: string;
  artist: string;
  title: string;
  filePath: string;
  absolutePath: string;
}

export type PruneOutcomeStatus = 'would-trash' | 'trashed' | 'missing' | 'failed';

export interface PruneOutcome {
  id: number;
  sourceId: string;
  artist: string;
  title: string;
  filePath: string;
  absolutePath: string;
  status: PruneOutcomeStatus;
  error?: string;
}

export interface PruneResult {
  ok: boolean;
  dryRun: boolean;
  candidates: PrunableTrack[];
  outcomes: PruneOutcome[];
  prunedCount: number;
  missingCount: number;
  failedCount: number;
}

export interface RunPruneOptions {
  dryRun?: boolean;
  cliFlags?: ConfigInput;
  env?: NodeJS.ProcessEnv;
  config?: Config;
  db?: Database.Database;
  fileExists?: (absolutePath: string) => boolean;
  trashFn?: typeof trash;
  spotifyClient?: SpotifyClient;
  fetchFn?: typeof fetch;
  refreshSource?: boolean;
  candidates?: PrunableTrack[];
}

export async function runPrune(opts: RunPruneOptions = {}): Promise<PruneResult> {
  const {
    dryRun = false,
    env,
    fileExists = existsSync,
    trashFn = trash,
    refreshSource = true,
  } = opts;

  let config: Config;
  try {
    config = opts.config ?? loadConfig({ cliFlags: opts.cliFlags, env });
  } catch (err) {
    throw new PruneError(`Configuration error: ${(err as Error).message}`, err);
  }

  let db: Database.Database;
  try {
    db = opts.db ?? (dryRun ? openDatabase(config.db_path) : initDb(config));
  } catch (err) {
    throw new PruneError(`Database error: ${(err as Error).message}`, err);
  }

  const source = 'spotify';
  const libraryId = config.library.id;
  const candidates =
    opts.candidates ??
    (await listCandidates({
      db,
      config,
      opts,
      libraryId,
      source,
      refreshSource,
    }));

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      candidates,
      outcomes: candidates.map((track) => ({ ...track, status: 'would-trash' })),
      prunedCount: 0,
      missingCount: 0,
      failedCount: 0,
    };
  }

  const outcomes: PruneOutcome[] = [];

  for (const track of candidates) {
    if (!fileExists(track.absolutePath)) {
      clearRemovedTrackFilePath(db, track.id);
      outcomes.push({ ...track, status: 'missing' });
      continue;
    }

    try {
      await trashFn([track.absolutePath], { glob: false });
      clearRemovedTrackFilePath(db, track.id);
      outcomes.push({ ...track, status: 'trashed' });
    } catch (err) {
      outcomes.push({
        ...track,
        status: 'failed',
        error: (err as Error).message,
      });
    }
  }

  const prunedCount = outcomes.filter((outcome) => outcome.status === 'trashed').length;
  const missingCount = outcomes.filter((outcome) => outcome.status === 'missing').length;
  const failedCount = outcomes.filter((outcome) => outcome.status === 'failed').length;

  return {
    ok: failedCount === 0,
    dryRun: false,
    candidates,
    outcomes,
    prunedCount,
    missingCount,
    failedCount,
  };
}

interface ListCandidatesOptions {
  db: Database.Database;
  config: Config;
  opts: RunPruneOptions;
  libraryId: string;
  source: string;
  refreshSource: boolean;
}

async function listCandidates(options: ListCandidatesOptions): Promise<PrunableTrack[]> {
  const { db, config, opts, libraryId, source, refreshSource } = options;

  if (!refreshSource) {
    return toPrunableTracks(config, listPrunableTracks(db, { libraryId, source }));
  }

  const spotifyClient = createClient(opts, config);
  try {
    const playlistId = parsePlaylistId(config.spotify.playlist_url);
    const spotifyTracks = await spotifyClient.fetchPlaylistTracks(playlistId);
    const rows = listPruneCandidates(db, {
      libraryId,
      source,
      presentSourceIds: spotifyTracks.map((track) => track.id),
    });
    return toPrunableTracks(config, rows);
  } catch (err) {
    throw new PruneError(`Failed to refresh Spotify playlist: ${(err as Error).message}`, err);
  }
}

function toPrunableTracks(config: Config, rows: PrunableTrackRow[]): PrunableTrack[] {
  return rows.map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    artist: row.artist,
    title: row.title,
    filePath: row.file_path,
    absolutePath: composeAbsolutePath(config.library.path, row.file_path),
  }));
}

function createClient(opts: RunPruneOptions, config: Config): SpotifyClient {
  try {
    return (
      opts.spotifyClient ??
      createSpotifyClientFromDisk({
        clientId: config.spotify.client_id,
        fetchFn: opts.fetchFn,
        env: opts.env,
      })
    );
  } catch (err) {
    throw new PruneError(
      `Spotify auth error: ${(err as Error).message}. Run "spotify-sync auth" to authenticate.`,
      err,
    );
  }
}
