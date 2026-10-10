# HARNESSED: design system

Status: v1 (Phase 0). Owner approval is part of the Phase 0 exit gate.
Every value here is final unless changed through `docs/DECISIONS.md`.
The machine-readable tokens live in `site/assets/core/tokens.css`; this file
explains them and wins if the two ever disagree (the QA palette check reads
the CSS, so a mismatch fails CI).

---

## 1. Identity

**The system itself is the character.** There are no mascots. The learner
meets the same eight wires, the Turn Clock, and their own Harness Board on
every page, until they can draw them from memory.

The look is an **engineering schematic on drafting paper**: a warm off-white
sheet with a faint blue grid, ink-dark type, and eight colored wires that
carry signal pulses. Figures sit on "plates": white panels with a thin rule,
a mono plate label, and corner ticks, like sheets pinned to a drafting board.
The dark theme is **night shift**: the same board under control-room light.

Five words for every visual decision: **precise, calm, legible, honest, alive**.

- *Precise*: thin rules, aligned grids, real terms on every label.
- *Calm*: one accent at a time; wires carry the color, the chrome stays neutral.
- *Legible*: 17–18 px body, generous line height, nothing under 14 px on phones.
- *Honest*: uncertainty is drawn (spreads, ranges, "≈"), never hidden.
- *Alive*: signal pulses show causality; motion always means "something flowed".

What HARNESSED is not (distinct from Oxidize): no dark-first ink-and-oxide
palette, no condensed shouting headlines, no characters, no island map, no XP.

---

## 2. Surfaces and themes

| Token | Day (default) | Night shift | Use |
|---|---|---|---|
| `--hx-paper` | `#F5F4EE` | `#0F161D` | page background (under the grid) |
| `--hx-grid-minor` | `rgb(29 78 116 / .055)` | `rgb(120 180 220 / .045)` | 1 px line every 16 px |
| `--hx-grid-major` | `rgb(29 78 116 / .10)` | `rgb(120 180 220 / .08)` | 1 px line every 80 px |
| `--hx-panel` | `#FFFFFF` | `#151F28` | plates, cards, widgets |
| `--hx-panel-2` | `#ECEBE3` | `#1C2833` | inset areas, table stripes, hover |
| `--hx-ink` | `#13202C` | `#E4EAF0` | text, primary strokes |
| `--hx-ink-2` | `#4D5A66` | `#9DABB8` | secondary text (≥ 4.5:1 on paper and panel) |
| `--hx-rule` | `#CFD3CC` | `#2A3946` | hairlines, borders |
| `--hx-focus` | `#1A56DB` | `#7FB2FF` | focus ring (3 px) |
| `--hx-code-bg` | `#13202C` | `#0A1016` | code blocks and the Wire View |
| `--hx-code-ink` | `#E4EAF0` | `#DCE6EE` | code text |
| `--hx-pass` | `#1D6B3F` | `#5FD08F` | pass state (always with the `check` mark and a word) |
| `--hx-fail` | `#B3261E` | `#FF8A80` | fail state (always with the `cross` mark and a word) |
| `--hx-warn` | `#8A5A00` | `#F2C35B` | stale fact, budget warning (always with ! and a word) |

- The grid is drawn only on the page background (two repeating linear
  gradients). Plates, code and widgets are solid. The grid is hidden in print.
- Theme selection: `prefers-color-scheme` by default; the learner can force
  `data-theme="light"` or `data-theme="dark"` on `<html>` (stored in prefs).
- Status colors are never the only cue: every pass/fail/warn shows its
  symbol and a word ("passed", "failed", "stale" with the `check`, `cross`, `bang` marks (§4.3)).

---

## 3. The eight wires

One order everywhere: the order of a single turn around the clock.
**"Clever Crews Launch Early; Test Pilots Verify Often."**

