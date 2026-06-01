// ---------------------------------------------------------------------------
// Logging module — per-run log files for the sync pipeline.
//
// Design:
//   - Each sync run writes to ~/.local/state/spotify-sync/logs/<runUuid>.log
//   - The runUuid is a UUID v4 generated at run start — globally unique so
//     filenames never collide even when the database is reset.
//   - Logs are newline-delimited JSON (pino format), capturing yt-dlp/ffmpeg
//     stderr and run lifecycle events. The numeric runId (SQLite rowid) is
//     bound as a field on every entry for DB correlation.
//   - Console output via onEvent is NOT touched — this module is purely for
//     the file-based verbose log.
//   - All dependencies are injectable so tests can avoid real filesystem I/O.
// ---------------------------------------------------------------------------

import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';
import { logsDir, runLogPath } from '../config/paths.js';

// UUID v4 pattern — used to identify log files owned by this tool.
const UUID_LOG_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.log$/i;

// ---------------------------------------------------------------------------
// RunLogger — minimal interface (structural subset of pino.Logger)
// ---------------------------------------------------------------------------

/**
 * A lightweight logger scoped to a single sync run.
 * Core modules depend on this interface, not on pino directly.
 */
export interface RunLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  /** Flush and close the underlying destination. Returns a promise for async callers. */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// pruneRunLogs — keep-last-N retention cap
// ---------------------------------------------------------------------------

/**
 * Remove old per-run log files so at most `keep - 1` remain *before* the
 * current run's file is created. Files are sorted by mtime (oldest first)
 * since UUID v4 filenames are random and cannot be sorted numerically.
 *
 * Silently skips files that don't match the UUID log pattern. Does nothing
 * when the directory does not yet exist.
 *
 * @param dir   Resolved logs directory path (already derived from env).
 * @param keep  Maximum number of log files to keep total (including the one
 *              about to be written). Must be ≥ 1.
 */
export function pruneRunLogs(dir: string, keep: number): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    // Directory doesn't exist yet — nothing to prune.
    return;
  }

  // Collect UUID log files, sorted by mtime ascending (oldest first).
  const logFiles = entries
    .filter((name) => UUID_LOG_RE.test(name))
    .map((name) => {
      try {
        return { name, mtimeMs: statSync(join(dir, name)).mtimeMs };
      } catch {
        return { name, mtimeMs: 0 };
      }
    })
    .sort((a, b) => a.mtimeMs - b.mtimeMs);

  // Delete oldest files until we have `keep - 1` remaining (leaving room for
  // the current run's file which is about to be created).
  const toDelete = logFiles.slice(0, Math.max(0, logFiles.length - (keep - 1)));
  for (const file of toDelete) {
    try {
      rmSync(join(dir, file.name));
    } catch {
      // Best-effort: ignore individual deletion failures.
    }
  }
}

// ---------------------------------------------------------------------------
// createFileRunLogger
// ---------------------------------------------------------------------------

export interface FileRunLoggerOptions {
  /** Numeric SQLite rowid — bound as a field on every log entry for DB correlation. */
  runId: number;
  /** UUID v4 for the log filename — generated at run start so it's globally unique. */
  runUuid: string;
  /** Injectable environment for XDG path resolution. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Log level (from config.logging.level). Defaults to 'info'. */
  level?: string;
  /**
   * Maximum total number of per-run log files to retain.
   * Oldest files (by mtime) are pruned before opening the new one. Defaults to 20.
   */
  maxRunLogs?: number;
}

/**
 * Create a pino logger that writes to the per-run log file for `runUuid`.
 *
 * Prunes old log files first (keep-last-N by mtime), then opens the
 * destination and returns a RunLogger bound with both runId (for DB
 * correlation) and runUuid (for log-file correlation).
 *
 * The destination is opened synchronously (pino `sync: true`) so callers
 * don't need to await an open — pino buffers writes and flushes on close.
 */
export function createFileRunLogger(opts: FileRunLoggerOptions): RunLogger {
  const { runId, runUuid, env = process.env, level = 'info', maxRunLogs = 20 } = opts;

  const dir = logsDir(env);
  const dest = runLogPath(runUuid, env);

  // Prune before creating so we never exceed maxRunLogs total.
  pruneRunLogs(dir, maxRunLogs);

  const destination = pino.destination({ dest, sync: true, mkdir: true });
  const logger = pino({ level }, destination).child({ runId, runUuid });

  return {
    info: (obj, msg) => logger.info(obj, msg),
    warn: (obj, msg) => logger.warn(obj, msg),
    error: (obj, msg) => logger.error(obj, msg),
    close: () => {
      // sync: true means all writes are already flushed; end() closes the fd.
      destination.end();
      return Promise.resolve();
    },
  };
}

// ---------------------------------------------------------------------------
// createNoopRunLogger — safe default for tests / headless contexts
// ---------------------------------------------------------------------------

/**
 * Returns a RunLogger that discards all log entries.
 * Useful for tests that inject the logger but don't care about its output,
 * and as a safe fallback when logging is disabled.
 */
export function createNoopRunLogger(): RunLogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    close: () => Promise.resolve(),
  };
}
