// ---------------------------------------------------------------------------
// SyncEvent — structured progress events emitted by runSync().
//
// The CLI handler receives these via the onEvent callback and prints
// one terminal line per event. A future Electron UI will consume the same
// events (see prd/future/ui-app.md) — so the shape is the data contract.
//
// Core never calls console.log directly; all output goes through onEvent.
// ---------------------------------------------------------------------------

/** The run started (after preflight passed). */
export interface RunStartEvent {
  type: 'run-start';
  runId: number;
  libraryPath: string;
  concurrency: number;
  pendingCount: number;
  addedCount: number;
  removedMarkedCount: number;
}

/** A track was successfully downloaded, tagged, and placed. */
export interface TrackDownloadedEvent {
  type: 'track-downloaded';
  trackId: number;
  artist: string;
  title: string;
  filePath: string;
  backend: string;
}

/** A download attempt failed but the track still has retry budget. */
export interface TrackRetryEvent {
  type: 'track-retry';
  trackId: number;
  artist: string;
  title: string;
  attempt: number;
  maxAttempts: number;
  error: string;
}

/** A track exhausted all retry attempts and was marked failed. */
export interface TrackFailedEvent {
  type: 'track-failed';
  trackId: number;
  artist: string;
  title: string;
  attempts: number;
  error: string;
}

/** The run finished (after all downloads completed and sync_runs was finalized). */
export interface RunFinishEvent {
  type: 'run-finish';
  runId: number;
  added: number;
  downloaded: number;
  failed: number;
  removedMarked: number;
  ok: boolean;
}

export type SyncEvent =
  | RunStartEvent
  | TrackDownloadedEvent
  | TrackRetryEvent
  | TrackFailedEvent
  | RunFinishEvent;
