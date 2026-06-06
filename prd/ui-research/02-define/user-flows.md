# Define — Core User Flows (Phase 1)

> UX artifact (Define phase). Step-by-step paths for the Phase 1 jobs — boxes-and-arrows,
> not screens. These become the wireframes in Phase 4 (Prototype). Confirmed 2026-06-06.

Phase 1 = Health + Acquisition. **Quality/match verification is deferred** (Phase 2):
v1 assumes a downloaded song is the correct version and good quality.

## 1. Run a sync (acquire new songs)

```
Dashboard → [Run sync]
  → fetch configured playlist, diff against DB
  → live progress, per track: searching → downloading → tagging → done / failed
  → tracks no longer in the playlist → marked removed-from-source
  → end-of-run summary: "+10 new · 8 downloaded · 2 failed · 1 removed"
  → Dashboard health cards refresh
```
Maps to existing core `sync` + its structured progress events. Pure presentation.

## 2. Resolve a failed track

```
Dashboard "Failed (N)" card  (or Tracks filtered = failed) → select track
  → side panel: last error + what the backend attempted
  → choose:
       [Retry]        → re-run backend search + download
       [Import file]  → manual-import flow (below)
  → ends: downloaded, or still failed (stays on the card)
```

## 3. Manual import with dedup  — kills the #1 spotdl pain (duplicates)

```
Track (pending/failed) → [Import file]   (or drag-and-drop a file onto the track row)
  → file is BOUND to that track row  ← the dedup: no new/duplicate row created,
                                        and the next sync won't re-download it
  → copy (default) or move file into the library
  → re-tag from Spotify metadata (artist/title/album/art/year)
  → status → downloaded, file_path set
```
Wraps the existing `import <file> --for <track-id>` (WES-17). The `--for` binding *is* the
dedup. (Import can also target an already-downloaded track to replace it — general capability,
not a QA workflow.)

## 4. Browse / preview

```
Tracks tab → search / filter (status, tag)
  → row shows: album art, title/artist, status, energy + characteristics, BPM, duration
  → inline play/preview (start/middle/end)
  → row click → side panel: details, file path, resolve actions
```
Serves both recognition needs: by **album art** and by **sound**. Field set excludes Key.

## Deferred (NOT Phase 1)

- **Quality / match verification** — preview-confirm the downloaded version; re-pick from a
  candidate list if wrong. Own future line of work. Needs backend candidate storage (today
  only the chosen result is logged) + a "verified" flag on tracks. → Phase 2.

## Core dependencies for Phase 1

Phase 1 is presentation over existing logic — **no schema/pipeline change required**:
- `sync`, `status`, `import`, `prune` already exist with `--json`.
- Health groupings come from the existing `status` enum.
- Sync progress comes from the existing structured events.
- Album art is already embedded/cached by the v1 pipeline.

(The only previously-flagged core change — a "reviewed" flag — is no longer needed, since
match-QA moved to Phase 2.)

## Define phase: COMPLETE

Outputs delivered: problem statement, prioritized tasks, phasing, IA, core flows.
Ready for **Phase 3 — Ideate** (sketch the Dashboard + Tracks views and explore layouts).
