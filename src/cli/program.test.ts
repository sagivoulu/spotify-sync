import { describe, expect, it } from 'vitest';
import { buildProgram } from './program.js';

describe('buildProgram', () => {
  it('registers all expected subcommands', () => {
    const program = buildProgram();
    const names = program.commands.map((cmd) => cmd.name());
    expect(names).toEqual(expect.arrayContaining(['auth', 'sync', 'status', 'prune', 'import']));
    expect(names).toHaveLength(5);
  });

  it('sets the correct program name', () => {
    const program = buildProgram();
    expect(program.name()).toBe('spotify-sync');
  });

  it('each command supports --json flag', () => {
    const program = buildProgram();
    for (const cmd of program.commands) {
      const hasJson = cmd.options.some((opt) => opt.long === '--json');
      expect(hasJson, `${cmd.name()} should have --json option`).toBe(true);
    }
  });
});
