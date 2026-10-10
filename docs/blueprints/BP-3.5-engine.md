# BLUEPRINT BP-3.5-engine: ENGINE A11 in both runtimes

Wave 3.5 platform: evals, prompt injection and tool provenance (D1–D3, E1,
E2). The spec is `docs/ENGINE.md` amendment **A11** (read A3, A6.1, A9, A10
too: A11 builds on them). Two builders implement it **independently from the
spec** (D-040): parity between your runtimes is the proof. Builder rules:
`.claude/agents/hx-builder.md`. You never commit.

## Who does what
| Builder | Owns | Writes |
|---|---|---|
| Rein builder | `rein/src/rein/*`, `rein/tests/*`, `tools/check_scenarios.py` and its tests, `scenarios/schema.json`, `scenarios/board.schema.json`, `scenarios/trace.schema.json`, the engine tapes, boards and evals below, all goldens (`--update`) | A11 in Python; `python -m rein.sim eval --eval E --board B [--scenarios DIR]`; eval goldens in `check_scenarios` |
| JS builder | `site/assets/sim/*` and its tests, `tools/sim_cli.mjs` | A11 in JS; `runEval(spec, tapes, board, {facts})` exported from `sim/index.js`; `node tools/sim_cli.mjs eval --eval E --board B [--scenarios DIR]` |

Neither of you reads the other's code for A11 before parity holds. If the
spec is unclear, stop and ask me (with the line and both readings); I rule
in ENGINE.md, as A10 did for A9.

## The CLIs' `eval`
`--eval` is a path to an eval file; a task's tape id resolves to
`<DIR>/<id>.json`, else `<DIR>/engine/<id>.json` (`--scenarios`, default
`scenarios`); `--board` is a path to a board file. Output: the A11.7 object
as one canonical JSON line (sorted keys, no spaces) and a newline. Errors go
to stderr with exit code 2, as `run`.

## Engine fixtures (Rein builder writes them; both runtimes must agree)
In `scenarios/engine/` (not copied to the site; A8.6):
- `eng-inject.json`: a page-reading custom tool (`fetch_page`, `trifecta:
  ["untrusted_content"]`) whose output plants an instruction; a secret in
  `outside` and in `workspace` with that string in `canaries`; a network
  tool `send_report` (`effect: network`, `url` field, `trifecta:
  ["exfiltration"]`). The script: `when` `last_result_contains:<the planted
  text>` then a `branch` (obey: call `send_report` with the secret in its
  body; ignore), with a lower obey percent under `sent_lacks:` on a
  defense's wording from `rules`. Boards: `eng-inject-open` (no defenses),
  `eng-inject-wording` (`rules_file`), `eng-inject-egress` (`sandbox` without
  the host: the call is blocked, no `leak`), `eng-inject-deny` (permissions
  deny `send_report`). Seeds that show obey and ignore on the open board.
- `eng-pins.json`: custom tools from two servers (`notes` v1.2.0 and a
  `notes` tool at v1.3.0 whose description carries a hidden instruction;
  `search` with no pin) and one tool with no server. The script uses
  `tool_loaded:` and `sent_lacks:`, and calls a rejected tool once. Boards:
  `eng-pins-none` (no module), `eng-pins-pinned` (pins `notes` at 1.2.0),
  `eng-pins-search` (`tool_pins` plus `tool_search`: a rejected tool cannot
  load).
- `scenarios/engine/evals/eng-eval.json`: three tasks over two tapes (one
  task reuses a tape), `trials` 5, a `model_grader` with both percents
  non-zero, `boards` [two existing boards]. Plus `eng-eval-attack.json`: one
  task on `eng-inject`, `trials` 10, no model grader (the attack success
  rate case).
Goldens: `scenarios/golden/engine/` for the tapes as today;
`scenarios/golden/evals/<eval>.<board>.json` for evals (A11.8).

## Rulings you can rely on
- Loader refusals: `last_result_contains:` with empty text; `server`
  without `version` or the reverse; a `trifecta` value outside the three or
  repeated; an empty or repeated canary; a `tool_pins` that is not
  `{"pins": {string: string}}`; an eval with 0 or more than 20 tasks,
  repeated task ids, `trials` outside 1–50, a percent outside 0–100, or a
  tape id that resolves to no file.
- `tool_rejected` events come right after `run_start`, before turn 1's
  first event, in tape order of the custom tools.
- The eval's results list every trial of every task even when a run ends
  `error`.

## Acceptance (quote final lines)
```
.venv/bin/python -m pytest -q
(cd rein && PYTHONPATH=src ../.venv/bin/python -m pytest -q && ../.venv/bin/ruff check . && ../.venv/bin/mypy)
.venv/bin/ruff check tools site/assets/py && .venv/bin/mypy
node --test "site/assets/**/test/*.test.mjs"
.venv/bin/python tools/check_scenarios.py
```
(the same steps `tools/ci_local.sh` runs).
`check_scenarios` must list the new tapes and evals with parity OK, and every
branch option taken (A3.22). Old goldens unchanged (`git status scenarios/golden`
shows only new files).

## Report
Files; checks and final lines; for each engine tape and eval, the run_end (or
summary) lines per board; any spec question and how it was ruled;
deviations; open doubts. Don't commit.
