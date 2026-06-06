# UI Research

Design-process working directory for moving spotify-sync from CLI to a UI.
This is **research and design, not implementation**. The end product of this
work is an active UI PRD (promoted from `prd/future/ui-app.md`) that the coding
agents build against.

## Process model (Double Diamond)

```
PROBLEM SPACE                         SOLUTION SPACE
◇ Discover → Define              →    ◇ Ideate → Prototype → Test/Iterate
  (explore)  (narrow)                   (explore)            (narrow)
"build the right thing"               "build the thing right"
```

Each phase below is a folder containing a `README.md` (goal, methods, status)
plus its findings/artifacts.

## Phases & status

| # | Phase | Folder | Status |
|---|---|---|---|
| 1 | **Discovery** — research the problem & the user | `01-discovery/` | 🟡 In progress |
| 2 | **Define** — synthesize into a problem statement, IA, flows | `02-define/` | ✅ Complete |
| 3 | **Ideate** — sketch many solution directions | `03-ideate/` | ✅ Complete |
| 4 | **Prototype** — wireframe → mockup → clickable | `04-prototype/` | 🟡 In progress |
| 5 | **Test & iterate** — usability test, refine | `05-test-iterate/` | ⬜ Not started |
| → | **Handoff** — write the active UI PRD | `prd/<NN>-ui-app.md` | ⬜ Not started |

## Discovery artifacts so far

- `01-discovery/current-state-journey.md` — current-state journey map of the
  full DJ library lifecycle (✅ step 1: workflow journaling).
- `01-discovery/competitor-teardown.md` — DJ tool landscape (✅ step 2). Key finding:
  acquisition (Spotify→local mp3) is an unoccupied niche; commercial tools only manage
  files you already own. Patterns to steal from Lexicon; scope-discipline list.
- `01-discovery/lexicon-personal-impressions.md` — Sagiv's first-hand Lexicon reactions
  (✅ step 2b). Drives IA (tab-per-category), required fields (album art in, Key out), and
  visual direction (Spotify-like). Raises a VDJ-integration feasibility question.

## Working notes

- Primary user = Sagiv (also the builder). Other WCS DJs are possible future users.
- Core insight driving the design: **"confidence before it matters"** — library
  health in both *quantity* (did everything download?) and *coverage* (do I have the
  right songs for this event?). See the journey map.
- Scope has expanded beyond the "download bridge" to include tagging assistance and
  set-building assistance; live playback stays in VirtualDJ forever. Phasing is a
  Define-phase decision — capture the full vision, don't build it all at once.
