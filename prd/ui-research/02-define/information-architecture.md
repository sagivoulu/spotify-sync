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
| `tracks` + `status` enum | **Tracks** list + Home health groupings |
| `sync_runs` + per-run logs | **History** |
| `libraries` | library context (switcher = future) + **Statistics** |

If the UI needs data the `--json` doesn't expose, that's a finding to feed back to core.

## Top-level structure

```
┌─ open·beat   [PLAYLIST: WCS Sagbot ↗]  ● Online   ● 814 downloaded · 2h · ⚠ N ─┐
│  TABS (tab-per-category):                                                      │
│   ● Home        positive overview + Run sync    (PHASE 1 — landing view)       │
│   ● Tracks      all songs, art, preview, filters(PHASE 1 — anchor view)        │
│   ◐ Sets        past sets → publish to Spotify   (Phase 3 — preview/mockup)     │
│   ● Activity    action log (syncs, removals…)   (PHASE 1 — light)              │
│   ○ Tagging     tag assist                       (Phase 2)                     │
│   ○ Coverage    event-readiness smartlists       (Phase 2)                     │
└───────────────────────────────────────────────────────────────────────────┘
```

**Landing view = Home (CONFIRMED).** A *positive home base*, not a problems inbox: opening the
app should reassure ("✓ 814 songs ready to play") and show what's new — with problems
**demoted** to a card that only stands out when there's something to fix. Tracks remains the
primary *browse* surface, one click away. (Renamed "Dashboard" → "Home": "Dashboard" implied a
metrics grid; "Home" sets the calm-landing expectation. A problems-first landing made the
default tone anxiety and was redundant with Tracks.)

## Phase 1 tabs in detail

### Home (landing) — calm overview, positive-first
Leads with reassurance and the primary action; problems are demoted to one card.
- **Readiness hero:** a positive headline ("✓ 814 songs ready to play · synced 2h ago") + the
  **Run sync** primary action + last-run summary. Stays positive even when issues exist (a
  subtle "N need attention ↓" links to the card below).
- **Recently added** (Phase 1): newest songs, shown as the **same song rows as the Tracks page**
  (art / title / artist / status) — a song looks identical everywhere. Click → opens it in Tracks.
- **Needs attention** (Phase 1): demoted card; quiet "✓ nothing needs attention" when healthy,
  otherwise the failed/removed groups with per-group **bulk fix** CTAs. (No duplicates card —
  v1 prevents dups at the source, detection is a possible future scan. No match-QA — Phase 2.)
- **Placeholders for what's coming** (tagged "Soon" so the roadmap is visible):
  - **Recent sets** (Phase 3) — played sets, saved from VirtualDJ, ready to publish to Spotify.
  - **Library stats** (Phase 2) — popular tags, most-played songs.
- Kept deliberately **uncluttered** (Home was getting overloaded): the action log lives in its
  own **Activity** tab (not duplicated here), and **app updates** moved off the page into a
  small top-bar **"What's new" button** (see cross-cutting).

