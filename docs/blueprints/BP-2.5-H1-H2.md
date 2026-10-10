# BLUEPRINT BP-2.5: H1 and H2 (the build exemplars), and ENGINE A5 in Rein

Phase 2. Builder rules: `.claude/agents/hx-builder.md`. You never commit. These
are the first **build** modules; like B2 for core modules, they set the bar for
H3–H13.

## Read first
`docs/AUTHORING.md` (all; build modules put `<hx-step>` in Fix), the B2 page
`site/modules/the-agent-loop.html` and its YAML (the exemplar: match its
quality and structure), `docs/ENGINE.md` amendment **A5**, `course.json`
modules `H1` and `H2` (objectives, terms, families: H1 `first-block-only`, H2
`almost-done-spiral`; prerequisites), your steps in `steps/H1`, `steps/H2`, the
book's steps 1–2 text (scratch `book.txt`), and the facts
`api.messages-stateless`, `api.tool-result-ids-must-match`,
`api.content-multiple-blocks`, `api.tool-results-single-user-message`,
`models.ids-current`.

## You own
`rein/src/rein/**` and `rein/tests/**` (A5), `scenarios/h1-first-block.json` and
its boards `scenarios/boards/h1-old.json`, `h1-new.json` (new tape), the schemas
(`scenarios/*.schema.json`, A5 fields), `tools/check_scenarios.py` (if A5 needs
it), `site/modules/rein-1-talk-to-a-model.html`,
`site/modules/rein-2-one-tool-and-the-loop.html`,
`content/H1/{terms,cards,say,checks}.yaml`, `content/H2/{terms,cards,say,checks}.yaml`.
Not `site/assets/sim/**` (the JS builder implements A5 there, from the same
spec, without reading yours).

## 1. ENGINE A5 in Rein
Implement A5 exactly: `history: {"resend": false}`, the `history_lt:<n>`
condition, `first_block_only: {}`. Tests for each item. Golden traces for the new
tape are written by me after the JS side lands (`check_scenarios --update`
requires parity).

## 2. The H1 incident tape: `h1-first-block`
A task where the model's first reply is text **followed by** a `tool_use`
("I'll run the tests first." + `run_command pytest -q`). On `h1-old` (with
`first_block_only`), the harness never runs the tests and ends the run `done`
with the checks failing: a false done caused by the parser, not the model. On
`h1-new` (no bug), the tests run, the model fixes the code, and the run ends
done with the checks passing. Incident block (ENGINE A4): the first bad event
is the harness ending the run right after a reply that asked for a tool; give
`notes` for the model reply ("The request is right here: tool_uses lists
run_command. What did the harness do with it?"). `golden_seeds: [0, 1, 2]`.

## 3. The H1 and H2 pages (build kind: Break, See, Fix, Prove, Keep)
Each ≤ 900 words of prose (the step text inside `hx-step` doesn't count), every
objective covered with `data-objective`, every term defined at first use, every
product claim a verified `.fact`.
- **H1 "Rein 1: talk to a model"**: Break: a predict check gating
  `hx-incident tape="h1-first-block"`. See: one model interface, two models;
  `Reply` keeps the raw blocks (fact `api.content-multiple-blocks`); the API is
  stateless (fact `api.messages-stateless`), shown by the statelessness exercise
  from the book (optional with a real key: never asked for in the page). Fix:
  `<hx-step step="H1">`. Prove: `hx-bench tape="h1-first-block" old="h1-old"
  new="h1-new"`. Keep: law, cards (6–8), say (2), portfolio.
- **H2 "Rein 2: one tool and the loop"**: Break: a predict check gating
  `hx-replay tape="b2-spiral" board="b2-old" locked` (the spiral, now in your own
  code's terms). See: tool specs vs functions; the loop in Rein; results matched
  by id (fact `api.tool-result-ids-must-match`), all in one message (fact
  `api.tool-results-single-user-message`); unknown tools as `is_error` results.
  Fix: `<hx-step step="H2">`. Prove: `hx-bench tape="b2-spiral" old="b2-old"
  new="b2-new"` (your turn limit). Keep: law, cards, say, portfolio.
- Build modules link back to the theory module (H2 → B2) with a margin note.

## Acceptance (quote final lines)
```
cd rein && PYTHONPATH=src ../.venv/bin/python -m pytest -q && ../.venv/bin/ruff check . && ../.venv/bin/mypy
.venv/bin/python tools/check_content.py site/modules/rein-1-talk-to-a-model.html site/modules/rein-2-one-tool-and-the-loop.html
.venv/bin/python tools/check_steps.py --pyodide
.venv/bin/python tools/gen_data.py --check && .venv/bin/python tools/gen_pages.py --check
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --only modules/rein-1-talk-to-a-model.html modules/rein-2-one-tool-and-the-loop.html --out <your scratch>/qa
```
(`check_scenarios` parity on `h1-first-block` waits for the JS side; report its
Python-only run.) QA 0 failures, except failures caused by the JS side of A5
not being there yet (say which). View both pages at 375×812 and 1280.

## Report
Files; checks and final lines; word counts per beat; facts used; deviations;
open doubts. Don't commit.
