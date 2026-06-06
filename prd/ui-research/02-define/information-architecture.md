# Define — Information Architecture

> UX artifact (Define phase). Top-level navigation and what lives where.
> Confirmed with Sagiv (2026-06-06). Phase 1 = the buildable MVP; later tabs are
> captured so the structure doesn't paint future phases into a corner.

## Principle

IA falls out of the data model + Sagiv's tab-per-category preference. The DB objects
*are* the navigation, and the UI is largely a presentation of the existing `--json`
contract:

| Data | Surfaced as |
|---|---|
| `tracks` + `status` enum | **Tracks** list + Dashboard health groupings |
| `sync_runs` + per-run logs | **History** |
| `libraries` | library context (switcher = future) + **Statistics** |

If the UI needs data the `--json` doesn't expose, that's a finding to feed back to core.

## Top-level structure

```
┌─ Top bar:  [Library ▾(future)]   🔍 Global search        ● Last sync: 2h ago ─┐
│  TABS (tab-per-category):                                                      │
│   ● Dashboard   health at a glance + Run sync   (PHASE 1 — landing view)       │
│   ● Tracks      all songs, art, preview, filters(PHASE 1 — anchor view)        │
│   ● History     past sync runs + logs           (PHASE 1 — light)              │
│   ● Statistics  counts / overview               (PHASE 1 — light)              │
│   ○ Tagging     tag assist                       (Phase 2)                     │
│   ○ Coverage    event-readiness smartlists       (Phase 2)                     │
│   ○ Sets        set-building + Spotify export     (Phase 3)                     │
└───────────────────────────────────────────────────────────────────────────┘
```

**Landing view = Dashboard (CONFIRMED).** Opening the app should immediately answer
"is my library healthy / event-ready?" — the core "confidence before it matters" insight.
Tracks remains the primary *browse* surface, one click away.

## Phase 1 tabs in detail

### Dashboard (landing) — the wedge
Pattern borrowed from Lexicon's "scans → actionable problem lists."
- **Sync control:** `Run sync` button; live progress while running; last-run summary
  (e.g. "+10 new, 814 downloaded, 3 failed").
- **Health summary cards**, each drilling into the relevant filtered list with resolve actions:
  - Downloaded · Pending · **Failed (review)** · **Duplicates** · Removed-from-source.
  - (No "needs match-QA" card — quality/match verification is deferred to Phase 2.)
- A top-line library status ("● healthy" / "⚠ N items need attention").

### Tracks — the anchor
- Rows: **album art**, title/artist, status badge, energy + characteristics, BPM, duration.
  (Field set per impressions: art in, **Key out**.)
- **Inline play/preview** per row.
- Row click → **side panel** (Lexicon pattern Sagiv liked): match info, file path, and
  resolve actions (retry, manual import).
- Filters: status, tag, free-text search.

### History — light
- List of past `sync_runs` (date, +new, downloaded, failed, removed).
- Drill into a run's per-run log file.

### Statistics — light
- Library counts by status; room to grow into coverage stats in Phase 2.

## Cross-cutting elements

- **Global search** in the top bar (Lexicon table-stake).
- **Sync status indicator** always visible (last sync time / in-progress).
- **Library switcher** stubbed in the top bar for the multi-library future (single library in v1).
- Visual direction (Prototype phase): **Spotify-like** — dark, clean, art-forward.

## Resolve actions — where they live

The Phase-1 resolve flows are reachable from **two entry points** (same underlying action):
1. Dashboard health card → filtered list → resolve.
2. Tracks tab → row → side panel → resolve.

Actions: **retry a failed download**, **manual import with dedup**.
(Quality/match verification deferred to Phase 2 — not a Phase 1 resolve action.)

## Next in Define

- **Core user flows** (`user-flows.md`) — step-throughs for the Phase 1 jobs:
  run sync, resolve a failed track, manual import (dedup), match-QA, browse/preview.