The point: **Home is for *knowing*** (overview, what's new, future insights/coverage); **Tracks
is for *doing***. That's what keeps Home from being a redundant copy of the Tracks data.

### Tracks — the anchor
- Rows: **album art**, title/artist, status badge, energy + characteristics, BPM, duration.
  (Field set per impressions: art in, **Key out**.)
- **Inline play/preview** per row.
- Row click → **side panel** (Lexicon pattern Sagiv liked): match info, file path, and a
  **primary fix CTA matched to the status** (Not downloaded → Download · Download failed →
  Retry · Removed from Spotify → Prune), plus a secondary action (Import file / Keep file).
- **Scroll containment:** the filter/sort bar (top) and the side panel (right) stay pinned;
  only the track list scrolls. The side panel itself scrolls internally **only when** its
  content exceeds the visible height (no scrollbar when it fits).
- **Tracks control bar** — search, filter, and sort grouped together (they all describe
  "how the list is shaped"; search belongs here, not in the global top bar):
  - **Free-text search** (title / artist).
  - **Adaptive status chips** (Not downloaded / Download failed / Removed from Spotify —
    labels match the list badges) — grayed & non-clickable when
    empty, colored with a count when populated. **No standing `Downloaded` filter** (browse
    "All"; a Downloaded-only view returns in Phase 2 for tagging).
  - **Sort** — an icon button (same visual style as the filters button) opening a menu of
    sort fields (date added, title, artist, BPM, status). **Reversible:** click the active
    field again to flip ascending/descending; the selected field shows a ↑/↓ direction arrow.
  - **Filters button** — a Linear-style **funnel icon** (three decreasing lines) at the
    top-right of the bar; opens the filter panel. *Future (Phase 2):* VirtualDJ-style
    filtering — combine **tags** (e.g. sexy, dark) + **energy** (e.g. low) with free-text
    search, all here in the Tracks page.

### Status vocabulary (download/sync state)

Statuses describe the relationship between a Spotify song (what you *want*) and your local
library (what you *have*) — i.e. download/sync state. This was unclear with terse one-word
labels, so user-facing labels are plain-language (not DB jargon), each with a tooltip and a
one-line explanation in the side panel:

| DB status | User label | Means |
|---|---|---|
| `downloaded` | ✓ Downloaded | On your computer, ready to play. |
| `pending` | Not downloaded | In your Spotify playlist, not downloaded yet. |
| `failed` | ⚠ Download failed | Couldn't download; retry or import a file. |
| `removed_from_source` | Removed from Spotify | No longer in the playlist; file kept until prune. |

(The "Spotify" wording is source-specific for v1; a multi-source future generalizes to "source".)

When a status filter is active, a short **explainer banner** appears between the filter chips
and the song list: it describes that category **and offers a bulk fix CTA** for all songs in
it (Download all / Retry all / Prune all). Shown for Not downloaded / Download failed /
Removed; none for All.

### Activity (action log) — light
- A clearly-labeled **technical** log: sync runs, tracks removed from source, manual imports
  detected, etc. Not a hero view.
- Drill into a run's per-run log file.
- **Note:** a true *play/set History* (the sets the DJ actually played) is a different,
  **Phase 3** concept — don't conflate. The "History" name is reserved for that.

### Sets (Phase 3) — preview tab
A visible tab with a **mockup** of the future sets feature (tab tagged "Soon"): a record of
past sets (venue · date · duration · track count), each with **Publish to Spotify** / **Export**
actions, and an "open in Spotify" state for already-published sets. Not built in Phase 1 —
shown so the direction is concrete and testable.

> **The old Statistics tab was removed.** Its counts already live in the Home readiness/health
> badge and the Tracks list — a separate tab was redundant. Meaningful stats (popular tags,
> most-played songs) return as the Home **Library stats** card in Phase 2, not as a tab.

## Cross-cutting elements

- **Brand:** the app is **openbeat** (top-left). (Repo/CLI still `spotify-sync` for now.)
- **Source playlist indicator** in the top bar — labeled (`PLAYLIST: WCS Sagbot`), opens the
  playlist in Spotify. A switcher is a multi-playlist / multi-library future concern.
- **Library health badge** (top-right), always visible from any tab: downloaded count +
  last-sync time + an amber "⚠ N to review" when anything needs attention; click → Home.
- **Online/offline awareness** (top bar indicator). Offline is a **first-class, expected state**
  (DJs play at venues with no internet; the local library must work offline). When offline:
  - the local library stays **fully usable** — browse, preview, view tags, (future) build sets;
  - **internet-only actions are disabled** with a clear reason (Run sync, Download, Retry; the
    bulk Download all / Retry all). Local actions stay enabled (Prune, import a local file);
  - a calm banner reassures rather than errors: "You're offline — your library is fully
    playable. Syncing and downloads resume automatically when you reconnect." This *is* the
    "confidence" theme applied to connectivity: offline should feel safe, not broken.
- **Notifications** (far top-right corner, **bell** icon — minimal, low-attention): one place for
  updates and notifications in general. Shows a dot when something is unread; opening it clears
  the dot. Update notes are **grouped by version** with a relative time (e.g. "v0.3 · 2h ago").
  (A standard bell, deliberately *not* a sparkle/AI-style icon.)
- **Search is NOT global** — it lives in the Tracks page (see below), since searching is a
  Tracks operation.
- Visual direction (Prototype phase): **Spotify-like** — dark, clean, art-forward.

## Resolve actions — where they live

The Phase-1 resolve flows are reachable from **two entry points** (same underlying action):
1. Home "Needs attention" card → filtered list → resolve.
2. Tracks tab → row → side panel → resolve.

Actions (each available **per-song** in the side panel and **in bulk** from the category
explainer): **Download** (Not downloaded), **Retry download** (Download failed), **Prune**
(Removed from Spotify), plus **manual import with dedup**. Every problem state surfaces a fix.
(Quality/match verification deferred to Phase 2 — not a Phase 1 resolve action.)

## Next in Define

- **Core user flows** (`user-flows.md`) — step-throughs for the Phase 1 jobs:
  run sync, resolve a failed track, manual import (dedup), match-QA, browse/preview.
