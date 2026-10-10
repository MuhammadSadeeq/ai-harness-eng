# BLUEPRINT BP-1.6: `hx-kata` (Python in the page) and `hx-cards` (spaced repetition)

Phase 1, wave 2. Builder rules: `.claude/agents/hx-builder.md`. You never commit.

## Read first
`docs/COMPONENTS.md` (all; binding), `docs/DESIGN.md` §2–§5, §7.9, §8, §9,
§10, §11, `docs/DECISIONS.md` D-014 (editor), D-015 (Pyodide), D-016 (two
runners), D-018 (pins), D-026 (Leitner), D-027 (store), `docs/AUTHORING.md`
§8 (katas) and §10 (cards), `site/assets/py/hxtest.py`, `tools/check_katas.py`,
`tools/gen_data.py`, `site/assets/components/lib/{hx-element,data}.js`,
`site/assets/core/store.js`, `site/assets/core/shell/{pure,chrome}.js`
(due cards, today's date), `site/assets/core/hx.css` (keys, whole-row radios,
readouts: reuse them).

## You own
- `site/assets/components/hx-kata.js`, `hx-kata.css`,
  `site/assets/components/lib/py-worker.js` (the Pyodide worker),
  `site/assets/components/lib/editor.js` (lazy CodeMirror loader, with a
  textarea until it loads)
- `site/assets/components/hx-cards.js`, `hx-cards.css`,
  `site/assets/components/lib/leitner.js` (pure scheduling)
- `site/assets/components/test/{leitner,cards}.test.mjs` (pure, Node)
- `site/sw.js` (the service worker)
- `tools/vendor/copy_pyodide.mjs`, `tools/vendor/build_codemirror.mjs`,
  `site/vendor/codemirror/**` (the committed bundle), `.gitignore` (add
  `site/vendor/pyodide/`)
- `package.json`, `package-lock.json` (add exactly the D-018 pins: `pyodide`
  314.0.7, `codemirror` 6.0.2, `@codemirror/state` 6.7.6, `@codemirror/view`
  6.43.13, `@codemirror/commands` 6.11.1, `@codemirror/language` 6.12.4,
  `@codemirror/lang-python` 6.2.1, `@lezer/highlight` 1.2.4, `esbuild` 0.28.2;
  `npm install --save-exact`; nothing else)
- `tools/check_katas.py` and its tests (the `--pyodide` runner; demo katas),
  `tools/gen_data.py` and its tests (compile katas)
- `katas/lab-turn-limit/` (the demo kata), `site/labs/kata.html`,
  `site/labs/cards.html`, `site/labs/data/cards-demo.json`

Nothing else (`store.js` is the design builder's: if you need a change there,
tell me). Other builders are writing other components at the same time.

## 1. Katas end to end
- **Compile**: `gen_data.py` writes `site/data/katas/<id>.json`
  (`{id, module, title, objectives, minutes, hints, from_memory, starter, solution, tests}`)
  from `katas/<id>/` (AUTHORING §8). `--check` covers them.
- **Demo katas**: a kata whose id starts with `lab-` belongs to no module
  (`module: null` in its meta) and is skipped by the course checks, but it is
  still checked like any other kata (the starter fails, the solution passes,
  each wrong solution fails, and both runners agree).
- **`katas/lab-turn-limit/`** (content you write; I review it): "Give the loop
  a second exit." The learner gets a small loop function that calls a
  `step()` callable until it returns `"done"`, and adds a `max_turns` limit
  that returns `"max_turns"`. 3–5 tests, 3 hints (where to look, what to do,
  nearly the code), 2 wrong solutions (an off-by-one limit, and a limit that
  is never checked). Stdlib only.
- **`check_katas.py --pyodide`**: loads Pyodide from `node_modules/pyodide` in
  Node (one process for all katas), runs hxtest on the starter, the solution
  and each wrong solution, and requires the same pass/fail per test as CPython
  hxtest and pytest. Without `--pyodide` nothing changes. It is a heavy check.
- **`tools/vendor/copy_pyodide.mjs`**: copies the core files the browser needs
  (`pyodide.mjs`, `pyodide.asm.js`, `pyodide.asm.wasm`, `python_stdlib.zip`,
  `pyodide-lock.json`, and whatever else core loading needs) from
  `node_modules/pyodide` to `site/vendor/pyodide/`, and prints the total size.
  Never committed (D-015).

## 2. `hx-kata`
Attributes: `id` (a kata id; data from `site/data/katas/<id>.json`), `mode`
(`practice` default, or `memory` when the kata has `from_memory: true`).
- **Python runs in a Web Worker** (`lib/py-worker.js`) so the page stays
  responsive. The worker loads Pyodide from `../../vendor/pyodide/` the first
  time a kata on the page needs it. It writes the learner's code to `kata.py`,
  runs hxtest on the tests and posts back per-test results.
- **A run that takes more than 10 s is stopped** (the worker is terminated and
  restarted) with: `Your code ran for more than 10 seconds and was stopped. Is there a loop without an exit?`
- **Loading** is lazy and shown: `Loading Python (about 8 MB, once)…` with a
  progress indicator. The Run key is disabled until ready. The editor
  (CodeMirror bundle, lazy) shows a plain textarea with the starter until it
  loads, and keeps the textarea if it fails.
