# HARNESSED: design system

Status: **v2 (Phase 0).** Chosen after a design exploration (DECISIONS D-031,
D-034): three directions prototyped on the same screens and data, a
first-time-learner walkthrough, and a weighted rubric fixed in advance.
v1 (the spec-derived "drafting paper schematic", now baseline D0) is in git
history at `c82e35e`. Owner approval is part of the Phase 0 exit gate.
Machine-readable tokens live in `site/assets/core/tokens.css`; this file wins
if the two disagree (`tools/qa/check_palette.py` reads the CSS, so a mismatch
fails CI).

---

## 1. Identity: a field guide with working instruments

**HARNESSED reads like a field guide and works like a lab bench.** Each module
is a calm, beautifully set reading page. Every figure in it is a working
**instrument**: you step a real run, turn a real knob, run twenty trials and
read the numbers. At night the same course becomes the **night shift**: the
on-call console where incidents page you and you resolve them.

The memory system is the character (no mascots): the eight wires, and one
diagram that is both the **Turn Clock** and your **Harness Board**. Wires sit
at fixed clock angles everywhere, so "permissions live at 7 o'clock" becomes
spatial memory.

Five words for every decision: **clear, playable, precise, honest, calm.**
- *Clear*: one thing to do per screen; the run comes first, controls second.
- *Playable*: every figure answers back; predicting, stepping, tuning and
  beating par feel good to do again.
- *Precise*: real terms on every label; numbers carry units and intervals.
- *Honest*: uncertainty is drawn; simulated values carry "≈".
- *Calm*: no decorative motion; at most two feedback cues per action.

Where it came from (evidence in D-034): the reading structure, margin notes,
transcript replay and clock board from "Field Guide" (best learning clarity,
best memory aid); the instruments, step grids and par puzzle from "Patch Bay"
(most fun, clearest result display); the incident flow, escalating hints,
seed numbers, sticky thumb-zone transport and night console from "Night
Shift" (best phone ergonomics, accessibility and buildability).

---

## 2. Surfaces and themes

| Token | Day (default) | Night shift | Use |
|---|---|---|---|
| `--hx-paper` | `#FBFAF7` | `#0B0F14` | page background (plain; no page grid) |
| `--hx-panel` | `#FFFFFF` | `#121821` | plates: figures, cards (1 px `--hx-rule` border) |
| `--hx-panel-2` | `#F2F0EA` | `#18212C` | insets, table stripes, hover |
| `--hx-grid-minor` | `rgb(29 78 116 / .06)` | `rgb(120 180 220 / .05)` | faint drafting grid, **inside instrument plates only** (16 px) |
| `--hx-ink` | `#1B1F24` | `#E6EBF1` | text, primary strokes |
| `--hx-ink-2` | `#55595F` | `#9DABB8` | secondary text, margin notes (≥ 6.7:1 day, ≥ 7.6:1 night) |
| `--hx-rule` | `#E3E0D8` | `#222C38` | hairlines, plate borders |
| `--hx-rule-strong` | `#7C858C` | `#6B7A88` | form-control borders (≥ 3:1) |
| `--hx-focus` | `#1A56DB` | `#7FB2FF` | 3 px focus ring |
| `--hx-inst` | `#1B1F22` | `#0A0E13` | instrument readout windows |
| `--hx-inst-ink` | `#E9ECEF` | `#E9ECEF` | readout text |
| `--hx-inst-amber` | `#F2D06B` | `#F2D06B` | live readout values (11:1 / 12.9:1) |
| `--hx-inst-label` | `#AEB6BD` | `#AEB6BD` | readout labels (8:1) |
| `--hx-scrub` | `#FFF1BF` | `#3A3218` | interactive-number highlight |
| `--hx-code-bg` / `--hx-code-ink` | `#1B1F24` / `#E4EAF0` | `#0A1016` / `#DCE6EE` | code, Wire JSON |
| `--hx-pass` / `--hx-fail` / `--hx-warn` | `#1D6B3F` / `#B3261E` / `#8A5A00` | `#5FD08F` / `#FF8A80` / `#F2C35B` | status, always with a mark and a word |

- Theme: `prefers-color-scheme` by default; the learner can force day or
  night (`data-theme`), stored in prefs. Night shift is a full theme, not a
  palette swap: plates gain visible borders (plate vs paper is only 1.08:1),
  and the home becomes the shift console (§7.8).
- Instrument windows are dark in both themes, so "this is live" reads the
  same by day and by night.

---

## 3. The eight wires

One order everywhere, the order of one turn around the clock:
**"Clever Crews Launch Early; Test Pilots Verify Often."**

