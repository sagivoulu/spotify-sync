import { existsSync } from 'node:fs';
import type Database from 'better-sqlite3';
import trash from 'trash';
import type { Config, ConfigInput } from '../config/index.js';
import { loadConfig } from '../config/index.js';
import { clearRemovedTrackFilePath, initDb, listPrunableTracks } from '../db/index.js';
import { composeAbsolutePath } from '../library/index.js';

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
}

export async function runPrune(opts: RunPruneOptions = {}): Promise<PruneResult> {
  const { dryRun = false, env, fileExists = existsSync, trashFn = trash } = opts;

  let config: Config;
  try {
    config = opts.config ?? loadConfig({ cliFlags: opts.cliFlags, env });
  } catch (err) {
    throw new PruneError(`Configuration error: ${(err as Error).message}`, err);
  }

  let db: Database.Database;
  try {
    db = opts.db ?? initDb(config);
  } catch (err) {
    throw new PruneError(`Database error: ${(err as Error).message}`, err);
  }

  const source = 'spotify';
  const libraryId = config.library.id;
  const candidates = listPrunableTracks(db, { libraryId, source }).map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    artist: row.artist,
    title: row.title,
    filePath: row.file_path,
    absolutePath: composeAbsolutePath(config.library.path, row.file_path),
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