| # | id | Wire | Clock | Angle | Day | Night | Glyph | Line |
|---|---|---|---|---|---|---|---|---|
| 1 | `control` | Control plane | 12 | 0° | `#7A62E0` | `#C8BEFF` | layers | solid, 2 px |
| 2 | `context` | Context & memory | 1–2 | 45° | `#1A3F96` | `#4A86E8` | window | long dash `10 4` |
| 3 | `loop` | Loop & state | 3 (the hand) | 90° | `#D8465C` | `#FF9E94` | cycle | solid, 3.5 px |
| 4 | `errors` | Errors & recovery | 4–5 | 135° | `#73290F` | `#C2621E` | zigzag | dash-dot `8 3 2 3` |
| 5 | `tools` | Tools | 6 | 180° | `#A27F00` | `#F3CB6E` | hexagon | short dash `4 3` |
| 6 | `permissions` | Permissions & sandbox | 7–8 | 225° | `#155C45` | `#4E9A62` | diamond | dash-dot-dot `8 3 2 3 2 3` |
| 7 | `verify` | Verification & evals | 9–10 | 285° | `#1F8577` | `#7FE0CF` | shield | dotted `0.1 4`, round caps, 2.5 px |
| 8 | `observe` | Observability | 11 (rim) | 330° | `#3E4858` | `#7E8A99` | eye | fine dash `2 2`, 1.5 px |

Each wire also has a question and a law (in `course.json` → `wires`). The
course never repeats them by hand; components read them from `course.json`.

### 3.1 Why these colors (evidence)

The book's palette gave all eight wires nearly the same lightness, so under
color-vision deficiency neighbors on the clock merged (worst adjacent pair:
ΔE<sub>OK</sub> 0.8 for loop/errors under protanopia, 1.9 for control/context
under deuteranopia). HARNESSED keeps the book's hue families and **alternates
lightness around the clock** (light: control, loop, tools, verify; dark:
context, errors, permissions, observe), so every pair of neighbors differs in
lightness, which survives every CVD type.

Measured with Machado et al. (2009) severity-1.0 simulation and OKLab
distance × 100 (`tools/qa/check_palette.py`):

| Theme | Normal min / adjacent min | Protan | Deutan | Tritan | Min contrast vs paper |
|---|---|---|---|---|---|
| Day | 9.0 / 13.4 | 6.7 / 14.1 | 5.2 / 13.2 | 4.0 / 13.7 | ≥ 3:1 for all eight |
| Night shift | 12.3 / 20.4 | 9.3 / 18.8 | 7.0 / 20.0 | 4.7 / 17.5 | ≥ 3:1 for all eight |

**CI thresholds** (`check_palette.py` fails below these): contrast ≥ 3.0 vs
`--hx-paper` and vs `--hx-panel` for every wire; adjacent-pair distance ≥ 12
under all four visions; any-pair distance ≥ 8 (normal) and ≥ 3.5 (each CVD).

### 3.2 Wire rules

1. **Never color alone.** A wire is always shown with at least two of: its
   glyph, its name (or id), its line pattern. Lanes, legends, chips and the
   clock all carry the glyph.
2. **Wire color is for wires.** Don't use wire colors for decoration, beats,
   status or chart series that aren't wires.
3. **Text in wire color is forbidden** (most wire colors are < 4.5:1). Wire
   chips use ink text on a tint: `color-mix(in srgb, var(--w-x) 14%, var(--hx-panel))`
   with a 1 px border at 45 %.
4. **Fixed angles.** Wherever wires are arranged in a circle, they sit at the
   angles above. Wherever they're stacked (lanes, lists, radar order,
   cards), they appear in turn order 1 → 8, top to bottom.

---

## 4. Glyphs

All glyphs: `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`,
`stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`,
unless "filled" is stated. They live in one sprite,
`site/assets/core/glyphs.svg`, as `<symbol id="g-<name>">`. Minimum rendered
size 16 px; lanes use 18 px; the clock uses 22 px.

