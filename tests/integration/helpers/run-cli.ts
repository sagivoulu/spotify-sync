import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// runCli — spawn the real spotify-sync binary as a subprocess.
//
// The binary is `bin/spotify-sync`, which dynamically imports dist/index.js.
// We invoke it via `node bin/spotify-sync <args>` rather than by exec path so
// it inherits the Node version from the test runner (consistent with the real
// install scenario).
//
// runCliJson is a convenience wrapper that JSON-parses stdout — all integration
// tests pass --json to every command for deterministic output parsing.
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const BIN_PATH = resolve(REPO_ROOT, 'bin/spotify-sync');

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunCliOptions {
  /** CLI arguments (not including `node` or the bin path). */
  args: string[];
  /**
   * Environment variables for the child process.
   * Merged on top of the test process's env so Node internals still work.
   * Pass XDG_*, SPOTIFY_SYNC_*, PATH, and any test-specific overrides here.
   */
  env: Record<string, string | undefined>;
  /** Milliseconds before the child is killed and the promise rejects. Default: 60 000. */
  timeoutMs?: number;
}

export function runCli(opts: RunCliOptions): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const { args, env, timeoutMs = 60_000 } = opts;
    let stdout = '';
    let stderr = '';

    const child = spawn(process.execPath, [BIN_PATH, ...args], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`CLI timed out after ${timeoutMs} ms\nstdout: ${stdout}\nstderr: ${stderr}`));
    }, timeoutMs);

    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });

    child.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export interface CliJsonResult<T> {
  result: T;
  exitCode: number;
  stderr: string;
}

/**
 * Run the CLI and JSON-parse stdout.
 * Throws if stdout is not valid JSON, so test failures surface clearly.
 */
export async function runCliJson<T = unknown>(opts: RunCliOptions): Promise<CliJsonResult<T>> {
  const { exitCode, stdout, stderr } = await runCli(opts);
  let result: T;
  try {
    result = JSON.parse(stdout.trim()) as T;
  } catch {
    throw new Error(
      `CLI stdout was not valid JSON.\nstdout: ${stdout}\nstderr: ${stderr}\nexitCode: ${exitCode}`,
    );
  }
  return { result, exitCode, stderr };
}
