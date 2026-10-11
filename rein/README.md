# Rein

Rein is the small agent harness that the HARNESSED course builds, one step at a
time. This package is the local reference: the same harness the course's pages
run in the browser, with a scripted model (every tape, every golden trace) and,
on your machine, a real model with your own key.

Run every command in this README from the repository root: the folder that
holds `scenarios/`, `site/` and `rein/`. The facts registry (`site/data/facts.json`)
is found from there, so no command needs `--facts`.

Make `python -m rein` importable in one of two ways. Both work:

- Install once, from the root. `python -m pip install -e "./rein[live]"` adds the
  live extra, which pins the Anthropic SDK for real-model runs. The scripted
  commands need only the core: `python -m pip install -e ./rein`.
- Or put the source on the path in front of each command:
  `PYTHONPATH=rein/src python -m rein ...`. The course's H13 page and its example
  use this form.

The commands below assume the install. If you did not install, put
`PYTHONPATH=rein/src` in front of each one.

## Commands

Scripted (free, offline, repeats exactly):

    python -m rein run  --tape scenarios/d1-example-a.json --board scenarios/boards/d1-new.json --seed 0
    python -m rein eval --eval scenarios/evals/d1-suite.json --board scenarios/boards/d1-new.json --out d1-new.json
    python -m rein results d1-new.json --markdown

Live (a real model, your key, a spend cap; the course shows this command and does
not run it):

    python -m rein eval --eval scenarios/evals/d1-suite.json --board scenarios/boards/d1-new.json --live claude-haiku-5-5 --max-cost-usd 0.05 --trials 2 --out my-results.json

`python -m rein.sim` keeps working as before. Errors print one line on stderr
and exit with status 2.

The workspace of a run is the tape's own virtual one. A real model never
touches your files; the tape's checks still decide whether a run passed.

## Record your own numbers

The course's results are scripted, and the table says so. To record real
numbers, from the repository root:

1. Install with the live extra, as above:

       python -m pip install -e "./rein[live]"

2. Set your key. It is read from `ANTHROPIC_API_KEY` only. No command takes it
   as an argument, and no output, trace or results file contains it.

       export ANTHROPIC_API_KEY=...

3. Pick a cheap current model for practice. The model id is checked against the
   Models API before the run. Its price comes from the facts registry (for the
   cheap tier, `models.haiku-5-5-price-up-to-100k` in `facts/models.yaml`), so
   the cost you see is the dated price.

4. Cap the spend. `--max-cost-usd` is required for a live run. Before each
   request the run checks that the request cannot pass the cap, and stops with
   status `budget` if it could:

       python -m rein eval --eval scenarios/evals/d1-suite.json --board scenarios/boards/d1-new.json --live claude-haiku-5-5 --max-cost-usd 0.05 --trials 2 --out my-results.json

5. Print the table and paste it into your write-up:

       python -m rein results my-results.json --markdown

The table has the columns Task, Passed of trials, Wilson 95% interval, Tokens,
Cost and Scripted. A live run says that its numbers vary from run to run.

## What the live path enforces

Each constraint has a test, and each claim about the API cites its fact id in
the code (`rein/src/rein/live.py`).

- A `refusal` stop reason ends the run as `refused` (`api.stop-reason-refusal`).
- History is append-only: each reply's blocks go back exactly as received.
- No forced `tool_choice` and no assistant prefill are sent
  (`api.tool-choice-adaptive-forced-exceptions`, `api.prefill-claude-sonnet-5-5`).
- Effort is set only through the board's `output_config`
  (`api.effort-location`).
- Parallel `tool_result` blocks go back in one user message
  (`api.parallel-results-one-message`).
- The spend cap is checked before each request (prices from `models.*-price`).
- The key is never printed, logged, traced or written to a file.

Two claims have no fact yet, and the code marks them as waiting: the Models API
lookup endpoint, and the rule that thinking blocks go back unchanged.

## Tests

From the repository root, with the course's virtual environment (or any Python
3.11+ that has pytest):

    PYTHONPATH=rein/src .venv/bin/python -m pytest -q rein/tests

The live tests run against a local mock of the Messages API on 127.0.0.1 only.
Its recorded responses are in `rein/tests/fixtures/live/` and are validated by
`tools/check_wire.py`. No test opens a connection anywhere else, and no test
spends money.
