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

- **Brand:** the app is **openbeat** (renamed from spotify-sync; repo/CLI still spotify-sync).
- **Top bar:** labeled **source-playlist indicator** (`PLAYLIST: WCS Sagbot ↗`, opens in
  Spotify) + an always-visible **health badge** (downloaded count · last sync · amber
  "⚠ N to review" when attention is needed; click → Dashboard).
- **Dashboard** (landing): readiness verdict (ready/attention states) · Run sync with
  simulated live progress · attention list (failed / duplicates / removed) with
  Review/Prune actions · summary line.
- **Tracks**: a unified **control bar** — free-text **search** (title/artist) + **adaptive**
  status filter chips (Pending / Failed / Removed — grayed when empty, colored with a count
  when populated; no standing Downloaded filter) + an interactive **sort** icon button
  (menu: date added / title / artist / BPM / status) + a **filters button** (Linear-style
  funnel icon, top-right) that opens VirtualDJ-style tag/energy filtering (Phase 2 stub) ·
  Spotify-style
  art-forward rows · **play appears on hover over the album art** (no misleading ▶ arrow) ·
  click a row → **side panel** with detail and **context-aware actions** (failed →
  Retry/Import; downloaded → Preview/Replace; removed → Prune/Re-add).
- **Wired click-through**: Dashboard attention row → Tracks pre-filtered → side panel.
- **Activity** (action log): technical log of syncs / removals / manual imports, clearly
  labeled (not a hero view). **Statistics**: light stub.
- Visual language: Spotify-like dark theme. Album art shown (placeholder color blocks in the
  prototype; real cover art exists in the pipeline).

## Review changes — round 1 (Sagiv)

- Renamed app to **openbeat**.
- Tracks: dropped the `Downloaded` filter; made status chips adaptive (gray when empty).
- Renamed **History → Activity** (action log) — "History" reserved for a future
  play/set-history concept (Phase 3).
- Enriched the top-right status into a real **health badge** (count + warning), and labeled
  the **playlist** pill so its purpose is clear.
- Fixed the misleading ▶ row arrow → play now appears on hover over the album art; row click
  still opens the side panel (kept, per Sagiv).

## Review changes — round 2 (Sagiv)

- Tracks: only the list scrolls; **filter/sort bar and side panel stay pinned**.
- **Dark, subtle scrollbars**; removed the needless side-panel scrollbar.
- **Moved search out of the global top bar into the Tracks page**, grouped with status filters
  and sort into one control bar (search is a Tracks operation). Added a **filters button**
  (Linear-style funnel icon, top-right) as the entry to VirtualDJ-style tag + energy
  filtering (Phase 2 stub).
- Made **sort** an interactive icon button (styled like the filters button) with a working
  sort menu (date added / title / artist / BPM / status).

### Verified

Rendered and click-tested in a browser (Playwright): Dashboard verdict + attention list,
tab nav, Tracks list + filters, and the side panel with context-aware actions all work.
(Only console noise is a harmless favicon 404.)

## Next

- Sagiv review / feedback round on the prototype.
- Then **Phase 5 — Test & Iterate**: usability-test this with a few WCS DJs (task-based,
  think-aloud), fix findings, and finalize for the active UI PRD.
