# Ideate — Low-Fi Sketches & Chosen Direction

> UX artifact (Ideate phase). Explored multiple rough layouts for the two Phase 1 screens
> (Dashboard, Tracks), then converged. Confirmed with Sagiv (2026-06-06).
> Fidelity is intentionally low — these define *structure*, not visuals. Visual polish is
> the Prototype phase (target aesthetic: Spotify-like).

## Variants explored

**Dashboard:** A = status-cards grid · B = attention-inbox · **C+B = readiness verdict +
attention list (CHOSEN)**.
**Tracks:** **B = Spotify-style list + side panel (CHOSEN)** · A = dense table+art ·
C = filter rail + cards.

Rationale for the picks:
- Dashboard C+B leads with the *readiness verdict* (the purest expression of "confidence
  before it matters") and immediately lets the user act on problems via the attention list —
  better than cards (equal weight, no priority) or verdict-only (no inline action).
- Tracks B is art-forward with inline preview and a side panel — directly matching Sagiv's
  stated likes (album art for recognition, Spotify aesthetic, the Lexicon side panel).

## CHOSEN — Dashboard (readiness verdict + attention list)

```
┌ spotify-sync ───────────────────── 🔍 ──── ● synced 2h ago ┐
│  ▸Dashboard  Tracks  History  Stats          [Library ▾]    │
├──────────────────────────────────────────────────────────────┤
│      ●  Library is event-ready                               │
│         814 of 842 downloaded · 3 need attention             │
│              [ ▶ Run sync ]    last: +10 new, 2 failed       │
│  ──────────────────────────────────────────────────────     │
│  Needs your attention                                        │
│   ⚠  3 downloads failed                       [ Review → ]   │
│   ⧉  5 possible duplicates                    [ Review → ]   │
│   ⊘  8 removed from Spotify (files kept)       [ Prune →  ]   │
│  ──────────────────────────────────────────────────────     │
│  ✓ 814 downloaded · 12 pending                               │
└──────────────────────────────────────────────────────────────┘
```

States:
- **Healthy:** verdict reads "✓ You're event-ready"; attention section reads
  "Nothing needs attention." Calm, reassuring.
- **Syncing:** the `Run sync` button becomes a live progress area (per-track:
  searching → downloading → tagging → done/failed); verdict updates on finish.
- Each attention row drills into the Tracks tab pre-filtered to that group, where the
  resolve actions live. "Prune" reuses the existing `prune` (confirm-then-delete).

## CHOSEN — Tracks (Spotify-style list + side panel)

```
┌ spotify-sync ───────────────────── 🔍 ─────────────────────┐
│  Dashboard  ▸Tracks  History  Stats           [Library ▾]   │
├──────────────────────────────────────────────────────────────┤
│ [All][Downloaded][Pending][Failed][Removed]    sort: Added ▾│
├──────────────────────────────────────────┬──────────────────┤
│ ▶ ▓▓ Crazy In Love             ✓          │  ▓▓▓▓▓▓▓▓▓▓     │
│      Beyoncé · high, funky · 124 · 3:56   │  Crazy In Love   │
│ ▶ ▓▓ Valerie                   ✓          │  Beyoncé         │
│      Amy Winehouse · mid, sexy · 108·3:42 │  Album · 2008    │
│ ▶ ▒▒ Mercy                     ⚠ failed   │  ✓ downloaded    │
│      Duffy                                │  file: …/Mercy…  │
│                                           │  source: yt-music│
│                                           │  [ ▶ Preview ]   │
│                                           │  [Retry][Import] │
└──────────────────────────────────────────┴──────────────────┘
```

Notes:
- Row = album art thumbnail + title + status badge; second line = artist · tags · BPM · time.
  (Field set per Discovery: art in, **Key out**.)
- Status-filter chips across the top double as the entry point from Dashboard attention rows.
- **Inline play (▶)** per row; clicking a row opens the **side panel** (detail + resolve
  actions: Preview, Retry, Import). Manual import here = the dedup flow (bind file to row).
- Side panel is the single home for per-track detail and actions (no separate detail screen).

## Carry-over for Prototype (Phase 4)

- Take these two wireframes to higher fidelity in the Spotify-like visual language.
- Add the secondary states sketched here (healthy / syncing / empty).
- Wire the click-throughs: Dashboard attention row → filtered Tracks → side panel action.
- History + Statistics are light and can be wireframed quickly alongside.

## Ideate phase: COMPLETE
