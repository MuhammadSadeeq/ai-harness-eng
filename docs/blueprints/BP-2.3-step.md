# BLUEPRINT BP-2.3: Rein build steps: the format, `check_steps`, `hx-step`, and steps 1–2

Phase 2. Builder rules: `.claude/agents/hx-builder.md`. You never commit.

## Read first
The book's build part in `source/wire-by-wire.html` (the owner's book; never
copied into `site/`): "How the build works" and "Steps 1 and 2: a model, then a
loop" (a plain-text copy is at
`/tmp/claude-0/-home-user-ai-harness-eng/4512a573-cc00-58ec-8db9-1f17cfd98bb0/scratchpad/book.txt`,
lines about 1840–2410). SPEC §6.3 (`hx-step`), `docs/AUTHORING.md` §8 (katas,
for the two-runner rule), `docs/COMPONENTS.md`, `tools/check_steps.py` (the
stub), your `tools/check_katas.py` (reuse its Pyodide runner), your
`lib/py-host.js`, `py-worker.js`, `editor.js`, `facts/models.yaml`.

## You own
`steps/**` (new), `tools/check_steps.py` and `tools/tests/test_check_steps.py`,
`tools/gen_data.py` and its tests (compile steps), `site/assets/components/hx-step.js`,
`hx-step.css`, `site/assets/components/lib/{py-host,py-worker,editor}.js`
(shared with hx-kata), `hx-kata.js`/`.css` (the carried fix below),
`site/labs/step.html`.

