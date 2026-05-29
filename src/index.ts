import { buildProgram } from './cli/program.js';

// Entrypoint: wire up the CLI and hand off to commander.
// Keep this file thin — all command registration lives in src/cli/.
await buildProgram().parseAsync(process.argv);
