import { describe, expect, it } from 'vitest';
import { buildProgram } from './program.js';

describe('buildProgram', () => {
  it('registers all expected subcommands', () => {
    const program = buildProgram();
    const names = program.commands.map((cmd) => cmd.name());
    expect(names).toEqual(
      expect.arrayContaining(['auth', 'doctor', 'sync', 'status', 'prune', 'import']),
    );
    expect(names).toHaveLength(6);
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

  it('auth command has --port option defaulting to 8888', () => {
    const program = buildProgram();
    const auth = program.commands.find((cmd) => cmd.name() === 'auth');
    expect(auth).toBeDefined();
    const portOpt = auth?.options.find((opt) => opt.long === '--port');
    expect(portOpt).toBeDefined();
    expect(portOpt?.defaultValue).toBe('8888');
  });
});
