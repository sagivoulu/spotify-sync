import { createInterface } from 'node:readline/promises';
import { mapCliFlags } from '../config/index.js';
import { PruneError, type PruneResult, runPrune } from '../prune/index.js';

export interface RunPruneCommandOptions {
  dryRun: boolean;
  yes: boolean;
  json: boolean;
  globals: { libraryPath?: string; dbPath?: string };
}

export interface RunPruneCommandDeps {
  runPrune?: typeof runPrune;
  confirmDeletion?: (count: number, opts: { json: boolean }) => Promise<boolean>;
}

type PruneCommandJsonResult = PruneResult & {
  confirmed: boolean;
  aborted: boolean;
};

export async function runPruneCommand(
  options: RunPruneCommandOptions,
  deps: RunPruneCommandDeps = {},
): Promise<void> {
  const { dryRun, yes, json, globals } = options;
  const run = deps.runPrune ?? runPrune;
  const confirm = deps.confirmDeletion ?? confirmDeletion;

  let preview: PruneResult;
  try {
    preview = await run({
      dryRun: true,
      refreshSource: true,
      cliFlags: mapCliFlags(globals),
      env: process.env,
    });
  } catch (err) {
    if (err instanceof PruneError) {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  if (dryRun) {
    if (json) {
      process.stdout.write(`${JSON.stringify({ ...preview, confirmed: false, aborted: false })}\n`);
    } else {
      printCandidates(preview, true);
    }
    process.exitCode = 0;
    return;
  }

  if (!json) {
    printCandidates(preview, false);
  }

  if (preview.candidates.length === 0) {
    const result: PruneCommandJsonResult = {
      ...preview,
      dryRun: false,
      outcomes: [],
      confirmed: false,
      aborted: false,
    };
    if (json) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
    process.exitCode = 0;
    return;
  }

  const confirmed = yes || (await confirm(preview.candidates.length, { json }));
  if (!confirmed) {
    const result: PruneCommandJsonResult = {
      ...preview,
      dryRun: false,
      outcomes: [],
      prunedCount: 0,
      missingCount: 0,
      failedCount: 0,
      confirmed: false,
      aborted: true,
    };

    if (json) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else {
      process.stdout.write('Aborted. No files were touched.\n');
    }
    process.exitCode = 0;
    return;
  }

  let result: PruneResult;
  try {
    result = await run({
      dryRun: false,
      refreshSource: false,
      candidates: preview.candidates,
      cliFlags: mapCliFlags(globals),
      env: process.env,
    });
  } catch (err) {
    if (err instanceof PruneError) {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const jsonResult: PruneCommandJsonResult = {
    ...result,
    confirmed: true,
    aborted: false,
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(jsonResult)}\n`);
  } else {
    printOutcomes(result);
  }

  process.exitCode = result.ok ? 0 : 1;
}

async function confirmDeletion(count: number, opts: { json: boolean }): Promise<boolean> {
  const output = opts.json ? process.stderr : process.stdout;
  const rl = createInterface({ input: process.stdin, output });
  try {
    const answer = await rl.question(`Delete ${count} files? [y/N] `);
    return isConfirmedAnswer(answer);
  } finally {
    rl.close();
  }
}

export function isConfirmedAnswer(answer: string): boolean {
  return ['y', 'yes'].includes(answer.trim().toLowerCase());
}

function printCandidates(result: PruneResult, dryRun: boolean): void {
  const count = result.candidates.length;
  if (count === 0) {
    process.stdout.write('No removed tracks with files to prune.\n');
    return;
  }

  process.stdout.write(`${dryRun ? 'Would move' : 'Will move'} ${count} file(s) to trash:\n`);
  for (const track of result.candidates) {
    process.stdout.write(`  - ${track.artist} - ${track.title}\n`);
    process.stdout.write(`    ${track.absolutePath}\n`);
  }

  if (dryRun) {
    process.stdout.write('\nDry run: no files were touched.\n');
  }
}

function printOutcomes(result: PruneResult): void {
  for (const outcome of result.outcomes) {
    switch (outcome.status) {
      case 'trashed':
        process.stdout.write(`Trashed: ${outcome.artist} - ${outcome.title}\n`);
        break;
      case 'missing':
        process.stdout.write(
          `Missing: ${outcome.artist} - ${outcome.title} (${outcome.absolutePath}); cleared DB path\n`,
        );
        break;
      case 'failed':
        process.stdout.write(
          `Failed: ${outcome.artist} - ${outcome.title} (${outcome.absolutePath}): ${outcome.error ?? 'unknown error'}\n`,
        );
        break;
      case 'would-trash':
        break;
    }
  }

  process.stdout.write(
    `\nDone. trashed=${result.prunedCount} missing=${result.missingCount} failed=${result.failedCount}\n`,
  );
}

export type { PruneCommandJsonResult };
