import { describe, expect, it } from 'vitest';
import {
  applyCollisionSuffix,
  buildBaseName,
  buildFilename,
  sanitizeComponent,
} from './filename.js';

// ---------------------------------------------------------------------------
// sanitizeComponent
// ---------------------------------------------------------------------------

describe('sanitizeComponent', () => {
  it('returns a clean string unchanged', () => {
    expect(sanitizeComponent('Tory Lanez')).toBe('Tory Lanez');
  });

  // One test per illegal character, as required by the acceptance criteria.

  it('strips / (forward slash)', () => {
    expect(sanitizeComponent('AC/DC')).toBe('ACDC');
  });

  it('strips \\ (backslash)', () => {
    expect(sanitizeComponent('AC\\DC')).toBe('ACDC');
  });

  it('strips : (colon)', () => {
    expect(sanitizeComponent('Song: Remix')).toBe('Song Remix');
  });

  it('strips * (asterisk)', () => {
    expect(sanitizeComponent('Song*')).toBe('Song');
  });

  it('strips ? (question mark)', () => {
    expect(sanitizeComponent('What?')).toBe('What');
  });

  it('strips " (double quote)', () => {
    expect(sanitizeComponent('"Quoted"')).toBe('Quoted');
  });

  it('strips < (less-than)', () => {
    expect(sanitizeComponent('A<B')).toBe('AB');
    // surrounding spaces collapse to one after the char is removed
    expect(sanitizeComponent('A < B')).toBe('A B');
  });

  it('strips > (greater-than)', () => {
    expect(sanitizeComponent('A>B')).toBe('AB');
    expect(sanitizeComponent('A > B')).toBe('A B');
  });

  it('strips | (pipe)', () => {
    expect(sanitizeComponent('A|B')).toBe('AB');
  });

  it('collapses multiple spaces to a single space', () => {
    expect(sanitizeComponent('Too  Many   Spaces')).toBe('Too Many Spaces');
  });

  it('collapses tabs to a single space', () => {
    expect(sanitizeComponent('Tab\there')).toBe('Tab here');
  });

  it('collapses newlines to a single space', () => {
    expect(sanitizeComponent('Line\nBreak')).toBe('Line Break');
  });

  it('trims leading whitespace', () => {
    expect(sanitizeComponent('  hello')).toBe('hello');
  });

  it('trims trailing whitespace', () => {
    expect(sanitizeComponent('hello  ')).toBe('hello');
  });

  it('preserves unicode — accented characters', () => {
    expect(sanitizeComponent('Beyoncé')).toBe('Beyoncé');
  });

  it('preserves unicode — CJK characters', () => {
    expect(sanitizeComponent('坂本龍一')).toBe('坂本龍一');
  });

  it('preserves unicode — emoji (no stripping)', () => {
    expect(sanitizeComponent('Song 🎵')).toBe('Song 🎵');
  });

  it('returns empty string when every character is illegal', () => {
    expect(sanitizeComponent('/*?')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(sanitizeComponent('   ')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// buildBaseName
// ---------------------------------------------------------------------------

describe('buildBaseName', () => {
  it('formats as "artist - title"', () => {
    expect(buildBaseName({ artist: 'Adele', title: 'Hello' })).toBe('Adele - Hello');
  });

  it('falls back to "Unknown Artist" when artist is empty string', () => {
    expect(buildBaseName({ artist: '', title: 'Hello' })).toBe('Unknown Artist - Hello');
  });

  it('falls back to "Unknown Title" when title is empty string', () => {
    expect(buildBaseName({ artist: 'Adele', title: '' })).toBe('Adele - Unknown Title');
  });

  it('falls back to both unknowns when both are empty', () => {
    expect(buildBaseName({ artist: '', title: '' })).toBe('Unknown Artist - Unknown Title');
  });

  it('falls back to "Unknown Artist" when artist is all illegal chars', () => {
    expect(buildBaseName({ artist: '//\\*', title: 'Test' })).toBe('Unknown Artist - Test');
  });

  it('falls back to "Unknown Artist" when artist is whitespace-only', () => {
    expect(buildBaseName({ artist: '   ', title: 'Test' })).toBe('Unknown Artist - Test');
  });

  it('falls back to "Unknown Title" when title is whitespace-only', () => {
    expect(buildBaseName({ artist: 'Test', title: '   ' })).toBe('Test - Unknown Title');
  });
});

// ---------------------------------------------------------------------------
// buildFilename
// ---------------------------------------------------------------------------

describe('buildFilename', () => {
  it('builds "artist - title.ext"', () => {
    expect(buildFilename({ artist: 'Adele', title: 'Hello', ext: 'mp3' })).toBe(
      'Adele - Hello.mp3',
    );
  });

  it('handles unicode in artist', () => {
    expect(buildFilename({ artist: 'Beyoncé', title: 'Halo', ext: 'mp3' })).toBe(
      'Beyoncé - Halo.mp3',
    );
  });

  it('handles unicode in title', () => {
    expect(buildFilename({ artist: 'Artist', title: '坂本龍一', ext: 'mp3' })).toBe(
      'Artist - 坂本龍一.mp3',
    );
  });

  it('works with m4a extension', () => {
    expect(buildFilename({ artist: 'Artist', title: 'Title', ext: 'm4a' })).toBe(
      'Artist - Title.m4a',
    );
  });

  it('sanitizes artist and title before composing', () => {
    expect(buildFilename({ artist: 'AC/DC', title: 'Song: Live', ext: 'mp3' })).toBe(
      'ACDC - Song Live.mp3',
    );
  });
});

// ---------------------------------------------------------------------------
// applyCollisionSuffix
// ---------------------------------------------------------------------------

describe('applyCollisionSuffix', () => {
  it('inserts the first 8 chars of sourceId before the extension', () => {
    expect(applyCollisionSuffix('Artist - Title.mp3', '12345678abcdef')).toBe(
      'Artist - Title [12345678].mp3',
    );
  });

  it('uses exactly 8 chars even for a longer sourceId', () => {
    expect(applyCollisionSuffix('A - B.mp3', 'abcdefghijklmnop')).toBe('A - B [abcdefgh].mp3');
  });

  it('uses the full sourceId when it is shorter than 8 chars', () => {
    expect(applyCollisionSuffix('A - B.mp3', 'abc')).toBe('A - B [abc].mp3');
  });

  it('does not treat a dot inside the base name as the extension boundary', () => {
    // "Artist - U.S.A..mp3" — the extension is .mp3; the dots in U.S.A. are part of the name.
    expect(applyCollisionSuffix('Artist - U.S.A..mp3', '12345678')).toBe(
      'Artist - U.S.A. [12345678].mp3',
    );
  });

  it('works with m4a extension', () => {
    expect(applyCollisionSuffix('Artist - Title.m4a', '12345678')).toBe(
      'Artist - Title [12345678].m4a',
    );
  });

  it('handles a filename with no extension (edge case)', () => {
    expect(applyCollisionSuffix('Artist - Title', '12345678')).toBe('Artist - Title [12345678]');
  });
});
