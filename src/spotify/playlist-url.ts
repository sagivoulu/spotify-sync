// ---------------------------------------------------------------------------
// Playlist URL / URI parser.
//
// Accepted forms:
//   https://open.spotify.com/playlist/<id>
//   https://open.spotify.com/playlist/<id>?si=...
//   spotify:playlist:<id>
//
// Spotify playlist IDs are base-62 strings (letters and digits, typically 22
// characters). The regex allows any alphanumeric run to be forward-compatible
// with ID format changes.
// ---------------------------------------------------------------------------

/**
 * Extract the bare Spotify playlist ID from a URL or URI.
 *
 * @throws {Error} if the input doesn't match any recognised form.
 */
export function parsePlaylistId(input: string): string {
  // HTTPS URL: https://open.spotify.com/playlist/<id>[?si=...]
  const urlMatch = /^https:\/\/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)(\?.*)?$/.exec(input);
  if (urlMatch) {
    return urlMatch[1];
  }

  // Spotify URI: spotify:playlist:<id>
  const uriMatch = /^spotify:playlist:([A-Za-z0-9]+)$/.exec(input);
  if (uriMatch) {
    return uriMatch[1];
  }

  throw new Error(
    `Cannot parse playlist ID from: "${input}"\nExpected a URL like https://open.spotify.com/playlist/... or a URI like spotify:playlist:...`,
  );
}