| # | id | Wire | Clock | Angle | Day | Night | Glyph | Line |
|---|---|---|---|---|---|---|---|---|
| 1 | `control` | Control plane | 12 | 0° | `#7A62E0` | `#C8BEFF` | layers | solid 2 px |
| 2 | `context` | Context & memory | 1–2 | 45° | `#1A3F96` | `#4A86E8` | window | long dash `10 4` |
| 3 | `loop` | Loop & state | 3 (the hand) | 90° | `#D8465C` | `#FF9E94` | cycle | solid 3.5 px |
| 4 | `errors` | Errors & recovery | 4–5 | 135° | `#73290F` | `#C2621E` | zigzag | dash-dot `8 3 2 3` |
| 5 | `tools` | Tools | 6 | 180° | `#A27F00` | `#F3CB6E` | hexagon | short dash `4 3` |
| 6 | `permissions` | Permissions & sandbox | 7–8 | 225° | `#155C45` | `#4E9A62` | diamond | dash-dot-dot `8 3 2 3 2 3` |
| 7 | `verify` | Verification & evals | 9–10 | 285° | `#1F8577` | `#7FE0CF` | shield | dotted `0.1 4`, round caps, 2.5 px |
| 8 | `observe` | Observability | 11 (rim) | 330° | `#3E4858` | `#7E8A99` | eye | fine dash `2 2`, 1.5 px |

Questions and laws live in `course.json` → `wires`; components read them.

### 3.1 Why these colors (evidence)

The book's palette gave all eight wires nearly the same lightness, so clock
neighbors merged under color-vision deficiency (worst neighbor ΔE<sub>OK</sub>
0.8). These keep the book's hue families and alternate lightness around the
clock (light: control, loop, tools, verify; dark: context, errors,
permissions, observe). Measured with Machado et al. (2009) severity-1.0
simulation and OKLab distance × 100 (`tools/qa/check_palette.py`):

| Theme | Normal min / adjacent min | Protan | Deutan | Tritan | Min contrast |
|---|---|---|---|---|---|
| Day | 9.0 / 13.4 | 6.7 / 14.1 | 5.2 / 13.2 | 4.0 / 13.7 | 3.6:1 on paper, 3.8:1 on plates |
| Night shift | 12.3 / 20.4 | 9.3 / 18.8 | 7.0 / 20.0 | 4.7 / 17.5 | 4.6:1 on paper, 4.3:1 on plates |

Considered and rejected: Okabe-Ito (best any-pair separation, 7.6, but half
its colors fall below 3:1 on light paper) and Paul Tol's palettes (same
problem). **CI thresholds**: every wire ≥ 3.0:1 vs paper and plate; adjacent
pairs ≥ 12 under all four visions; any pair ≥ 8 (normal) and ≥ 3.5 (CVD).

### 3.2 Wire rules
1. **Never color alone**: every wire mark carries its glyph and/or name.
2. **Wire color is for wires**: not for beats, status, decoration or chart
   series that aren't wires.
3. **No text in wire colors**; chips use ink text on a 14 % tint with a 45 % border.
4. **Fixed angles** in every circular view; **turn order** top to bottom in
   every stacked view (lanes, lists, radar, filters).
5. **Every wire has an event every turn** (D-033), so no lane is empty.

---

## 4. Glyphs

Unchanged from v1. The exact SVG path data is in
`site/assets/core/glyphs.svg` (built from the v1 tables at `c82e35e`). All
glyphs: `viewBox 0 0 24 24`, no fill, `currentColor` stroke 2 px, round caps
and joins; minimum 16 px; lanes 18 px; clock 22 px. One exception: the phone
replay's overview strip draws its lane glyphs at 12 px, because the strip is an
overview and never the only place a wire is identified (chips and transcript
rows show the glyph at full size).

- **Wire glyphs**: `layers` control · `window` context · `cycle` loop ·
  `zigzag` errors · `hexagon` tools · `diamond` permissions · `shield` verify ·
  `eye` observe. Each wire's glyph is the glyph of its central trace event.
- **Event glyphs**: `run_start` play · `run_end` flag (filled when done) ·
  `prompt_built` layers · `model_call` box · `model_reply` box filled ·
  `model_error` zigzag · `retry_wait` hourglass · `breaker` switch ·
  `tool_call` hexagon (slash when failed) · `permission` diamond
  (allow/ask/deny marks) · `compaction` squeeze · `cache` prefix ·
  `context_check` window · `verify` shield (pass/fail) · `guard` noentry ·
  `interrupt` pause · `subagent_start/end` nested · `trace_write` eye.
