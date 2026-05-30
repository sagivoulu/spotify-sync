import { renameSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { applyCollisionSuffix, buildFilename } from './filename.js';

// ---------------------------------------------------------------------------
// File placement — bridges pure filename logic and filesystem / DB side effects.
//
// These functions are only called when assigning a path to a *new* track row
// for the first time. They never rename or move files that already have a path.
// ---------------------------------------------------------------------------

/**
 * Resolve the relative `file_path` to store in `tracks.file_path` for a new
 * track being added to this library.
 *
 * Algorithm:
 * 1. Build the candidate filename from artist / title / ext.
 * 2. Collision check: does a *different* (source, source_id) in this library
 *    already own a file at that path? If yes, append a collision suffix derived
 *    from the first 8 chars of the new track's sourceId.
 * 3. Return the resulting relative path (flat layout in v1 = just the filename).
 *
 * This function is **read-only** — it does not write to the DB or filesystem.
 * The caller is responsible for storing the returned path in `tracks.file_path`
 * and later moving the downloaded file to the composed absolute path.
 */
export function resolveRelativePath(
  db: Database.Database,
  params: {
    libraryId: string;
    source: string;
    sourceId: string;
    artist: string;
    title: string;
    ext: string;
  },
): string {
  const { libraryId, source, sourceId, artist, title, ext } = params;
  const candidate = buildFilename({ artist, title, ext });

  // A "collision" is any track in this library whose file_path equals the
  // candidate but whose identity (source, source_id) differs from ours.
  const collision = db
    .prepare(
      `SELECT 1 FROM tracks
       WHERE library_id = ?
         AND file_path  = ?
         AND NOT (source = ? AND source_id = ?)
       LIMIT 1`,
    )
    .get(libraryId, candidate, source, sourceId);

  return collision ? applyCollisionSuffix(candidate, sourceId) : candidate;
}

/**
 * Compose the absolute path to a track's audio file from the library root and
 * the relative path stored in `tracks.file_path`.
 *
 * This is the read-time complement of relative storage: the library root can be
 * updated in `libraries.path` (e.g. when the user moves their library directory)
 * without touching any `tracks` rows — only this call needs the new root.
 */
export function composeAbsolutePath(libraryPath: string, relativePath: string): string {
  return join(libraryPath, relativePath);
}

/**
 * Atomically move a downloaded temp file to its final location in the library.
 *
 * Uses `fs.renameSync`, which is atomic when the source and destination are on
 * the same filesystem — the expected case for a local-disk library with a system
 * temp directory on the same volume.
 *
 * Returns the final absolute path so the caller can populate `tracks.file_path`
 * (after converting to relative via the library root).
 */
export function placeDownloadedFile(
  tempPath: string,
  libraryPath: string,
  relativePath: string,
): string {
  const finalPath = composeAbsolutePath(libraryPath, relativePath);
  renameSync(tempPath, finalPath);
  return finalPath;
}
