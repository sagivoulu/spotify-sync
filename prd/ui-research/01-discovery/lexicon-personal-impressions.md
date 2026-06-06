# Lexicon — Sagiv's First-Hand Impressions

> UX research artifact (Discovery phase, step 2b). Source: Sagiv's hands-on reactions
> as the primary user, 2026-06-06. Complements the factual `competitor-teardown.md`
> with subjective likes/dislikes — the raw material for IA, field choices, and visual
> direction in Define/Prototype.

## Likes (keep / borrow)

- **Tab-per-action-category IA.** Separate tabs for `Tracks`, `Tagging`, `Sync`,
  `History`, `Statistics`. Clear purpose per tab; doesn't overload one screen.
- **Sync as its own tab, separate from Tracks.** Sync is information-dense and serves a
  different goal; pushing that detail off the main Tracks page keeps Tracks clean.
  (Note: in Lexicon "sync" = cross-app sync; for us it = download/acquisition + health.
  The *separation principle* holds regardless.)
- **A main "Tracks" page** that mirrors his Spotify playlist and VDJ's main library list —
  one familiar "all my songs" anchor view.
- **Inline play/preview.** He often can't recognize a song by name; hearing it is essential.
- **VDJ integration as a data source.** Lexicon pulls data directly from VDJ. His real data
  (tags, person-comments, cut-notes) lives in VDJ — so do other DJs'. A valuable source to read.

## Dislikes (avoid / fix)

- **No album art.** He frequently recognizes songs faster by cover image than by name.
  Lexicon's art-less list is a real miss. → Art is a hard requirement for our list views.
- **Dated visual design.** He dislikes Lexicon's look. Prefers a **modern, Spotify-like
  aesthetic** (clean, dark, art-forward).
- **`Key` field is useless to him.** He never looks at musical key for WCS. → Don't copy
  DJ-tech fields that don't serve the WCS workflow.

## Design implications (for Define & Prototype)

| Impression | Implication |
|---|---|
| Tab-per-category IA | Adopt a tabbed top-level IA. Candidate tabs: **Tracks**, **Sync/Health**, **Tagging**, **History**, **Stats**. Confirm in Define IA work. |
| Sync separate from Tracks | The download/health detail (logs, failures, what's missing) lives in its own tab — *not* crammed into the main list. Aligns with the "library-health dashboard as the wedge" finding. |
| Main Tracks page as anchor | The browse-all-songs list is the home/default view, mirroring Spotify + VDJ mental models. |
| Inline preview | Per-row play/preview is a must-have, not a nice-to-have. |
| Album art required | Show cover art in list/detail views. **We already have the data** — the v1 pipeline embeds APIC art and caches it by album ID (`prd/01-download-sync.md`). |
| Drop `Key` | Field set should reflect WCS: artist, title, album art, **energy**, **characteristics/tags**, **BPM**, status. Exclude key (and other harmonic/cue fields). |
| Spotify-like visual direction | Visual design target = Spotify's aesthetic (dark, clean, art-forward). Record as the Prototype-phase visual north star. |
| VDJ as a data source | Strong pull to **read from VDJ's database** (tags, comments → person-tags, cut-notes). Opens a feasibility/data-boundary question — needs a spike in Define. Could also be a future *write-back* path. |

## New open questions raised

- **VDJ integration feasibility:** Can we reliably read VDJ's library DB (tags, comments)?
  What format/location? Read-only first? This could unlock the "homeless cut-note" and
  person-tag pains from the journey map — but only if technically sound. Flag for a spike.
- **Field set / column config:** finalize which fields show in the main list (and whether
  columns are user-configurable) during Define IA work.
