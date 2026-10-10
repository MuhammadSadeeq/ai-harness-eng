# BLUEPRINT BP-3.5-content: wave 3.5 modules D1–D3, E1, E2

Phase 3, wave 3.5 content (T9, its primer, is built). Builder rules:
`.claude/agents/hx-builder.md`. You never commit. The rules and lessons of
BP-3.1 to BP-3.4 content all apply.

## Read first (everyone)
`docs/AUTHORING.md` v1 (§13), the B2 page, an accepted core page from waves
3.3–3.4 (`verification.html`, `permissions.html`), the walkthrough reports,
`course.json` (your modules), `docs/ENGINE.md` A11, A12 (evals, canaries and
`leak`, `tool_pins`, `last_result_contains`), `docs/COMPONENTS.md`, DECISIONS
D-049 to D-055, and the demo pages and data contracts of `hx-evalbench`,
`hx-escape`, `hx-dice` and `hx-bench`. The engine fixtures `eng-inject`,
`eng-pins`, `eng-eval` and `eng-eval-attack` show each feature working; your
tapes and evals are new, written for the module.

## Course evals (new in this wave)
An eval is `scenarios/evals/<id>.json` (A11.7), served at
`site/data/evals/<id>.json` by `gen_data`, checked for parity and given
goldens per board by `check_scenarios` (I write the goldens after parity).
Its tasks name tapes in `scenarios/`.

## Who writes what
| Builder | Modules | Tapes and evals | Labs and katas |
|---|---|---|---|
| Bench builder | D1 (core), D2 (core), D3 (core) | D1: an incident tape where a harness change passes the two hand-picked examples and fails held-out tasks, plus eval `d1-suite` (5–8 tasks over course tapes and new small ones, both boards); D2: a tape with a branch whose percent makes 10 trials mislead (`d2-noise`), with boards that differ in something harmless; D3: eval `d3-graded` with a `model_grader` whose false-pass rate rubber-stamps false dones, and an incident where the model grader passes a false done | `hx-evalbench` (D1, D3), `hx-dice` (D2: pass@k against pass^k, Wilson intervals, trials needed), `hx-bench`; katas `D1-eval` (run an eval with a code grader over seeded trials), `D2-wilson` (pass rate with a 95 % Wilson interval, and whether two results really differ), `D3-calibrate` (agreement rate between a model grader and human labels) |
| Design builder (after BP-5.3) | E1 (core), E2 (core) | E1: `e1-injected-page` (canaries, an untrusted page, a network tool; boards open, wording, egress cut) and eval `e1-attacks` (the attack success rate); E2: `e2-poisoned-tool` (a server's new version carries a hidden instruction; boards without and with `tool_pins`), plus an excessive-agency case for least privilege | `hx-escape` (E1, E2) with module data under `content/<ID>/labs/`; katas `E1-trifecta` (find the three legs in a tool set and report which are open), `E2-least-privilege` (narrow a policy to the tools and paths a task needs) |

## Notes per module
- **D1**: the parts of an eval (task, environment, trials, grader,
  transcript, outcome); capability against regression evals (D1.o4) shown
  by the eval's `kind`. Graders: code, model, human, each with how it fails.
- **D2**: pass@k and pass^k tell opposite stories (D2.o1); a Wilson interval
  (D2.o2); trials needed for a given difference (D2.o3); noise beyond
  sampling (D2.o4: infrastructure, time limits, flaky checks) as a principle.
- **D3**: noise-aware thresholds in CI (D3.o1), calibrating a model grader
  (D3.o2) with the evalbench's agreement line, contamination and eval
  awareness (D3.o3) need facts or stay principles, reading transcripts for
  graders that pass for the wrong reason (D3.o4) through the trial panel.
- **E1**: injection lives in any content the agent reads; wording lowers
  the rate, only a cut leg stops it (the escape lab's lesson line).
- **E2**: defense in layers, tool supply chain (pin, review, isolate),
  least privilege, red-teaming with a seeded attack suite and an attack
  success rate (E2.o4, the eval's `leaked` count). The OWASP and security
  facts in `facts/owasp.yaml` and `security.yaml` likely cover the terms.

## Acceptance and report
As BP-3.4-content. For evals, report each eval's summary per board (code,
leaked, model, agree, tasks_any_pass, tasks_all_pass). Don't commit.
