import { spawn } from 'node:child_process';

// ---------------------------------------------------------------------------
// openBrowser — best-effort cross-platform URL opener.
//
// Lives in the CLI layer (presentation concern). Errors are intentionally
// swallowed — callers always print the URL as a manual fallback so the user
// is never stranded.
// ---------------------------------------------------------------------------

const OPENERS: Record<string, string> = {
  darwin: 'open',
  win32: 'start',
  linux: 'xdg-open',
};

/**
 * Attempt to open `url` in the user's default browser.
 * Silently swallows errors — always print the URL alongside calling this.
 */
export function openBrowser(url: string): void {
  const opener = OPENERS[process.platform] ?? 'xdg-open';
  try {
    // `shell: true` is needed for `start` on Windows (it's a shell built-in).
    // `detached: true` + `unref()` lets the spawned process outlive the parent.
    const child = spawn(opener, [url], {
      stdio: 'ignore',
      detached: true,
      shell: process.platform === 'win32',
    });
    child.unref();
  } catch {
    // Best-effort — the caller must always print a manual fallback URL.
  }
}