### 4.1 Wire glyphs

| Glyph | Wire | Path data |
|---|---|---|
| `layers` | control | `M4 6h16M6.5 12h11M9 18h6` |
| `window` | context | `M8 4H5v16h3M16 4h3v16h-3M9.5 13h5M9.5 16.5h5` |
| `cycle` | loop | `M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.2h-4.2` |
| `zigzag` | errors | `M2.5 12l3-6 3.6 12 3.8-12 3.6 12 3-6` |
| `hexagon` | tools | `M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z` + `M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 1 0 0-5.6` |
| `diamond` | permissions | `M12 2.8l9.2 9.2-9.2 9.2L2.8 12z` |
| `shield` | verify | `M12 2.8l7.5 3v5.6c0 4.6-3.1 8.1-7.5 10-4.4-1.9-7.5-5.4-7.5-10V5.8z` + `M8.6 12.2l2.4 2.4 4.4-4.8` |
| `eye` | observe | `M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z` + `M12 9.3a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 1 0 0-5.4` |

### 4.2 Trace event glyphs

Every trace event kind (SPEC §7.2) has a wire (its lane and color) and a
glyph. Where an event is the heart of its wire, it shares the wire's glyph.

| Event kind | Wire | Glyph | Path data / variant |
|---|---|---|---|
| `run_start` | loop | `play` | `M8 5.5l11 6.5-11 6.5z` |
| `run_end` | loop | `flag` | `M5.5 21V4h11l-2.2 4.2 2.2 4.3H5.5`; filled when `status=done` |
| `prompt_built` | control | `layers` | — |
| `model_call` | loop | `box` (rounded box) | `M5 7h14a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H5a2.5 2.5 0 0 1-2.5-2.5v-5A2.5 2.5 0 0 1 5 7z` |
| `model_reply` | loop | `box`, filled | same path, `fill="currentColor"` |
| `model_error` | errors | `zigzag` | — |
| `retry_wait` | errors | `hourglass` | `M7 3.5h10M7 20.5h10M8 3.5c0 4.5 8 4.5 8 8.5s-8 4-8 8.5M16 3.5c0 4.5-8 4.5-8 8.5s8 4 8 8.5` |
| `breaker` | errors | `switch` | `M2.5 15h5.5l8-7M16.5 15h5`; closed state draws `M8 15h8.5` instead of the angled blade |
| `tool_call` | tools | `hexagon` | — ; `ok=false` adds a 2 px slash `M5 19L19 5` |
| `permission` | permissions | `diamond` | inner mark: allow `M8.8 12.2l2.2 2.2 4.2-4.6`; ask `M10 9.8a2 2 0 1 1 2.8 1.9c-.6.3-.8.8-.8 1.4M12 16.2v.1`; deny `M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6` |
| `compaction` | context | `squeeze` | `M3 7.5l4.5 4.5L3 16.5M21 7.5L16.5 12l4.5 4.5M12 4v16` |
| `cache` | context | `prefix` | `M3 9h18v6H3zM10 9v6`; read = left cell filled, write = right cell filled |
| `verify` | verify | `shield` | passed shows the check; failed swaps it for `M9.2 9.6l5.6 5.6M14.8 9.6l-5.6 5.6` |
| `guard` | loop | `noentry` | `M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M5.6 5.6l12.8 12.8` |
| `interrupt` | loop | `pause` | `M8.5 5v14M15.5 5v14` |
| `subagent_start` | loop | `nested` | `M3.5 3.5h17v17h-17zM8.5 8.5h7v7h-7z` |
| `subagent_end` | loop | `nested`, inner filled | same path, inner square filled |

Beats (Break, See, Fix, Prove, Keep) have **no glyphs**. They're shown as a
numbered word ("1 Break"), so they never collide with wire or event glyphs.

### 4.3 UI marks

