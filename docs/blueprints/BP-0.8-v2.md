# BLUEPRINT BP-0.8: unified prototype of DESIGN v2

Builder rules: `.claude/agents/hx-builder.md`. You never commit. Your
directory: `site/proto/v2/` (plus QA output `tools/qa/out/v2/` and your
scratch dir).

## Goal
Build the **same three screens** as BP-0.7 (home, break, prove) to
**`docs/DESIGN.md` v2**, the system chosen from the exploration. The owner
will click this to approve the design, and it becomes the visual reference
for Phase 1 components. Quality bar: the best of each prototype, in one
coherent look. Read DESIGN v2 completely first; it is the spec. DESIGN §12
lists defects found in the prototypes that must not come back.

## Reuse (read these; copy and adapt code, don't start from zero)
- `site/proto/d2/` (Field Guide): reading layout, margin notes, transcript
  replay with inline explanations, the clock plate on home, reactive prose,
  "why each option is tempting" copy. **Base structure.**
- `site/proto/d1/` (Patch Bay): keys, readout windows, step grids, the par
  stepper and solution-space chart with the infeasible zone, results tiles.
- `site/proto/d3/` (Night Shift): escalating hints, the incident flow
  (page → acknowledge → resolved), seed-numbered cells and twin highlight,
  sticky thumb-zone transport, stored reduced-motion setting, the night console.
- Walkthrough findings to fix while reusing:
  `/tmp/claude-0/-home-user-ai-harness-eng/4512a573-cc00-58ec-8db9-1f17cfd98bb0/scratchpad/research/R5/WALKTHROUGH.md`
  (read every D1/D2/D3 problem; none may reappear).
- Common contract still binding: `docs/blueprints/BP-0.7-common.md`
  (screens, data, test hooks `hx-proto-home/break/prove`, constraints,
  addendum). Where it conflicts with DESIGN v2, DESIGN v2 wins.

## Must-haves (checked in review)
1. Tokens: link `../../assets/core/tokens.css` (DESIGN v2 values) and use the
   tokens, never raw colors for surfaces, ink or wires.
2. Fonts: `../../assets/fonts/` Harnessed Sans 400/600 and Harnessed Mono
   400/600 (already built), plus **Newsreader static** 400, 400 italic, 600
   (latin) from `@fontsource/newsreader` installed in scratch, copied with
   its LICENSE into `site/proto/v2/fonts/`. Report each file's size and
   whether the license names a Reserved Font Name.
3. **Both themes**: day (paper) and night shift (console). A visible theme
   toggle (day / night / auto) and a motion toggle, both stored.
4. Home: the **Turn Clock board** (DESIGN §7.1) as the hero, drawn on phones
   too (with the legend list), with the two earned modules as tags and the
   "2 cards due" badge; Continue as the one primary action; the on-call page
   card (day: "Today's shift"; night: the PAGE card); compact path progress.
5. Break: DESIGN §7.2–§7.4 exactly: transcript-first on phones with the
   8-lane strip and inline explanation, sticky transport ≤ 22 % of 812 px,
   lanes + callout on desktop, prediction gate, reveal with "why each option
   is tempting", the hunt with escalating hints that never hides or resets.
6. Prove: DESIGN §7.5–§7.6: step grids with seed numbers and twin highlight,
   results in readout windows, histograms that read at 375 px, the honest and
   noise sentences as reactive prose, the par puzzle with stepper, readout
   and solution-space chart, then "Plug it in" onto the clock board.
7. No text under 14 px including SVG (draw at measured width); every target
   ≥ 44 px; no jargon the course hasn't taught yet in this module (no "SLO",
   "p100", "canary"; "turn limit", "token budget", "seed", "pass rate" are fine).

## Acceptance (quote final lines)
```
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --out tools/qa/out/v2 --only proto/v2/index.html proto/v2/break.html proto/v2/prove.html --cvd
```
must end `0 failures`, every page ≤ 300 KB. Then look at your screenshots at
375 and 1280 in **both themes** and fix what looks wrong; save the three
mid-interaction extras (break 375 mid-replay in day; prove 1280 after Run ×20
in night; prove 375 at par in day) as `tools/qa/out/v2/proto__v2__extra-*.png`.

## Report
The BP-0.7 report format, plus: which walkthrough problems you fixed
(one line each) and font sizes.