## 1. The step format (`steps/<MODULE>/`)
Rein is built as one file, `rein.py`, grown step by step in the book's order.
```text
steps/_shared/reset_demo.py        the book's practice-project script
steps/H1/step.yaml                 the step: chunks, checkpoint, breaks (below)
steps/H1/rein.py                   the whole file after the step
steps/H1/scenarios/01_hello.json   the FakeModel script(s) the step uses
```
`step.yaml`:
```yaml
module: H1
number: 1                        # the book's step number
title: Talk to a model
goal: Send one message to a model and print its reply, ...
lines_after: 105
chunks:
  - id: 1a
    title: Start the file
    where: new code              # or "in Agent.run()", "under show()", ...
    explain: >-
      Plain explanation, a few sentences.
    diff: |                      # one line per line: "+" add, "-" remove, " " context (grey)
      +"""Rein: a small coding-agent harness, built one step at a time.
      ...
checkpoint:
  setup: [reset_demo]            # optional: run steps/_shared/reset_demo.py first
  argv: ["Say hello", "--fake", "scenarios/01_hello.json"]
  expected: |                    # the exact stdout
    you      Say hello
    ...
  explain: >-                    # "What just happened"
breaks:                          # "Break it on purpose"
  - id: empty-reply
    title: An empty reply
    explain: >-
    change:                      # exactly one of: script (replace a scenario file) or patch (a diff on rein.py)
      script: {path: scenarios/01_hello.json, json: {"replies": [{}]}}
    expected: |                  # the exact stdout after the change (or `error: SomeError` for a traceback)
```
A chunk applies where its context lines match the current file **exactly once**
(the book's rule: find the grey lines, put the green lines between them).

## 2. `check_steps.py`
For the build modules that have `steps/<ID>/`, in `course.json` path order:
1. Start from the previous step's `rein.py` (empty for the first) and apply each
   chunk; the result must equal this step's `rein.py` byte for byte, with
   `lines_after` lines. Report the chunk that fails to apply and why (context
   not found / found twice).
2. Run the checkpoint with CPython in a temp dir (the step's files, the setup
   scripts, `python rein.py <argv>`, 30 s timeout, `PYTHONHASHSEED=0`, no
   network): stdout must equal `expected` exactly.
3. Run every break the same way: its stdout must equal its `expected`, and
   differ from the checkpoint's.
4. `--pyodide`: run steps whose `runs_in_browser` is not false (default true)
   in Node Pyodide (one process; files in the Pyodide FS; `sys.argv` set;
   `runpy.run_path(..., run_name="__main__")`; stdout captured; `SystemExit`
   handled): output must equal CPython's. Steps that need a subprocess set
   `runs_in_browser: false` (none in steps 1–2).
Summary line: `check_steps: N steps OK (M breaks, CPython and Pyodide agree)`.
Run in CI: I add it; make sure it is fast (< 30 s for steps 1–2).

## 3. Steps 1 and 2 (content: transcribed from the book, then upgraded)
Transcribe the book's steps 1 and 2 into `steps/H1/` and `steps/H2/`: chunks
(titles, labels, explanations, diffs), scripts, checkpoints with their exact
outputs, "What just happened", the breaks, and the whole files. Keep the book's
code and words; three upgrades only:
- Python 3.11 or newer (the book says 3.10).
- The real model's default id must be a **verified** model id from
  `facts/models.yaml`; name the fact id in a comment next to it and in your
  report. If the book's id isn't verified, use the verified current Sonnet id.
- Wherever the book's prose names a product fact, keep it only if a verified
  fact backs it; list any you dropped.
`check_steps` must pass on both steps.

## 4. `hx-step` (SPEC §6.3)
`<hx-step step="H1">` loads `site/data/steps/<ID>.json` (compiled by
`gen_data.py` from `steps/<ID>/`, with `_shared` files included). It renders:
- The goal and size (`rein.py grows to 172 lines`).
- Each chunk as a card: title, `where` label, the explanation, the diff with a
  mark per line (`+` added, `−` removed, blank for context) and the line text,
  with the green / red / grey coloring as a second cue (never color alone), and
  a `Copy new lines` key (copies only the added lines; `Copied` for 2 s,
  announced).
- The script (JSON, pretty-printed) in a `details`.
- The checkpoint: the command (mono), the expected output (mono), and two keys:
  `Run it here` (runs the step's reference `rein.py` with the script in Pyodide
  and shows the real output with a match mark against the expected) and
  `Check my file` (opens an editor where the learner pastes their own
  `rein.py`; running it shows their output beside the expected one with the first
  differing line marked; a match records
  `this.evidence("step", {step, match: true})` with the module's objectives
  from `data-objective`).
- "What just happened" after a run.
- **Break it on purpose**: each break as a toggle; turning it on runs the
  changed version and shows its output next to the normal one, with the
  explanation.
- The whole file after the step in a `details` with a Copy key.
- Python loads as in `hx-kata` (shared host; near the viewport or on first
  use). Long output scrolls inside its own labelled region.
- `selfTest()`: copy a chunk (check the clipboard text equals the added lines),
  run the reference (expect a match), toggle one break (expect its output),
  paste the reference into Check my file and run (expect a match), restore.
- Demo: `site/labs/step.html` with H1 and H2.

## 5. Carried fix: kata loading (Phase 1 verification, N1/N2)
No hard cap on Python's load: after 20 s show `Still loading Python. A slow connection can take a minute or two.` with a `Try again` key (restarts the load);
fail only on a real error (worker `error`/`messageerror`, init rejection, wasm
failure). The failure copy becomes `Python could not load. Check your connection and try again.` with `Try again`. Same behavior in `hx-step`.

## Acceptance (quote final lines)
```
.venv/bin/python tools/check_steps.py
.venv/bin/python tools/check_steps.py --pyodide
.venv/bin/python tools/gen_data.py --check
.venv/bin/python -m pytest -q tools/tests
.venv/bin/ruff check tools && .venv/bin/mypy
node --test "site/assets/**/test/*.test.mjs"
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --only labs/step.html labs/kata.html
```
QA 0 failures with self-tests counted. View `labs/step.html` at 375 and 1280,
both themes. Report: the line counts after each step, check_steps timing, the
model fact id used, any book fact you dropped.

## Report
Files; checks and final lines; numbers above; UI copy beyond the strings
above; deviations; open doubts. Don't commit.