- **Layout**: title, minutes, the objective(s); the editor (Harnessed Mono,
  14–15 px, line numbers, theme from tokens in both themes); keys
  `Run the tests` (primary), `Reset to starter`; results: `2 of 3 tests pass`,
  then one row per test with a mark and a word, the first failing test expanded
  with its message (mono). The results area is a live region: one message per
  run.
- **Hints**: `Show hint 1`, then 2, then 3, revealed one at a time and kept
  visible.
- **Solution**: a `Show the solution` key appears after the first run, read-only,
  with a sentence: `Compare it with yours; the tests are the judge, not the text.`
- **From memory** (`mode="memory"`): a blank file (one comment line), a
  visible timer counting up with a Pause key, the same tests; on a pass,
  `Passed from memory in 4:12.`
- **Draft**: the code is saved to the store as the learner types (debounced
  500 ms) under `drafts[<kata id>] = {code, at}`, created on demand (the store
  keeps unknown top-level keys). Reload restores it. `Reset to starter` asks
  once (`Replace your code with the starter? Your draft will be lost.`) and
  clears it.
- **Evidence**: `this.evidence("kata", {id, passed, tests_passed, tests_total, hints_shown, solution_shown, mode, seconds})`
  on each run. A pass also sets nothing else; the shell writes evidence.
- **Service worker** (`site/sw.js`, registered by `hx-kata` on first use,
  scope `/`): cache-first for `vendor/pyodide/*` and `vendor/codemirror/*`
  only, with a versioned cache name; nothing else is cached. Offline
  installability is backlog B-09.
- **Budget**: the kata page's initial load stays ≤ 300 KB (Pyodide and the
  editor excluded: they load on first use).
- `selfTest()`: wait for Python, run the starter (expect at least one
  failure), replace the code with the solution through the real editor, run
  (expect all pass), reveal hint 1. It may take up to 60 s; that is fine.

## 3. `hx-cards`
Attributes: `src` (a module id or a demo `.json`, COMPONENTS §11).
- **Leitner** (D-026, `lib/leitner.js`, pure and tested):
  - Six boxes with intervals 0, 1, 3, 7, 16 and 35 days.
  - A new card starts in box 1, due today.
  - "Got it" (or a correct auto-graded answer) moves the card up one box (at
    most 6), due today plus that box's interval.
  - A miss returns it to box 1, due today; a card due today comes back later
    in the same session.
  - Dates are local calendar dates (`todayIso`).
  - State lives in `store.state.cards[<card id>] = {box, due, seen, last}`.
- **Session**: the queue is the due cards, then the new cards, at most 20.
  Progress shows `3 of 12`. The end summary reads
  `12 reviewed: 9 right, 3 again. Next due: tomorrow (4 cards).`
  Then `this.evidence("cards", {src, reviewed, right})`.
- **Card types** (AUTHORING §10):
  - `term` and `wire-question`: the front, then `Show answer`, then the back,
    then self-grade `Again` / `Got it`.
  - `which-wire`: eight whole-row radios in turn order, each with its glyph.
  - `spot-bug-json`: the JSON pretty-printed with a 2-space indent, one line
    per row. Each row is a target (≥ 44 px, roving focus); the right row holds
    the key at `bug_path`, a JSON pointer.
  - `order-turn`: the items in a deterministic shuffle (the simulator's PRNG
    seeded by the sum of the card id's character codes), each with `Move up` /
    `Move down` keys, then `Check`. It must be the exact order.
  - `name-family`: the trace lines (mono), then the right family and two
    others from `course.json`, picked and shuffled deterministically the same
    way.
  - Auto-graded types show the right answer and the back after the answer,
    then `Next`.
- **Keyboard**: Space shows the answer, 1 is Again, 2 is Got it, and a visible
  line says so. Everything else follows DESIGN §9.
- `selfTest()`: answer every demo card through the real UI (one wrong, the rest
  right), check the summary numbers and the stored boxes.

## 4. Demo content (you write; I review)
`site/labs/data/cards-demo.json`: one card of each of the six types, about the
seed scenarios only (the spiral, the false done, the context flood, the
orphaned tool call, approval fatigue), in the course voice, each correct.

## 5. Demo pages
`site/labs/kata.html` (the `lab-turn-limit` kata in practice mode, and the
same kata in memory mode) and `site/labs/cards.html` (the demo cards). Use the
AUTHORING §2 skeleton (no beats, no `data-module`), with real no-JS fallbacks:
the kata's starter code in a `<pre>` plus a sentence; the cards as a static
list of fronts and backs.

## Acceptance (quote final lines)
```
node tools/vendor/copy_pyodide.mjs
node tools/vendor/build_codemirror.mjs
.venv/bin/python tools/gen_data.py --check
.venv/bin/python tools/check_katas.py
.venv/bin/python tools/check_katas.py --pyodide
node --test "site/assets/**/test/*.test.mjs"
.venv/bin/ruff check tools && .venv/bin/mypy && .venv/bin/python -m pytest -q tools/tests
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --only labs/kata.html labs/cards.html
```
QA must report 0 failures (it already skips `vendor/`). Then view both pages at
375 and 1280, in both themes, and say what you checked. Also report:
- the Pyodide copy size, the CodeMirror bundle size (raw and gzip) and the kata
  page's initial weight;
- the time from pressing Run to results on a cold load and a warm load;
- what happens with an infinite loop (paste the message).

## Report
Files; checks and final lines; sizes and timings; the screenshots reviewed and
what you fixed after looking; all UI copy beyond the strings above; the demo
content; deviations; open doubts, with the choice you made. Don't commit.
