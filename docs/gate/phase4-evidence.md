# Phase 4 gate evidence (BP-4.1 and the package)

Run from the repository root (`/home/user/ai-harness-eng`) in a clean environment (`env -i`, PATH without the
caller's PYTHONPATH). Each row is one command and the last line it printed. Exit 0 means the command passed.

| Gate | Command | Exit | Final line |
|---|---|---|---|
| check_steps (CPython) | `/home/user/ai-harness-eng/.venv/bin/python tools/check_steps.py` | 0 | check_steps: 11 steps OK (36 breaks, 1 local; CPython) |
| check_steps --pyodide | `/home/user/ai-harness-eng/.venv/bin/python tools/check_steps.py --pyodide` | 0 | check_steps: 11 steps OK (36 breaks, 1 local; CPython and Pyodide agree) |
| step tests | `.venv/bin/python -m pytest -q tools/tests/test_steps_traces.py tools/tests/test_check_steps.py` | 0 | 31 passed in 25.76s |
| check_content (whole site) | `.venv/bin/python tools/check_content.py` | 0 | check_content: course.json OK (70 modules), 70 pages OK |
| check_scenarios | `.venv/bin/python tools/check_scenarios.py` | 0 | check_scenarios: 68 tapes, 423 runs, 7 evals, 17 eval runs, parity OK |
| check_facts | `.venv/bin/python tools/check_facts.py` | 0 | check_facts: 279 facts OK (242 verified, 37 unverifiable, 0 contradicted), 136 page references |
| check_katas --pyodide | `.venv/bin/python tools/check_katas.py --pyodide` | 0 | check_katas: 43 katas OK (309 candidates, CPython and Pyodide agree) |
| QA rein-3-real-tools-inside-a-wall (--jobs 1) | `node tools/qa/run.mjs --jobs 1 --only modules/rein-3-real-tools-inside-a-wall.html --out /tmp/claude-0/-home-user-ai-harness-eng/4512a573-cc00-58ec-8db9-1f17cfd98bb0/scratchpad/gate/qa/rein-3-real-tools-inside-a-wall` | 0 | qa: 1 pages, 6 screenshots, 0 failures |
| ruff (package) | `.venv/bin/python -m ruff check rein` | 0 | All checks passed! |
| mypy (package) | `.venv/bin/python -m mypy --config-file rein/pyproject.toml rein/src` | 0 | Success: no issues found in 23 source files |
| pytest (package, offline) | `PYTHONPATH=rein/src .venv/bin/python -m pytest -q rein/tests` | 0 | 725 passed in 19.14s |
| eval runner, offline | `PYTHONPATH=rein/src .venv/bin/python -m rein eval --eval scenarios/evals/d1-suite.json --board scenarios/boards/d1-new.json --out /tmp/claude-0/-home-user-ai-harness-eng/4512a573-cc00-58ec-8db9-1f17cfd98bb0/scratchpad/gate/eval-offline.json` | 0 | These numbers are scripted: they repeat exactly. A real model's numbers would vary. |
| results table, offline | `PYTHONPATH=rein/src .venv/bin/python -m rein results /tmp/claude-0/-home-user-ai-harness-eng/4512a573-cc00-58ec-8db9-1f17cfd98bb0/scratchpad/gate/eval-offline.json --markdown` | 0 | These numbers are scripted: they repeat exactly. A real model's numbers would vary. |
| eval runner against the mock API (live tests) | `PYTHONPATH=rein/src .venv/bin/python -m pytest -q rein/tests/test_live_cli.py rein/tests/test_live_constraints.py rein/tests/test_live_facts.py` | 0 | 31 passed in 11.93s |

Page QA for H3–H13 is covered by the full gate (tools/ci_local.sh --committed --qa) on the director's commit.

The rein-4 QA run was stopped before it finished, and the QA runs for rein-5 to rein-from-one-file were never started, so the table has no rows for them.
