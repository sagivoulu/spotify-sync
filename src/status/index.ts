import { existsSync, readdirSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { extname, join, relative } from 'node:path';
import type Database from 'better-sqlite3';
import type { SubprocessRunner } from '../backend/index.js';
import { ConfigError, loadConfig } from '../config/index.js';
import type { ConfigInput } from '../config/index.js';
import { openDatabase } from '../db/connection.js';
import { countTracksByStatus, listTrackedFilePaths, listTracksByStatus } from '../db/tracks.js';
import type { StatusTrackRow } from '../db/tracks.js';
import type { RunDoctorOptions, RunDoctorResult } from '../doctor/index.js';
import { runDoctor } from '../doctor/index.js';
import { composeAbsolutePath } from '../library/index.js';
import type { SpotifyClient } from '../spotify/index.js';
import type {
  LibraryCounts,
  LibraryScanError,
  LibraryStatus,
  PlaylistStatus,
  StatusReport,
  TrackListItem,
} from './types.js';

// ---------------------------------------------------------------------------
// Options — all deps injectable for testing (mirrors RunDoctorOptions)
// ---------------------------------------------------------------------------

export interface GetStatusOptions {
  /** Config overrides from CLI flags (already mapped via mapCliFlags). */
  cliFlags?: ConfigInput;
  /** Injectable environment for XDG path resolution. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /**
   * Injectable subprocess runner forwarded to runDoctor for yt-dlp/ffmpeg checks.
   * Tests inject a fake to avoid requiring real binaries.
   */
  binaryRunner?: SubprocessRunner;
  /**
   * Injectable Spotify client forwarded to runDoctor.
   * Tests inject a fake to avoid live API calls.
   */
  spotifyClient?: SpotifyClient;
  /**
   * Injectable fetch forwarded to runDoctor.
   */
  fetchFn?: typeof fetch;
  /**
   * Pre-opened Database instance. When provided, skips DB path resolution and
   * openDatabase(). Tests pass an ':memory:' DB seeded with the scenario under
   * test; status never closes an injected DB.
   */
  db?: Database.Database;
  /**
   * Injectable file-existence check. Defaults to fs.existsSync.
   * Tests inject () => false to simulate missing files.
   */
  fileExists?: (absolutePath: string) => boolean;
  /**
   * Injectable local audio scanner. Defaults to a read-only recursive filesystem
   * scan of the configured library path.
   */
  scanLocalAudioFiles?: LocalAudioFileScanner;
  /**
   * Injectable runDoctor implementation. Defaults to the real runDoctor.
   * Tests inject a canned result to avoid network / filesystem side-effects.
   */
  runDoctorFn?: (opts: RunDoctorOptions) => Promise<RunDoctorResult>;
}

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------

/**
 * Collect a full status snapshot combining setup health (via runDoctor) and
 * local library state (via read-only DB queries + disk existence checks).
 *
 * Never throws on expected failures — config errors, missing DB, missing auth,
 * etc. are all captured in the returned StatusReport.
 *
 * Never writes: does not create or migrate the DB, does not reset track states.
 */
export async function getStatus(opts: GetStatusOptions = {}): Promise<StatusReport> {
  const {
    cliFlags,
    env,
    binaryRunner,
    spotifyClient,
    fetchFn,
    db: injectedDb,
    fileExists = existsSync,
    scanLocalAudioFiles: scanLocalAudioFilesFn = scanLocalAudioFiles,
    runDoctorFn = runDoctor,
  } = opts;

  // -------------------------------------------------------------------------
  // 1. Run doctor — provides setup health AND the live Spotify playlist total.
  // -------------------------------------------------------------------------

  const doctor = await runDoctorFn({ cliFlags, env, binaryRunner, spotifyClient, fetchFn });

  const setup = {
    ok: doctor.ok,
    failedChecks: doctor.results.filter((r) => !r.ok).map((r) => r.name),
  };

  // Extract live Spotify data from the Spotify CheckResult (if it passed).
  const spotifyCheckResult = doctor.results.find((r) => r.name === 'Spotify');
  let liveTotal: number | null = null;
  let playlistName: string | null = null;
  if (spotifyCheckResult?.ok && spotifyCheckResult.data) {
    liveTotal = (spotifyCheckResult.data.trackCount as number) ?? null;
    playlistName = (spotifyCheckResult.data.playlistName as string) ?? null;
  }

  // -------------------------------------------------------------------------
  // 2. Load config (read-only — config errors degrade library section only).
  // -------------------------------------------------------------------------

  let downloadDir: string | null = null;
  let dbPath: string | null = null;
  let libraryId: string | null = null;
  let configError: string | undefined;
  let configured = true;

  try {
    const config = loadConfig({ cliFlags, env });
    downloadDir = config.library.path;
    dbPath = config.db_path;
    libraryId = config.library.id;
  } catch (err) {
    configured = false;
    configError = err instanceof ConfigError ? err.message : String(err);
  }

  // -------------------------------------------------------------------------
  // 3. Library: open DB read-only, query counts + track lists + disk checks.
  // -------------------------------------------------------------------------

  const library = await collectLibraryStatus({
    configured,
    configError,
    downloadDir,
    dbPath,
    libraryId,
    liveTotal,
    injectedDb,
    fileExists,
    scanLocalAudioFiles: scanLocalAudioFilesFn,
  });

  // -------------------------------------------------------------------------
  // 4. Playlist section (live with last-sync fallback).
  // -------------------------------------------------------------------------

  const knownInPlaylist = library.counts?.knownInPlaylist ?? null;
  const playlist: PlaylistStatus = buildPlaylistStatus(liveTotal, playlistName, knownInPlaylist);

  return {
    setup,
    playlist,
    library,
    ok: setup.ok,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CollectLibraryOpts {
  configured: boolean;
  configError: string | undefined;
  downloadDir: string | null;
  dbPath: string | null;
  libraryId: string | null;
  liveTotal: number | null;
  injectedDb: Database.Database | undefined;
  fileExists: (path: string) => boolean;
  scanLocalAudioFiles: LocalAudioFileScanner;
}

async function collectLibraryStatus(opts: CollectLibraryOpts): Promise<LibraryStatus> {
  const {
    configured,
    configError,
    downloadDir,
    dbPath,
    libraryId,
    injectedDb,
    fileExists,
    scanLocalAudioFiles,
  } = opts;

  if (!configured || dbPath === null || libraryId === null || downloadDir === null) {
    return {
      configured,
      downloadDir,
      dbPath,
      dbInitialized: false,
      counts: null,
      notYetSynced: null,
      notDownloaded: [],
      missingFiles: [],
      untrackedFiles: [],
      scanErrors: [],
      failed: [],
      detail: configError,
    };
  }

  // Use injected DB or open our own (read-only: no migrations, no registration).
  let db: Database.Database;
  let ownedDb = false;

  if (injectedDb !== undefined) {
    db = injectedDb;
  } else if (!existsSync(dbPath)) {
    return {
      configured,
      downloadDir,
      dbPath,
      dbInitialized: false,
      counts: null,
      notYetSynced: null,
      notDownloaded: [],
      missingFiles: [],
      untrackedFiles: [],
      scanErrors: [],
      failed: [],
    };
  } else {
    try {
      db = openDatabase(dbPath);
      ownedDb = true;
    } catch {
      return {
        configured,
        downloadDir,
        dbPath,
        dbInitialized: false,
        counts: null,
        notYetSynced: null,
        notDownloaded: [],
        missingFiles: [],
        untrackedFiles: [],
        scanErrors: [],
        failed: [],
      };
    }
  }

  try {
    const rawCounts = countTracksByStatus(db, { libraryId });

    // Detect downloaded tracks whose files have been deleted from disk.
    const downloadedRows = listTracksByStatus(db, { libraryId, status: 'downloaded' });
    const missingFileRows = downloadedRows.filter(
      (row) =>
        row.file_path !== null && !fileExists(composeAbsolutePath(downloadDir, row.file_path)),
    );
    const trackedFilePaths = new Set(
      listTrackedFilePaths(db, { libraryId }).map(normalizeRelativePath),
    );
    const localScan = scanLocalAudioFiles(downloadDir);
    const untrackedFiles = localScan.files.filter(
      (filePath) => !trackedFilePaths.has(normalizeRelativePath(filePath)),
    );

    const counts: LibraryCounts = {
      downloaded: rawCounts.downloaded,
      pending: rawCounts.pending,
      missingFiles: missingFileRows.length,
      untrackedFiles: untrackedFiles.length,
      failed: rawCounts.failed,
      needsManual: rawCounts.needs_manual,
      knownInPlaylist:
        rawCounts.pending + rawCounts.downloaded + rawCounts.failed + rawCounts.needs_manual,
    };

    const pendingRows = listTracksByStatus(db, { libraryId, status: 'pending' });
    const failedRows = listTracksByStatus(db, { libraryId, status: 'failed' });

    const notYetSynced =
      opts.liveTotal !== null ? Math.max(0, opts.liveTotal - counts.knownInPlaylist) : null;

    return {
      configured,
      downloadDir,
      dbPath,
      dbInitialized: true,
      counts,
      notYetSynced,
      notDownloaded: toTrackListItems(pendingRows),
      missingFiles: toTrackListItems(missingFileRows),
      untrackedFiles,
      scanErrors: localScan.errors,
      failed: toTrackListItems(failedRows, true),
    };
  } catch {
    // DB file exists but schema hasn't been created yet (no `tracks` table).
    return {
      configured,
      downloadDir,
      dbPath,
      dbInitialized: false,
      counts: null,
      notYetSynced: null,
      notDownloaded: [],
      missingFiles: [],
      untrackedFiles: [],
      scanErrors: [],
      failed: [],
    };
  } finally {
    if (ownedDb) {
      db.close();
    }
  }
}

export interface LocalAudioFileScanResult {
  files: string[];
  errors: LibraryScanError[];
}

type LocalAudioFileScanner = (libraryPath: string) => LocalAudioFileScanResult;

const LOCAL_AUDIO_EXTENSIONS = new Set([
  '.aac',
  '.aif',
  '.aiff',
  '.alac',
  '.amr',
  '.ape',
  '.au',
  '.caf',
  '.dff',
  '.dsf',
  '.flac',
  '.m4a',
  '.m4b',
  '.m4p',
  '.mp2',
  '.mp3',
  '.oga',
  '.ogg',
  '.opus',
  '.ra',
  '.wav',
  '.weba',
  '.wma',
  '.wv',
]);

export function scanLocalAudioFiles(libraryPath: string): LocalAudioFileScanResult {
  const files: string[] = [];
  const errors: LibraryScanError[] = [];

  function visit(dir: string): void {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      errors.push(toLibraryScanError(libraryPath, dir, err));
      return;
    }

    for (const entry of entries) {
      const absolutePath = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile() && LOCAL_AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        const relativePath = normalizeRelativePath(relative(libraryPath, absolutePath));
        if (relativePath !== '') {
          files.push(relativePath);
        }
      }
    }
  }

  visit(libraryPath);
  return {
    files: files.sort((a, b) => a.localeCompare(b)),
    errors: errors.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

function normalizeRelativePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

function toLibraryScanError(libraryPath: string, path: string, err: unknown): LibraryScanError {
  const relativePath = normalizeRelativePath(relative(libraryPath, path)) || '.';
  const code =
    typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string'
      ? err.code
      : undefined;
  const message = err instanceof Error ? err.message : String(err);
  return {
    path: relativePath,
    ...(code !== undefined ? { code } : {}),
    message,
  };
}

function toTrackListItems(rows: StatusTrackRow[], includeError = false): TrackListItem[] {
  return rows.map((row) => ({
    artist: row.artist,
    title: row.title,
    sourceId: row.source_id,
    ...(includeError && row.last_error !== null ? { error: row.last_error } : {}),
  }));
}

function buildPlaylistStatus(
  liveTotal: number | null,
  playlistName: string | null,
  knownInPlaylist: number | null,
): PlaylistStatus {
  if (liveTotal !== null) {
    return { name: playlistName, total: liveTotal, source: 'live' };
  }
  // Offline fallback: use what the local DB knows.
  return {
    name: null,
    total: knownInPlaylist,
    source: 'last-sync',
  };
}
