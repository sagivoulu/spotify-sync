import { Command } from 'commander';
import { runAuthCommand } from './auth.js';
import { runDoctorCommand } from './doctor.js';
import { runImportCommand } from './import.js';
import { runSyncCommand } from './sync.js';

// Version is hardcoded for v1 skeleton; make dynamic in a follow-up.
const VERSION = '0.1.0';

/**
 * Build and return the root commander program with all subcommands registered.
 *
 * Exported as a function (not a module-level singleton) so tests can instantiate
 * a fresh program without global state leaking between test cases.
 *
 * Architecture note: this file is the thin CLI layer. It registers commands,
 * parses arguments, and delegates to core modules. No business logic lives here.
 * Core functions return data; this layer formats it for the terminal.
 * Long-running operations emit structured events — this layer subscribes and prints.
 * (See prd/future/ui-app.md — a future Electron UI will consume the same core.)
 *
 * Config flags: global options here correspond to config fields overridable at the
 * CLI level. Commands access them via cmd.optsWithGlobals() and pass them to
 * loadConfig({ cliFlags: mapCliFlags(opts) }) from src/config.
 */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name('spotify-sync')
    .description('Sync your Spotify playlist to a local music library')
    .version(VERSION)
    // Global config overrides — highest precedence (above env vars and config file).
    .option('--library-path <path>', 'Override the local library directory (library.path)')
    .option('--db-path <path>', 'Override the SQLite DB file location (db_path)');

  // ---------------------------------------------------------------------------
  // auth — one-time OAuth flow to authenticate with Spotify
  // ---------------------------------------------------------------------------
  program
    .command('auth')
    .description('Authenticate with Spotify (one-time OAuth flow)')
    .option('--port <number>', 'Localhost port for the OAuth callback server', '8888')
    .option('--json', 'Output as JSON')
    .action(async function (this: Command) {
      // optsWithGlobals() merges local + global opts.
      const opts = this.optsWithGlobals<{
        port: string;
        json: boolean;
        libraryPath?: string;
        dbPath?: string;
      }>();
      await runAuthCommand({
        json: opts.json ?? false,
        port: Number(opts.port),
        globals: { libraryPath: opts.libraryPath, dbPath: opts.dbPath },
      });
    });

  // ---------------------------------------------------------------------------
  // doctor — setup health check
  // ---------------------------------------------------------------------------
  program
    .command('doctor')
    .description('Check that spotify-sync is correctly set up (config, auth, Spotify connectivity)')
    .option('--json', 'Output as JSON')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals<{
        json: boolean;
        libraryPath?: string;
        dbPath?: string;
      }>();
      await runDoctorCommand({
        json: opts.json ?? false,
        globals: { libraryPath: opts.libraryPath, dbPath: opts.dbPath },
      });
    });

  // ---------------------------------------------------------------------------
  // sync — main loop: fetch playlist tracks and download new ones
  // ---------------------------------------------------------------------------
  program
    .command('sync')
    .description('Fetch playlist tracks and download any that are pending')
    .option('--json', 'Output as JSON')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals<{
        json: boolean;
        libraryPath?: string;
        dbPath?: string;
      }>();
      await runSyncCommand({
        json: opts.json ?? false,
        globals: { libraryPath: opts.libraryPath, dbPath: opts.dbPath },
      });
    });

  // ---------------------------------------------------------------------------
  // status — show a summary of the local library state
  // ---------------------------------------------------------------------------
  program
    .command('status')
    .description('Show sync status (pending, failed, removed tracks)')
    .option('--json', 'Output as JSON')
    .action(() => {
      console.log('status: not yet implemented');
    });

  // ---------------------------------------------------------------------------
  // prune — review and optionally remove files for removed-from-playlist tracks
  // ---------------------------------------------------------------------------
  program
    .command('prune')
    .description('Review files for tracks removed from the playlist; optionally delete them')
    .option('--dry-run', 'Show what would be removed without deleting anything')
    .option('--json', 'Output as JSON')
    .action(() => {
      console.log('prune: not yet implemented');
    });

  // ---------------------------------------------------------------------------
  // import — manually resolve a needs_manual track with a local file
  // ---------------------------------------------------------------------------
  program
    .command('import')
    .description('Import a local audio file as the resolved download for a specific track')
    .argument('<file>', 'Path to the audio file to import')
    .requiredOption('--for <track-id>', 'Spotify track ID this file resolves')
    .option('--move', 'Move the file instead of copying it (default: copy)')
    .option('--json', 'Output as JSON')
    .action(async function (this: Command, file: string) {
      const opts = this.optsWithGlobals<{
        for: string;
        move: boolean;
        json: boolean;
        libraryPath?: string;
        dbPath?: string;
      }>();
      await runImportCommand({
        filePath: file,
        trackId: opts.for,
        move: opts.move ?? false,
        json: opts.json ?? false,
        globals: { libraryPath: opts.libraryPath, dbPath: opts.dbPath },
      });
    });

  return program;
}
