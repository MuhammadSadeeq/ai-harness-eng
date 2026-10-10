# BLUEPRINT BP-0.7-D1: direction "Patch Bay"

Read `docs/blueprints/BP-0.7-common.md` first; it binds you. Your directory:
`site/proto/d1/`.

## Concept
**Your harness is a modular rack you patch together.** Each wire is a
hardware module (Eurorack-style) with an engraved front panel; patch cables in
the wire colors run from the **MODEL** core module to each one. Signals are
pulses that travel the cables. The learner earns modules and plugs them into
rack slots. It should feel like pro audio gear or test equipment: tactile,
precise, a little playful, never toy-like. Real terms are the panel labels
(`MAX TURNS`, `STOP_REASON`, `TOOL_USE`), the way gear prints real units.

## Palette (day; no night theme required)
- Case (page background) `#E6E2D8`; module panels `#F1EEE7` with a 1 px
  `#CFCAC0` border and a 1 px inner highlight `#FFFFFF80` at the top edge;
  four small screw dots (`#B9B3A7`) in panel corners on large panels only.
- Ink `#1E2226`; secondary ink `#555B60`; engraved labels in ink at 600.
- LEDs: on = the wire color with a 6 px glow at 35 %; off = `#C9C4B9`.
- Wires (cables, glyphs, LEDs), in turn order — exact:
  control `#7457E6`, context `#14408F`, loop `#D23A4A`, errors `#6A2A10`,
  tools `#946E00`, permissions `#12553F`, verify `#187A6D`, observe `#36404E`.
- Pass `#1D6B3F`, fail `#B3261E`; always with a mark and a word.

## Type
- **Archivo** (variable; `@fontsource-variable/archivo`): panel labels in
  width 75–80, weight 650, uppercase, letter-spacing .08em, 14 px minimum;
  headings width 85, weight 700; body width 100, weight 400, 17/18 px.
- **JetBrains Mono** (`@fontsource/jetbrains-mono`, 400 and 700): readouts,
  tokens, costs, JSON. Readouts styled like a 7-segment display *without*
  imitating segments: mono 700 on a dark inset window `#1B1F22` with text
  `#F2D06B` (amber), ≥ 4.5:1.
- If a package doesn't exist, report it and use `@fontsource/archivo` (static)
  for the same roles.

## Layout
- Home: the **rack** is the hero: 8 slots in turn order (desktop: one row of
  8 narrow modules, ≈ 120 px each, with the MODEL module centered above and
  cables drooping down to each; phone: a 2 × 4 grid of modules, cables as
  short stubs into each module's input jack). Earned modules are populated
  panels with knobs and labels; empty slots are blank panels with a dashed
  outline and the "plugs in later" label. Below: Continue (big hardware
  "PLAY" key), On-call shift card, path progress as a row of patch-point lights.
- Break: a **tape transport** deck: big square keys (step back, play/pause,
  step forward) with pressed states, a speed selector (3-position switch),
  and a scrubber styled as a fader. Desktop: lanes as sequencer tracks
  (track names engraved at left, events as glyph "notes"). Phone: vertical
  event list styled as a printed **tape log** (monospace rows, a cursor on
  the current row), the overview strip above as a tiny 8-track LED grid,
  the transport keys sticky at the bottom. Context bar = a horizontal VU
  meter (segments fill; turns amber at 70 %, red at 90 %, and the % in text).
  Cost = amber readout window.
- Prove: two **racks** (old/new) with a big RUN ×20 key; trials appear as a
  20-step **LED step grid** per board (lit in status color with a glyph);
  linked seeds light the same step on both boards on hover/focus.
  Histograms as vertical bar meters. The par puzzle is a **rotary knob**
  labeled MAX TURNS (implemented as a native `<input type="range">`,
  visually a knob; arrow keys and drag both work; value in a readout), and
  the solution-space chart drawn on a dark "scope" screen (grid lines,
  the curve in amber, the learner's point as a bright dot).

## Motion and juice
- Keys: 80 ms press-down (translateY 2 px, inner shadow), release with a
  springy return `cubic-bezier(.34,1.56,.64,1)` 180 ms.
- Every replayed event sends a **pulse** along that wire's cable/lane
  (8 px dot, 200–400 ms by distance) and blinks the module's LED once.
- Knob turns snap to detents (one per value) with a 60 ms tick animation.
- Par: all 8 LEDs on the new rack sweep left→right once (≈ 600 ms), the
  readout shows `PAR`, and the turn-limit module slides into the loop slot
  with a satisfying settle (overshoot 4 px).
- Optional sound (off by default, toggle labeled "Clicks"): tiny WebAudio
  ticks for key presses and knob detents, generated in code (no files).
- Reduced motion: no pulses, no springs, no sweep; LEDs simply switch state.

## Voice
Like a good hardware manual: short, labeled, a little dry humor allowed once
per screen ("Fault light on. That's your cue.").

## Avoid
Skeuomorphic clutter (no wood, no fake metal textures), tiny knobs on phones
(the knob is ≥ 88 px on phones), text inside cables, anything below 14 px.