| Glyph | Use | Path data |
|---|---|---|
| `check` | passed, done, verified | `M5 12.5l4.5 4.5L19 7.5` |
| `cross` | failed | `M6.5 6.5l11 11M17.5 6.5l-11 11` |
| `bang` | warning, stale | `M12 4.5v10M12 19v.5` |
| `ext` | external link (fact chips) | `M14 4h6v6M20 4l-9 9M18 14v5H5V6h5` |
| `prog-0` / `prog-1` / `prog-2` | not started / in progress / done | circle r 7 at 12,12; `prog-1` fills the right half (`M12 5a7 7 0 0 1 0 14z`), `prog-2` fills it all |

Every mark is paired with a word (visible or `aria-label`).

---

## 5. Typography

Self-hosted, derived from IBM Plex (SIL OFL 1.1), Latin subsets, WOFF2,
`font-display: swap`. No font is fetched from a CDN.

**Naming (license).** IBM Plex is released "with Reserved Font Name 'Plex'",
and under OFL 1.1 a modified font (a subset is one) may not use a reserved
name. So the subsets are renamed in their `name` tables and in CSS:
**Harnessed Sans**, **Harnessed Sans Condensed**, **Harnessed Mono**. The OFL
text and IBM's copyright notice ship next to the files
(`site/assets/fonts/LICENSE-OFL.txt`) with a `FONTLOG.txt` saying what was
changed (subset, renamed) and from which package version.

| Role | Family (CSS) | Source | Weights | Token |
|---|---|---|---|---|
| Body, UI | Harnessed Sans | `@ibm/plex-sans` 1.1.0 | 400, 400 italic, 600 | `--font-sans` |
| Display (h1, h2, plate titles, big numbers) | Harnessed Sans Condensed | `@ibm/plex-sans-condensed` 2.0.0 | 600 | `--font-cond` |
| Code, wire JSON, plate labels, trace fields, numeric readouts | Harnessed Mono | `@ibm/plex-mono` 2.5.0 | 400, 600 | `--font-mono` |

Measured subset sizes (Phase 0 research, 6 files): about 99 KB total.

**Glyph gaps.** Plex has no `tnum` (tabular figures) feature, and lacks ✓, ✕,
↗ and the geometric shapes block. Therefore:
- Numbers that must align (meters, bench results, cost, numeric table
  columns) are set in `--font-mono`.
- Status and progress marks are SVG glyphs from the sprite (§4.3), never
  Unicode symbols.

Fallback stacks: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
and `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`.

### 5.1 Scale (rem = 16 px)

| Token | Phone (< 768 px) | ≥ 768 px | Use |
|---|---|---|---|
| `--fs-small` | 0.875rem (14) | 0.875rem (14) | captions, plate labels, chips: the floor |
| `--fs-ui` | 0.9375rem (15) | 0.9375rem (15) | buttons, lane labels, tables |
| `--fs-body` | 1.0625rem (17) | 1.125rem (18) | prose |
| `--fs-lede` | 1.1875rem (19) | 1.25rem (20) | module lede |
| `--fs-h3` | 1.1875rem | 1.25rem | Plex Sans 600 |
| `--fs-h2` | 1.5rem | 1.75rem | Plex Sans Condensed 600 |
| `--fs-h1` | `clamp(2rem, 1.3rem + 3.2vw, 3rem)` | same | Plex Sans Condensed 600 |
| `--fs-code` | 0.875rem (14) | 0.9375rem (15) | code, wire JSON |

- Body line height 1.6; headings 1.12; code 1.5. Prose measure ≤ 68ch.
- **Nothing under 14 px on phones**, including SVG text (SVG text sizes are
  set in CSS px, not scaled down with the viewBox; figures that would shrink
  text below 14 px switch to a stacked phone layout instead).
- Real terms (`tool_use`, `stop_reason`) are set in `--font-mono` at 0.94em
  with a `--hx-panel-2` background chip.