- **UI marks**: `check`, `cross`, `bang`, `ext`, `prog-0/1/2`, always paired
  with a word (visible or `aria-label`). Unicode symbols are never used as marks.
- Beats have no glyphs (shown as "1 Break").

---

## 5. Typography

Three families, self-hosted, Latin subsets, `font-display: swap`; no CDN.

| Role | Family (CSS) | Source | Faces | Token |
|---|---|---|---|---|
| Reading text, headings | **Newsreader** (text optical size) | `@fontsource/newsreader`, OFL | 400, 400 italic, 600 | `--font-serif` |
| UI, labels, captions, controls | **Harnessed Sans** (renamed IBM Plex Sans subset) | `@ibm/plex-sans` 1.1.0, OFL | 400, 600 | `--font-sans` |
| Code, Wire JSON, trace rows, readouts, numbers | **Harnessed Mono** (renamed IBM Plex Mono subset) | `@ibm/plex-mono` 2.5.0, OFL | 400, 600 | `--font-mono` |

- Newsreader ships as static subsets (not the 132 KB variable file); target
  ≤ 135 KB for all seven files (measured 133 KB in the v2 prototype); preload
  only serif 400, sans 600, mono 400.
- Plex's reserved font name keeps its subsets renamed (D-013). Newsreader's
  license is checked for a reserved name in Phase 1 and renamed the same way
  if it has one.
- Numbers that must align (readouts, bench results, numeric columns) use
  `--font-mono` (Plex has no `tnum`).

### 5.1 Scale (px; rem = 16 px)
| Token | Phone | ≥ 768 px | Use |
|---|---|---|---|
| `--fs-small` | 14 | 14 | captions, labels, chips: the floor |
| `--fs-ui` | 15 | 15 | buttons, controls, tables (sans) |
| `--fs-body` | 19 | 20 | reading text (serif), line height 1.55, measure ≤ 64ch |
| `--fs-lede` | 21 | 23 | module lede (serif) |
| `--fs-h3` | 19 | 20 | sans 600 |
| `--fs-h2` | 26 | 30 | serif 600 |
| `--fs-h1` | `clamp(2.1rem, 1.4rem + 3vw, 3.1rem)` | | serif 600 |
| `--fs-code` | 14 | 15 | code, JSON, trace rows |
| `--fs-readout` | 22 | 28 | instrument values (mono 600); long values must stay on one line |

**Nothing under 14 px at any width, including SVG text.** Charts and diagrams
draw at their measured pixel width (not a scaled viewBox) and redraw on
resize, so their text stays at real sizes.

---

## 6. Layout

### 6.1 Breakpoints
phone 375–699 · tablet 700–1099 · desktop ≥ 1100 (margin notes appear) ·
wide ≥ 1280 (figures widen to 60rem). QA screenshots at 375, 768 and 1280.

### 6.2 App shell
- **Top bar** (52 px; sticky on ≥ 700, scrolls away on phones): wordmark
  `HARNESSED` (sans 600, .04em, with the 8-tick connector mark), current
  module code and title, a board button (mini clock with the due-card count),
  theme and motion toggles.
- **Course map**: left rail on desktop, drawer on phones. "Today's shift"
  first, then Parts with status marks (`prog-0/1/2` + words).
- Footer: progress export/import, theme, motion, licenses, "facts verified
  as of …".
- Skip link to `#main` first on every page.

### 6.3 Module page (the field guide page)
1. Header: plate label (`B2 · Part B`), title (serif), lede, wire chips,
   minutes, "By the end you can …", prerequisites, and the beat strip
   (`1 Break · 2 See · 3 Fix · 4 Prove · 5 Keep`; sticky under the top bar on ≥ 700).
2. A single reading column (≤ 64ch). Figures (instruments) step out to
   60rem on desktop and go full width on phones, each with a plate label
   (`FIG B2.1 · REPLAY`) and a one-line "Try this" caption.
3. **Margin notes** (≥ 1100 px): term definitions, fact chips and "why this
   number" notes, aligned to their line in a 260 px right margin. On phones
   they are tap-to-expand inline notes.
4. Keep beat: the law (large serif with the wire glyph), cards, say-it
   prompts, "what to show from this module".

### 6.4 Spacing, radius, elevation
Spacing 4/8/12/16/24/32/48/64 (`--sp-1…8`). Radius: chips 6, keys and buttons
8, plates 12, instrument windows 6. No shadows except popovers, the drawer and
**keys** (a 2 px bottom edge that compresses when pressed).

---

