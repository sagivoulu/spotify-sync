import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import pLimit from 'p-limit';
import type { DownloadBackend } from '../backend/index.js';
import {
  BackendError,
  configToAudioFormat,
  createBackendFromConfig,
  getFfmpegVersion,
  getYtDlpVersion,
} from '../backend/index.js';
import type { SubprocessRunner } from '../backend/index.js';
import type { Config, ConfigInput } from '../config/index.js';
import { loadConfig } from '../config/index.js';
import { initDb } from '../db/index.js';
import {
  finalizeSyncRun,
  incrementAttempts,
  insertSyncRun,
  listPendingTracks,
  markDownloaded,
  markFailed,
  markRemovedFromSource,
  resetPendingAttempts,
  upsertTrack,
} from '../db/index.js';
import { placeDownloadedFile, resolveRelativePath } from '../library/index.js';
import type { SpotifyClient, SpotifyTrack } from '../spotify/index.js';
import { createSpotifyClientFromDisk, parsePlaylistId } from '../spotify/index.js';
import type { AlbumArtCache } from '../tagging/index.js';
import { tagFile } from '../tagging/index.js';
import type { SyncEvent } from './events.js';

export type { SyncEvent } from './events.js';

// ---------------------------------------------------------------------------
// FatalSyncError — thrown for fatal conditions that should produce exit code 2.
// The CLI handler catches this and maps it to process.exitCode = 2.
// ---------------------------------------------------------------------------

export class FatalSyncError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FatalSyncError';
  }
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface SyncResult {
  runId: number;
  added: number;
  downloaded: number;
  failed: number;
  removedMarked: number;
  /** true when failed === 0 */
  ok: boolean;
}

// ---------------------------------------------------------------------------
// Options — all deps injectable for testing
// ---------------------------------------------------------------------------

export interface RunSyncOptions {
  /** Config overrides from CLI flags (already mapped via mapCliFlags). */
  cliFlags?: ConfigInput;
  /** Injectable environment for XDG path resolution. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /**
   * Pre-built Config — when provided, skips loadConfig(). Useful in tests that
   * want full control over config values without writing config files.
   */
  config?: Config;
  /**
   * Pre-opened, migrated Database instance. When omitted, initDb(config) is called.
   * Tests pass an ':memory:' DB so no filesystem is required.
   */
  db?: Database.Database;
  /**
   * Injectable Spotify client. When omitted, createSpotifyClientFromDisk() is used.
   * Tests pass a canned client to avoid live API calls.
   */
  spotifyClient?: SpotifyClient;
  /**
   * Injectable fetch — forwarded to createSpotifyClientFromDisk when no spotifyClient
   * is provided.
   */
  fetchFn?: typeof fetch;
  /**
   * Pre-built DownloadBackend. When omitted, createBackendFromConfig(config) is used
   * and a binary preflight probe is run. Tests inject FakeBackend to avoid real I/O.
   */
  backend?: DownloadBackend;
  /**
   * Injectable subprocess runner for binary version probes (yt-dlp, ffmpeg).
   * When `backend` is injected without a `binaryRunner`, the probe is skipped.
   * When `binaryRunner` is provided without a pre-built `backend`, the probe runs and
   * a FatalSyncError is thrown if either binary is missing — this lets tests cover the
   * "binary absent → exit 2" acceptance criterion.
   */
  binaryRunner?: SubprocessRunner;
  /**
   * Injectable tagFile implementation. Defaults to the real tagging/tagFile.
   * Tests inject a no-op to avoid filesystem reads/writes.
   */
  tagFileFn?: typeof tagFile;
  /**
   * Injectable file-placement function. Defaults to placeDownloadedFile.
   * Tests inject a no-op to avoid real filesystem moves.
   */
  placeFileFn?: (tempPath: string, libraryPath: string, relativePath: string) => string;
  /**
   * Injectable clock — returns the current time as an ISO string.
   * Tests inject a fixed value for deterministic assertions.
   */
  now?: () => string;
  /** Directory for temporary download files. Defaults to os.tmpdir(). */
  tmpDir?: string;
  /**
   * Called once per SyncEvent as the run progresses.
   * Core never prints; the CLI subscribes here and formats output.
   */
  onEvent?: (event: SyncEvent) => void;
}

