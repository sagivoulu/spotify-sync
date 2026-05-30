// ---------------------------------------------------------------------------
// src/library — filename sanitization and file placement logic.
//
// Public API:
//   filename.ts — pure functions (no I/O); safe to import anywhere.
//   placement.ts — DB-aware collision resolution + filesystem move.
// ---------------------------------------------------------------------------

export {
  applyCollisionSuffix,
  buildBaseName,
  buildFilename,
  sanitizeComponent,
} from './filename.js';

export {
  composeAbsolutePath,
  placeDownloadedFile,
  resolveRelativePath,
} from './placement.js';
