# BLUEPRINT BP-4.0-steps-platform: every Rein step runs in the browser

Phase 4, platform for the build track (H3–H11). Builder rules:
`.claude/agents/hx-builder.md`. You never commit. Decision: DECISIONS D-056.

## Read first
SPEC Part H and §6.3 (`hx-step`), §7.2 (the trace event schema); D-015,
D-056; `docs/blueprints/BP-2.3-step.md` (the step format you built);
`tools/check_steps.py`, `site/assets/components/hx-step.js`,
`lib/py-host.js`, `lib/py-worker.js`, `hx-replay.js`;
`scenarios/trace.schema.json`; the book's steps 3–11 (scratch `book.txt`,
lines about 2410–6900) for what the steps' commands and prompts look like:
almost every checkpoint runs `python test_calc.py`, step 4 asks `[y/N]`
questions with `input()`, step 5 writes a JSONL trace.

## You own
`site/assets/py/hxshell.py` (new) and its tests, `tools/check_steps.py` and
`tools/tests/test_check_steps.py` (and fixtures), `tools/gen_data.py` (the
step fields below), `hx-step.js`/`.css`, `lib/py-host.js`, `lib/py-worker.js`,
`hx-replay.js`/`.css`, `site/labs/step.html`, `site/labs/replay.html`, and
`docs/COMPONENTS.md` entries for `hx-step` and `hx-replay`. Not `steps/H*`
(the Rein builder writes the steps; you test with fixtures).

## 1. The stand-in: `site/assets/py/hxshell.py`
One file, standard library only, typed (mypy strict), read by the browser
worker and by `check_steps`' Pyodide runner. `install()` replaces
`subprocess.run` (only it) and does nothing outside Pyodide
(`sys.platform != "emscripten"`); `run(...)` is the stand-in itself, callable
from tests under CPython.
- **Accepts** what `subprocess.run` accepts that the book uses: `args` as a
  string (with `shell=True`) or a list; `cwd`, `capture_output`, `stdout`/
  `stderr` (`PIPE` or `None`), `text`/`encoding`, `input`, `env`, `timeout`,
  `check`. Returns `subprocess.CompletedProcess(args, returncode, stdout,
  stderr)`; `check=True` raises `CalledProcessError` exactly as CPython does.
- **Runs** `python`, `python3` or `sys.executable`, optional `-u`, then
  `<path>.py` and its arguments (split with `shlex`): the file runs with
  `runpy.run_path(path, run_name="__main__")` with `cwd` as the working
  directory, `sys.argv = [path, *args]`, the script's folder first on
  `sys.path`, `input` (or empty) as `sys.stdin`, stdout and stderr captured
  separately. Afterwards everything is put back: the folder, `sys.argv`,
  `sys.path`, the streams, and **every module the run imported is removed
  from `sys.modules`**, so the next run imports an edited `calc.py` afresh
  (a real process would). Exit code: 0 at the end; `SystemExit(None or 0)`
  → 0, `SystemExit(int)` → that int, `SystemExit(str)` → 1 with the text on
  stderr; an uncaught exception → 1 with `Traceback (most recent call
  last):` … `Name: message` on stderr (paths in tracebacks differ by machine:
  a step's expected output must not contain one, and `check_steps` will say
  so when it does).
- **Refuses** everything else: another program, `-c` or `-m`, a shell
  operator anywhere (`; & | \` $ < > ( )` and newlines), an empty command.
  Refused: exit code 127, empty stdout, stderr `<word>: not available in the
  browser. Run this step on your machine to use it.` No waiting happens:
  `timeout` is accepted and not enforced (documented in the file's
  docstring).
- **Tests** (CPython, calling `run` directly): a file runs with arguments
  and `cwd`; a module edited between two runs is re-imported; stdout and
  stderr stay apart and join as the book's `run_command` joins them; each
  exit-code case above; `input` reaches `input()`; `check=True` raises; each
  refusal; state is restored after a run that raised. Plus one test that
  `install()` is a no-op under CPython.