- Numbers in meters, bench results and numeric columns use `--font-mono`
  (Plex has no tabular-figure feature).
- Plate labels: mono 600, 14 px, uppercase, letter-spacing .06em, `--hx-ink-2`.
  Example: `FIG B2.3 · REPLAY · fix-add-basic`.

---

## 6. Layout

### 6.1 Breakpoints

| Name | Width | Behavior |
|---|---|---|
| phone | 375–767 | one column; 16 px gutters; widgets full-bleed inside the gutter; drawer nav |
| tablet | 768–1099 | one column, wider widgets (two-pane widgets go side by side ≥ 900) |
| desktop | ≥ 1100 | persistent left rail (288 px) + content |
| wide | ≥ 1280 | content centered; widgets may widen to 64rem |

QA screenshots are taken at 375, 768 and 1280.

### 6.2 App shell

- **Top bar** (56 px, sticky): menu button (hidden ≥ 1100) · wordmark
  `HARNESSED` (Plex Sans Condensed 600, letter-spacing .04em, with the
  8-tick connector mark) · current module code and title (truncates) ·
  board button (mini board, shows due-card count) · settings.
- **Left rail / drawer**: "Today's shift" first, then the course map by Part
  (A–I, then Toolbelt), each module with code, title and a status mark
  (○ not started, ◐ in progress, ● done; plus a word for screen readers).
- **Footer**: export/import progress, theme, reduced-motion toggle, licenses,
  "facts verified as of" date (from the newest/oldest facts in the registry).
- Skip link to `#main` is the first focusable element on every page.

### 6.3 Module page anatomy

1. Module header plate: code + Part (mono label), h1 title, lede, wire chips,
   estimated minutes, "By the end you can …" objectives list, prerequisites
   (links), and the beat strip.
2. **Beat strip**: `1 Break · 2 See · 3 Fix · 4 Prove · 5 Keep` (concept
   modules show their own beats). Sticky under the top bar on ≥ 768; inline
   on phones. Each step shows ○/● for done.
3. Beats as `<section class="beat" data-beat="…">`, each opening with a
   plate label (`BEAT 1 · BREAK`) and an h2.
4. Prose column ≤ 44rem; widgets may widen to 60rem (desktop) by stepping
   out of the prose column (`.bleed`).
5. Module footer: law (big, Plex Sans Condensed), next module(s), "report a
   problem" link.

### 6.4 Spacing, radius, elevation

- Spacing scale (px): 4, 8, 12, 16, 24, 32, 48, 64 → `--sp-1` … `--sp-8`.
- Radius: chips 6 px, buttons 8 px, plates 10 px.
- Plates: `--hx-panel`, 1 px `--hx-rule` border, **no drop shadows** except
  popovers and the drawer (`0 10px 30px rgb(0 0 0 / .18)`).
- Corner ticks: plates with `.plate.ticked` draw four 10 px L-shaped ticks
  (1 px `--hx-ink-2` at 50 %) at their corners, offset 4 px outside.

---

## 7. Components (visual rules)

- **Buttons**: min 44×44 px target; primary = ink fill, paper text;
  secondary = 1.5 px ink border; quiet = text only with underline on hover.
  One primary per widget.
- **Inputs**: 44 px tall; 1.5 px `--hx-rule` border, ink on focus; labels
  always visible (no placeholder-only labels).
- **Wire chip**: glyph (16 px, wire color) + name, ink text on wire tint.
- **Term**: dotted 1.5 px underline in `--hx-ink-2`; tap/hover/focus opens a
  popover (ink background, paper text, 15 px) with term, definition, wire
  chip and "taught in B2".
- **Fact chip**: inline after the claim. Mono 14 px, `--hx-panel-2`,
  check mark + `verified Oct 2026` + ext mark, linking to the source. Stale
  (> 90 days) turns to `--hx-warn` with the bang mark and
  `check source · verified Jun 2026`. Company-reported numbers add
  `· company report`.
