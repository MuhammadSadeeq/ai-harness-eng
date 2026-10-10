# BLUEPRINT BP-5.1-design-room: `hx-design`, the Design Room

Career-track platform, built ahead of its content (PLAN: platform before
content). It serves I5.o3 ("run a system design answer with the eight-wire
checklist, including cost, risks and rollout") and SPEC Appendix D (6+ Design
Room prompts, each with clarifying questions, a wire-by-wire model answer,
named cheating risks, cost and rollout). Builder rules:
`.claude/agents/hx-builder.md`. You never commit.

## Read first
`docs/COMPONENTS.md` (all; §5 success-only credit and state in the store,
§11 `src`, §12 shared wording), `docs/DESIGN.md` §7 (components), §8, §9, §11,
SPEC §6.3 (`hx-design`, `hx-say`) and Appendix D, `site/assets/components/hx-say.js`
and its CSS (the closest pattern: a prompt, a timer you run yourself, a model
answer, a rubric self-grade, "Last time"), `lib/{hx-element,data,format,restore}.js`,
`site/assets/core/store.js` (drafts and results live there), and the wires in
`site/data/course-core.json` (`id`, `short`, `name`, `question`, `law`).

## Data (`src`: a module id, read with `getContent("design", id)`, or a demo `.json` path)
```json
{"prompts": [{
  "id": "ci-fixer",
  "objectives": ["I5.o3"],
  "title": "An agent that fixes failing CI",
  "prompt": "Design an agent that picks up a failing CI run on a team's repository and opens a pull request that fixes it.",
  "minutes": 25,
  "clarify": ["Which repositories and languages?", "..."],
  "wires": {"control": {"answer": "...", "points": ["...", "..."]}, "...": {}},
  "risks": {"answer": "...", "points": ["..."]},
  "cost": {"answer": "...", "points": ["..."]},
  "rollout": {"answer": "...", "points": ["..."]}
}]}
```
- `wires` has all eight wire ids (course-core order); each `answer` 40–90
  words, 2–4 `points` (checkable, one idea each). `clarify` 3–6 questions.
  `risks`, `cost`, `rollout` each an answer and 2–4 points. `minutes` 10–45.
  A `checkDesign(item)` export throws with the first problem (as `checkSay`).

## The room, in order (one prompt at a time; `Previous` / `Next` when there are several)
1. **The prompt** with its title and `minutes`. A timer you start yourself
   (`Start`, `Pause`, and off by default: WCAG timing adjustable). When the
   time passes, say `Time is up. Finish your thought, then reveal.`; nothing
   stops or locks.
2. **Clarify.** One text box: `What would you ask before you design?`
3. **The design.** The eight wires in turn order, each a toggle with its `short` name
   and its `question` (`aria-pressed`, a mark plus the word `in the design`).
   Switching a wire on opens its note field (`What does this wire do in this
   system?`). This is the canvas: the SPEC's "drag wire modules into a design"
   becomes toggles plus notes, so keys and touch work alike and there is one
   clear control per wire (D-054). Then three fields: `Risks: how could it
   cheat or fail?`, `Cost`, `Rollout`.
4. **Reveal** (the primary action, enabled any time). Shows, for each part,
   the learner's text beside the model answer (stacked below 700 px), and the
   part's points as checkboxes, `I covered this`. The clarifying questions
   show as a list with the same checkboxes. A wire the learner left out shows
   its model answer with the line `You left this wire out.`
5. **Self-grade.** `Save my grade` records the ticks:
   `You covered <ticked> of <total>.` and `Last time: …` as `hx-say` does.
   `Try again` clears the ticks and the reveal and keeps the drafts.

## State, evidence, values
- Drafts (clarify, notes, toggles, the three fields) are saved per prompt in
  the store as the learner types (debounced), and restored on load. Restoring
  never emits evidence (COMPONENTS §5).
- Evidence on `Save my grade`: `"design"`, `{item, ticked, total, wires_in, seconds}`
  with the prompt's `objectives` (credit is success-only: the evidence carries
  the numbers; the store decides).
- Values: `ticked`, `total` (read-only).

## Shared rules
As BP-3.4-labs: nothing under 14 px; marks plus words; reduced motion means
no tweening; `selfTest()` drives the real UI (start the timer, write a note,
toggle a wire, reveal, tick, save, check the line and the evidence, then
restore); a demo page `site/labs/design.html` with one demo data file
`site/labs/data/design-demo.json`; module plus CSS ≤ 40 KB; the primary action
visibly primary. Text fields: visible labels, at least 44 px targets, and no
character limits shown as errors.

## Demo data
One complete prompt, `ci-fixer` above, written to the course's standard: the
eight wires as the course teaches them (read the wire definitions in
`course-core.json`; Control holds the system prompt and project rules,
Verification the gate on done claims, Permissions allow/ask/deny and the
sandbox, and so on), cheating risks such as a test edited to pass and a
special-cased answer, cost as tokens per run times runs per day with the
model's price named as a variable (no product numbers without a fact), and a
rollout that starts read-only with a human approving every pull request. No
product claims; the content is principles. Short sentences, the course voice.

## Ownership
`site/assets/components/hx-design.js`, `hx-design.css`,
`site/assets/components/test/design.test.mjs`, `site/labs/design.html`,
`site/labs/data/design-demo.json`. Nothing else (the registry, gen_data and
accepted-labs are the director's).

## Acceptance (quote final lines)
```
node --test "site/assets/components/test/*.test.mjs"
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --only labs/design.html --out <your scratch>/qa
```
QA 0 failures with the self-test counted. View every state (prompt, timer
running, a wire on with a note, reveal, saved grade, reload with drafts
restored) at 375 and 1280 in both themes, and list what you viewed.

## Report
Files; checks and final lines; sizes; UI copy beyond the strings above; the
demo data's word counts per part; deviations; open doubts. Don't commit.
