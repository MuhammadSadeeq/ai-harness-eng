# BLUEPRINT BP-5.4-interview-room: I5, the question bank, the Design Room prompts, the on-call shift

Phase 5. Builder rules: `.claude/agents/hx-builder.md`. You never commit.
Gate: SPEC Appendix D (career-track gate list) and §6.4 (the daily on-call
shift).

## Read first
SPEC §6.3 (`hx-say`, `hx-design`), §6.4, Appendix D; `course.json` I5
(objectives I5.o1–o5) and the eight wires; `docs/AUTHORING.md` (career kind:
See, Do, Keep; §10 say prompts and rubrics); `docs/COMPONENTS.md`;
`hx-say.js`, `hx-design.js`, `hx-kata.js`, `hx-incident.js`, `hx-cards.js`
(the board), `lib/readiness.js` (the brag sheet's evidence), the home page's
on-call card (`core/shell/home.js`); every module's `content/<ID>/say.yaml`
(80 prompts with rubrics today) and the D-054 Design Room.

## 1. The question bank (I5.o1)
- `gen_data` builds `site/data/say/bank.json` from every built module's
  say prompts plus `content/I5/say.yaml` (new prompts below), each tagged
  with its module, its wire (the module's wire, or `design`, `debugging`,
  `behavioral`) and its objectives. A prompt id stays the module's
  (`B2-s1`), so evidence from the bank and from the module page is the same
  item.
- `hx-say` gains `src="bank"` with a filter (all, one wire, design,
  debugging, behavioral) and Next: one prompt at a time, chosen in order
  from those not yet answered (then those answered longest ago), so a learner
  who returns sees new prompts first. Everything else in `hx-say` is as now.
- New prompts in `content/I5/say.yaml`, rubric 4–6 lines each: 6 design
  ("walk me through the harness for …"), 6 debugging ("this trace ends done
  and the checks fail: what do you look at first?"), 4 behavioral (a project,
  a failure, a disagreement, a measured result). With the modules' prompts
  the bank holds 40+ and covers every wire (Appendix D); a test counts it.

## 2. The Design Room prompts (I5.o3)
`content/I5/design.yaml` → `site/data/design/I5.json`: **six prompts**, each
with clarifying questions, a wire-by-wire model answer (all eight wires,
each with its decision and its trade-off), named cheating risks (for
example reward hacking in a grader, tests the agent can edit), cost and
latency, and a rollout (shadow, canary, the metric that stops it). Topics:
a coding agent for a monorepo; a customer-support agent with refunds; a
research agent with sub-agents; an on-call triage agent; an eval harness
for a model launch; a browser agent that handles a user's email. Product or
API claims are facts (`api.*`, `anthropic.*`, `harnesses.*`) or stay out.

## 3. The I5 page (`site/modules/interview-room.html`)
Career kind (See, Do, Keep). See: what each interview format tests (out
loud, system design, from-memory coding, trace debugging, behavioral, the
take-home), as the course's advice (no claims about named companies without
`careers.*` facts). Do, five stations, each one component at a time so the
page stays under its weight budget:
1. Out loud: `<hx-say src="bank">`.
2. Design: `<hx-design src="I5">`.
3. From memory: a list of the ten Appendix D katas (loop, tool validation,
   retries with a breaker, permission policy, compaction, trace writer,
   verification gate, eval runner, pass^k, idempotent retry: map each to
   its existing kata id, and say which is missing, if any); choosing one
   mounts `<hx-kata mode="memory">`.
4. Trace debugging: `<hx-incident>` on an incident the learner has not
   hunted yet (from built modules), with its time shown after the hunt.
5. Behavioral: two story outlines (situation, what you built, the number,
   what you would change), each linked to brag-sheet evidence from the
   readiness page; and the take-home template (a Markdown file to download:
   brief, constraints, results table, write-up outline).
Keep: cards and say as every module.

## 4. The daily on-call shift (§6.4)
`site/oncall.html` (generated chrome like the other top pages): about ten
minutes. One incident (built modules only, the day's pick from a seeded
order over the incidents the learner has unlocked: done modules first),
the board's due cards (`hx-cards` board), and one drill: a memory kata or a
say prompt, alternating by day. The page records a shift as evidence
(`kind: "shift"`, with what was done), and the home page's on-call card
links to it. No streaks that punish a missed day; say "Today's shift" and
what is left.

## Acceptance (quote final lines)
```
.venv/bin/python tools/gen_data.py --check && .venv/bin/python tools/gen_pages.py --check
.venv/bin/python tools/check_content.py && .venv/bin/python tools/check_facts.py
node --test "site/assets/**/test/*.test.mjs"
node tools/qa/run.mjs --only modules/interview-room.html oncall.html index.html --out <your scratch>/qa
```
Plus a test that the bank holds 40+ prompts and covers every wire, design,
debugging and behavioral. View both pages at 375 and 1280, with each
station open once.

## Report
Files; checks and final lines; prompt counts by tag; the kata mapping;
facts used and missing; open doubts. Don't commit.