## 2. Step format: `stdin` and `local`
- `stdin:` (a list of lines) on the checkpoint and on any break: the run's
  standard input. CPython's runner passes it to the process; the Pyodide
  runner sets `sys.stdin`. The expected output is what a pipe captures: the
  prompt `input()` prints, and no echo of the answer. Teach authors this in
  BP-2.3's format section of `docs/COMPONENTS.md` (`hx-step`), and have
  `hx-step` show the answers beside the run ("answers: n").
- `local: true` on the checkpoint or a break: `check_steps` runs it under
  CPython only and skips Pyodide for it. Without `local`, a step's runs must
  agree under both runtimes (as now), so a run the stand-in cannot reproduce
  fails with a message that names the command and suggests `local: true`.
  `runs_in_browser: false` (the whole step) stays legal; the summary line
  counts browser runs and local runs, for example `check_steps: 9 steps OK
  (31 breaks, 3 local; CPython and Pyodide agree)`.
- `check_steps`' Pyodide runner calls `hxshell.install()` before each job;
  the CPython runner keeps real processes. Fixture steps under
  `tools/tests/fixtures/steps/` prove it: a `rein.py` whose tool runs
  `python test_x.py` through `subprocess.run(..., shell=True, cwd=...)`,
  with a passing and a failing test file, a break that edits the module
  between two runs, a `stdin` answer, and a break marked `local` (it runs
  `ls`). Both runners agree on all but the local one.
- `gen_data` carries `stdin` and `local` into `site/data/steps/<ID>.json`.

## 3. `hx-step` in the browser
- The worker installs the stand-in before each run, and passes the run's
  `stdin`.
- A checkpoint or break marked `local` has no Run button: it shows "Run this
  on your machine", the command (copy button), the answers if any, and the
  expected output. Check my file still works (it compares text, not runs).
- Under the checkpoint, one plain line, once per page: "In the browser,
  Rein's commands run in a stand-in that can only run Python files. On your
  machine they run for real." Keep the rest of the component as it is.
- The run's files: after each run, `hx-step` keeps the files the run wrote
  (text under the run's folder, 200 KB cap in total) and dispatches
  `hx-step-files` (`{step, files: {path: text}}`) on itself, bubbling.

## 4. `hx-replay`: open your own trace
H5 asks learners to load the trace their Rein wrote into the Replay Deck.
- New attribute `accept-trace`: the deck shows "Open a trace": a file picker
  (`.jsonl`) and, when a `hx-step` on the page has written a `.jsonl` file,
  a button "Use the trace from step N" (listening for `hx-step-files`). The
  trace never leaves the page; say so in one line.
- Each line is parsed and checked against `scenarios/trace.schema.json`'s
  common fields (`v`, `run`, `seq`, `t`, `turn`, `agent`, `kind`, `wire`)
  and the kind's own required fields where the schema has them; the first
  bad line is named with its number and the reason ("line 4: seq 3 follows
  seq 5"). A good trace replays as a tape run does (transcript, lanes, step
  keys); views that need a tape (Wire View payloads, Bench) say they need a
  tape and are off.
- Tests (node): parsing, each validation message, a good trace's rows.
  Demo: `labs/replay.html` gets a second deck with `accept-trace` and a
  sample trace file under `site/labs/data/`.

## Acceptance (quote final lines)
```
.venv/bin/python -m pytest -q tools/tests/test_check_steps.py tools/tests/test_hxshell.py
.venv/bin/ruff check tools site/assets/py && .venv/bin/mypy
.venv/bin/python tools/check_steps.py --pyodide
.venv/bin/python tools/gen_data.py --check
node --test "site/assets/**/test/*.test.mjs"
node tools/qa/run.mjs --only labs/step.html labs/replay.html modules/rein-1-talk-to-a-model.html modules/rein-2-one-tool-and-the-loop.html --out <your scratch>/qa
```
H1 and H2 must be unchanged for the learner (same outputs, same page). View
`labs/step.html` and `labs/replay.html` at 375 and 1280, with a local break
and an opened trace on screen.

## Report
Files; checks and final lines; what the stand-in refuses and why; deviations;
open doubts. Don't commit.
