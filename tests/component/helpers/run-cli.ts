import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// runCli — spawn the real spotify-sync binary as a subprocess.
//
// `node bin/spotify-sync <args>` is used (not execPath resolution via which)
// so the binary inherits the same Node version as the test runner.
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const BIN_PATH = resolve(REPO_ROOT, 'bin/spotify-sync');

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunCliOptions {
  args: string[];
  env: Record<string, string | undefined>;
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
      reject(
        new Error(`CLI timed out after ${timeoutMs} ms\nstdout: ${stdout}\nstderr: ${stderr}`),
      );
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

/** Run the CLI and JSON-parse stdout. Throws clearly if stdout is not valid JSON. */
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
