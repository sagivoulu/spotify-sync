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

  it.each([
    { char: '/', input: 'AC/DC', expected: 'ACDC' },
    { char: '\\', input: 'AC\\DC', expected: 'ACDC' },
    { char: ':', input: 'Song: Remix', expected: 'Song Remix' },
    { char: '*', input: 'Song*', expected: 'Song' },
    { char: '?', input: 'What?', expected: 'What' },
    { char: '"', input: '"Quoted"', expected: 'Quoted' },
    { char: '<', input: 'A<B', expected: 'AB' },
    { char: '<', input: 'A < B', expected: 'A B' }, // stripped char leaves two spaces; collapse kicks in
    { char: '>', input: 'A>B', expected: 'AB' },
    { char: '>', input: 'A > B', expected: 'A B' }, // stripped char leaves two spaces; collapse kicks in
    { char: '|', input: 'A|B', expected: 'AB' },
  ])('strips $char  ($input → $expected)', ({ input, expected }) => {
    expect(sanitizeComponent(input)).toBe(expected);
  });

  it.each([
    { desc: 'multiple spaces', input: 'Too  Many   Spaces', expected: 'Too Many Spaces' },
    { desc: 'tab', input: 'Tab\there', expected: 'Tab here' },
    { desc: 'newline', input: 'Line\nBreak', expected: 'Line Break' },
    { desc: 'leading whitespace', input: '  hello', expected: 'hello' },
    { desc: 'trailing whitespace', input: 'hello  ', expected: 'hello' },
  ])('normalizes whitespace — $desc', ({ input, expected }) => {
    expect(sanitizeComponent(input)).toBe(expected);
  });

  it.each([
    { desc: 'accented characters', input: 'Beyoncé', expected: 'Beyoncé' },
    { desc: 'CJK characters', input: '坂本龍一', expected: '坂本龍一' },
    { desc: 'emoji', input: 'Song 🎵', expected: 'Song 🎵' },
  ])('preserves unicode — $desc', ({ input, expected }) => {
    expect(sanitizeComponent(input)).toBe(expected);
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
  it.each([
    { artist: 'Adele', title: 'Hello', expected: 'Adele - Hello' },
    { artist: '', title: 'Hello', expected: 'Unknown Artist - Hello' },
    { artist: 'Adele', title: '', expected: 'Adele - Unknown Title' },
    { artist: '', title: '', expected: 'Unknown Artist - Unknown Title' },
    { artist: '//\\*', title: 'Test', expected: 'Unknown Artist - Test' }, // all chars illegal
    { artist: '   ', title: 'Test', expected: 'Unknown Artist - Test' }, // whitespace-only
    { artist: 'Test', title: '   ', expected: 'Test - Unknown Title' }, // whitespace-only title
  ])('("$artist", "$title") → "$expected"', ({ artist, title, expected }) => {
    expect(buildBaseName({ artist, title })).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// buildFilename
// ---------------------------------------------------------------------------

describe('buildFilename', () => {
  it.each([
    { artist: 'Adele', title: 'Hello', ext: 'mp3', expected: 'Adele - Hello.mp3' },
    { artist: 'Beyoncé', title: 'Halo', ext: 'mp3', expected: 'Beyoncé - Halo.mp3' },
    { artist: 'Artist', title: '坂本龍一', ext: 'mp3', expected: 'Artist - 坂本龍一.mp3' },
    { artist: 'Artist', title: 'Title', ext: 'm4a', expected: 'Artist - Title.m4a' },
  ])('$artist / $title ($ext) → $expected', ({ artist, title, ext, expected }) => {
    expect(buildFilename({ artist, title, ext })).toBe(expected);
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
  it.each([
    {
      desc: 'takes the first 8 chars of a longer sourceId',
      filename: 'Artist - Title.mp3',
      sourceId: '12345678abcdef',
      expected: 'Artist - Title [12345678].mp3',
    },
    {
      desc: 'truncates at exactly 8 chars',
      filename: 'A - B.mp3',
      sourceId: 'abcdefghijklmnop',
      expected: 'A - B [abcdefgh].mp3',
    },
    {
      desc: 'uses the full sourceId when it is shorter than 8 chars',
      filename: 'A - B.mp3',
      sourceId: 'abc',
      expected: 'A - B [abc].mp3',
    },
    {
      desc: 'does not treat an inner dot as the extension boundary',
      filename: 'Artist - U.S.A..mp3',
      sourceId: '12345678',
      expected: 'Artist - U.S.A. [12345678].mp3',
    },
    {
      desc: 'works with m4a extension',
      filename: 'Artist - Title.m4a',
      sourceId: '12345678',
      expected: 'Artist - Title [12345678].m4a',
    },
    {
      desc: 'handles a filename with no extension',
      filename: 'Artist - Title',
      sourceId: '12345678',
      expected: 'Artist - Title [12345678]',
    },
  ])('$desc', ({ filename, sourceId, expected }) => {
    expect(applyCollisionSuffix(filename, sourceId)).toBe(expected);
  });
});
