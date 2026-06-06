# Phase 2 — Define

> Status: ✅ Complete
> Goal: converge Discovery findings into a sharp problem definition and the
> structural backbone of the UI. This is the real design work (structure before screens).

## Planned outputs

- **Problem statement** — 1–2 sentences naming the core problem the UI solves.
- **Prioritized task list** — the jobs the UI must support, ranked by frequency × pain.
- **Phasing decision** — which in-scope areas ship first (download health is the likely
  wedge). Resolves the "scope explosion" risk flagged in Discovery.
- **Information Architecture (IA)** — top-level navigation and where each object lives.
  Anchored to the DB objects (Libraries → Tracks/status → Sync runs) and the `--json`
  data contract.
- **Key user flows** — boxes-and-arrows step-throughs for the top tasks (e.g. resolve a
  failed/`needs_manual` track; review a match; run a sync; export a set).

## Status of outputs

- ✅ Problem statement, prioritized task list, phasing decision → `problem-and-scope.md`
- ✅ Information Architecture → `information-architecture.md`
- ✅ Core user flows → `user-flows.md`
- ⬜ VDJ-integration feasibility spike (gates the Phase 2 *build*, not the design)

## Findings

- **`problem-and-scope.md`** — problem statement ("confidence before it matters";
  acquisition is our niche), ranked task list, and the **confirmed phasing**:
  Phase 1 = Health + Acquisition (MVP), Phase 2 = Organize (tagging + coverage smartlists),
  Phase 3 = Prep & Share (set-building + Spotify export). Live mixing is out forever.
- **`information-architecture.md`** — tab-per-category IA (Dashboard / Tracks / History /
  Statistics in Phase 1; Tagging / Coverage / Sets later). **Landing view = Dashboard**
  (health at a glance). IA derived from DB objects + `--json`. Field set: album art in,
  Key out. Resolve actions reachable from Dashboard cards and Tracks side panel.
- **`user-flows.md`** — Phase 1 flows: run sync, resolve a failed track, manual import
  (dedup), browse/preview. Quality/match verification **deferred to Phase 2**. Phase 1
  needs **no schema/pipeline change** — pure presentation over existing `--json`.
