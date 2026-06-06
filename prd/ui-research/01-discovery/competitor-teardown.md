# Competitor Teardown — DJ Library & Set Tools

> UX research artifact (Discovery phase, step 2). Source: web research, 2026-06-06.
> Purpose: study how existing tools solve adjacent problems — steal proven interaction
> patterns, avoid their frictions, and locate where spotify-sync is actually differentiated.

## Competitive landscape

| Tool | Core focus | Library mgmt | Set-building assist | **Acquires/downloads audio** | Spotify |
|---|---|---|---|---|---|
| **Lexicon** | Library management + metadata sync across all 5 DJ apps | ✅ deep | ❌ (manual; has Track Timeline viz) | ❌ | "Send to Spotify" share only |
| **Djoid** | Music curation + **AI set planning** | ✅ | ✅ (Auto-Grouping, Magic Sort) | ❌ | not mentioned |
| **DJ.Studio** | Mix editing / transition automation for recorded sets | ❌ | ✅ (Automix/Harmonize) | ❌ | not mentioned |
| **Mixed In Key** | Harmonic/key + energy analysis | minimal | partial (cue/transition hints) | ❌ | not mentioned |
| **spotdl / yt-dlp** (what Sagiv uses now) | Acquisition: playlist → local audio | ❌ | ❌ | ✅ | ✅ (reads playlists) |

## THE key finding: the acquisition gap is our wedge

**None of the commercial DJ tools download audio.** Lexicon, Djoid, DJ.Studio, and Mixed In Key all *assume you already own the files* — bought from Beatport, ripped, or streamed via paid LINK subscriptions. Lexicon's "streaming" support is reference/metadata + (partial) in-app preview, **not** turning a Spotify track into a local mp3.

The only tools that do acquisition are the hacky CLI ones Sagiv already fights with (spotdl, yt-dlp, yt2mp3 sites) — and *those* have no library health, no dedup, no visibility, no UI.

**So spotify-sync sits in an unoccupied niche: acquisition + library health for a personal library, glued together.** The mature products are downstream of us (they manage files we'd help you get). This sharpens positioning:
- **Don't** try to out-Lexicon Lexicon on conversion/cue points/multi-app sync.
- **Do** own the thing none of them touch: "from a Spotify playlist of intent to a complete, healthy, event-ready local library" — and then optionally help organize/select, which is where we'd borrow their patterns.

## Lexicon — patterns worth stealing (mapped to our pains)

Lexicon is the closest analog and the richest source of proven UX. Mapped to the journey-map pains:

| Lexicon pattern | What it is | Maps to our pain / scope |
|---|---|---|
| **Scans**: "Find Lost Tracks", "Find Broken Tracks", "Find Missing Tags & Album Art", "Find Duplicates", "Find Unused Files" | A *library-health* model: run checks that surface problems as actionable lists | Directly answers our #1 pain — **silent failures / no list of what's missing**. The "scan → list of problems → act" UX is exactly the dashboard we want. |
| **Smartlists** | Rule-based dynamic playlists ("Any/All", OR clauses, tag rules like *has all these tags / has none*). Auto-populate as the library grows. | **Event-readiness coverage** ("do I have enough spanish / late-night songs?") becomes a smartlist. Also the backbone for tag-driven set building. **Strongest single pattern to steal.** |
| **Analytics fields**: Energy, Danceability, Happiness, Popularity | First-class numeric/mood fields, auto-analyzable | Our **Energy + Characteristics tags**; auto-analysis = the **tagging-assistance** direction. |
| **Track Timeline** (v1.10) | Visual chart of BPM / key / energy across a playlist; plan a set as energy blocks (build-up → peak → cool-down); interactive, updates live | Matches Sagiv's exact mental model — the **"BPM wave" + energy flow**. The visual model for **set-building assist**. |
| **Incoming Tracks / Watch Folder / Target Folder** | Auto-import new files into the library, with move/rename | **Manual-import dedup** — recognize files grabbed manually so they aren't re-downloaded. |
| **Send to Spotify / Shareable list** | Push/share a playlist out to Spotify | **Post-set export** pain (the error-prone, late-night, often-skipped step). |
| **Custom tags, unlimited** | Free-form tagging system | Sagiv's over-tagging habit + person-tags. |
| **Cleanup tools** (genre/artist/casing/garbage-char) | Batch metadata hygiene | Lower priority, but relevant to messy yt-dlp output. |
| **Local API + Plugin support** | Headless core other tools build on | **Validates our own core/CLI separation** — the architecture is already "right" by Lexicon's standard. |

UX table-stakes Lexicon shows are expected: dark/light theme, global search, side panel, undo history, waveform preview.

## What to deliberately NOT copy (scope discipline)

Lexicon is a pro, paid, multi-app tool managing up to 1.2M tracks. We are personal, VDJ-only, ~850 tracks, acquisition-first. Out of scope for us:
- Multi-DJ-app library conversion / field mappings (we only target VirtualDJ).
- Cue points, beatgrids, key/harmonic analysis (VDJ + Mixed In Key territory; we said live/mixing stays external).
- 400+ hotkeys, power-user batch reformatting at scale.
- Paid streaming LINK integrations (Beatport/Tidal).

Resisting these is the whole point of the journey-map scope note: **capture the vision, phase the build.**

## Adjacent set-building tools (revisit if/when set-building is phased in)

Now that set-building assist is in scope, three tools are worth a deeper teardown *later*:
- **Djoid** — AI set planning (Auto-Grouping, Magic Sort). Closest to "help me choose songs."
- **DJ.Studio** — timeline-based mix building + auto-transitions.
- **Mixed In Key** — energy/key analysis feeding transition suggestions.

All three still rely on you already having the files. Note for Define: if we phase in set-building, the realistic play is *suggestion/curation* (à la Djoid) feeding a list **into VDJ**, not in-app mixing (DJ.Studio's lane, which we've ruled out).

## Implications for the Define phase

1. **Lead with the library-health dashboard.** Lexicon's "scans → problem lists" validates that download health is the natural first wedge and a familiar pattern.
2. **Smartlists are the unifying primitive.** Health, coverage audit, and tag-driven set prep can all be expressed as rule-based dynamic lists — one concept, three payoffs. Strong IA candidate.
3. **Borrow the Track Timeline mental model** for any future set-building view (energy/BPM as a curve, not a flat list).
4. **Differentiation is acquisition + health**, not management depth. The IA and the "first run" story should make that obvious.

## Sources

- [Lexicon — home](https://www.lexicondj.com/)
- [Lexicon — Features](https://www.lexicondj.com/features)
- [Lexicon — Smartlists manual](https://www.lexicondj.com/manual/smartlists)
- [Lexicon — Streaming Tracks manual](https://www.lexicondj.com/manual/streaming-tracks)
- [Digital DJ Tips — Lexicon 1.10 (Track Timeline)](https://www.digitaldjtips.com/lexicon-1-10-brings-serato-4-0-support-track-timeline-play-history/)
- [Djoid vs Lexicon vs Mixed In Key vs DJ.Studio](https://www.djoid.io/articles/djoid-vs-lexicon-vs-mixed-in-key-vs-dj-studio)
