# BLUEPRINT BP-4.1-steps: Rein steps H3–H11 and their pages

Phase 4, the build track. Builder rules: `.claude/agents/hx-builder.md`. You
never commit. Platform first: BP-4.0-steps-platform (the stand-in for
`python <file>.py`, `stdin`, `local`, `accept-trace`) must be committed before
your first step is accepted; write against its format.

## Read first
SPEC Part H, §7.2, §7.4; DECISIONS D-015, D-038, D-056; `docs/AUTHORING.md`
(build kind: Break, See, Fix, Prove, Keep; §13 lessons), BP-2.3 (the step
format) and BP-2.5 (the H1/H2 bar); `steps/H1`, `steps/H2` and the pages
`rein-1-talk-to-a-model.html`, `rein-2-one-tool-and-the-loop.html` (match
their quality); `course.json` modules H3–H11 (objectives, terms, families);
ENGINE §9 (event fields and statuses) and `scenarios/trace.schema.json`; the
book's steps 3–11 (scratch `book.txt`, lines about 2410–6900; the owner's
book, never deployed: port its code and its checkpoints, and write the page
prose in the course's voice).

## You own
`steps/H3` … `steps/H11` (step.yaml, rein.py, scenarios/), `steps/_shared/`
(add files the book's `reset_demo.py` creates later, such as `app.log`),
`tools/tests/test_steps_traces.py` (new, §3), the nine pages
`site/modules/rein-3-…` to `rein-11-…`, `content/H3` … `content/H11`, katas
the pages need, and tapes/boards only where no existing one fits (§4).

## 1. Order and size
Steps are one chain: each `rein.py` is the previous one plus the step's
chunks (`check_steps` proves it byte for byte). Write them in order, H3 to
H11, and send me each step with its page as one unit (H3 first, alone, so
the format questions are settled once). Port the book's code and its
checkpoints faithfully, with the upgrades in §2 and nothing else; if the
book's code has a bug, say so in the report and fix it in the smallest way.
Prose ≤ 900 words per page (step text inside `hx-step` does not count).

## 2. The upgrades (each is a course objective; nothing else changes)
- **H3, output caps (H3.o2):** every tool's result is capped before it goes
  to the model (head and tail kept, a line saying how much was cut), from
  step 3 on. The book's `truncate()` arrives in step 6; move the helper to
  step 3 and let step 6 reuse it. **Hostile tape (H3.o3):** a script that
  asks for `../` paths, an absolute path, and a symlink that points out of
  the workspace; each is refused with the book's message, and a break shows
  the wall removed.
- **H4, a table of cases (H4.o2):** the policy is tested with a table of
  (tool, args, mode, expected decision) rows: a kata `H4-policy`
  (`decide()` against the table, CPython and Pyodide) or a checkpoint that
  prints the table's results; say which and why. Step 4's `[y/N]` answers
  come from `stdin`.
- **H5, the course's trace (H5.o1–o3):** the Tracer writes the course's
  events (ENGINE §9): `v`, `run`, `seq`, `t` (ms), `turn`, `agent`, `kind`,
  `wire` and each kind's fields, for `run_start`, `model_call`,
  `model_reply`, `permission`, `tool_call` and `run_end` (later steps add
  their own kinds: `retry_wait`, `breaker` and `model_error` in H7, `guard`
  and `interrupt` in H8, `verify` in H9, `subagent_start`/`subagent_end`
  in H11). A model without a price entry costs 0 (the FakeModel does); a
  string that looks like an API key is redacted. The trace must open in the
  Replay Deck (`hx-replay accept-trace` on the H5 page). Keep the book's
  one-line summary.
- **H7, a virtual clock (H7.o1):** a `Clock` with `now()` and `sleep()`;
  under `--fake` a virtual clock advances without waiting and the jitter
  comes from a seeded `random.Random`, so retries are instant and the output
  repeats exactly. The trace's `t` reads the same clock. The breaker ends
  the run with status `circuit_open`.
- **H8, one status per ending (H8.o1):** each guard ends the run with its
  own status from ENGINE §9 (`max_turns`, `budget`, `loop`, `interrupted`):
  the book's `stopped` lines become these, in one chunk that names why.
  Closing the books on interrupt (H8.o2) is the book's code.
- **H9:** status `unverified` as in the book; the check command runs through
  `run_command`'s path (so the stand-in runs it in the browser).
- **H10, H11:** the book's code; H10.o3's stable prefix is shown with
  `--show-prompt` twice; H11's reviewer emits `subagent_start` and
  `subagent_end`.

## 3. Checks you add
`tools/tests/test_steps_traces.py`: for each step from H5 on, run the
checkpoint under CPython in a temp folder (reuse `check_steps`' runner), read
`trace.jsonl`, and validate every line against the whole
`scenarios/trace.schema.json` (Draft 2020-12), plus: `seq` counts up from 0,
the last event is `run_end`, and its `status` is the one the checkpoint
prints. A step that fails this is not done.

## 4. Pages
Build kind, each beat as in H1/H2. Break: a predict check gating the
module's incident (reuse: H3 `c10-escape`, H4 `c9-approval`, H5
`c12-unexplained-bill`, H6 `c2-flood`, H7 `c6-outage`, H8 `c5-interrupt`,
H9 `c11-tamper` or `s0-false-done`, H10 `c1-ignored-rule`; H11 needs a new
tape `h11-rubber-stamp`: a reviewer sub-agent that approves a diff the tests
miss, and a board whose reviewer gets only the task, the diff and the check
output (A14 sub-agents)). See: the mechanism in Rein's terms, and a margin
note back to the theory module (H3→C10, H4→C9, H5→C12, H6→C2, H7→C6,
H8→C5, H9→C11, H10→C1, H11→D3/C11). Fix: `<hx-step step="H…">`. Prove:
`hx-bench` on the incident tape with the module's boards (or the H5 Replay
Deck with the learner's own trace). Keep: law, cards (6–8), say (2), the
portfolio line. Every product or API claim is a verified fact; the book
itself is not a source for claims about products.

## Acceptance (per step, quote final lines)
```
.venv/bin/python tools/check_steps.py --pyodide
.venv/bin/python -m pytest -q tools/tests/test_steps_traces.py tools/tests/test_check_steps.py
.venv/bin/python tools/check_content.py site/modules/<page>.html
.venv/bin/python tools/check_scenarios.py   # new tapes: --update <tape> after parity
.venv/bin/python tools/check_facts.py && .venv/bin/python tools/check_katas.py --pyodide
node tools/qa/run.mjs --only modules/<page>.html --out <your scratch>/qa
```
View each page at 375 and 1280 with the step run and one break open.

## Report
Per step: files; the upgrades applied and anything else changed from the
book (with the reason); checks and final lines; local runs and why; word
counts per beat; facts used and missing; open doubts. Don't commit.
