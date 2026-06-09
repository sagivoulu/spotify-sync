# Current-State Journey Map — DJ Library Lifecycle

> UX research artifact (Discovery phase, step 1 of the UI design process).
> Source: structured interview with Sagiv (the primary user) on 2026-06-06.
> This is **descriptive** (what happens today), not a spec. Scope/vision decisions
> belong to the later Define phase. Feeds into the eventual active UI PRD
> (promoted from `prd/future/ui-app.md`).

Legend: **[TOOL]** = spotify-sync's domain · **[VDJ]** = DJ-software domain ·
**[BRIDGE]** = handoff/overlap · ⛔ pain epicenter · 🟢🟡 emotional tone

---

## Cadence & volume (context for sizing)

- Sync run frequency: **1–2× per month**, usually in the few days before a set
  (sometimes day-of, while building the set in a 1–2h block).
- Long-lead sync only for: flying abroad for an event, or returning after a long gap.
- Typical batch: **~10 new songs**. After a gap: **~50**.
- Failure rate: **unknown to the user** — that is precisely the problem. Last 50-song
  batch (manual, because spotdl was fully broken): ~5 songs had no findable version (~10%).
- Library size today: **~842 songs** in the `WCS Sagbot` Spotify playlist (flat, unordered).

**Design implication:** optimize for *small, reliable, pre-set* batches and confidence,
not big-data reconciliation. The tool is used under mild time pressure, close to an event.

---

## The journey

### 1. Collect 🟢 [collect]
- **Goal:** never lose a song you liked.
- **Do:** hear a song (radio, social, video) → Shazam → add to `WCS Sagbot`.
  One flat "library of intent," unordered — structure comes later via tags.
- **Tools:** Shazam, Spotify.
- **Pain:** minimal.
- **Emotion:** 🙂 Easy, habitual.

### 2. Download ⛔ [TOOL] — pain epicenter
- **Goal:** every collected song as a local mp3 VDJ can play, offline.
- **Do:** bulk-download via spotdl; *or* grab singles manually from YouTube-to-mp3
  (faster, for non-Spotify songs, or to avoid a multi-minute full sync).
