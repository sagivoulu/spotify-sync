import { mapCliFlags } from '../config/index.js';
import { getStatus } from '../status/index.js';
import type { GetStatusOptions } from '../status/index.js';
import type { StatusReport, TrackListItem } from '../status/types.js';

// ---------------------------------------------------------------------------
// runStatusCommand — thin CLI handler for `spotify-sync status`.
//
// Responsibilities:
// 1. Delegate to getStatus (returns structured StatusReport).
// 2. Format and print results (human or JSON).
// 3. Set process.exitCode: 0 if setup ok, 1 if any check failed.
//
// Exit code contract:
// - 0 = all setup checks pass (binaries, auth, config, Spotify connectivity).
// - 1 = one or more checks failed — user should run `spotify-sync doctor`.
// ---------------------------------------------------------------------------

export interface RunStatusCommandOptions {
  /** Whether to emit JSON output instead of human-readable text. */
  json: boolean;
  /** Whether to print the per-track problem lists in human mode. */
  list: boolean;
  /** Global CLI flags (from cmd.optsWithGlobals()). */
  globals: { libraryPath?: string; dbPath?: string };
}

export interface RunStatusCommandDeps {
  /**
   * Injectable getStatus — lets tests verify output and exit-code mapping
   * without wiring up real binaries, a DB, or Spotify credentials.
   * Defaults to the real getStatus imported above.
   */
  getStatus?: (opts: GetStatusOptions) => Promise<StatusReport>;
}

/**
 * Run the `spotify-sync status` command.
 * Exported for testing; `src/cli/program.ts` calls this from the .action() handler.
 */
export async function runStatusCommand(
  options: RunStatusCommandOptions,
  deps: RunStatusCommandDeps = {},
): Promise<void> {
  const { json, list, globals } = options;
  const fn = deps.getStatus ?? getStatus;

  const report = await fn({
    cliFlags: mapCliFlags(globals),
    env: process.env,
  });

  if (json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } else {
    printHumanReport(report, list);
  }

  process.exitCode = report.ok ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Human formatter
// ---------------------------------------------------------------------------

function printHumanReport(report: StatusReport, showList: boolean): void {
  // -- Setup line --
  if (report.setup.ok) {
    process.stdout.write('Setup:    ✓ everything looks good\n');
  } else {
    const checks = report.setup.failedChecks.join(', ');
    process.stdout.write(
      `Setup:    ✗ problems found (${checks}) — run \`spotify-sync doctor\` to investigate\n`,
    );
  }

  process.stdout.write('\n');

  // -- Playlist --
  const { playlist } = report;
  if (playlist.name !== null && playlist.total !== null) {
    process.stdout.write(`Playlist: "${playlist.name}" — ${playlist.total} tracks on Spotify\n`);
  } else if (playlist.total !== null) {
    const label = playlist.source === 'live' ? 'tracks on Spotify' : 'tracks known locally';
    process.stdout.write(`Playlist: ${playlist.total} ${label}\n`);
  } else {
    process.stdout.write('Playlist: unknown (not connected to Spotify)\n');
  }

  // -- Library --
  const { library } = report;
  if (!library.configured) {
    process.stdout.write(
      `Library:  not configured${library.detail ? ` — ${library.detail.split('\n')[0]}` : ''}\n`,
    );
    return;
  }

  process.stdout.write(`Library:  ${library.downloadDir}\n`);
  process.stdout.write(`Database: ${library.dbPath}\n`);

  if (!library.dbInitialized || library.counts === null) {
    process.stdout.write('          not initialised — run `spotify-sync sync` first\n');
    return;
  }

  const { counts } = library;
  const downloadedOf =
    playlist.total !== null ? `${counts.downloaded} / ${playlist.total}` : `${counts.downloaded}`;

  process.stdout.write('\n');
  process.stdout.write(`  Downloaded:       ${downloadedOf}\n`);

  if (library.notYetSynced !== null && library.notYetSynced > 0) {
    process.stdout.write(
      `  Not yet synced:   ${library.notYetSynced}   (in playlist, not yet in library — run \`sync\`)\n`,
    );
  }
  if (counts.pending > 0) {
    process.stdout.write(`  Pending download: ${counts.pending}\n`);
  }
  if (counts.missingFiles > 0) {
    process.stdout.write(`  Missing files:    ${counts.missingFiles}\n`);
  }
  if (counts.failed > 0) {
    process.stdout.write(`  Failed:           ${counts.failed}\n`);
  }
  if (counts.needsManual > 0) {
    process.stdout.write(`  Needs manual:     ${counts.needsManual}\n`);
  }

  if (!showList) return;

  // -- Track lists (--list) --
  const hasPending = library.notDownloaded.length > 0;
  const hasMissing = library.missingFiles.length > 0;
  const hasFailed = library.failed.length > 0;

  if (!hasPending && !hasMissing && !hasFailed) {
    process.stdout.write('\nAll downloaded tracks are accounted for.\n');
    return;
  }

  if (hasPending) {
    process.stdout.write(`\nNot downloaded (${library.notDownloaded.length}):\n`);
    for (const t of library.notDownloaded) {
      process.stdout.write(`  - ${t.artist} — ${t.title}\n`);
    }
  }

  if (hasMissing) {
    process.stdout.write(`\nMissing files (${library.missingFiles.length}):\n`);
    for (const t of library.missingFiles) {
      process.stdout.write(`  - ${t.artist} — ${t.title}\n`);
    }
  }

  if (hasFailed) {
    process.stdout.write(`\nFailed (${library.failed.length}):\n`);
    for (const t of library.failed) {
      const errNote = t.error ? `  (${t.error})` : '';
      process.stdout.write(`  - ${t.artist} — ${t.title}${errNote}\n`);
    }
  }
}

// ---------------------------------------------------------------------------
// Exported for use in tests that need a canned TrackListItem printer
// ---------------------------------------------------------------------------
export type { TrackListItem };
