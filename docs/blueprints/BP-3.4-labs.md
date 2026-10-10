# BLUEPRINT BP-3.4-labs: wave 3.4 labs: `hx-scheduler`, `hx-gatekeeper`, `hx-bugcatch`

Phase 3, wave 3.4 platform. Builder rules: `.claude/agents/hx-builder.md`. You
never commit. These labs serve C7, C9 and C11; their module builders write the
data that feeds them.

## Read first
`docs/COMPONENTS.md` (all), `docs/DESIGN.md` §7.5–§7.7, §7.9, §7.10, §8, §9,
§11, `docs/ENGINE.md` §7.5 (permissions, decision order) and amendments A2
(the simulated human) and A9, `site/assets/components/lib/{hx-element,data,format}.js`,
`site/assets/sim/index.js` (the exports: `decidePermission` arrives with the
JS builder's A9 work; use it, never a copy), your accepted labs (`hx-sort`,
`hx-stack`, `hx-outage`: patterns), and the facts `mcp.annotation-*`,
`mcp.annotations-hints`, `mcp.annotations-untrusted-tools`.

## Shared rules
As BP-3.3: illustrative numbers labelled; seeded draws with `seed` and
`New seed`; charts at measured width; nothing under 14 px; marks plus words;
reduced motion: no tweening; `selfTest()` drives the real UI; a demo page and
one demo data file; module + CSS ≤ 40 KB; values protocol. **One clear control
per thing**: no grids of equal-weight buttons (the desk and cache line lesson);
the main action is visibly primary.

## 1. `hx-scheduler` (C7.o5: batch tool calls into safe rounds)
`src` JSON: `{calls: [{id, tool, label, reads: [resource], writes: [resource], ms, annotations?: {readOnlyHint?, destructiveHint?, idempotentHint?, openWorldHint?}}], note?}`.
- The calls start in one column in the model's order. The learner puts each
  call in a round (a `Round` select per call, rounds 1–N, plus `New round`),
  so it works by keys and touch alike.
- Rules, checked live: two calls conflict when one writes a resource the
  other reads or writes. Calls in one round run in parallel; rounds run in
  order. A conflict in a round is marked on both calls, with the reason in
  words (`edit_file writes calc.py while run_command reads it: the test may run before the edit`).
- Readouts: time for the plan (sum of each round's longest call) against one
  call at a time, and the conflicts left. `Check my plan` says whether the plan
  is safe and how much time it saves.
- Each call shows its annotations as badges with words (`read-only`,
  `destructive`, `idempotent`, `open world`); a line under the figure cites
  `mcp.annotations-hints`: annotations are hints, so the plan uses the real
  reads and writes, not the badges.
- Evidence on `Check my plan`: `{safe, saved_ms, rounds}`. Values: `saved_ms`,
  `conflicts` (read-only).

## 2. `hx-gatekeeper` (C9: allow, ask, deny under pressure)
`src` JSON: `{calls: [{id, tool, input, risk: "safe" | "risky" | "dangerous", why}], human?: {fatigue: {after, approve_percent}}, rules_templates: [...], pace_ms?}`.
- **Round 1, by hand.** Calls arrive one at a time (every `pace_ms`, default
  4,000, with a visible countdown that can be paused or switched off: WCAG
  timing adjustable). For each, the learner picks `Allow`, `Ask` or `Deny`.
  `Ask` goes to the simulated human (ENGINE A2, seeded): after `after` asks it
  approves `approve_percent` of the time without looking. A fatigue meter
  shows asks so far against `after`, in words and a bar.
- **The replay.** After the stream: each call with what happened (ran, denied,
  approved by a tired human), and the dangerous ones that got through, each
  with its `why`.
- **Round 2, by rule.** The learner builds a policy from `rules_templates`
  (deny / ask / allow, tool, an input glob; reasons required) and the mode's
  default, then `Run the stream` replays the same calls through the
  simulator's `decidePermission` (decision order deny, ask, allow, default:
  ENGINE §7.5; never a copy). Readouts for both rounds side by side: asks,
  dangerous calls through, safe calls blocked.
- A line under the figure: `The course's model of a tired reviewer, not a measurement.`
- Evidence after each round: `{round, asks, dangerous_through, safe_blocked}`.
  Values: `asks`, `dangerous_through` (read-only).

## 3. `hx-bugcatch` (C11: which checks catch which bugs)
`src` JSON: `{bugs: [{id, label, detail}], checks: [{id, label, kind: "guide" | "sensor", cost}], catches: {<bug id>: [<check id>]}, budget}`.
- A grid of bugs (rows) by checks (columns). **Predict:** the learner marks
  the cells they think catch each bug (one tap per cell; a cell is a toggle
  with words, `catches` / `misses`), then `Reveal` shows the real answers from
  `catches` with each bug's `detail`, and marks right and wrong predictions.
- **Choose under a budget:** each check has a `cost`; the learner picks checks
  within `budget` and sees which bugs are still uncaught. Guides (steer
  before the work) and sensors (check after it) are labelled by `kind`
  (C11.o3).
- The demo includes self-report (`the model says it is done`), unit tests,
  a type check, an independent reviewer that sees the task and the diff, and
  tests from a pristine copy; bugs include a test edited to pass, a special-
  cased answer and a wrong type. Illustrative: label it.
- On phones the grid becomes one card per bug with its checks as toggles.
- Evidence on `Reveal` and on a budget choice: `{right, total}` /
  `{caught, budget}`. Values: `caught` (read-only).

## Acceptance (quote final lines)
```
node --test "site/assets/components/test/*.test.mjs"
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --only labs/scheduler.html labs/gatekeeper.html labs/bugcatch.html --out <your scratch>/qa
```
QA 0 failures with self-tests counted. View every state at 375 and 1280, both
themes, and list what you viewed.

## Report
Files; checks and final lines; sizes; UI copy beyond the strings above; demo
data; model choices; deviations; open doubts. Don't commit.
