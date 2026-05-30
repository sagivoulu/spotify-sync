import { format, parse } from 'node:path';

// ---------------------------------------------------------------------------
// Filename sanitization and generation — pure functions, no I/O.
//
// Format: `<artist> - <title>.<ext>`
//   - Artist = first artist in the track's artists list.
//   - Featured artists go in ID3 tags, not the filename (keeps names short for VDJ).
//   - The filename a track gets on first download is permanent — VirtualDJ breaks
//     tag associations when files are renamed after first write.
// ---------------------------------------------------------------------------

/** Characters forbidden in filenames on Windows and common UNIX filesystems. */
const ILLEGAL_CHARS_RE = /[/\\:*?"<>|]/g;

/**
 * Sanitize a single filename component (artist or title).
 *
 * - Strips filesystem-illegal characters: `/ \ : * ? " < > |`
 * - Collapses runs of whitespace (spaces, tabs, newlines) to a single space
 * - Trims leading/trailing whitespace
 */
export function sanitizeComponent(value: string): string {
  return value.replace(ILLEGAL_CHARS_RE, '').replace(/\s+/g, ' ').trim();
}

/**
 * Build the base name (without extension) for a track: `<artist> - <title>`.
 *
 * Falls back to `"Unknown Artist"` / `"Unknown Title"` when the sanitized
 * component is empty (e.g. the original value consisted entirely of illegal
 * characters or whitespace).
 */
export function buildBaseName({ artist, title }: { artist: string; title: string }): string {
  const sanitizedArtist = sanitizeComponent(artist) || 'Unknown Artist';
  const sanitizedTitle = sanitizeComponent(title) || 'Unknown Title';
  return `${sanitizedArtist} - ${sanitizedTitle}`;
}

/**
 * Build the full filename for a track: `<artist> - <title>.<ext>`.
 *
 * `ext` is the bare extension without a leading dot, e.g. `"mp3"`.
 */
export function buildFilename({
  artist,
  title,
  ext,
}: {
  artist: string;
  title: string;
  ext: string;
}): string {
  return `${buildBaseName({ artist, title })}.${ext}`;
}

/**
 * Apply a collision suffix to a filename when two different tracks would map
 * to the same name on disk.
 *
 * Inserts ` [<first-8-chars-of-sourceId>]` before the file extension:
 *   `"Artist - Title.mp3"` → `"Artist - Title [12345678].mp3"`
 *
 * Uses `node:path` parse/format so a `.` embedded inside the base name
 * (e.g. `"U.S.A."`, `"feat."`) is not mistakenly treated as the extension
 * boundary — only the *last* dot in the filename is the extension.
 */
export function applyCollisionSuffix(filename: string, sourceId: string): string {
  const suffix = sourceId.slice(0, 8);
  const { dir, name, ext } = parse(filename);
  return format({ dir, base: `${name} [${suffix}]${ext}` });
}
