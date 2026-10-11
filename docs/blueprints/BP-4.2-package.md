# BLUEPRINT BP-4.2-package: the local `rein` package (a real-model path, an eval runner)

Phase 4. Builder rules: `.claude/agents/hx-builder.md`. You never commit.
Decisions: D-038 (no real-model spend: everything here is tested against a
local mock of the Messages API, never the live API), D-019 (the pinned SDK,
`anthropic==1.8.0`).

## Read first
SPEC §7.4 (real model runs), §10 Phase 4, §12 (the package's checks);
D-038, D-019; `docs/ENGINE.md` §10 (wire payloads) and A11 (evals);
`rein/src/rein/{sim,harness,model,wire,evals,pricing}.py`; `tools/check_wire.py`;
`facts/models.yaml` and `facts/api.yaml` (model ids, effort, refusal, the
constraints below); module pages D1–D3 (how the course reports results:
pass counts, Wilson intervals, scripted results labelled as scripted).

## What it is
Today `python -m rein.sim` runs a tape with its scripted model. This brief
adds a second model behind the same harness: a real one, on the learner's
machine, with the learner's key. The workspace stays the tape's virtual one
(`vfs.py`), so a real model can never touch the learner's files, and the
tape's checks still decide `passed`. That is what H12 asks learners to run.

## You own
`rein/src/rein/{live.py,cli.py,results.py}` (new; names are yours if you
prefer others), `rein/src/rein/model.py` (the interface only, if it needs
one), `rein/tests/test_live_*.py`, `rein/tests/fixtures/live/` (recorded
responses), `rein/pyproject.toml` (an optional `live` extra with
`anthropic==1.8.0`; the core package keeps zero dependencies),
`rein/README.md`, `tools/check_wire.py` (only to also validate the recorded
fixtures).

## 1. The live model
- `LiveModel(model_id, client)` answers one turn from the request the
  harness already builds (`wire.request_payload`): it sends that payload
  through the SDK and turns the response into the harness's reply (text,
  `tool_use` blocks, `stop_reason`, `usage`). Nothing in the harness changes
  shape for it; if the harness needs a seam (a model object instead of the
  tape's script), add the smallest one and keep every golden byte-identical.
- The constraints SPEC §7.4 lists, each with a test: a `refusal` stop reason
  ends the run with status `refused`; history is append-only (a reply's
  blocks go back exactly as received, thinking blocks included); no forced
  `tool_choice` and no assistant prefill are ever sent; effort is set only
  through the board's `output_config`; parallel `tool_result` blocks go back
  in one user message. Each claim about the API cites its fact id in a
  comment; a claim with no fact waits (report it).
- The model id comes from the command line or config and is checked against
  the Models API before the run (a clear error naming the id if it is not
  there). The key comes only from the `ANTHROPIC_API_KEY` environment
  variable; it is never printed, logged, put in a trace or an error, or
  written to a file (a test greps every output and trace for it).
- A spend cap: `--max-cost-usd` (required for live runs). Cost is computed
  from `usage` and the dated prices in the facts registry (`pricing.py`);
  before each request the runner checks the next request cannot pass the
  cap at the board's `max_tokens`, and stops the run with status `budget`
  if it could.

## 2. The command line
`python -m rein` with subcommands (keep `python -m rein.sim` working as is):
- `rein run --tape T --board B [--seed N]` (scripted, as today) and
  `rein run --tape T --board B --live MODEL_ID --max-cost-usd X` (real).
- `rein eval --eval E --board B [--live MODEL_ID --trials N --max-cost-usd X]
  --out results.json`: runs each task's trials, then writes the results file
  (§3) and prints a short table: task, passed of trials, Wilson 95%
  interval, tokens, cost.
- Errors are one line on stderr with exit code 2, as `rein.sim` does.

## 3. Results the learner records
`results.json`: the eval id, board, model id, date, trials, per-task counts,
intervals, tokens and cost, and `"scripted": true|false`. `rein results
results.json --markdown` prints the course's results table (the shape I3's
portfolio projects use) with a line saying whether the numbers are scripted.
The README's "Record your own numbers" section is the procedure D-038 asks
for: install with the `live` extra, set the key, pick a cheap current model
for practice (named through the facts registry, not hard-coded prose), cap
the spend, run, and paste the table.

## 4. Tests without the network
A local mock of the Messages API in the tests (`http.server` on 127.0.0.1,
the SDK's `base_url` pointed at it, `max_retries=0`) serves recorded
responses from `rein/tests/fixtures/live/`. Fixtures are hand-written to the
SDK's types and validated by `check_wire.py` (extend it to read them). Cover:
a tool-using run to done, a refusal, an overloaded error then success, a run
the spend cap stops, a model id the Models API does not list, and the key
never appearing in any output. No test may open a connection anywhere but
127.0.0.1.

## Acceptance (quote final lines)
```
cd rein && PYTHONPATH=src ../.venv/bin/python -m pytest -q && ../.venv/bin/ruff check . && ../.venv/bin/mypy
.venv/bin/python tools/check_wire.py
.venv/bin/python tools/check_scenarios.py      # every golden unchanged
cd rein && PYTHONPATH=src ../.venv/bin/python -m rein eval --eval ../scenarios/evals/d1-suite.json --board ../scenarios/boards/d1-new.json --out /tmp/r.json && PYTHONPATH=src ../.venv/bin/python -m rein results /tmp/r.json --markdown
```

## Report
Files; checks and final lines; the seam you added to the harness (if any)
and why goldens did not move; facts used and missing; open doubts. Don't
commit.