- **Tools:** spotdl, yt2mp3 sites.
- **Pains:**
  1. **Manual downloads create duplicates** — spotdl doesn't detect them, re-downloads next run.
  2. **Silent failures, zero visibility** — no list of what failed/is missing. Gaps are
     discovered *by accident* (on the phone, wishing to play a song that isn't local).
  3. **Backend fragility** — spotdl broke on a Spotify API change right before two
     international events; rescued ~50 songs with a hand-written script under pressure.
- **Emotion:** 😖 Anxiety/betrayal — gaps surface at the worst moment (mid-set, pre-flight).

### 3. Tag & clean 🟡 [VDJ], with a [BRIDGE] thread + opt-in assist
- **Goal:** make songs findable and play-ready.
- **Do:** filter VDJ to untagged → listen start/middle/end → (a) **check version**
  (right cut? not the music-video audio? background noise?), (b) **cut** start/end noise
  if needed (rare, in VDJ), (c) **tag**.
- **Tagging system:** Energy (high / mid / low — can be multiple) + Characteristics
  (cluby, bass, funky, dark, sexy, emotional, disney, …). Deliberately **over-tags**.
- **Tools:** VirtualDJ.
- **Pains / notes:**
  - "Did I get the right version?" is **downstream of a bad download match** → a [BRIDGE]
    problem better prevented upstream (future match-QA).
  - User states **tagging assistance is in-scope** for the product (opt-in help, not
    replacing his judgement).
- **Emotion:** 😐 Tedious but accepted craft.

### 4. Prep set 🟡 [VDJ today] — selection assist is IN SCOPE
- **Goal:** a strong set he can edit live.
- **Do:** build a set in VDJ (usually from scratch; from an old set when rushed),
  balancing: **duration** (1.5h Media West / 3.5h WesTLV / ~2h international),
  **crowd** (level, time-of-night, taste), **BPM** (the ~65–125 "wave," matched to
  level/time), **energy flow**, **style variety** (latin/pop/club/sexy/funky…).
- **Tools:** VirtualDJ.
- **Scope:** playback stays in VDJ, but **helping choose songs is explicitly in-scope.**
- **Works mostly from a "sidelist," not the full library** — see the cross-cutting section below.
- **Emotion:** 🙂 The fun, expressive part.

### 5. Live set 🟡 [VDJ] — live song-selection assist IN SCOPE; [BRIDGE] data leaks
- **Goal:** read the room and adapt.
- **Do:** edit the pre-made set live (pull a VIP song if the floor's empty; extend a
  latin run if it lands). Captures observations:
  - song **needs cutting** (too long / noise) → **no good place to record this**;
    risk of replaying the unfixed song.
  - song's **vibe felt different** → update tags.
  - **a specific person loved it** → tag their name in VDJ comments to find favorites later.
- **Tools:** VirtualDJ.
- **Pains:** **[BRIDGE]** — valuable metadata (cut-needed, re-tags, person-tags) is
  generated here with **no reliable capture mechanism**. "Cut needed" note is homeless.
- **Scope:** live *playback/mixing* = external forever; live *next-song suggestion* = in-scope.
- **Emotion:** 🎢 Flow + low-grade "I'll forget to fix that" friction.

### 6. Post-set ⛔ [BRIDGE→TOOL] — second pain cluster
- **Goal:** archive the set + share it to Spotify with the community.
- **Do:** save set as a VDJ playlist (venue + date). For Spotify: paste a text export
  into a free web converter → **manually fix its mistakes**.
- **Tools:** VDJ, web text→Spotify converters.
- **Pains:** converters are error-prone (manual correction) and it's **late at night** →
  he **often just doesn't publish**. Intent dies from friction.
- **Emotion:** 😞 Deflating — good work goes unshared.

---

## The "sidelist" (recurring practice — taming a large library)

Source: follow-up from Sagiv, 2026-06-08.

The full library (~842 and growing) is **too large to navigate when picking songs for a set**.
To cope, Sagiv keeps a **sidelist**: a smaller, curated working subset he builds sets *from*,
only dipping into the full library when the sidelist doesn't have what he needs.

- **What goes in it:** recently-added songs, plus songs he *remembers loving* and wants to play
  in upcoming sets. A personally-curated "front of mind" shortlist.
- **Lifecycle:** it sticks around for a **while (~1–2 months)**, gets periodically topped up, and
  is eventually **cleared / restarted fresh**. Not permanent, not a one-off — a rolling working set.
- **Why it matters:** it's a manual workaround for *"my library is too big to find things in."*
  It's effectively the user's own answer to navigation/findability — distinct from tags (which
  slice the *whole* library) and from a played-set archive (history). The sidelist is a
  *forward-looking staging area* for "what I'm likely to play soon."

**Design implications (for Define):**
- This is a strong candidate first-class concept: a **named, mutable working list** (curated
  subset) that set-building draws from. Distinct from: the full library (Tracks), tag filters,
  coverage smartlists, and the played-sets archive (Sets).
- It overlaps conceptually with "Recently added" (already on the Home mockup) — recently-added is
  one *input* to the sidelist, but the sidelist is broader (also old favorites) and is
  user-curated + clearable.
- Likely needs: add/remove a song to the sidelist from anywhere a song appears, a dedicated view,
  and a "clear / start fresh" action. Pin the data model question: is this one list, or many?
  (v1 leans one personal list; multiple is a natural extension.)

## The "event-readiness" audit (recurring, currently invisible)

Before an event, Sagiv manually reviews the library for **category coverage** against the
specific event's needs:
- Romantic songs for `Valentine Swing`.
- Spanish songs for `Arousa` (Spain); language-matching by destination.
- Enough late-night-appropriate songs if he might get a late slot.

This is anxiety-driven, manual, and depends on tag quality. It is the clearest expression
of the core emotional need below.

---

## Headline insight

**The core unmet need is *confidence before it matters*** — and it has two faces:
- **Quantity confidence:** "Did everything download? What's missing?" (download health)
- **Coverage confidence:** "Do I have the right songs for what I'm about to play?"
  (depends on tags + library composition; surfaced in the event-readiness audit)

Both are *visibility/trust* problems, currently invisible until they bite at the worst time.
A UI's primary job is to make library health — quantity **and** coverage — visible and
trustworthy ahead of an event.

## Scope picture (post-interview)

- **Hard out (forever):** live playback / mixing — VDJ owns this.
- **In scope / fair game:** collect→download health, match-QA, manual-import dedup,
  **tagging assistance**, **set-building assistance (pre-set + live next-song suggestion)**,
  **Spotify set export**.
- This is a **larger product** than the original "download bridge." Capture the full vision;
  decide **phasing** in the Define step. Risk has flipped from "too timid" to "scope explosion."

## Pain → planned-feature map

| Pain | Planned as |
|---|---|
| Manual download → duplicate | `future/manual-imports.md` / `import` (WES-17, partly built) |
| Silent failures, no list of missing | `status` + UI dashboard (core reason for the UI) |
| Wrong version / music-video / noise | future **match-QA** flow (`future/ui-app.md`) |
| spotdl breakage | the pluggable yt-dlp backend (why the tool exists) |
| Painful Spotify export | `future/set-export.md` |
| Tagging is tedious | `future/tagging-assistance.md` |
| **Set-building / song selection assist** | **no PRD yet — new direction** |
| **Event-readiness coverage audit** | **no PRD yet — new, ties health+tags+prep** |
| **Large library hard to navigate → manual "sidelist"** | **no PRD yet — new; a curated working list as a first-class concept** |
| **"Cut needed" note has no home** | **not planned anywhere — genuine gap** |

## Jobs To Be Done (extracted)

- When I collect a song I like, I want it captured so I never lose it.
- When I prep before a set, I want every wanted song available locally so I'm not ambushed by a gap.
- When a download fails, I want to *know which songs* failed so I can act, not discover it mid-set.
- When I grab a song manually, I want the tool to recognize it so I don't get duplicates.
- When an event is coming, I want to know if my library *covers* what I'll need to play (mood, language, time-of-night).
- When I tag, I want help so it's faster and I miss fewer tags.
- When I build a set, I want help choosing songs that fit duration/crowd/BPM/energy/style.
- When my library is too big to scan, I want a curated "sidelist" of songs I'm likely to play
  soon (recent + remembered favorites) to build sets from, that I can top up and clear over time.
- When a set ends, I want to publish it to Spotify *without* late-night manual cleanup.
- When I notice a song needs a cut/fix, I want a reliable place to record it so I don't replay the bad version.

## Open questions for the Define phase

- Phasing: which of the in-scope areas ship first? (Download health is the obvious wedge.)
- Where does set-building assistance live relative to VDJ — export a set *into* VDJ, or just
  produce a candidate list?
- Does the tool need to *read* VDJ's tags/comments (person-tags, cut notes) to be useful, and
  is that technically feasible? (Data-boundary question.)
- **Sidelist:** is it a first-class concept in the UI, and which phase? How does it relate to
  "Recently added," tag filters, and the played-sets archive — one curated list or many? What
  are the add/remove/clear interactions, and where does "add to sidelist" appear?