// ---------------------------------------------------------------------------
// runSync — the main pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full sync pipeline:
 *   preflight → fetch tracks → reconcile DB → concurrent download+tag+place → finalize.
 *
 * Throws FatalSyncError on unrecoverable failures (missing auth, binary not found,
 * network error during fetch). The CLI maps this to exit code 2.
 *
 * Returns a SyncResult on completion (ok=false when any track failed).
 * The CLI maps ok=false to exit code 1.
 */
export async function runSync(opts: RunSyncOptions = {}): Promise<SyncResult> {
  const {
    cliFlags,
    env,
    fetchFn,
    onEvent = () => {},
    now = () => new Date().toISOString(),
    tmpDir = tmpdir(),
  } = opts;

  // -------------------------------------------------------------------------
  // Phase 1: Preflight — load config, open DB, build clients
  // -------------------------------------------------------------------------

  let config: Config;
  try {
    config = opts.config ?? loadConfig({ cliFlags, env });
  } catch (err) {
    throw new FatalSyncError(`Configuration error: ${(err as Error).message}`, err);
  }

  const db = opts.db ?? initDb(config);

  // Build or validate the download backend.
  let backend: DownloadBackend;
  if (opts.backend !== undefined) {
    // Injected backend (tests). Run binary probe only if binaryRunner is also injected.
    backend = opts.backend;
    if (opts.binaryRunner !== undefined) {
      await probeBinaries(opts.binaryRunner);
    }
  } else {
    // Production path: build from config and always probe binaries.
    try {
      backend = createBackendFromConfig(config);
    } catch (err) {
      throw new FatalSyncError(`Backend configuration error: ${(err as Error).message}`, err);
    }
    await probeBinaries(opts.binaryRunner);
  }

  // Build Spotify client.
  let spotifyClient: SpotifyClient;
  try {
    spotifyClient =
      opts.spotifyClient ??
      createSpotifyClientFromDisk({
        clientId: config.spotify.client_id,
        fetchFn,
        env,
      });
  } catch (err) {
    throw new FatalSyncError(
      `Spotify auth error: ${(err as Error).message}. Run "spotify-sync auth" to authenticate.`,
      err,
    );
  }

  const tagFileFn = opts.tagFileFn ?? tagFile;
  const placeFileFn = opts.placeFileFn ?? placeDownloadedFile;
  const audioFormat = configToAudioFormat(config.download);
  const source = 'spotify';
  const libraryId = config.library.id;

  // -------------------------------------------------------------------------
  // Phase 2: Fetch playlist tracks from Spotify
  // -------------------------------------------------------------------------

  let spotifyTracks: SpotifyTrack[];
  try {
    const playlistId = parsePlaylistId(config.spotify.playlist_url);
    spotifyTracks = await spotifyClient.fetchPlaylistTracks(playlistId);
  } catch (err) {
    throw new FatalSyncError(`Failed to fetch Spotify playlist: ${(err as Error).message}`, err);
  }

  // -------------------------------------------------------------------------
  // Phase 3: Reconcile DB — upsert tracks, mark removed, reset attempts
  // -------------------------------------------------------------------------

  const syncRunId = insertSyncRun(db, { libraryId, source, startedAt: now() });

  let added = 0;
  const presentSourceIds: string[] = [];

  // Build a map from source_id → SpotifyTrack for use in the download phase.
  const trackMap = new Map<string, SpotifyTrack>();

  for (const track of spotifyTracks) {
    presentSourceIds.push(track.id);
    trackMap.set(track.id, track);

    const { isNew } = upsertTrack(db, {
      libraryId,
      source,
      sourceId: track.id,
      artist: track.artists[0] ?? 'Unknown Artist',
      title: track.title,
      album: track.album.name,
      releaseYear: track.releaseYear,
      durationMs: track.durationMs,
      sourceAddedAt: track.addedAt,
      now: now(),
    });

    if (isNew) added++;
  }

  const removedMarked = markRemovedFromSource(db, { libraryId, source, presentSourceIds });
  resetPendingAttempts(db, { libraryId, source });

  const pendingTracks = listPendingTracks(db, { libraryId, source });

  onEvent({
    type: 'run-start',
    runId: syncRunId,
    pendingCount: pendingTracks.length,
    addedCount: added,
    removedMarkedCount: removedMarked,
  });

  // -------------------------------------------------------------------------
  // Phase 4: Download pending tracks (concurrent, with retries)
  // -------------------------------------------------------------------------

  const limit = pLimit(config.download.concurrency);
  const retryCount = config.download.retry_count;
  const albumArtCache: AlbumArtCache = new Map();

  let downloaded = 0;
  let failed = 0;

  await Promise.all(
    pendingTracks.map((trackRow) =>
      limit(async () => {
        const spotifyTrack = trackMap.get(trackRow.source_id);
        // Guard: if for any reason the track isn't in the map, skip it.
        if (spotifyTrack === undefined) return;

        let attempts = 0;
        let lastError = '';

        while (attempts < retryCount) {
          attempts++;
          let error: string | undefined;

          try {
            // Search for a candidate.
            const candidates = await backend.search({
              artist: trackRow.artist,
              title: trackRow.title,
              durationMs: trackRow.duration_ms ?? undefined,
            });

            if (candidates.length === 0 || candidates[0] === undefined) {
              error = 'No candidates found';
            } else {
              const candidate = candidates[0];
              const outPath = join(tmpDir, `spotify-sync-${trackRow.source_id}`);

              // Download.
              const result = await backend.download(candidate, {
                outPath,
                format: audioFormat,
              });

              if (!result.success) {
                error = result.error;
              } else {
                // Tag the downloaded file.
                await tagFileFn(result.filePath, spotifyTrack, albumArtCache, { fetchFn });

                // Resolve final path and place the file.
                const relPath = resolveRelativePath(db, {
                  libraryId,
                  source,
                  sourceId: trackRow.source_id,
                  artist: trackRow.artist,
                  title: trackRow.title,
                  ext: audioFormat.codec,
                });

                placeFileFn(result.filePath, config.library.path, relPath);

                // Update DB.
                markDownloaded(db, {
                  id: trackRow.id,
                  filePath: relPath,
                  backend: result.backend,
                  backendSource: candidate.url,
                  now: now(),
                });

                downloaded++;
                onEvent({
                  type: 'track-downloaded',
                  trackId: trackRow.id,
                  artist: trackRow.artist,
                  title: trackRow.title,
                  filePath: relPath,
                  backend: result.backend,
                });

                // Success — exit the retry loop.
                return;
              }
            }
          } catch (err) {
            // BackendError carries stderr; other errors get .message.
            if (err instanceof BackendError) {
              error = err.stderr.trim() || err.message;
            } else {
              error = err instanceof Error ? err.message : String(err);
            }
          }

          // Attempt failed.
          lastError = error ?? 'Unknown error';
          incrementAttempts(db, trackRow.id, attempts);

          if (attempts >= retryCount) {
            // Budget exhausted.
            markFailed(db, { id: trackRow.id, lastError, attempts });
            failed++;
            onEvent({
              type: 'track-failed',
              trackId: trackRow.id,
              artist: trackRow.artist,
              title: trackRow.title,
              attempts,
              error: lastError,
            });
          } else {
            onEvent({
              type: 'track-retry',
              trackId: trackRow.id,
              artist: trackRow.artist,
              title: trackRow.title,
              attempt: attempts,
              maxAttempts: retryCount,
              error: lastError,
            });
          }
        }
      }),
    ),
  );

  // -------------------------------------------------------------------------
  // Phase 5: Finalize sync_runs row
  // -------------------------------------------------------------------------

  finalizeSyncRun(db, {
    id: syncRunId,
    finishedAt: now(),
    added,
    downloaded,
    failed,
    removedMarked,
  });

  const result: SyncResult = {
    runId: syncRunId,
    added,
    downloaded,
    failed,
    removedMarked,
    ok: failed === 0,
  };

  onEvent({
    type: 'run-finish',
    runId: syncRunId,
    added,
    downloaded,
    failed,
    removedMarked,
    ok: result.ok,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Probe yt-dlp and ffmpeg availability. Throws FatalSyncError if either is missing.
 * When `runner` is undefined, the real defaultRunner is used via getYtDlpVersion/getFfmpegVersion.
 */
async function probeBinaries(runner?: SubprocessRunner): Promise<void> {
  const [ytDlp, ffmpeg] = await Promise.all([getYtDlpVersion(runner), getFfmpegVersion(runner)]);

  if (!ytDlp.available) {
    throw new FatalSyncError(
      `yt-dlp is not available: ${ytDlp.error}. Install it with "brew install yt-dlp" or from https://github.com/yt-dlp/yt-dlp.`,
    );
  }
  if (!ffmpeg.available) {
    throw new FatalSyncError(
      `ffmpeg is not available: ${ffmpeg.error}. Install it with "brew install ffmpeg".`,
    );
  }
}