## 7. Signature figures and patterns

### 7.1 The Turn Clock board (`hx-clock`, also the Harness Board)
One diagram serves both: the clock face with the eight wires as **spokes** at
their angles; earned modules are **tags** on their spoke ("A3 · history
resend"); empty spokes are dashed with "comes in C9"; a de-energized wire
(cards due) shows a dimmer spoke *and* a "2 cards due" badge.
- On phones the clock is still drawn (≥ 343 px wide); outer labels become a
  numbered legend list under it.
- During a replayed turn the **hand** (loop color) points at the active
  spoke; in full motion a pulse travels the rim (≈ 300 ms per hop).
- Tapping a spoke opens its card: question, law, modules, level, evidence.
- In Prove the board appears twice (old vs new) and the new module **plugs
  in**: the tag slides onto its spoke and the spoke brightens (two cues).

### 7.2 The replay (`hx-replay`)
- **Phone, story first.** The main view is a **transcript**: the model's
  words as quoted lines, tool calls as small cards with their result,
  harness decisions (permission, guard, retry) as one-line rows with their
  glyph. The current event is highlighted and carries its **plain explanation
  inline**. Above it, a compact **8-lane strip** (every event as a mark and a
  playhead; at most 96 px tall on phones). The **whole strip is one scrubber
  control** (≥ 44 px tall, arrow keys, tap selects the nearest event); on
  phones individual lanes are display-only. Then **one compact instrument bar**
  ("Turn 4/14 · Desk 26 % · ≈ 0.026") instead of tiles; tiles on ≥ 700 px.
  The transcript keeps the **current row visible** just above the transport.
- **Transport, sticky in the thumb zone**: Back · **Step** (primary) · Play,
  speed 1×/2×/4×, and the event counter. At most 22 % of an 812 px screen;
  48 px keys. The scrubber has − / + steppers and arrow keys.
- **Desktop**: lanes timeline (8 lanes in turn order, glyph marks at time
  `t`, hit areas ≥ 44 px) beside the transcript; the inline explanation is a
  callout anchored to the selected mark.
- Readouts in instrument windows: turn, context ("desk") usage with %, cost
  (`≈ 0.031 units`).
- **No autoplay**: starts paused at the first event.
- **Wire filter**: a lane label or chip isolates that wire; Step and Back
  then move between that wire's events; the filter shows in text.
- **Repetition cue**: a repeated action is marked "seen at turn 4".
- **Friendly / Wire** toggle for event detail (plain sentence vs JSON).

### 7.3 Prediction gate and reveal (`hx-check mode=predict`)
The replay is locked until the learner commits to a prediction. After the
run, the reveal states the outcome in one line, whether they were right, and
**why each option is tempting** (one line each).

### 7.4 Incident hunt (`hx-incident`)
"Tap the first event where things went wrong." Wrong taps get **escalating
hints** (first: "Too early: that step was reasonable."; second: a pointer to
where to look). Success states *why* and offers the fix choice with a reason
per option. Time to diagnose and par appear only after success. An early tap
never hides or resets the hunt.

### 7.5 The bench (`hx-bench`)
- Old and new boards side by side (stacked on phones). **Run ×20** runs both
  on the same seeds (one PRNG per trial, D-029).
- Trials appear as a **step grid** per board: numbered cells (seed 1–20) with
  status mark and turns; the same number on both boards is the same seed, and
  focusing one highlights its twin.
- Results in instrument windows (pass rate, worst-case turns and cost, mean
  cost), computed, never typed; small-multiple histograms on shared axes,
  "before" hatched and "after" solid; then the honest sentence and the noise
  sentence as reactive prose.

### 7.6 Par puzzles
A goal ("cheapest worst case without losing a passing run"), a stepper with a
readout, and a **solution-space chart** of every possible value (infeasible
zone marked, the learner's point highlighted, par revealed after three
distinct tries). Reaching par: one celebration line plus the readout's `PAR`
state (two cues). Compare against the solution space, never a leaderboard.

### 7.7 Reactive sentences
Numbers in prose can drive a figure ("With a limit of **[12]** turns, **13**
runs pass"). The number has a visible highlight (`--hx-scrub`), a dotted
underline, − / + steppers on focus, arrow keys and drag; its value is also
shown in the figure. At most one per paragraph.

### 7.8 Night shift and the daily on-call shift
- The daily shift opens like a page: "**PAGE** · run b2-spiral has called
  tools 14 times and hasn't stopped" → Acknowledge → the incident → Resolved
  (with time to diagnose vs par). Calm on-call voice, real terms, no jargon
  before it is taught (the first-use checker applies to UI copy too).
- In the night theme the home is the **shift console**: the page card, the
  clock board, due cards, continue.

### 7.9 Instruments (the shared controls)
- **Keys**: 48 px, 8 px radius, ink fill (primary) or outline, a 2 px bottom
  edge that compresses on press (80 ms down, 150 ms up, no bounce).
- **Readout windows**: `--hx-inst` background, mono 600 values in
  `--hx-inst-amber`, 14 px labels in `--hx-inst-label`.
- **Steppers and sliders**: native inputs, styled; − / + are separate 44 px keys.
- **Radios and checkboxes**: the whole row is the target (≥ 44 px tall); the
  visual dot is 20 px.

### 7.10 Charts
Neutral ink marks; before = hatched, after = solid, both directly labeled;
wire colors only when the series is a wire. Every chart has a one-sentence
summary underneath. Axis titles sit above the plot, never colliding with
ticks; bins are chosen so every bin label is legible at 375 px.

---

## 8. Motion

| Token | Value | Use |
|---|---|---|
| `--dur-press` | 80 ms | key press down |
| `--dur-fast` | 150 ms | hover, toggles, key release |
| `--dur-base` | 300 ms | panel open, one pulse hop, tag plug-in |
| `--dur-slow` | 500 ms | figure line draw-on, a lane sweep step |
| `--ease-signal` | `cubic-bezier(.2,.7,.2,1)` | pulses, reveals |
| `--ease-exit` | `cubic-bezier(.4,0,1,1)` | things leaving |

1. **Motion means flow**: pulses, a filling desk, a retry wait, a plug-in.
   Never decoration.
2. **Learner-paced**: nothing starts on its own; stepping is primary.
3. **At most two feedback cues per action**; nothing flashes more than three
   times a second; automatic motion over 5 s has a pause control.
4. **Reduced motion** (system setting, or the stored in-app toggle, which
   wins): no travel, no draw-on, no tweening; state changes are instant and
   shown by a 2 px ink ring and fill.
5. Simulated time is virtual; the UI may pace playback for reading.

---

## 9. Accessibility (binding)

- WCAG 2.2 AA. Text ≥ 4.5:1, UI strokes and wires ≥ 3:1, nothing below 14 px.
- **Targets ≥ 44 × 44 px**, including radio rows, lane marks (via invisible
  hit areas), brand links and mini-board slots.
- Keyboard: everything; arrows within lanes, clock spokes, step grids and
  radio groups; Esc closes popovers; visible 3 px focus ring.
- Every setting persists (theme, motion, sound) in the progress store.
- Live regions announce replay progress at most once per turn and every result.
- Every component contains its no-JS fallback (figure + sentence).
- QA: axe (no serious/critical), reduced motion, CVD screenshots, the 14 px
  floor, no horizontal scroll, page weight.

---

## 10. Performance budget

≤ 300 KB per page (compressed, initial load), excluding Pyodide and the
editor, which load lazily with a progress indicator and are cached by the
service worker. Fonts ≤ 135 KB. Components load per page (only the `hx-*`
elements present). Diagrams are SVG; images ≤ 60 KB.

---

## 11. Voice and microcopy

Plain, warm, exact; second person; short sentences. One wry line per screen
at most ("The model is very sure it's almost done. It isn't."). No hype, no
exclamation marks. Buttons say what happens ("Step", "Run ×20", "Plug it in").
Numbers carry units and uncertainty. Jargon only after its module teaches it.

---

## 12. Prototype findings that became rules

| Finding (prototype or walkthrough) | Rule |
|---|---|
| Controls filled the phone's first screen (D1, D3) | §7.2 story first; transport ≤ 22 % of the screen |
| Explanations in a distant panel (D3) | §7.2 inline explanation on the event |
| Empty lanes looked broken (all) | §3.2 rule 5; D-033 |
| Clock hidden on phones lost the memory aid (D2) | §7.1 clock drawn at 343 px with a legend |
| Scaled SVG text rendered at 7–8 px (D2, D3) | §5.1 draw at measured width |
| An early tap removed the hunt (D1 blocker) | §7.4 never hide or reset the hunt |
| A static status line contradicted the readout (D1 blocker) | all status text is derived from state |
| Radios 20 px, lane marks 14 px (D2, D3) | §7.9, §9 target rules |
| Motion setting not stored (D2) | §9 settings persist |
| Jargon before teaching ("SLO", "p100", "canary") (D3) | §7.8, §11 first-use applies to UI copy |
| Variable serif cost 132 KB (D2) | §5 static subsets |
