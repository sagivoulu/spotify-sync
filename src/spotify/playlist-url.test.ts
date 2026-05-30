import { describe, expect, it } from 'vitest';
import { parsePlaylistId } from './playlist-url.js';

describe('parsePlaylistId', () => {
  // ---------------------------------------------------------------------------
  // HTTPS URL forms
  // ---------------------------------------------------------------------------

  it('parses a bare HTTPS URL', () => {
    expect(parsePlaylistId('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toBe(
      '37i9dQZF1DXcBWIGoYBM5M',
    );
  });

  it('parses a HTTPS URL with a ?si= query parameter', () => {
    expect(
      parsePlaylistId('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123xyz456'),
    ).toBe('37i9dQZF1DXcBWIGoYBM5M');
  });

  it('parses a HTTPS URL with multiple query parameters', () => {
    expect(
      parsePlaylistId('https://open.spotify.com/playlist/ABC123?si=foo&utm_source=copy-link'),
    ).toBe('ABC123');
  });

  // ---------------------------------------------------------------------------
  // Spotify URI form
  // ---------------------------------------------------------------------------

  it('parses a Spotify URI', () => {
    expect(parsePlaylistId('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')).toBe(
      '37i9dQZF1DXcBWIGoYBM5M',
    );
  });

  // ---------------------------------------------------------------------------
  // Error cases
  // ---------------------------------------------------------------------------

  it('throws on a non-playlist Spotify URL (track)', () => {
    expect(() => parsePlaylistId('https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh')).toThrow(
      /Cannot parse playlist ID/,
    );
  });

  it('throws on a plain string (not a URL or URI)', () => {
    expect(() => parsePlaylistId('not-a-url')).toThrow(/Cannot parse playlist ID/);
  });

  it('throws on an empty string', () => {
    expect(() => parsePlaylistId('')).toThrow(/Cannot parse playlist ID/);
  });

  it('throws on an http:// (not https://) URL', () => {
    expect(() =>
      parsePlaylistId('http://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'),
    ).toThrow(/Cannot parse playlist ID/);
  });

  it('throws on a Spotify URI with the wrong type (album)', () => {
    expect(() => parsePlaylistId('spotify:album:37i9dQZF1DXcBWIGoYBM5M')).toThrow(
      /Cannot parse playlist ID/,
    );
  });
});
