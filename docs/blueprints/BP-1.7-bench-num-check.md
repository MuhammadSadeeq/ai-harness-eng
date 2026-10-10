# BLUEPRINT BP-1.7: `hx-bench` (the Knob Bench), `hx-num` (reactive numbers), `hx-check` (predictions and checks)

Phase 1, wave 2. Builder rules: `.claude/agents/hx-builder.md`. You never commit.

## Read first
`docs/COMPONENTS.md` (all; binding, especially §10 gate, result and value
protocols), `docs/DESIGN.md` §2–§4, §7.3, §7.5–§7.7, §7.9, §7.10, §8, §9,
§11, §12, `docs/ENGINE.md` §7 (board modules) and §8 (cost),
`docs/AUTHORING.md` §10 (checks format), `site/assets/components/lib/{hx-element,data}.js`,
`site/assets/sim/index.js` (`runBench`, `runTrial`, `loadBoard`),
`site/assets/core/hx.css` (keys, readouts, steppers, whole-row radios, chips:
reuse them), `site/assets/core/glyphs.svg`, the seed tapes and boards in
`scenarios/`, and the prototype `site/proto/v2/prove.html` + `app.js` (its
bench is the visual starting point: reuse and clean up).

## You own
- `site/assets/components/hx-bench.js`, `hx-bench.css`
- `site/assets/components/hx-num.js`, `hx-num.css`
- `site/assets/components/hx-check.js`, `hx-check.css`
- `site/assets/components/lib/stats.js` (pure: bench statistics, Wilson
  intervals, histogram bins, the sweep for par)
- `site/assets/components/test/{stats,num}.test.mjs` (pure logic, Node)
- `site/labs/bench.html`, `site/labs/check.html`, `site/labs/data/checks-demo.json`

Nothing else. Other builders are writing `hx-replay`, `hx-incident`,
`hx-clock`, `hx-wire`, `hx-kata` and `hx-cards` at the same time; don't touch
theirs. To get your tags loaded, list them in your report and I add them to
`components/registry.js`; until then your demo pages may load your modules with
their own `<script type="module">` (I remove those at integration).

## 1. `hx-bench`
Attributes: `tape` (required), `old`, `new` (board ids; default the tape's
`boards[0]` and `boards[1]`), `trials` (default 20, 1–50), `knob` (optional:
`<module>.<param>`, for example `turn_limit.max_turns`), `knob-min`,
`knob-max`, `knob-step` (integers), `par` (optional: `cheapest-worst-case`),
`locked`.

- **Boards.** Old and new side by side on ≥ 700 px, stacked on phones, each
  labelled with the board's `label` and its plugged modules in words
  ("turn limit 12, token budget 60,000"). The knob, when present, changes that
  param on a **copy of the new board** (the board files are never changed).
  Knob labels (exact): `turn_limit.max_turns` Turn limit;
  `token_budget.max_tokens` Token budget; `loop_detect.window` Loop window;
  `output_cap.max_tokens` Output cap (tokens); `retry.max_attempts` Retry
  attempts; `retry.base_ms` Backoff base (ms); `breaker.threshold` Breaker
  threshold; `verify_gate.max_feedback` Verify retries. The knob control is a
  native range input with separate − / + keys (44 px) and a readout of its
  value (DESIGN §7.9).
- **Run ×N** (the key says `Run ×20` with the real N) runs both boards with
  `runBench` on the same seeds (`seed_base + i`). Keep the page responsive:
  run in chunks (yield to the event loop between trials) and show
  `Running 7 of 20…`. Changing the knob after a run marks the results stale
  ("Results are for a turn limit of 12. Run again.") until the next run; no
  auto-run.
- **Step grid** per board: N numbered cells (seed 1–N in order), each with its
  status mark (SVG glyph from the sprite: done-and-passed, false done, stopped by
  a guard, error) and its turns. The same number on both boards is the same
  seed: focusing or hovering a cell highlights its twin. Each cell has an
  `aria-label` such as `Seed 3, old board: done, checks pass, 6 turns, ≈ $0.0094`.
  The grid is one tab stop with roving focus (arrows move; Up/Down switch
  boards on the same seed). Cells ≥ 44 px.
