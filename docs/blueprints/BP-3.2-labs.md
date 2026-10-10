# BLUEPRINT BP-3.2-labs: wave 3.2 labs: `hx-sort`, `hx-workbench`, `hx-costcalc`

Phase 3, wave 3.2 platform. Builder rules: `.claude/agents/hx-builder.md`. You
never commit. These labs serve B1, B3, B4, A6 and later G1–G3 and F4; their
module builders write the data that feeds them.

## Read first
`docs/COMPONENTS.md` (all), `docs/DESIGN.md` §7.5–§7.7, §7.9, §7.10, §8, §9,
§11, `site/assets/components/lib/{hx-element,data,format}.js`,
`site/assets/sim/index.js` (`runBench`, `loadTape`, `loadBoard`, `tokens`),
`facts/models.yaml` (prices: `models.*-price`, read from `site/data/facts.json`),
`site/assets/core/hx.css`, the accepted `hx-bench` (patterns for knobs, runs and
results).

## Shared rules
As BP-3.1-labs: illustrative numbers labelled; seeded draws; charts at measured
width; nothing under 14 px; marks plus words; reduced motion; `selfTest()`; a demo
page `site/labs/<name>.html`; module + CSS ≤ 40 KB; values protocol.

## 1. `hx-sort` (B3, B4, G1–G3: sort items into buckets)
`src` JSON: `{prompt, buckets: [{id, label, hint?}], items: [{id, text, bucket, why}]}`.
- Items start in a tray; the learner moves each into a bucket by drag **or** by
  focusing an item and choosing its bucket from a small menu (`Move to …`), so
  it works with keyboard and touch alike (no drag-only path).
- `Check` marks each item right or wrong with its `why`; wrong ones can be
  moved again and re-checked. `Show the answer` after one check.
- Evidence: `this.evidence("sort", {src, right, total})` on each check.
- Values: `right` (read-only).

## 2. `hx-workbench` (B1, C7: a tool is a user interface for a model)
A tool-definition editor whose quality changes how often a scripted model
misuses the tool, measured with Run ×20.
- `src` JSON: `{tool: {name, description, input_schema}, task, checks: [{id, label, test, weight}], base_misuse_percent, tape, old_board, new_board}`.
  `checks` are the course's rules for a good tool (for example "the
  description says when to use it", "every parameter is described", "the name
  says what it does"), each a simple test on the edited definition
  (`contains`, `min_length`, `has_description_for_every_property`).
- The learner edits the name, the description and the schema (a JSON editor
  with validation); a live checklist shows which rules hold (marks plus words).
- **Misuse rate** = `base_misuse_percent` minus the weights of the rules that
  hold (floor 2 %); `Run ×20` runs a bench whose tape branches on that percent
  (the component writes the percent into a copy of the tape's first `branch`
  step; the tape is the module builder's) and shows pass counts before and after
  the edit, with the honest sentence. Say on screen how the number is made:
  `The scripted model misuses a tool more when its definition breaks these rules. The rates are the course's model, not a measurement.`
- Evidence: `this.evidence("workbench", {rules_held, misuse_percent, passed})` on
  each run.
- Values: `misuse_percent` (read-only), `rules_held` (read-only).

## 3. `hx-costcalc` (A6, F4: cost per completed task)
- Inputs (each a stepper or select with readout): model (from the facts with a
  `value` of prices: `input_usd_per_mtok`, `output_usd_per_mtok`; names from the
  fact ids), effort (a multiplier table from `src` JSON, labelled as the
  course's illustration), turns per task, input and output tokens per turn,
  cache hit rate (0–90 %, using `models.cache-read-multiplier` where the model
  has it), and success rate (the share of tasks that finish).
- Readouts: cost per call, cost per task, **cost per completed task**
  (`cost per task / success rate`), and a one-line comparison when two
  configurations are pinned side by side (`Pin this` key, up to two pins).
- Every price shows its fact chip (`.fact` with the fact id); prices are never
  hard-coded.
- Evidence: `this.evidence("costcalc", {model, cost_per_completed_task})` when a
  pin is made.
- Values: `cost_per_task`, `cost_per_completed` (read-only, nano-units).

## Acceptance (quote final lines)
```
node --test "site/assets/components/test/*.test.mjs"
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --only labs/sort.html labs/workbench.html labs/costcalc.html
```
QA 0 failures with self-tests counted. View each at 375 and 1280, both themes.
Tell me which tags to register.

## Report
Files; checks and final lines; sizes; UI copy beyond the strings above; demo
data; deviations; open doubts. Don't commit.
