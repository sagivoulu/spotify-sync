import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/connection.js';
import { registerLibrary } from '../db/index.js';
import { runMigrations } from '../db/migrations.js';
import { composeAbsolutePath, placeDownloadedFile, resolveRelativePath } from './placement.js';

// ---------------------------------------------------------------------------
// Shared DB helpers
// ---------------------------------------------------------------------------

/**
 * Open an in-memory DB, run migrations, and register a library row.
 * Returns the open Database — caller is responsible for closing it.
 */
function makeDb(libraryId = 'default', libraryPath = '/music/wcs') {
  const db = openDatabase(':memory:');
  runMigrations(db);
  registerLibrary(db, libraryId, libraryPath, '2026-01-01T00:00:00.000Z');
  return db;
}

/**
 * Insert a minimal downloaded track row so collision checks have something to hit.
 */
function insertTrack(
  db: ReturnType<typeof makeDb>,
  opts: { libraryId: string; source: string; sourceId: string; filePath: string },
) {
  db.prepare(`
    INSERT INTO tracks
      (library_id, source, source_id, artist, title, status, first_seen_at, last_synced_at, file_path)
    VALUES (?, ?, ?, 'Artist', 'Title', 'downloaded', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', ?)
  `).run(opts.libraryId, opts.source, opts.sourceId, opts.filePath);
}

// ---------------------------------------------------------------------------
// resolveRelativePath
// ---------------------------------------------------------------------------

describe('resolveRelativePath', () => {
  it('returns the candidate filename when the library is empty (no collision)', () => {
    const db = makeDb();
    const result = resolveRelativePath(db, {
      libraryId: 'default',
      source: 'spotify',
      sourceId: 'abc123',
      artist: 'Adele',
      title: 'Hello',
      ext: 'mp3',
    });
    db.close();
    expect(result).toBe('Adele - Hello.mp3');
  });

  it('returns the candidate when the only matching file_path belongs to the same (source, source_id)', () => {
    const db = makeDb();
    // Same identity as the track we're resolving — not a foreign collision.
    insertTrack(db, {
      libraryId: 'default',
      source: 'spotify',
      sourceId: 'abc123',
      filePath: 'Adele - Hello.mp3',
    });

    const result = resolveRelativePath(db, {
      libraryId: 'default',
      source: 'spotify',
      sourceId: 'abc123',
      artist: 'Adele',
      title: 'Hello',
      ext: 'mp3',
    });
    db.close();
    expect(result).toBe('Adele - Hello.mp3');
  });

  it('appends a collision suffix when a different (source, source_id) already holds the candidate filename', () => {
    const db = makeDb();
    // 'xyz789' owns 'Adele - Hello.mp3' already.
    insertTrack(db, {
      libraryId: 'default',
      source: 'spotify',
      sourceId: 'xyz789',
      filePath: 'Adele - Hello.mp3',
    });

    // New track with sourceId 'abc12345' → first 8 chars = 'abc12345'.
    const result = resolveRelativePath(db, {
      libraryId: 'default',
      source: 'spotify',
      sourceId: 'abc12345',
      artist: 'Adele',
      title: 'Hello',
      ext: 'mp3',
    });
    db.close();
    expect(result).toBe('Adele - Hello [abc12345].mp3');
  });

  it('does not treat tracks in a different library as a collision', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    registerLibrary(db, 'lib-a', '/music/a', '2026-01-01T00:00:00.000Z');
    registerLibrary(db, 'lib-b', '/music/b', '2026-01-01T00:00:00.000Z');

    // lib-a already has 'Adele - Hello.mp3'.
    insertTrack(db, {
      libraryId: 'lib-a',
      source: 'spotify',
      sourceId: 'xyz789',
      filePath: 'Adele - Hello.mp3',
    });

    // Resolving for lib-b — the lib-a row must not trigger a collision.
    const result = resolveRelativePath(db, {
      libraryId: 'lib-b',
      source: 'spotify',
      sourceId: 'abc123',
      artist: 'Adele',
      title: 'Hello',
      ext: 'mp3',
    });
    db.close();
    expect(result).toBe('Adele - Hello.mp3');
  });

  it('sanitizes artist and title before checking for collisions', () => {
    const db = makeDb();
    const result = resolveRelativePath(db, {
      libraryId: 'default',
      source: 'spotify',
      sourceId: 'id1',
      artist: 'AC/DC', // slash gets stripped → 'ACDC'
      title: 'TNT',
      ext: 'mp3',
    });
    db.close();
    expect(result).toBe('ACDC - TNT.mp3');
  });
});

// ---------------------------------------------------------------------------
// composeAbsolutePath — relative-path storage invariant
// ---------------------------------------------------------------------------

describe('composeAbsolutePath', () => {
  it('joins the library root and the relative path', () => {
    expect(composeAbsolutePath('/music/wcs', 'Adele - Hello.mp3')).toBe(
      '/music/wcs/Adele - Hello.mp3',
    );
  });

  it('relative-path storage invariant: changing only the library root gives the correct absolute path', () => {
    // The relative path stored in tracks.file_path stays constant.
    // Only libraries.path changes when the user moves their library.
    const relativePath = 'Adele - Hello.mp3';

    const pathAtOriginalLocation = composeAbsolutePath('/original/library', relativePath);
    const pathAfterMove = composeAbsolutePath('/new/location/library', relativePath);

    expect(pathAtOriginalLocation).toBe('/original/library/Adele - Hello.mp3');
    expect(pathAfterMove).toBe('/new/location/library/Adele - Hello.mp3');
  });

  it('handles a collision-suffixed relative path', () => {
    expect(composeAbsolutePath('/music/wcs', 'Adele - Hello [abc12345].mp3')).toBe(
      '/music/wcs/Adele - Hello [abc12345].mp3',
    );
  });
});

// ---------------------------------------------------------------------------
// placeDownloadedFile
// ---------------------------------------------------------------------------

describe('placeDownloadedFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'spotify-sync-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('moves the temp file to the final path and returns the absolute path', () => {
    const tempPath = join(tmpDir, 'download.tmp');
    writeFileSync(tempPath, 'audio data');

    const finalPath = placeDownloadedFile(tempPath, tmpDir, 'Artist - Title.mp3');

    expect(finalPath).toBe(join(tmpDir, 'Artist - Title.mp3'));
    expect(existsSync(finalPath)).toBe(true);
    expect(existsSync(tempPath)).toBe(false); // temp file is gone
  });

  it('the moved file retains its original contents', () => {
    const tempPath = join(tmpDir, 'download.tmp');
    const content = 'fake mp3 content 12345';
    writeFileSync(tempPath, content);

    const finalPath = placeDownloadedFile(tempPath, tmpDir, 'Artist - Title.mp3');

    expect(readFileSync(finalPath, 'utf8')).toBe(content);
  });

  it('composes the final path from libraryPath + relativePath', () => {
    const tempPath = join(tmpDir, 'download.tmp');
    writeFileSync(tempPath, '');

    const relativePath = 'Artist - Title [abc12345].mp3';
    const finalPath = placeDownloadedFile(tempPath, tmpDir, relativePath);

    expect(finalPath).toBe(join(tmpDir, relativePath));
  });
});
