import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { authFilePath, configDir, configFilePath, defaultDataDir } from './paths.js';

describe('configDir', () => {
  it('falls back to ~/.config/spotify-sync when XDG_CONFIG_HOME is unset', () => {
    expect(configDir({})).toBe(join(homedir(), '.config', 'spotify-sync'));
  });

  it('respects XDG_CONFIG_HOME when set', () => {
    expect(configDir({ XDG_CONFIG_HOME: '/custom/config' })).toBe(
      join('/custom/config', 'spotify-sync'),
    );
  });
});

describe('configFilePath', () => {
  it('returns config.json inside the config dir (default XDG)', () => {
    expect(configFilePath({})).toBe(join(homedir(), '.config', 'spotify-sync', 'config.json'));
  });

  it('respects XDG_CONFIG_HOME when set', () => {
    expect(configFilePath({ XDG_CONFIG_HOME: '/xdg/config' })).toBe(
      join('/xdg/config', 'spotify-sync', 'config.json'),
    );
  });
});

describe('authFilePath', () => {
  it('returns auth.json inside the config dir (default XDG)', () => {
    expect(authFilePath({})).toBe(join(homedir(), '.config', 'spotify-sync', 'auth.json'));
  });

  it('respects XDG_CONFIG_HOME when set', () => {
    expect(authFilePath({ XDG_CONFIG_HOME: '/xdg/config' })).toBe(
      join('/xdg/config', 'spotify-sync', 'auth.json'),
    );
  });
});

describe('defaultDataDir', () => {
  it('falls back to ~/.local/share/spotify-sync when XDG_DATA_HOME is unset', () => {
    expect(defaultDataDir({})).toBe(join(homedir(), '.local', 'share', 'spotify-sync'));
  });

  it('respects XDG_DATA_HOME when set', () => {
    expect(defaultDataDir({ XDG_DATA_HOME: '/custom/data' })).toBe(
      join('/custom/data', 'spotify-sync'),
    );
  });
});
