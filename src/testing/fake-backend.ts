// ---------------------------------------------------------------------------
// FakeBackend — a canned DownloadBackend for tests.
//
// Lives in src/testing/ because it is shared across test files in different
// modules (unit tests, future pipeline integration tests, e2e tests, etc.).
// Never imported by production code.
// ---------------------------------------------------------------------------

import { BackendError } from '../backend/types.js';
import type {
  AudioFormat,
  BackendOperationOptions,
  Candidate,
  DownloadBackend,
  DownloadResult,
  SearchQuery,
} from '../backend/types.js';

/** Configurable options for the fake backend. */
export interface FakeBackendOpts {
  /**
   * Candidates to return from search().
   * Default: one canned candidate pointing to a fake YouTube URL.
   */
  searchResults?: Candidate[];

  /**
   * If set, download() returns this result regardless of the candidate.
   * Default: success with the given outPath + ".mp3" as filePath.
   */
  downloadResult?: DownloadResult;

  /**
   * If set, search() throws a BackendError with this message.
   * Takes precedence over searchResults.
   */
  searchError?: string;
}

const DEFAULT_CANDIDATE: Candidate = {
  url: 'https://www.youtube.com/watch?v=fake123',
  sourceLabel: 'youtube',
  durationMs: 210_000,
  title: 'Fake Track',
};

/**
 * Create a DownloadBackend with canned results for use in tests.
 *
 * All opts are optional — the default configuration returns one fake candidate
 * and a successful download result. Override as needed in individual tests.
 */
export function createFakeBackend(opts: FakeBackendOpts = {}): DownloadBackend {
  const { searchResults, downloadResult, searchError } = opts;

  return {
    name: 'fake',

    async search(_query: SearchQuery, opts?: BackendOperationOptions): Promise<Candidate[]> {
      opts?.log?.({
        binary: 'yt-dlp',
        stream: 'stdout',
        chunk: 'fake yt-dlp search stdout\n',
      });
      if (searchError !== undefined) {
        opts?.log?.({
          binary: 'yt-dlp',
          stream: 'stderr',
          chunk: 'fake yt-dlp search stderr\n',
        });
        throw new BackendError(searchError, 'fake stderr', 1);
      }
      return searchResults ?? [DEFAULT_CANDIDATE];
    },

    async download(
      candidate: Candidate,
      opts: { outPath: string; format: AudioFormat },
      operationOpts?: BackendOperationOptions,
    ): Promise<DownloadResult> {
      operationOpts?.log?.({
        binary: 'yt-dlp',
        stream: 'stderr',
        chunk: 'fake download stderr',
      });
      if (downloadResult !== undefined) {
        return downloadResult;
      }
      return {
        success: true,
        filePath: `${opts.outPath}.${opts.format.codec}`,
        candidate,
        backend: 'fake',
        stdout: '',
        stderr: 'fake download stderr',
        exitCode: 0,
      };
    },
  };
}