- **Callouts**: *Law* (ink plate, Condensed 600 1.4rem, wire glyph), *Real term*
  (left rule in the wire color, shows "metaphor → real term"), *Warn* (left
  rule `--hx-fail` + "Common mistake" label with the `cross` mark), *Noise* (dashed border: "how
  much of this is luck").
- **Code**: `--hx-code-bg`, 14–15 px mono, line numbers optional, a copy
  button. Python highlighting uses six token colors defined in tokens.css
  (`--syn-kw`, `--syn-str`, `--syn-num`, `--syn-com`, `--syn-fn`, `--syn-op`),
  all ≥ 4.5:1 on the code background.
- **Diff chunks** (Rein steps): added lines tinted pass-green with `+`,
  removed tinted fail-red with `−`, context grey; the sign column is always
  rendered (color is never the only cue).
- **Wire View JSON**: code background; keys `--hx-code-ink` at 70 %, strings
  and numbers per syntax tokens; content blocks get a left bar in the
  block's wire color (`tool_use` → tools, `tool_result` → tools,
  `text` → loop, `thinking` → loop, system → control).
- **Charts** (bench histograms, radar, CI bars): neutral ink marks;
  comparisons use *before* = hatched outline, *after* = solid ink, each with a
  direct label. Wire colors appear in charts only when the series *is* a wire
  (the readiness radar). Every chart has a text summary underneath
  ("Pass rate 9/20 → 18/20; the 95 % intervals do not overlap").

---

## 8. Signature diagrams

### 8.1 The Turn Clock (`hx-clock`)

- Square SVG, viewBox `0 0 400 400`, center (200, 200).
- Face: `--hx-panel` circle r = 168, 1 px `--hx-rule`; 12 hour ticks
  (8 px, `--hx-ink-2`); hour numerals only at 12, 3, 6, 9 (mono 14 px).
- **Observability is the rim**: a ring r = 182 drawn with the observe line
  pattern, plus its socket at 330°.
- **Sockets**: each wire plugs in at its angle (§3) at r = 150: a 44 px
  circle (hit target) with the wire glyph (22 px) in wire color on panel,
  1.5 px wire-colored ring. Labels outside the face at r = 196 (wide) or in
  a legend list under the clock (phones < 420 px).
- **The model** sits in the center: a rounded box (the `box` glyph shape,
  64 × 40) labeled "model".
- **The hand** is the loop: a 3.5 px loop-colored line from center to the
  active socket. During a replayed turn it moves socket to socket in turn
  order, and a **signal pulse** (8 px circle, the active wire's color, with a
  soft 16 px halo at 25 %) travels the rim from one socket to the next.
- Tapping a socket opens its card: question, law, the modules that plug in
  there, and the learner's level on that wire.

### 8.2 The Replay Deck (`hx-replay`)

- Eight lanes in turn order (top → bottom), 32 px tall each, lane label on the
  left (glyph + name; name hides < 480 px, glyph stays). Lane line drawn in
  the wire's line pattern at 1 px, 35 % opacity.
- Events are glyphs (18 px) on their lane at their virtual time `t`; the
  current event gets a 2 px ink ring. Selected event payload opens below
  (phones) or in a right pane (≥ 900 px).
- Bottom: time axis in virtual seconds (mono 14 px), the scrubber (a 44 px
  tall hit area), play / step back / step forward / speed (1×, 2×, 4×).
- Above the lanes: **context-budget bar** (fills in `--w-context`, with the
  limit marked and the percentage as text) and **cost meter** (mono
  figures, "≈ $0.0123" or "≈ 41 units" when relative units are on).

### 8.3 The Harness Board (`hx-board`)

