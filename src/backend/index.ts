// ---------------------------------------------------------------------------
// Public surface of src/backend/.
//
// The rest of the codebase (sync pipeline, CLI) imports from here — never
// from internal modules directly. YtDlpBackend implementation stays hidden.
// ---------------------------------------------------------------------------

export type {
  AudioFormat,
  Candidate,
  DownloadBackend,
  DownloadResult,
  SearchQuery,
} from './types.js';
export { BackendError } from './types.js';
export type { SubprocessRunner, VersionResult } from './yt-dlp.js';
export { getFfmpegVersion, getYtDlpVersion } from './yt-dlp.js';

import type { Config } from '../config/index.js';
import type { AudioFormat, DownloadBackend } from './types.js';
import { createYtDlpBackend } from './yt-dlp.js';

/**
 * Instantiate the configured download backend from a loaded Config.
 *
 * This is the only factory the sync pipeline should call — it ensures
 * YtDlpBackend is never referenced outside src/backend/.
 *
 * @throws Error for unknown backend names.
 */
export function createBackendFromConfig(config: Config): DownloadBackend {
  const { backend, search_source } = config.download;
  switch (backend) {
    case 'yt-dlp':
      return createYtDlpBackend({ searchSource: search_source });
    default:
      throw new Error(`Unknown download backend: "${backend}". Only "yt-dlp" is supported in v1.`);
  }
}

/**
 * Map the download section of a loaded Config to an AudioFormat value.
 *
 * mp3 carries the configured bitrate; m4a uses passthrough (no bitrate).
 */
export function configToAudioFormat(downloadConfig: Config['download']): AudioFormat {
  if (downloadConfig.format === 'm4a') {
    return { codec: 'm4a' };
  }
  return { codec: 'mp3', bitrateKbps: downloadConfig.bitrate_kbps };
}
