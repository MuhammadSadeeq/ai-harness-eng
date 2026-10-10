# BLUEPRINT BP-3.5-labs: wave 3.5 labs: `hx-evalbench`, `hx-escape`

Phase 3, wave 3.5 platform. They serve D1 and D3 (`hx-evalbench`) and E1 and
E2 (`hx-escape`). Both run the simulator's `runEval` (ENGINE A11.7–A11.8, from
the JS builder's A11 work: use it, never a copy). Builder rules:
`.claude/agents/hx-builder.md`. You never commit. Start only when I tell you
A11 is in (parity OK).

## Read first
`docs/COMPONENTS.md` (all), `docs/DESIGN.md` §7, §8, §9, §11, `docs/ENGINE.md`
A9, A11 (all) and §7.5–§7.7, `site/assets/components/lib/{hx-element,data,format,stats}.js`
(`wilson`, `percent`, `isPass`: a pass is a true done, D-045),
`site/assets/sim/index.js` (`runEval`, `loadTape`, `loadBoard`), and your
accepted labs `hx-bench` (old against new, the noise line), `hx-gatekeeper`
(rounds and readouts), `hx-sort` and `hx-stack` (patterns).

## Shared rules
As BP-3.4-labs: illustrative numbers labelled; seeded runs with a visible
seed; charts at measured width; nothing under 14 px; marks plus words;
reduced motion means no tweening; `selfTest()` drives the real UI; a demo page and
one demo data file each; module plus CSS ≤ 40 KB each; values protocol; one
clear control per thing, the main action visibly primary. Runs happen in
batches that yield to the page (no frozen tab): at most 50 runs per frame,
with a progress line in words.

## 1. `hx-evalbench` (D1, D3: assemble an eval, see its noise, trust its grader)
`src` JSON: `{eval: "<eval id>", boards: {old: "<board id>", new: "<board id>"}, start_tasks: [task ids], note?}`.
The eval and its tapes load from `site/data/evals/<id>.json` and
`site/data/scenarios/<tape>.json`; boards from `site/data/scenarios/boards/`.
- **Assemble.** The eval's tasks as a checklist (start with `start_tasks`,
  the hand-picked examples), the trials (a select: 1, 3, 5, 10, 20, 50), and
  the grader (`Code grader` / `Model grader`, the second only when the eval
  has a `model_grader`).
- **Run both boards** (primary). Readouts per board: pass rate as `<n> of
  <runs>` and a percent, its 95 % Wilson interval drawn as a bar on one shared
  0–100 % axis (both boards on the same axis), pass@k and pass^k as task
  counts with a one-line meaning each (`at least one of k trials passed` /
  `every one of k trials passed`), and cost.
- **The verdict line**, from the intervals: overlap gives `The intervals
  overlap: this eval can't tell the boards apart. Add tasks or trials.`;
  otherwise `<Board> is better: its interval sits above the other's.`
- **The grid.** Tasks (rows) by trials (columns), each cell a button with a
  mark and a word (`pass` / `fail`; with the model grader, both grades and a
  marked disagreement). A cell opens the trial: status in words
  (`lib/format.js`), the checks' verdict, the model grader's verdict, and the
  run's last reply text: where a grader passed work for the wrong reason,
  this is where the learner sees it (D3.o4).
- **Agreement** (model grader): `The model grader agreed with the code grader
  on <a> of <runs> trials. It passed <f> false dones.` A line under the
  figure: `The course's model of a judge, not a measurement.`
- Phones: the grid becomes one card per task with its trials as a row of
  cells; the interval bars stay on one axis.
- Evidence on each run: `{tasks, trials, grader, old: {pass, runs}, new: {pass, runs}, overlap}`.
  Values: `old_rate`, `new_rate` (percent, read-only).

## 2. `hx-escape` (E1, E2: red team, then blue team)
`src` JSON: `{tape: "<tape id>", trials, base_board: "<board id>", plants: [{id, label, where, patch}], defenses: [{id, label, leg, patch}], note?}`.
- `plants[].patch` is a tape patch: `{"custom_tools": {"<tool name>": {<fields>}}}`,
  each field replacing that tool's field (`results`, `description`,
  `version`): where the instruction hides (a page's body, a comment in the
  page, an email footer, a tool description from a new server version).
  `where` is the words for it.
- `defenses[].patch` is a board patch `{"modules": {...}}`: each module
  replaces the base board's, except `permissions.rules`, which concatenate in
  the order the defenses are listed (the mode stays the base board's).
  `leg` is one of `untrusted_content`, `private_data`, `exfiltration`
  (removes a leg), `wording` (a prompt defense) or `supply_chain`
  (`tool_pins`).
- **The trifecta.** The tape's custom tools with their `trifecta` labels,
  grouped under the three legs, each leg marked `open` or `cut` by the
  defenses on. A line says whether all three legs are open: `All three legs
  are open: an injection can steal data.` / `A leg is cut (<leg>): the attack
  has no way to finish.`
- **Red team.** Pick a plant (one select). Its text shows, with the planted
  instruction marked (mark plus words, `planted instruction`).
- **Blue team.** Defenses as toggles, each with its leg in words.
- **Replay the attack** (primary): `runEval` over `trials` seeds with the
  patched tape and board, graded `leaked` and `code`. Readouts: attack
  success rate (`<l> of <trials> runs leaked the secret`) and task success
  (`<p> of <trials> finished the task`), so cutting a leg the task needed
  shows its cost. Keep the last three replays in a small table (plant,
  defenses, leaked, finished) so wording against a cut leg compares at a
  glance.
- A line under the figure: `Seeded runs of the course's model: wording lowers
  the rate; only a cut leg stops the attack.`
- Evidence on each replay: `{plant, defenses, leaked, finished, trials}`.
  Values: `leaked`, `finished` (read-only).

## Demo data
`labs/data/evalbench-demo.json` points at a demo eval written for the lab
(`labs/data/evalbench-eval.json`): five tasks over existing tapes, trials up to 50, a model grader with a
false-pass percent that shows rubber-stamping. `labs/data/escape-demo.json`
uses `eng-inject` copied as a demo tape under `labs/data/` with three plants
and five defenses (one per leg, wording, pins). Illustrative: label it.

## Ownership
Per lab: `site/assets/components/hx-<name>.{js,css}`,
`site/assets/components/test/labs7.test.mjs`, `site/labs/<name>.html`,
`site/labs/data/<name>-demo.json` (plus the demo tape and eval files under
`site/labs/data/`). The registry, gen_data and accepted-labs are mine.

## Acceptance (quote final lines)
```
node --test "site/assets/components/test/*.test.mjs"
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --only labs/evalbench.html labs/escape.html --out <your scratch>/qa
```
QA 0 failures with self-tests counted. View every state at 375 and 1280, both
themes, and list what you viewed. Time the largest run the demo allows (every
task, 50 trials, both boards) and report it.

## Report
Files; checks and final lines; sizes; UI copy beyond the strings above; demo
data; model choices; deviations; open doubts. Don't commit.
