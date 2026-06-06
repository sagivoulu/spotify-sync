# Phase 4 — Prototype

> Status: 🟡 In progress (Phase 1 screens built; pending Sagiv review)
> Goal: take the chosen Ideate direction to a testable fidelity in the Spotify-like visual
> language. Climb the ladder: wireframe (done in Ideate) → **clickable mockup (here)**.

## What's here

- **`index.html`** — a **throwaway, self-contained, clickable prototype** of the Phase 1
  UI. Vanilla HTML/CSS/JS, no dependencies, works offline. Fake data only —
  **NOT wired to the real core.** It exists to *see and test* the design, and to be the
  artifact for Phase 5 usability testing. It informs the real build; it does not become it.

### How to open

Open `index.html` directly in a browser, or serve it:
```
cd prd/ui-research/04-prototype && python3 -m http.server 8765
# then visit http://localhost:8765/index.html
```

### What's implemented (matches the Ideate direction)

- **Dashboard** (landing): readiness verdict (ready/attention states) · Run sync with
  simulated live progress · attention list (failed / duplicates / removed) with
  Review/Prune actions · summary line.
- **Tracks**: status filter chips · Spotify-style art-forward rows (art, title, status,
  artist · tags · BPM, duration) · click a row → **side panel** with detail and
  **context-aware actions** (failed → Retry/Import; downloaded → Preview/Replace;
  removed → Prune/Re-add).
- **Wired click-through**: Dashboard attention row → Tracks pre-filtered → side panel.
- **History** & **Statistics**: light stubs.
- Visual language: Spotify-like dark theme (per Sagiv's stated preference). Album art shown
  (placeholder color blocks in the prototype; real cover art exists in the pipeline).

### Verified

Rendered and click-tested in a browser (Playwright): Dashboard verdict + attention list,
tab nav, Tracks list + filters, and the side panel with context-aware actions all work.
(Only console noise is a harmless favicon 404.)

## Next

- Sagiv review / feedback round on the prototype.
- Then **Phase 5 — Test & Iterate**: usability-test this with a few WCS DJs (task-based,
  think-aloud), fix findings, and finalize for the active UI PRD.
