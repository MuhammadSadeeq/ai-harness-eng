# BLUEPRINT BP-1.3: Python reference harness, schemas, parity and wire checkers

Phase 1, wave 1. Builder rules: `.claude/agents/hx-builder.md`. You never commit.

## Read first
`docs/ENGINE.md` (all of it, twice), `docs/DECISIONS.md` D-019, D-029, D-033,
D-039, `docs/AUTHORING.md` §9, `scenarios/fixtures/*`, `scenarios/dev/*`,
`site/data/facts.json`, and your own Phase 0 files `tools/check_scenarios.py`,
`tools/check_wire.py`, `tools/tests/test_stubs.py`.

## You own
`rein/src/rein/**`, `rein/tests/**`, `scenarios/schema.json`,
`scenarios/board.schema.json`, `scenarios/trace.schema.json`,
`tools/check_scenarios.py`, `tools/check_wire.py`,
`tools/tests/test_check_scenarios.py`, `tools/tests/test_check_wire.py`,
`tools/tests/test_stubs.py`, `tools/tests/fixtures/scenarios/**`. Builder B is
writing the JS twin (`site/assets/sim/`, `tools/sim_cli.mjs`) at the same time
from the same spec: never read or run their files until their CLI exists, and
never copy their code.

## Build
1. **Rein reference harness** (stdlib only, Python 3.11+, mypy strict, ruff
   clean). Modules mirroring the JS names: `pyjson.py` (just `json.dumps`
   with defaults, plus the integer/ASCII guards), `prng.py`, `tokens.py`,
   `tape.py`, `model.py`, `vfs.py`, `tools.py`, `tooldefs.json` (byte-identical
   copy of `scenarios/fixtures/tooldefs.json`, packaged as data), `policy.py`,
   `board.py`, `harness.py` (§7.1 exactly), `trace.py`, `wire.py`,
   `pricing.py` (resolve from a facts dict loaded from `site/data/facts.json`),
   `sim.py` with `run_trial`, `run_bench` and the CLI
   `python -m rein.sim run --tape T --board B --seed N [--wire] [--facts PATH]`
   (canonical JSONL on stdout, §10).
2. **Schemas** (JSON Schema 2020-12): tapes (`scenarios/schema.json`: every
   field in ENGINE §5–§6, integers only, ASCII string pattern, step shapes,
   `additionalProperties: false`), boards (`board.schema.json`: §7 modules and
   params) and trace events (`trace.schema.json`: §9 kinds with their fields).
3. **`tools/check_scenarios.py`** (replaces the stub): validate every
   `scenarios/*.json` tape and `scenarios/boards/*.json` board against the
   schemas; for every tape × its `boards` × its `golden_seeds`: run the Python
   harness (in-process) and the JS simulator (`node tools/sim_cli.mjs ...`,
   subprocess; the command is injectable for tests), compare events and wire
   payloads line by line and report the first difference with both lines;
   compare with `scenarios/golden/<tape>.<board>.<seed>.jsonl` (and
   `.wire.jsonl`); `--update <tape>` rewrites golden files from Python but only
   if JS matches; validate every emitted event against `trace.schema.json`.
   Last line: `check_scenarios: <t> tapes, <r> runs, parity OK`.
4. **`tools/check_wire.py`** (replaces the stub): for every golden
   `*.wire.jsonl`, validate each request with
   `pydantic.TypeAdapter(list[anthropic.types.MessageParam])` on `messages`
   (plus `ToolParam` for tools) and each response with
   `anthropic.types.Message.model_validate`; because TypedDict validation is
   lazy (D-019), materialize nested `content` lists and compare key sets
   yourself, rejecting unknown or missing keys. Last line:
   `check_wire: <n> payloads OK`.
5. Update `tools/tests/test_stubs.py` so it no longer expects the stub
   behavior for scenarios and wire.

## Tests
`rein/tests/`: mirror B's list (BP-1.2 "Tests") for the Python side, using
the shared fixtures, plus the CLI. `tools/tests/`: check_scenarios with a fake
JS command (match, first-difference report, golden update refused on
mismatch, schema errors), check_wire with good and bad payloads (missing
`tool_use_id`, unknown block key, wrong stop_reason).

## Acceptance (quote final lines)
```
cd rein && PYTHONPATH=src ../.venv/bin/python -m pytest && ../.venv/bin/ruff check . && ../.venv/bin/mypy
.venv/bin/python -m pytest tools/tests/test_check_scenarios.py tools/tests/test_check_wire.py tools/tests/test_stubs.py
cd rein && PYTHONPATH=src ../.venv/bin/python -m rein.sim run --tape ../scenarios/dev/b2-spiral.json --board ../scenarios/dev/boards/b2-new.json --seed 1 --facts ../site/data/facts.json | tail -1
tools/ci_local.sh
```
Report the same seed table as BP-1.2 (seeds 1–5, both boards: status, passed,
turns, cost) from the Python harness. List every ENGINE.md ambiguity you hit
with your choice.

## Report
Files; checks + final lines; the seed table; deviations; open doubts.
