import { mapCliFlags } from '../config/index.js';
import { FatalSyncError, runSync } from '../sync/index.js';
import type { SyncEvent } from '../sync/index.js';

// ---------------------------------------------------------------------------
// runSyncCommand — thin CLI handler for `spotify-sync sync`.
//
// Responsibilities:
// 1. Delegate to runSync (returns structured SyncResult, emits SyncEvents).
// 2. Subscribe to events and print one line per state transition (human mode).
// 3. Print final summary (human) or single JSON object (--json mode).
// 4. Set process.exitCode:
//    0 = all ok (no failures)
//    1 = sync completed but with at least one failed track
//    2 = fatal error (no auth, no network, missing binary)
//
// Error handling:
// - FatalSyncError → stderr + exitCode 2.
// - Unexpected errors propagate to the bin shim (which exits 1).
// ---------------------------------------------------------------------------

export interface RunSyncCommandOptions {
  /** Whether to emit a single JSON object instead of human-readable lines. */
  json: boolean;
  /** Global CLI flags (from cmd.optsWithGlobals()). */
  globals: { libraryPath?: string; dbPath?: string };
}

/**
 * Run the `spotify-sync sync` command.
 * Exported for testing; `src/cli/program.ts` calls this from the .action() handler.
 */
export async function runSyncCommand(options: RunSyncCommandOptions): Promise<void> {
  const { json, globals } = options;

  // In JSON mode we suppress per-event output and print the final result.
  // In human mode we print one line per event as the run progresses.
  const printedEvents: SyncEvent[] = [];

  function onEvent(event: SyncEvent): void {
    if (json) {
      // Accumulate events silently; only the final result is printed in JSON mode.
      printedEvents.push(event);
      return;
    }

    switch (event.type) {
      case 'run-start':
        process.stdout.write(
          `Syncing: ${event.pendingCount} pending, ${event.addedCount} new, ${event.removedMarkedCount} removed\n`,
        );
        break;

      case 'track-downloaded':
        process.stdout.write(`✓ ${event.artist} — ${event.title} (${event.backend})\n`);
        break;

      case 'track-retry':
        process.stdout.write(
          `↻ ${event.artist} — ${event.title} (attempt ${event.attempt}/${event.maxAttempts}): ${event.error}\n`,
        );
        break;

      case 'track-failed':
        process.stdout.write(
          `✗ ${event.artist} — ${event.title} failed after ${event.attempts} attempt(s): ${event.error}\n`,
        );
        break;

      case 'run-finish':
        // Summary line — always printed.
        process.stdout.write(
          `\nDone. added=${event.added} downloaded=${event.downloaded} failed=${event.failed} removed=${event.removedMarked}\n`,
        );
        break;
    }
  }

  let result: Awaited<ReturnType<typeof runSync>>;

  try {
    result = await runSync({
      cliFlags: mapCliFlags(globals),
      env: process.env,
      onEvent,
    });
  } catch (err) {
    if (err instanceof FatalSyncError) {
      process.stderr.write(`Fatal: ${err.message}\n`);
      process.exitCode = 2;
      return;
    }
    // Unexpected error — propagate to bin shim.
    throw err;
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }

  process.exitCode = result.ok ? 0 : 1;
}