- **Readout windows** per board, computed (never typed): pass rate
  `13/20 pass`, worst-case turns, worst-case cost, mean cost. Cost shows
  `≈ $0.0264` when the tape's pricing names a fact, else `≈ 0.0264 units`.
- **Histograms** (DESIGN §7.10): turns per trial as small multiples on shared
  axes, old hatched, new solid, both labelled directly; axis titles above the
  plot; bins chosen so every label is legible at 375 px; drawn at their
  measured pixel width (redraw on resize; no scaled viewBox, DESIGN §5.1). A
  one-sentence summary under each chart.
- **Reactive prose** under the results, from templates:
  - the honest sentence:
    `On the same {N} seeds, the new board passes {a} runs and the old board {b}.`
    + ` The worst case goes from {wt_old} turns to {wt_new}, and from {wc_old} to {wc_new}.`
  - the noise sentence, from 95 % Wilson score intervals of each pass rate
    (`lib/stats.js`, tested against hand-computed values):
    `Pass rate: old {p_old}% ({lo}–{hi}%), new {p_new}% ({lo}–{hi}%).` then
    either ` The ranges overlap, so this difference could be noise: run more trials before you claim it.`
    or ` The ranges don't overlap, so this difference is unlikely to be noise.`
- **Par puzzle** (`par="cheapest-worst-case"`, needs `knob`; DESIGN §7.6):
  goal line `Find the cheapest worst case without losing a passing run.` At
  setup, sweep every knob value in range (N trials each, same seeds). A value
  is **feasible** when the new board passes at least as many runs as the old
  board; its score is the worst-case cost. Par = the lowest score among
  feasible values (the smallest value on ties). Each Run is a try; a
  **solution-space chart** plots every value's worst-case cost, marks the
  infeasible values as a hatched zone, highlights the learner's tried values,
  and reveals par after three **distinct** tries. Reaching par: one line
  (`Par: the cheapest worst case that keeps every passing run.`) and the
  readout's `PAR` state (two cues, no more). Never a leaderboard.
- **Results** (COMPONENTS §10): after each Run, dispatch `hx-result`
  `{source: "bench", old: Stats, new: Stats}` and
  `this.evidence("bench", {tape, old, new, knob, value, old_passed, new_passed})`;
  on reaching par also `this.evidence("par", {tape, knob, value})`.
- **Values**: `knob` (settable, with `hxRange`), and read-only
  `passed.old`, `passed.new`, `worst_turns.old`, `worst_turns.new`,
  `worst_cost.old`, `worst_cost.new` (nano-units), `trials`. `hx-change` on
  every change (null before the first run).
- **locked**: Run and the knob are disabled (not hidden) and one line reads
  `Make your prediction above to unlock the run.`
- Live region: `Running…` once, then the honest sentence when a run ends.

## 2. `hx-num` (DESIGN §7.7)
`<hx-num for="bench1" name="knob" format="int">12</hx-num>`: shows the target's
value (its text content is the no-JS fallback).
- `format`: `int` (thousands separators), `usd` (a nano-unit cost as
  `$0.0264`), `percent`.
