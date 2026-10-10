# BLUEPRINT BP-3.6-labs: wave 3.6 labs: `hx-shift`, `hx-envbuilder`, `hx-topology`

Phase 3, wave 3.6 platform, for F1 (`hx-topology`), F2 (`hx-shift`) and F6
(`hx-envbuilder`). `hx-shift` and `hx-envbuilder` run the simulator (ENGINE
A9, A11, A14–A16: use `runTrial` / `runEval` from `site/assets/sim/index.js`,
never a copy). Builder rules: `.claude/agents/hx-builder.md`. You never
commit.

## Read first
`docs/COMPONENTS.md` (all), `docs/DESIGN.md` §7, §7.10, §8, §9, §11,
`docs/ENGINE.md` A9 (tape `tests`, `pristine_tests`), A11 (evals), A14–A16
(sessions, `progress_file`, sub-agents), `site/assets/components/lib/{hx-element,data,format,stats}.js`,
and the accepted labs `hx-evalbench`, `hx-escape` (patterns: a patched tape,
seeded replays, readouts next to each other), `hx-gatekeeper`.

## Shared rules
As BP-3.5-labs: illustrative numbers labelled; seeded runs; nothing under
14 px; marks plus words; reduced motion without tweening; `selfTest()` drives
the real UI; a demo page and its data per lab; module plus CSS ≤ 40 KB each;
values protocol; one clear control per thing, the main action primary;
batched runs that yield.

## 1. `hx-shift` (F2: write the handoff the next shift needs)
`src` JSON: `{tape, board, note_path, required: [{id, phrase, why}], starter_note?, trials}`.
The tape has two or more `sessions` (A14.2) and the board plugs
`progress_file` at `note_path`; the next session's script reacts with
`sent_lacks:` on each required phrase (it redoes work or breaks a rule it
was not told about).
- **Write the note** (a text box, labelled `The handoff note`), starting from
  `starter_note` if given.
- **Start the next shift** (primary): the component writes the note into the
  tape's workspace at `note_path` after session 1 (a tape patch on the
  workspace), runs the trials, and shows: the next shift's outcome (done, and
  checks), the turns it spent, and for each required item `in the note` or
  `missing`, with its `why` when missing (`The next shift rewrote the parser,
  because the note did not say it was done.`).
- A replay of one trial's second session is one click away.
- Evidence: `{shift_passed, trials, missing: [ids]}`. Values: `passed`,
  `missing_count`.

## 2. `hx-envbuilder` (F6: build an environment, then find the reward hack)
`src` JSON: `{tape, grader_options: [{id, label, patch}], sandbox_options: [{id, label, patch}], trials}`.
The tape's scripted policy tries hacks (A9: delete a test marker; write a
special-cased answer; read a hidden answers file in `outside`).
- **Build**: one select for the grader (for example `the policy says it is
  done`, `run the tests in the workspace`, `run the original tests
  (pristine)`, `run hidden tests`), and toggles for the sandbox (`no network`,
  `confine files to the workspace`). Each option is a tape or board patch.
- **Run the policy** (primary): `runEval` over `trials` seeds, with two
  readouts: the **reward** (what the chosen grader said: its pass count) and
  the **truth** (`run_end.passed`, the tape's own checks). A gap between them
  is a reward hack: `The grader rewarded 18 runs; 6 really solved the task.
  The policy found a way to pass the grader.` The trial panel names the hack
  a run used (from its events: a test edit, a read outside the workspace).
- Evidence: `{grader, sandbox, reward, truth, trials}`. Values: `reward`,
  `truth`.

## 3. `hx-topology` (F1: five shapes, and what each costs)
`src` JSON: `{topologies: [{id, name, diagram, cost, wall_clock, failure_modes: [..]}], task: {...}, note}`.
- Five topologies (single agent; orchestrator and workers; a pipeline;
  generator and evaluator in a loop; peers on a shared board), each drawn as
  a small diagram with marks plus words, one select to choose.
- Readouts for the chosen shape on the demo task: relative cost and wall
  clock against the single agent, as the course's model (labelled), and its
  failure modes as a list.
- **Isolated or forked** (F1.o3): one toggle that runs the demo sub-agent
  tape (A14.1) on the `isolated` and `forked` boards and shows the
  sub-agent's input tokens for each, from the run.
- Evidence: `{topology, context}`. Values: `cost_ratio`, `time_ratio`.

## Ownership
Per lab: `site/assets/components/hx-<name>.{js,css}`,
`site/assets/components/test/labs8.test.mjs`, `site/labs/<name>.html`,
`site/labs/data/<name>-*.json` (demo tapes copied from or modelled on the
engine fixtures, under `site/labs/data/`). The registry, gen_data and
accepted-labs are mine.

## Acceptance (quote final lines)
```
node --test "site/assets/components/test/*.test.mjs"
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --only labs/shift.html labs/envbuilder.html labs/topology.html --out <your scratch>/qa
```
QA 0 failures with self-tests counted; every state viewed at 375 and 1280 in
both themes, listed.

## Report
Files; checks and final lines; sizes; UI copy beyond the strings above; demo
data and the numbers it gives; deviations; open doubts. Don't commit.
