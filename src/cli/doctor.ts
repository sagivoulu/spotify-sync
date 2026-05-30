import { mapCliFlags } from '../config/index.js';
import { runDoctor } from '../doctor/index.js';

// ---------------------------------------------------------------------------
// runDoctorCommand — thin CLI handler for `spotify-sync doctor`.
//
// Responsibilities:
// 1. Delegate to runDoctor (returns structured CheckResult[]).
// 2. Format and print results (human or JSON).
// 3. Set process.exitCode: 0 if all checks pass, 1 if any fail.
//
// Error handling:
// - All expected failures (missing config, missing auth, API errors) are
//   already captured as ok=false CheckResults by the core — no try/catch here.
// - Unexpected errors propagate to the bin shim (which exits 1).
//
// Exit code contract:
// - 0 = all checks pass (suitable for scripting: && chaining).
// - 1 = one or more checks failed or were skipped.
// (Intentionally different from auth's exit-2-on-config-error convention —
// doctor's primary contract is the binary 0/1 scriptable interface.)
// ---------------------------------------------------------------------------

export interface RunDoctorCommandOptions {
  /** Whether to emit JSON output instead of human-readable text. */
  json: boolean;
  /** Global CLI flags (from cmd.optsWithGlobals()). */
  globals: { libraryPath?: string; dbPath?: string };
}

/**
 * Run the `spotify-sync doctor` command.
 * Exported for testing; `src/cli/program.ts` calls this from the .action() handler.
 */
export async function runDoctorCommand(options: RunDoctorCommandOptions): Promise<void> {
  const { json, globals } = options;

  const result = await runDoctor({
    cliFlags: mapCliFlags(globals),
    env: process.env,
  });

  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: result.ok, checks: result.results })}\n`);
  } else {
    for (const check of result.results) {
      const icon = check.ok ? '✓' : '✗';

      if (check.ok) {
        if (typeof check.data?.sampleTracks !== 'undefined') {
          // Spotify check success — print detail inline, sample tracks below.
          process.stdout.write(`${icon} ${check.name} — ${check.detail}\n`);
          const sampleTracks = check.data.sampleTracks as string[];
          for (let i = 0; i < sampleTracks.length; i++) {
            process.stdout.write(`  ${i + 1}. ${sampleTracks[i]}\n`);
          }
        } else {
          // Simple pass — icon + name only (detail is boilerplate, not useful on success).
          process.stdout.write(`${icon} ${check.name}\n`);
        }
      } else {
        // Failure — icon + name + full detail.
        // Multi-line details (e.g. ConfigError bullet lists) are printed with
        // the first line inline and subsequent lines indented by two spaces.
        const lines = check.detail.split('\n');
        process.stdout.write(`${icon} ${check.name} — ${lines[0]}\n`);
        for (const line of lines.slice(1)) {
          if (line.trim() !== '') {
            process.stdout.write(`  ${line}\n`);
          }
        }
      }
    }
  }

  process.exitCode = result.ok ? 0 : 1;
}
