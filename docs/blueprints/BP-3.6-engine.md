# BLUEPRINT BP-3.6-engine: ENGINE A14 in both runtimes

Wave 3.6 platform: sub-agents, sessions, crash and resume, side effects with
idempotency, model profiles (F1–F7, and H11 in the build track). The spec is
`docs/ENGINE.md` amendment **A14** (read A3, A6.1, A7, A9–A13 too). Two
builders implement it **independently from the spec** (D-040); parity is the
proof. Builder rules: `.claude/agents/hx-builder.md`. You never commit.

## Who does what
| Builder | Owns | Writes |
|---|---|---|
| Rein builder | `rein/src/rein/*`, `rein/tests/*`, `tools/check_scenarios.py` and tests, the schemas (`scenarios/*.schema.json`), the engine tapes and boards below, all their goldens (`--update` on parity) | A14 in Python |
| JS builder | `site/assets/sim/*` and its tests, `tools/sim_cli.mjs` | A14 in JS |

Neither reads the other's A14 code before parity holds. Unclear spec: stop and
ask me with the line and both readings; I rule in ENGINE.md (as A12, A13).

## Engine fixtures (Rein builder writes them; both runtimes must agree)
In `scenarios/engine/` (not copied to the site, A8.6), each with boards in
`scenarios/engine/boards/` and goldens in `scenarios/golden/engine/`:
- `eng-subagents`: two agents (one finishes `done`, one hits its
  `max_turns`); boards: isolated, forked (the forked request is larger), and
  `max: 1` (the second call gets `Sub-agent limit reached (1)`); an unknown
  agent once.
- `eng-sessions`: three sessions; the third reacts with `sent_lacks:` to the
  progress note; boards without and with `progress_file`; `session_gte:`
  used once.
- `eng-crash`: a ledger tool applied before the crash; boards without
  `durable_session` (the restart applies it again: the `lines` check fails)
  and with it (`resume`, applied once).
- `eng-idempotency`: a ledger tool with `lose_reply: [1]`; boards
  `tool_retry` alone (two ledger lines) and `tool_retry` plus `idempotency`
  (one line, `ok` true on the retry).
- `eng-models`: two model profiles, one rejecting `temperature`; boards
  `model` + `request_params` (the call fails, run `error`), the same with
  `capability_check` (dropped, run passes), and the other profile (its own
  pricing and script).

## Acceptance (quote final lines)
```
.venv/bin/python -m pytest -q
(cd rein && PYTHONPATH=src ../.venv/bin/python -m pytest -q && ../.venv/bin/ruff check . && ../.venv/bin/mypy)
.venv/bin/ruff check tools site/assets/py && .venv/bin/mypy
node --test "site/assets/**/test/*.test.mjs"
.venv/bin/python tools/check_scenarios.py
```
New tapes with parity OK and every branch option taken; the old goldens
unchanged (`git status scenarios/golden` shows only new files).

## Report
Files; checks and final lines; run_end lines per engine tape, board and seed;
spec questions and rulings; deviations; open doubts. Don't commit.
