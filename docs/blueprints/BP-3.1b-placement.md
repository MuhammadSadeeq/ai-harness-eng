# BLUEPRINT BP-3.1b-placement: `hx-placement`, and board tags for A5–A7

Phase 3, wave 3.1 platform (S0). Builder rules: `.claude/agents/hx-builder.md`.
You never commit.

## Read first
`docs/COMPONENTS.md` (all), `docs/DESIGN.md` §7.5–§7.7, §8, §9, §11,
`site/assets/components/lib/{hx-element,data,format}.js`, the store
(`site/assets/core/store.js`) and the course map you built
(`site/assets/core/shell/*`), `course.json` (`parts`, `path`, module
prerequisites), the accepted `hx-check` (question patterns), and ENGINE
amendments A5.4, A6.4–A6.5 and A7 (board labels).

## 1. `hx-placement` (S0: "where should I start?")
A placement check that suggests a starting point. It is not a test: say so at
the top, `This is not a test you can fail. It only suggests where to start, and every module stays open.`
- `src` JSON (`content/S0/placement.yaml`, compiled by `gen_data` like other
  content kinds; you add the kind to `tools/gen_data.py` with a test):
  `{questions: [{id, part, question, options: [{text, right?}], why}], rules: [{part, skip_if_right: n, of: m, start: "<module id>"}], start: "<module id>"}`.
  `part` is a `course.json` part id. The S0 module builder writes the 15 real
  questions; you ship 6 demo ones (two parts) in
  `site/labs/data/placement-demo.json`, marked as a demo.
- One question at a time: `Question 3 of 15`, the options as a radio group,
  `Next` and `Back`, and `I don't know` (always offered; it counts as not
  right, without a mark). No timer. No right/wrong shown until the end.
- The result: per part, right of asked (marks plus words, a small bar), each
  question's `why` in a disclosure, and the suggestion: the first rule whose
  part has fewer than `skip_if_right` right decides the start; if every rule's
  part is passed, the last rule's `start` applies; with no rules, `start`.
  Show `Suggested start: <module title>` with a link to it, and the modules
  you may skip listed as `You may skip these; their checks are still there if you want proof.`
- Store: save the suggestion (`placement: {start, at, right}`) through the
  store API; the course map (yours) shows a `Suggested start` mark on that
  module. Nothing is locked or hidden.
- `Take it again` resets.
- Evidence: `this.evidence("placement", {start, right, total})` at the end.
- Values: `right`, `total` (read-only).

## 2. Board tags for the harness-bug and A6–A7 modules (`hx-clock`)
Add the board modules from ENGINE A5.4, A6.4, A6.5 and A7 to the clock's tag
map (`lib/board-tags.js` or wherever the clock maps board modules to wires),
with the wires and labels the amendments give: `history` (resend false) and
`first_block_only` on the loop wire; `compaction` and `cache` on the context
wire; `system_clock` on the context wire; `validate_inputs` and
`split_results` on the tools wire; `effort` on the control wire (`effort <L>`).
The bug modules (`history` with resend false, `first_block_only`,
`system_clock`, `split_results`) are drawn with the warning mark and the word
`bug` in their label's accessible name. Test the map.

## Acceptance (quote final lines)
```
node --test "site/assets/**/test/*.test.mjs"
.venv/bin/python -m pytest -q tools/tests
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --only labs/placement.html labs/clock.html --out <your scratch>/qa
```
QA 0 failures with self-tests counted. View at 375 and 1280, both themes.

## Report
Files; checks and final lines; sizes; UI copy beyond the strings above;
deviations; open doubts. Don't commit.
