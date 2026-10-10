# BLUEPRINT BP-0.7-D2: direction "Field Guide"

Read `docs/blueprints/BP-0.7-common.md` first; it binds you. Your directory:
`site/proto/d2/`.

## Concept
**An explorable field guide to agents.** Reading comes first, and the figures
answer back: numbers in the prose can be dragged, figures react to the
sentence you're reading, terms open margin notes. Think of the best
interactive essays (Bartosz Ciechanowski, Red Blob Games, Distill): calm,
beautiful, precise, and full of small discoveries. Fun here is the "aha" of
direct manipulation and the satisfaction of finding the answer yourself.

## Palette (day; a night theme is optional)
- Paper `#FCFBF8`; figure plates `#FFFFFF` with a 1 px `#E6E3DC` rule; ink
  `#1B1B1B`; secondary `#5A5853`; margin-note ink `#4A4A4A`.
- Accent for interactive numbers: a dotted underline and a soft highlight
  `#FFF3C4` on hover/drag, plus a `↔` cursor (`ew-resize`).
- Wires, in turn order — exact: control `#7A62E0`, context `#1A3F96`,
  loop `#D8465C`, errors `#73290F`, tools `#A27F00`, permissions `#155C45`,
  verify `#1F8577`, observe `#3E4858`.
- Pass `#1D6B3F`, fail `#B3261E`; always with a mark and a word.

## Type
- **Newsreader** (variable with optical size; `@fontsource-variable/newsreader`):
  body text 19 px phone / 20 px desktop, line-height 1.55, measure ≤ 64ch;
  headings at display optical size, 600.
- **Inter** (`@fontsource-variable/inter`): UI controls, labels, figure
  captions (15–16 px), small caps-like figure labels ("FIG 2") at 14 px 600
  with .06em tracking. Use `font-variant-numeric: tabular-nums` for numbers.
- **JetBrains Mono** (`@fontsource/jetbrains-mono`): code, JSON, trace rows.
- If a package doesn't exist, report it; fall back to `@fontsource/newsreader`
  (static) or `@fontsource/inter` (static) for the same roles.

## Layout
- A single reading column (≤ 64ch) centered; on ≥ 1100 px a **right margin**
  (≈ 260 px) holds margin notes (term definitions, facts, "why this number")
  aligned to their line; on phones those notes become tap-to-expand inline
  notes (a small `ⓘ`-style marker drawn in SVG, not a font glyph).
- Figures break out of the column to ≈ 760 px on desktop, full width on phones,
  each with a figure number and a one-sentence caption that says what to try.
- Home reads like the guide's **contents page plus a bookmark**: a calm header,
  "Continue reading: B2 The agent loop" as the primary link, the on-call shift
  as a small boxed "Today's field exercise", the Harness Board drawn as a
  **specimen plate**: the Turn Clock face with the 8 wires as labeled spokes,
  earned modules drawn as small labeled tags on their spokes, empty spokes
  faint with "comes in B2" labels. Path progress as a table of contents with
  check marks.
- Break: the setup and prediction read as prose; the prediction is a short
  multiple-choice set inside the text. The replay is **FIG 1**: a transcript
  view (the run read like a story: model messages as quoted lines, tool calls
  as small cards, results in mono), with a thin 8-lane "spectrogram" strip
  above it that scrubs. A sentence under the figure is live: "At turn **[7]**,
  the prompt is **4,212** tokens and the run has cost **≈ 0.06** units." —
  the turn number is a **scrubbable number** (drag left/right or arrow keys)
  that moves the replay. Desktop shows lanes + transcript side by side; phone
  shows the transcript with the strip and a sticky slim control bar at the
  bottom.
- Prove: FIG 2 shows the two boards as **small multiples** (two identical
  plots, same axes, old vs new). The results are written as reactive prose:
  "Both boards pass **13** of 20. The worst run costs **≈ 1.19** on the old
  board and **≈ 0.13** on the new one, about **9×** less." The par puzzle is a
  sentence with a scrubbable number: "With a limit of **[12]** turns, **13**
  runs still pass and the worst run costs **≈ 0.127**." plus FIG 3, the
  solution-space curve, with the current limit as a dot that moves as you drag.

## Motion and juice
- Calm and precise: 200–400 ms, `cubic-bezier(.2,.7,.2,1)`; lines draw on
  (stroke-dashoffset) when a figure first becomes visible; values tween
  (≤ 300 ms) when a scrubbable number changes.
- Replay: the current transcript row fades in from 0 → 1 opacity with a 4 px
  rise; the strip's playhead glides.
- Par: the margin note "You found par." appears with a small hand-drawn-style
  underline drawing on beneath the sentence; the turn-limit tag slides onto the
  loop spoke of the mini clock.
- Reduced motion: no draw-on, no tweening; values update instantly.

## Voice
A good field guide: clear, warm, exact. One wry line per page is fine
("The model is very sure it's almost done. It isn't.").

## Avoid
Walls of text (no paragraph over 4 lines on phones), decorative serif in UI
controls, scrubbable numbers without a visible affordance, figures without a
"try this" caption, anything below 14 px.