- **Driving** (the target's `hxRange(name)` is not null): a visible highlight
  (`--hx-scrub`), a dotted underline, − / + steppers that appear on focus, arrow
  keys ±step, PageUp/PageDown ±10 steps, and horizontal drag (one step per
  8 px). It is a `role="spinbutton"` with `aria-valuenow/min/max` and an
  `aria-label` naming what it drives. With `pointer-only` (the figure already has
  a keyboard control for the same value) it is `aria-hidden="true"` and not
  focusable, so there is one tab stop per value.
- **Reading** (null range): plain text that updates on the target's
  `hx-change`; no live region of its own.
- At most one driving `hx-num` per paragraph (document it; QA can't check it).

## 3. `hx-check` (DESIGN §7.3)
Attributes: `src` (module id or a demo `.json`, COMPONENTS §11), `item` (an
item id in that file), `mode` (`predict` | `check`, default the item's
`mode`), `for` (predict only: the id of the runnable component it gates).
Items follow AUTHORING §10, plus `outcome` (one line) for predict items.
- Question (serif), options as **whole-row radios** (≥ 44 px rows, 20 px
  dot), one key: `Lock in my prediction` (predict) or `Check` (check).
- **check**: after the commit, a result line (`Right.` / `Not quite.`) and
  every option's `why`, the right one marked with a mark and a word.
- **predict**: on commit, remove `locked` from the target and say
  `Locked in: "{option}". Now run it.` When the target dispatches
  `hx-result`, reveal: the item's `outcome` line, whether the learner was right
  (`You called it.` / `Not this time.`), then every option's `why`, each
  marked "right" or "tempting". The options stay visible, the committed one
  marked.
- Evidence: `this.evidence("check", {item, choice, correct})` on a check
  commit; `this.evidence("prediction", {item, choice, correct})` on a
  prediction's reveal.
- Without a `for` target, a predict item reveals right after the commit.

## 4. `site/labs/data/checks-demo.json` (content you write; I review it)
Three items in the AUTHORING §10 format, in the course voice, about the b2
spiral and the s0 false done tapes only (what the demo pages show): one
predict item gating the b2 bench ("Will a turn limit of 12 change how many runs
pass?"), one predict item gating the s0 bench ("Which board ends more runs
with a false done?"), one check item. Every option needs a `why`.

## 5. Demo pages
- `site/labs/bench.html`: the `b2-spiral` bench (b2-old vs b2-new) with
  `knob="turn_limit.max_turns" knob-min="4" knob-max="30"` and
  `par="cheapest-worst-case"`, a prose line with a driving `hx-num` for the
  knob and a reading `hx-num` for `passed.new`; and a plain `s0-false-done`
  bench (s0-old vs s0-new).
- `site/labs/check.html`: a predict `hx-check` gating a `locked` `b2-spiral`
  bench, and a check item on its own.
- Use the AUTHORING §2 page skeleton (no beats, no `data-module`), with
  `tokens.css`, `hx.css` and `app.js` as in `site/design.html`. Every component
  needs a real no-JS fallback (a sentence plus a small static table of
  results).

## 6. All three components
COMPONENTS.md completely: extend `HxElement`; own CSS file (tokens only);
fallback; state derived in `render()` (no stale status text); focus kept
across renders (`data-key`); a11y (keyboard everything, ≥ 44 px targets,
nothing under 14 px including chart text, no color-only meaning: marks plus
words); reduced motion (no tweening of bars or points); module + CSS ≤ 40 KB
each. `selfTest()` drives the real UI:
- bench: press Run, wait for the result, check the readouts against
  `runBench` computed in the test, move the knob one step with the + key,
  check the stale line;
- hx-num: press ArrowUp on a driving number and check the target's value
  changed;
- check: pick an option, commit, check the reveal; for predict, check that
  the target unlocked.

## Acceptance (quote final lines)
```
node --test "site/assets/components/test/*.test.mjs"
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --only labs/bench.html labs/check.html
```
QA: 0 failures (axe at 375 and 1280, both themes, before and after your
self-tests; the 14 px floor including SVG text; no horizontal scroll). Then
open the screenshots in `tools/qa/out/` at 375 and 1280, light and dark, and
say what you checked in each. Also report: the b2 bench numbers (pass counts,
worst-case turns and cost per board), the par value and score for the b2 knob
sweep, module + CSS sizes, and the time a Run ×20 takes on b2.

## Report
Files; checks and final lines; numbers; sizes and timing; screenshots reviewed
and what you fixed after looking; all UI copy beyond the templates above;
deviations; open doubts (with the choice you made). Don't commit.