- A circuit board: the model chip in the center, eight sockets around it at
  the clock angles, traces (in each wire's color and line pattern) from the
  chip to each socket.
- Each socket holds **module cards** (small plates) the learner has earned:
  "retry policy", "breaker", "permission policy", etc.
- **Energy** = share of the wire's cards that are not overdue. It's drawn as
  the trace's opacity (100 % → 35 %) *and* as a text badge ("3 due"), never
  opacity alone.
- In the Prove beat, two boards sit side by side (≥ 900 px) or stacked:
  "old board" (hatched plate) and "new board" (solid).

### 8.4 Readiness radar

- Eight axes at the clock angles, three rings (L1 explain, L2 built,
  L3 defend with data). Points are wire glyphs at the learner's level; the
  polygon is ink at 12 % fill. Each axis label links to its evidence list.

---

## 9. Motion

| Token | Value | Use |
|---|---|---|
| `--dur-fast` | 150 ms | hover, press, chip toggles |
| `--dur-base` | 300 ms | panel open, socket highlight, one pulse hop |
| `--dur-slow` | 600 ms | page-level reveals, a full lane sweep step |
| `--ease-signal` | `cubic-bezier(.2, .7, .2, 1)` | pulses and reveals |
| `--ease-exit` | `cubic-bezier(.4, 0, 1, 1)` | things leaving |

Rules:

1. **Motion means flow.** Animate only to show something moving through the
   harness (a pulse, a token stream, a retry wait). No decorative motion.
2. **Signal flow**: a pulse hop takes 150–600 ms depending on distance;
   one full Turn Clock lap at 1× takes ≈ 2.4 s (8 hops × 300 ms).
3. **No autoplay longer than 5 s** without a visible pause control (WCAG 2.2.2).
4. **Reduced motion** (`prefers-reduced-motion: reduce`, or the in-app toggle,
   which wins): no traveling pulses, no transitions over 150 ms. Pulses are
   replaced by **step highlights**: the active socket/lane/event gets a 2 px
   ink ring and a filled background instantly, and "play" advances one step
   every 800 ms (or on each press of "step").
5. Simulated time is virtual: the simulator never waits; the UI may pace
   playback for reading.

---

## 10. Accessibility

- WCAG 2.2 AA. Text ≥ 4.5:1 (large text ≥ 3:1); wires and UI strokes ≥ 3:1.
- Every interaction is keyboard-operable: Tab order follows reading order;
  arrows move within lanes, clock sockets and radio groups; Space/Enter
  activate; Esc closes popovers. Visible 3 px `--hx-focus` ring.
- Touch targets ≥ 44 × 44 px.
- Every widget has a **no-JS fallback**: the static figure (SVG or image) and
  its text explanation sit inside the element and are replaced on upgrade.
- Live regions: simulators announce state changes politely ("Turn 3: tool
  call read_file, allowed").
- Charts and diagrams have text equivalents (the chart summary sentence; the
  clock's socket list).
- axe-core runs on every page in QA; color-blind simulation screenshots of
  every page with wires are produced in QA (protan, deutan, tritan).

---

## 11. Performance budget

- **≤ 300 KB per page** (compressed transfer, initial load), excluding Pyodide
  and the editor, which load lazily when a kata or Rein step is opened, with a
  progress indicator, and are cached by the service worker.
- Fonts: six WOFF2 Latin subsets, ≤ 120 KB total (measured ≈ 99 KB); only
  Sans 400/600 and Mono 400 are preloaded.
- Components load per page via ES-module imports of only the `hx-*` elements
  present (the app scans the page and imports what it finds).
- No images heavier than 60 KB; diagrams are SVG.

---

## 12. Microcopy

- Plain, short, calm. Second person. No hype ("revolutionary", "magic",
  "supercharge"), no exclamation marks in UI.
- Buttons say what happens: "Run ×20", "Show the payload", "Plug it in".
- Errors in the UI are actionable: say what happened and what to do.
- Numbers carry units and uncertainty: "18/20 passed (90 %, 95 % CI 69–97 %)".
- Simulated values are marked "≈" (token counts, costs).
