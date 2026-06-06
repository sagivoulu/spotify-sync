# Define — Problem Statement, Task Priority & Phasing

> UX artifact (Define phase). Converges Discovery findings into the backbone the UI
> is built on. Decisions here are confirmed with Sagiv (2026-06-06).

## Problem statement

> DJs collect songs on Spotify but can't trust that their **local, offline library is
> complete and event-ready**. Gaps — failed downloads, duplicates, missing coverage for a
> given event — stay **invisible until they bite at the worst moment** (mid-set, pre-flight).
> spotify-sync owns the one step no commercial DJ tool touches — *acquisition*
> (Spotify → local mp3) — but today it's a CLI with no at-a-glance confidence.

**The UI's core job:** make library health — both *quantity* ("did it all download?") and
*coverage* ("do I have what this event needs?") — **visible and trustworthy before it matters.**

## Prioritized task list (frequency × pain)

| Rank | Job | Pain | Freq | Notes |
|---|---|---|---|---|
| 1 | See library health — what failed / is missing / duplicated | 🔴 High | Every sync + pre-event | The #1 pain; the wedge |
| 2 | Run a reliable sync (acquire new songs) | 🔴 High | 1–2×/mo | Foundation; core + `--json` exist |
| 3 | Manual-import dedup (recognize hand-grabbed files) | 🟠 Med-High | Recurring | WES-17 partly built |
| 4 | Quality / match verification (right version, not music-video) | 🟠 Med | Per new song | **Deferred** — own future line of work; v1 assumes downloads are good |
| 5 | Event-readiness coverage audit | 🟠 Med-High | Per event | Smartlists pattern |
| 6 | Tagging assistance | 🟡 Med | Frequent | Needs VDJ data |
| 7 | Spotify set export | 🟡 Med | Per set | "Intent dies from friction" |
| 8 | Set-building assistance | 🟢 High value, low urgency | Per set | Big scope |
| 9 | Capture "cut needed" notes | 🟢 Low-Med | Occasional | Homeless today |

## Phasing decision (CONFIRMED)

Lead with the wedge; layer the rest.

### Phase 1 — Health + Acquisition (the MVP)
The first shippable UI. Mostly presentation over existing core logic + `--json`.
- **Sync/Health tab:** run a sync, live progress, end-of-run summary.
- **At-a-glance health:** what's pending / downloaded / failed / duplicated / missing.
- **Resolve actions:** retry a failed track; manual import with **dedup** (recognize files
  grabbed by hand so they're not re-downloaded).
- **Tracks tab:** browse all songs (mirrors Spotify playlist + VDJ library), **with album
  art** and **inline preview**.

> **Quality/match verification is explicitly NOT in Phase 1.** v1 assumes downloaded songs
> are the correct version and good quality. Verifying quality/match (preview-confirm,
> re-pick from candidates) becomes its own future line of work — see Phase 2.

### Phase 2 — Organize & Verify
- Tagging assistance.
- Event-readiness **coverage smartlists** (rule-based, à la Lexicon).
- **Tracks filtering by tags + energy** (VirtualDJ-style), combined with free-text search,
  in the Tracks control bar (closely related to coverage smartlists).
- **Quality / match verification** (own line of work): preview-confirm the downloaded
  version, and re-pick from candidate matches. Needs backend changes (store the candidate
  list — today only the chosen result is logged) and a "verified" flag on tracks.

### Phase 3 — Prep & Share
- Set-building assistance (suggestion/curation feeding a list *into* VDJ — not in-app mixing).
- Spotify set export (post-set, fix the error-prone late-night step).

### Hard out (forever)
Live playback / mixing — VirtualDJ owns this.

## Rationale

- Phase 1 attacks the highest-frequency, highest-pain jobs (1–4) and is the most buildable:
  the core, the DB schema, and `--json` already exist, so the UI is largely a presentation
  layer over proven logic.
- It also establishes the **differentiated niche** (acquisition + health) that the teardown
  showed is unoccupied, before investing in organize/share features that mature tools partly
  cover.
- Phases 2–3 are real and captured so we don't paint them into a corner — but they are
  explicitly *not* the MVP. Resists scope explosion.

## Next in Define

1. **Information Architecture** — top-level tabs (Sagiv likes tab-per-category) and what
   lives in each; anchored to DB objects + `--json` contract.
2. **Core user flows** — for the Phase 1 jobs (run sync, resolve a failure, manual import,
   match-QA, browse/preview).
3. **VDJ-integration feasibility spike** — needed before Phase 2 leans on reading VDJ data.
