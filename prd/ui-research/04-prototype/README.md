# Phase 4 — Prototype

> Status: 🟡 In progress (Phase 1 screens built; pending Sagiv review)
> Goal: take the chosen Ideate direction to a testable fidelity in the Spotify-like visual
> language. Climb the ladder: wireframe (done in Ideate) → **clickable mockup (here)**.

## What's here

- **`index.html`** — a **throwaway, self-contained, clickable prototype** of the Phase 1
  UI. Vanilla HTML/CSS/JS, no dependencies, works offline. Fake data only —
  **NOT wired to the real core.** It exists to *see and test* the design, and to be the
  artifact for Phase 5 usability testing. It informs the real build; it does not become it.

### Where the mockup file lives

The mockup is a **static asset of the VitePress docs site**: `docs/public/mockup.html`.
VitePress copies `public/` to the site root, so it's served at `/spotify-sync/mockup.html`.
Open the file directly in a browser, or run the docs dev server:
```
npm run docs:dev        # then open the printed URL + /mockup.html
```

### Live demo (shareable link)

- Mockup: **https://sagivoulu.github.io/spotify-sync/mockup.html**
- The docs home (**https://sagivoulu.github.io/spotify-sync/**) has a "major update is coming"
  note + a hero/nav link to the mockup.

Deployed as part of the existing **VitePress docs site** via `.github/workflows/docs.yml`
(builds on push to `main`). So the mockup goes live with the normal docs — no separate Pages
config, no `gh-pages` branch, no deploy script. Edit `docs/public/mockup.html`, merge to `main`,
and the docs deploy publishes it. The repo is public; the link is unlisted (not advertised).

### What's implemented (matches the Ideate direction)

- **Brand:** the app is **openbeat** (renamed from spotify-sync; repo/CLI still spotify-sync).
- **Top bar:** labeled **source-playlist indicator** (`PLAYLIST: WCS Sagbot ↗`, opens in
  Spotify) + an **online/offline indicator** (click to toggle in the demo) + an always-visible
  **health badge** (downloaded count · last sync · amber "⚠ N to review"; click → Home).
- **Home** (landing): a *positive*, uncluttered overview — readiness hero ("✓ 814 songs ready
  to play") + Run sync · **Recently added** (real song rows) · demoted **Needs attention** card
  · "Soon" **placeholders** for Recent sets (Phase 3) and Library stats (Phase 2). App updates
  live behind a far-corner **notifications bell** (dot when unread; updates grouped by version
  with relative time); the action log is in its own **Activity** tab. Reframed from the old
  problems-first "Dashboard".
- **Tabs:** Home · Tracks · **Tagging** (Phase 2 coming-soon) · **Sets** (Phase 3
  preview/mockup) · Activity. The old **Statistics** tab was removed (counts already live in
  Home + Tracks).
- **Tagging** (coming-soon): a tab with a coming-soon card explaining openbeat will help tag
  music (energy + characteristics) faster, with fewer missed tags.
- **Sets** also has a disabled **"✨ Build my next set"** hint CTA (future guided set-builder).
- **Settings** (top-right gear): coming-soon popover (no design yet).
- All **"Coming soon" tags** share one blue style across tabs, cards, and CTAs.
- **Sets** (preview): a mockup of the future sets feature — past sets (venue · date · duration ·
  tracks) with Publish-to-Spotify / Export actions; marked "Soon".
- **Online/offline:** offline shows a calm banner and disables internet-only actions (Run sync,
  Download, Retry, bulk Download all / Retry all) while local actions stay enabled (Prune,
  import a local file). The library stays fully browsable/playable offline.
- **Tracks**: a unified **control bar** — free-text **search** (title/artist) + **adaptive**
  status filter chips (Not downloaded / Download failed / Removed from Spotify, matching the
  list badges — grayed when empty, colored with a count
  when populated; no standing Downloaded filter) + an interactive **sort** icon button
  (menu: date added / title / artist / BPM / status) + a **filters button** (Linear-style
  funnel icon, top-right) that opens VirtualDJ-style tag/energy filtering (Phase 2 stub) ·
  Spotify-style
  art-forward rows · **play appears on hover over the album art** (no misleading ▶ arrow) ·
  click a row → **side panel** with detail and a **fix CTA matched to the status**
  (Not downloaded → Download · Download failed → Retry · Removed → Prune; downloaded →
  Preview/Replace). The category explainer also offers a **bulk fix** (Download all / Retry
  all / Prune all).
- **Wired click-through**: Home attention row → Tracks pre-filtered → side panel; Recently-added
  row → Tracks with that song open.
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
- Clarified **status terminology** — statuses describe download/sync state, so labels are now
  plain-language (Downloaded / Not downloaded / Download failed / Removed from Spotify) with
  tooltips and a one-line explanation in the side panel.
- **Reversible sort** — click the active sort field again to flip asc/desc; the selected field
  shows a ↑/↓ direction arrow (menu stays open).
- **Status explainer** — a short line between the filter chips and the list explains the active
  category (Not downloaded / Failed / Removed; none for All).

## Review changes — round 3 (Sagiv)

- **Fix CTAs** for problem states: side-panel primary action matched to status (Download /
  Retry / Prune) + a **bulk** fix in the category explainer (Download all / Retry all /
  Prune all). Also fixed "Not downloaded" wrongly showing Preview/Replace.
- Chip labels matched to the list badges (Not downloaded / Download failed / Removed from Spotify).
- **Removed the fake "duplicates" indicator** (dashboard, health count, stats) — v1 prevents
  duplicates at the source (manual-import dedup); a "find duplicates" scan would be a future
  feature, not something we detect today.
- **Side panel** now scrolls internally only when its content exceeds the visible height
  (no needless scrollbar when it fits); trimmed the cover-art height to help it fit.

## Review changes — round 4 (Sagiv)

- **Reframed Dashboard → "Home"**: a positive, calm landing (readiness hero + Run sync +
  Recently added + demoted Needs-attention + Recent activity) instead of a problems inbox.
  Added "Soon" placeholders for Recent sets, Library stats, and What's new (app updates) so the
  roadmap is visible.
- **Recently added** uses the **same song rows as the Tracks page** (a song looks identical
  everywhere) — not chips.
- **Online/offline awareness**: top-bar indicator; offline shows a calm banner and disables
  internet-only actions (Run sync / Download / Retry / bulk) while local actions stay enabled.
  The library remains fully browsable & playable offline.

## Review changes — round 5 (Sagiv)

- **Reduced Home overload:** moved **app updates** to a small top-bar **"What's new" button**
  (dot when unread; opening clears it), and **removed the Recent activity card** from Home (it
  has its own Activity tab). Home is now hero + Recently added + Needs attention + two "Soon"
  placeholders.

## Review changes — round 6 (Sagiv)

- **Notifications bell** replaces the ✦ "What's new" button: moved to the far top-right corner,
  minimal/low-attention, **bell** icon (the sparkle read as AI). Reframed as updates +
  notifications in general; update notes **grouped by version** with relative time.
- **Removed the Statistics tab** — its info already exists in Home + Tracks.
- **Added a Sets tab (Phase 3 preview)** — a mockup of past sets with Publish-to-Spotify /
  Export actions, so the future direction is concrete.

### Verified

Rendered and click-tested in a browser (Playwright): Dashboard verdict + attention list,
tab nav, Tracks list + filters, and the side panel with context-aware actions all work.
(Only console noise is a harmless favicon 404.)

## Next

- Sagiv review / feedback round on the prototype.
- Then **Phase 5 — Test & Iterate**: usability-test this with a few WCS DJs (task-based,
  think-aloud), fix findings, and finalize for the active UI PRD.
