# BLUEPRINT BP-3.1-content: wave 3.1 modules S0, A1, A2, A3, T1–T3

Phase 3, wave 3.1 content. Builder rules: `.claude/agents/hx-builder.md`. You
never commit. The Phase 2 gate has passed (docs/PHASE2-GATE.md): B2 is the bar
and AUTHORING.md v1 is final.

## Read first (everyone)
`docs/AUTHORING.md` (all; it is final), the B2 page
`site/modules/the-agent-loop.html` and `content/B2/*.yaml` (**the bar**: match
its structure, voice and quality), `docs/gate/phase2-walkthrough-B2.md` and
`docs/gate/phase2-walkthrough-H1-H2.md` (what a learner tripped on, so you
don't repeat it), `course.json` (your modules:
`kind`, objectives, terms, family, law, prerequisites), `docs/ENGINE.md` (tapes
and boards; A4 incident blocks; A5 for A3), `docs/COMPONENTS.md` (the labs you
use), and the book's chapters for your modules (scratch `book.txt`; the book
is the owner's, so never copy its sentences: teach the idea in your words).

## Who writes what
| Builder | Modules | Incident tapes (yours) | Labs |
|---|---|---|---|
| JS builder | S0 (concept), A3 (core) | `s0-false-done` exists; new `a3-forgetful` (`history: {"resend": false}` on `a3-old`) | `hx-replay`, `hx-bench`, `hx-placement` (S0); `hx-forgetful`, kata `A3-messages` (A3) |
| Bench builder | A1 (concept), A2 (concept) | new `a1-confident-lie` (a fluent, wrong reply: the model calls an invented helper; the verify gate on `a1-new` catches it); A2 reuses `c2-flood` (a whole log overflows the window, ENGINE A1) for Break only: its fix, the output cap, is taught in C2, and the page says so | `hx-sampler` (A1); `hx-tokenizer` (A2) |
| Rein builder | T1, T2, T3 (primers: See, Fix, Keep) | none | katas `T1-dataclass`, `T2-gather`, `T3-timeout` |

## Rules for this wave
- Pages: `site/modules/<slug>.html` (slug from `course.json`), from the
  skeleton in AUTHORING §2, with the gen markers; run `tools/gen_pages.py`
  to fill them.
- Content: `content/<ID>/{terms,cards,say,checks}.yaml`; katas under
  `katas/<ID>-<name>/` (AUTHORING §8). Primers need `cards` and a kata.
- ≤ 900 words of prose per page (component text and code don't count).
  Every objective covered by `data-objective`; every term defined at first
  use and never used before its module; every product claim a verified fact
  span that says no more than its claim. A fact you need and don't have: list
  it (claim and where you'd source it) in your report; don't write the claim.
- Tapes: ASCII, integers only, `golden_seeds: [0, 1, 2]` covering every branch
  option the runs reach (A3.22), an A4 incident block whose `first_bad_seq` is
  the first event a harness engineer would call wrong (D-041). Golden traces
  are mine (`check_scenarios --update` after both runtimes agree); report the
  JS and Python `run_end` lines for each board and seed.
- T3 (subprocess) cannot run a child process in the browser. Its kata tests
  the parts that are pure (building the argument list, reading a result
  object, choosing the timeout) against a fake; the real `subprocess.run`
  call is shown in a code block marked `Runs on your machine, not in the browser.`
  T2's kata must pass in Pyodide (`check_katas --pyodide`): use
  `asyncio` patterns that work there and say in your report which you used.
- Illustrative numbers labelled (DESIGN §11). No typed numbers that a
  component computes: bind them with `hx-num` (B2's Fix sentence).

## Acceptance (quote final lines)
```
.venv/bin/python tools/check_content.py site/modules/<your pages>
.venv/bin/python tools/check_facts.py
.venv/bin/python tools/check_katas.py --pyodide
.venv/bin/python tools/check_scenarios.py        (Python-only for new tapes until I write goldens)
.venv/bin/python tools/gen_data.py --check && .venv/bin/python tools/gen_pages.py --check
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --only modules/<your pages> --out <your scratch>/qa
```
QA 0 failures with self-tests counted. View every figure at 375 × 812 and
1280, light and dark, and list which you viewed.

## Report
Per module: files; checks and final lines; word counts per beat; facts used
and facts needed; tapes with their run_end lines; deviations; open doubts.
Don't commit.
