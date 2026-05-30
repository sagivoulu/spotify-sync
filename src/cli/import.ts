import { mapCliFlags } from '../config/index.js';
import { ImportError, runImport } from '../import/index.js';

export interface RunImportCommandOptions {
  filePath: string;
  trackId: string;
  move: boolean;
  json: boolean;
  globals: { libraryPath?: string; dbPath?: string };
}

export interface RunImportCommandDeps {
  runImport?: typeof runImport;
}

export async function runImportCommand(
  options: RunImportCommandOptions,
  deps: RunImportCommandDeps = {},
): Promise<void> {
  const run = deps.runImport ?? runImport;

  let result: Awaited<ReturnType<typeof runImport>>;
  try {
    result = await run({
      filePath: options.filePath,
      trackId: options.trackId,
      move: options.move,
      cliFlags: mapCliFlags(options.globals),
      env: process.env,
    });
  } catch (err) {
    if (err instanceof ImportError) {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(`Imported ${result.trackId} -> ${result.finalPath}\n`);
  }

  process.exitCode = 0;
}
