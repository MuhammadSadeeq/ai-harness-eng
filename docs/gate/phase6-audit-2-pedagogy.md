# Phase 6 audit 2: sequencing and pedagogy (BP-6.0 section 2)

Reviewer: hx-reviewer audit 2. Audited commit 0fef4ca, worktree `scratchpad/audit-2` (clean, read-only use). Scratch: `scratchpad/audit-scratch-2`. No project file was edited, created, deleted or committed. Paths below are relative to the worktree root.

Summary of counts: 1 blocker, 10 major, 13 minor groups (see the list). Most important finding: an objective (I5.o2) cannot be earned at all, so Interview Room (I5) and Part I can never show as done (course.json:4092, site/modules/interview-room.html:76).

## Findings, ranked

### Blocker

- [blocker] course.json:4092 and site/modules/interview-room.html:76 — "Solve timed coding katas from memory" (I5.o2) has no path that credits it, so I5 can never reach status `done` and Part I can never show `done`. The I5 page has only `hx-cards` and `hx-say` (no kata). The two katas whose metadata names I5.o2 (katas/I5-pass-k/meta.yaml, katas/I5-trace-writer/meta.yaml) are not placed on any page; they appear only in the on-call memory list (site/data/oncall/shift.json). The shift mounts them as `element("hx-kata", { kata, mode: "memory" })` with no `data-objective` (site/assets/core/shell/shift.js:203), and the shift records its own evidence with `objectives: []` (shift.js:225). `hx-element.js:114` takes the element's own `data-objective` as the default, so the kata credits nothing. Done-ness needs every objective seen (site/assets/core/shell/progress.js:29-32), and Part I is done only when all its modules are done (site/assets/core/shell/pure.js:14-20). Evidence: credit table (scratch/credit-table.txt) lists 270 of 271 objectives with a success path and I5.o2 with none; grep of all pages for `hx-kata` with I5.o2 returns nothing. Suggested fix: put `<hx-kata kata="I5-pass-k" mode="memory" data-objective="I5.o2">` (and the trace-writer kata) on the I5 page, and have the shift's kata drill pass the kata's objectives; or reword I5.o2 if it cannot be earned.

### Major

- [major] site/assets/components/hx-incident.js:190 and :207 — a hunt credits its objective when the learner commits a fix, right or wrong. `finish()` runs after any fix pick (line 190), and the evidence call (line 207) passes no objective list, so the element's `data-objective` is used even when `fix_ok`, `family_ok` and `wire_ok` are all false. COMPONENTS.md section 5 says only success credits an objective and names "a correct incident hunt". Evidence: real-input probe, `scratch/probe-credit.mjs` (output `scratch/probe-credit.txt`). On site/modules/the-api-call-on-the-wire.html I answered the prediction, tapped row 0 (wrong), then row 7 (found), picked the wrong family (retry-storm), the wrong wire (control) and the wrong fix (1; the right one is 0), and committed the fix. The page showed "That fix does not stop it. The one that works is marked." (`scratch/probe1-wrong-hunt.png`). The stored progress has one `incident` entry: `objectives: ["A4.o3"]`, `detail: {wrong_taps: 1, fix_ok: false, family_ok: false, wire_ok: false}`. The same applies to every hx-incident credit (52 objective credits across the course, Breaks included). Suggested fix: pass `[]` unless `fixOk && family right && wire right`, as hx-kata already does (site/assets/components/hx-kata.js:516, `allPass ? null : []`).

- [major] site/assets/components/hx-cards.js:185 — a card review credits no objective. The component's evidence call passes no list, so it falls back to the element's `data-objective`; none of the 70 pages sets one on `hx-cards` (grep of `<hx-cards` finds only the `src` attribute). hx-cards.js never reads the `objective:` field that content/*/cards.yaml carries (e.g. content/B4/cards.yaml:21). COMPONENTS.md section 5 says card reviews credit ("Bench runs and card reviews credit as they are"). Evidence: real-input probe on site/modules/the-api-call-on-the-wire.html (line 254): seven cards reviewed with Show, Got it, Next; stored entry `kind: "cards", objectives: [], detail: {src: "A4", reviewed: 7, right: 7}` (`scratch/probe-credit.txt`). Suggested fix: as hx-say does (site/assets/components/hx-say.js:148, per-item `item.objectives`), pass each reviewed card's objective from cards.yaml.

- [major] site/assets/core/shell/shift.js:91 — the on-call shift for a learner with nothing done draws incidents from the whole course, including modules not yet reached. `pool()` falls back to `scope: "course"` when no done module matches. CURRICULUM.md:103-105 says the shift mixes "an incident from any family seen so far". Evidence: replay of the real `pickShift` (site/assets/core/shell/shift.js:87) for 2026-10-11 to 17 (`scratch/week-shifts.txt`): day 1 C6 retry-storm, day 2 D3, day 3 A6, day 4 C3, day 5 H7 retry-storm plus the I5-pass-k kata, day 6 A3, day 7 F6 reward-hack. Suggested fix: draw from modules the learner has started or finished (status `started` or `done`), never from modules beyond the first unfinished one.

- [major] site/assets/core/shell/shift.js:87-101 — the incident pool narrows to finished modules, so variety drops as the learner progresses, and hunted incidents come back. `pickShift` never uses `unhuntedIncidents` (shift.js:69, which only stations.js uses). Evidence (`scratch/week-shifts.txt`): with only S0 done, the S0 "false-done" incident is the shift on all seven days, including after it has been hunted. With the first six path modules done, the 28-day replay has 6 distinct incident modules, 4 wires, and 18 of 28 days repeat a module from the previous seven days. This is the opposite of the interleaving CURRICULUM.md:103-105 asks for. Suggested fix: pick from the seen modules' incidents not yet hunted, and mix wires across the seen set (round-robin by module or wire) instead of indexing one pool by the day's seed.

- [major] site/assets/components/lib/leitner.js:56-57 and site/assets/components/hx-say.js:40 — new cards and new say prompts come in course order, so a new learner's first sessions are module-blocked. `sessionQueue` takes fresh cards in board order, and `bankOrder` takes fresh prompts in bank order. Evidence: the first 20 fresh cards of site/data/cards/board.json are S0 x8, A1 x8, A2 x4 (wires verify and context only); the say bank starts S0, S0, A1, A1, A2, A2 (checked with the same data). CURRICULUM.md:103-105 says "the due cards across wires". Suggested fix: shuffle fresh cards and prompts with a seed (for example the day's `seedOf`), or interleave by module.

- [major] tools/check_content.py:236 — the B7 term-order check skips every `hx-*` element and pre/code, so a strict term used inside a check, incident, lab, bench, kata or say prompt is never checked. Evidence: the checker's own logic, with the `hx-*` skip removed (`scratch/strict_terms.py`), finds 23 strict-term uses before their owner, all inside `hx-*` (`scratch/strict-early.json`). The real ones are listed in the forward-reference findings below. The official checker passes the affected pages: `tools/check_content.py` over all 70 pages prints "70 pages OK" (`scratch/check-content-all.txt`), and four affected pages pass on their own. CURRICULUM.md:113-116 says "A module may use a term only if it owns it or the owner is one of its ancestors", and that the checker enforces this. Suggested fix: keep the skip for pre/code and for `.fwd` spans, but scan the static fallback text inside `hx-*` components.

- [major] site/modules/many-agents.html:135-137 — F1's check introduces "generator" and "evaluator", which F2 owns (course.json, F2 is after F1). No F1 beat uses either word except the check and its option ("The evaluator approves its own style of work", line 137). The check is the first place the learner meets the pattern. Evidence: grep of the F1 page; strict scan (`scratch/strict-early.json`, page many-agents, line 135). Suggested fix: move the check to F2, or introduce the roles in See with `<span class="fwd" data-term="generator">` (AUTHORING.md section 5 allows at most two forward references per module).

- [major] site/modules/reasoning-and-effort.html:135 and site/assets/components/hx-costcalc.js:16 — the A6 cost calculator has a "Cache hit rate (%)" knob. "Cache hit" is owned by C4 (prompt caching, later on the path), A6's only prerequisite is A4, and A6 never explains the knob (the only A6 mention is the fallback sentence at line 135). A learner adjusts a cost control with no meaning given. Evidence: `scratch/strict-early.json` (page reasoning-and-effort, hx-costcalc, line 135) and course.json A6 prereqs. Suggested fix: explain the knob in one clause at first use (a `fwd` span), or move the cost calculator to C4.

- [major] site/modules/model-migrations.html:104 (Break) — F7's incident uses "permanent error", owned by C6 (errors-and-recovery), and C6 is not in F7's declared prerequisites (F7 prereqs are D3 and A6, course.json:2841 block). A Break that depends on an unlisted prerequisite is one of the checks the brief names. Evidence: `scratch/break-fwd.json` (module F7, strict hit), `scratch/strict-early.json`. Suggested fix: add C6 to F7's prerequisites, or define "permanent error" in the Break.

- [major] 13 misconceptions are not confronted on their own page (CURRICULUM.md:106-108 requires "confronted, not just corrected", and wrong options written from the module's list). For each, the module's beats contain no sentence that names or refutes the belief (`scratch/misc-weak.txt`, `scratch/misc_grep.py`, `scratch/misc_grep2.py`). Listed by course.json line of the misconception:
  - C4 k2 "Caching changes the model's answers." (course.json:1514). The page covers cost only (prompt-caching.html).
  - C7 k0 "More tools make the agent more capable." (course.json:1727). Not on the page; C8 has a related point.
  - C7 k2 "Tool output should be complete." (course.json:1729). The word "output" does not appear in the C7 beats; the cut-output answer is in C2 and H6.
  - C9 k2 "Permissions replace a sandbox." (course.json:1873). The word "sandbox" does not appear in the C9 beats; C10 covers it.
  - D3 k2 "Once an eval is written, it stays valid." (course.json:2289). Not on the page.
  - F6 k1 "More tasks fix a weak grader." (course.json:2816). Not on the page.
  - F7 k2 "Prompts tuned for one model transfer unchanged." (course.json:2883). Only "a new model is a new set of rules" (F7 k0) is close.
  - T5 k0 "A 200 status means the whole stream succeeded." (course.json:4376). The status table has no stream-failure case (see F7 k1 for the refusal case).
  - T7 k0 "Containers are virtual machines." (course.json:4464). The primer does not say so; C10 does.
  - T9 k0 "Killing the parent kills the children." (course.json:4552). Not on the page.
  - T10 k0 "Threads make Python code run in parallel." (course.json:4594). Not on the page.
  - A3 k2 "Resending history is free." (course.json:714). A3 says the history is resent, not that it costs.
  - A5 k2 "If parsing fails, the harness should crash." (course.json:858). No sentence about parse failure handling on the page.
  Suggested fix: for each, add a tempting wrong option with its reason in a check or card, or a sentence in See.

### Minor

- [minor] site/modules/tokens-and-the-window.html:169, :170, :180 — the A2 check's answer options use stop-reason values owned by A4 (end_turn, max_tokens) and B1 (tool_use). A2 explains max_tokens in the See beat; end_turn and tool_use are never explained before their owners. Suggested fix: explain or drop the two options.
- [minor] site/modules/the-api-call-on-the-wire.html:128 (A4 check, "tool definitions", owned by B1) and :106 (A4 Break, `run_command`, owned by H3, 21 modules later). Suggested fix: use "the tools" in the check; use a neutral tool name in the Break.
- [minor] site/modules/tools-give-the-model-hands.html:186 — B1 check distractor "A higher turn limit" uses a B2 term before B2. Suggested fix: write "a larger budget", or move the item to B2.
- [minor] site/modules/rein-1-talk-to-a-model.html:149 (tool_use, owned by B1, not a prerequisite of H1) and :93 (run_command, owned by H3). Suggested fix: as above.
- [minor] site/modules/what-a-harness-is.html:102 — B3 Break uses "output cap" (owned by C2, later); A2 calls the same thing "output limit". Suggested fix: use "output limit" here.
- [minor] site/modules/rein-extensions.html:148 — H13 check asks "What goes on the brag sheet?" before I2 (which owns and defines it) on the path. Suggested fix: define in one clause, or move the item to I2.
- [minor] site/modules/the-job-map.html:121 (C6 terms "exponential backoff" and "rate limit"; I1 prereqs are B4 only) and :140 ("write-up", owned by I3, later). Suggested fix: add C6 to I1 prerequisites or drop the phrases; define "write-up".
- [minor] closure-only uses (owner earlier on the path but not a declared prerequisite; the rule still forbids them): site/modules/rein-setup.html:152 ("token", A1); site/modules/context-budget.html:130 ("rules file", C1); site/modules/errors-and-recovery.html:188 and site/modules/tool-design.html:95 ("final status", C5); site/modules/git-primer.html:131 ("conversation history", A3). Suggested fix: declare the prerequisite or reword.
- [minor] site/modules/rein-setup.html:91 ("checkpoint", a Rein step check) and site/modules/errors-and-recovery.html:171 ("retry policies") reuse the words of two owned terms with other senses (F5 checkpoint; F6 policy). Suggested fix: rename the Rein or retry uses, or note the sense.
- [minor] site/modules/linux-processes.html:166 — the memory-mode kata element credits only T9.o2, while the same kata's metadata (katas/T9-procs/meta.yaml) lists T9.o1 to T9.o3 and the normal-mode element (line 146) credits all three. Display and credit disagree in memory mode. Suggested fix: match the element to its metadata.
- [minor] katas/lab-turn-limit/meta.yaml:1 — kata metadata with `module: null` and no objectives, placed on no page. Dead content. Suggested fix: delete it or place it.
- [minor] site/assets/components/hx-replay.js:230 — a replay credits its objectives on every finish, whatever `passed` says (`passed` is recorded but not gated). COMPONENTS.md section 5 does not list replays among crediting events, so the rule is unclear. Suggested fix: decide the rule in COMPONENTS.md, then gate on it.
- [minor] 42 misconceptions are addressed only by the module's topic: no sentence names or refutes the belief, but the content teaches the opposite. Examples: S0 k2, A1 k1, A2 k1, A2 k2, B2 k1, B2 k2, C4 k0, C5 k0, C5 k1, C5 k2, C6 k0, C6 k2, C9 k0, C10 k2, C11 k2, D3 k1, E2 k1, F2 k0, F2 k1, F3 k1, F3 k2, F4 k1, F6 k2, G2 k0, G2 k1, G4 k0, G4 k1, H4 k0, H5 k0, H8 k0, I4 k1, I5 k0, I5 k1, T2 k0, T3 k0, T6 k0, T8 k0, A4 k0, A5 k1, A6 k2, A7 k1, C1 k1. Suggested fix (optional): one sentence that names the belief.

## Coverage (checked and found clean, or measured)

- Prerequisite order: all 60 path modules; every prerequisite is an earlier path module (0 violations). The 10 primers (T1 to T10) are off-path, each has a page, and each is used by a path module (scratch/prereq-check.txt). All 70 pages exist. Each of the 336 terms has exactly one owner.
- Term first use in prose (beats outside components): 0 strict-term uses before their owner. Inside components: 23, see the checker finding above (scratch/strict-early.json). Everyday words listed as non-strict were checked only where they are tagged, as AUTHORING section 5 says.
- Break scan: all 60 Break beats were scanned for course terms owned outside the prerequisite closure (scratch/break-fwd.json). Strict hits: A4 (run_command), B3 (output cap), F7 (permanent error). The other hits are everyday words (ask, task, turn, event, request, eval) and are incidental.
- Objectives: 271 in course.json. 270 have a success-based credit path (component `data-objective`, or say.yaml objectives for hx-say). I5.o2 has none. No objective is credited by a `mode="predict"` check (46 prediction items carry an objective in checks.yaml but no data-objective, as intended). All 305 non-prediction hx-check elements match their checks.yaml objective. Of 66 hx-kata elements, one mismatch (T9, minor above). Card reviews are not a credit path at all (major above).
- Five-beat structure, all 70 pages: beat order matches each module's kind (course.json kinds); the law paragraph matches course.json (the C11 apparent mismatch is only the `&ldquo;` entity, not a finding); 6 to 9 cards on core, concept and build pages; 2 or more say prompts (I5 has 16); bench trials are 20 wherever a bench appears; a portfolio aside is present on every core, concept, build and primer page and absent only on H0 and H13 (guides) and I5 (career). Prose is under 900 words on all pages (the checker's count: max 894; scratch/check-content-all.txt).
- Five-beat quality, 14 sampled pages (brief said 12; two per part A to F is 12, plus one primer and one build step is 14): A4 (core), A6 (concept), B2 (core), B4 (concept), C5 (core), C9 (core), D1 (core), D3 (core), E1 (core), E2 (core), F1 (core), F3 (concept), T5 (primer), H9 (build). Each Break has a predict check before its replay or incident (13 of 13 Breaks; T5 has no Break, as a primer should not). The post-replay text is two to three sentences once the figure caption is set aside. Where a Prove beat exists it runs 20 seeded trials and has the scripted-run sentence (read in full on A4, B2, C5, C9, D1, D3, E1). The defects I found on these pages are A4 (run_command in the Break), F1 (the check's new terms), A6 (the cache knob) and F7's Break prerequisite.
- Misconceptions: 152 in course.json. 97 are confronted by a sentence that refutes the belief, a "wrong idea" line, or a tempting wrong option in a check or Break. 42 are addressed only by the topic (listed above). 13 are not confronted on their page (listed above). The split is my reading of quoted sentences (scratch/misc.json, scratch/misc-weak.txt, scratch/misc_grep*.py), and the uncertain calls are the ones most likely to move.
- Interleaving: the on-call shift (replayed with the real pickShift), the board order and the say bank order were all checked. Results are in the findings above and in scratch/week-shifts.txt.

## Week of shifts from the seeded order (real pickShift, Node, pure function)

Learner with nothing done (scope "course"):

| day | scope | incident (module, family, wire) | drill |
|---|---|---|---|
| 2026-10-11 | course | C6 retry-storm [errors] | kata T7-docker-args (T7) |
| 2026-10-12 | course | D3 reviewer-rubber-stamp [verify] | say A5 |
| 2026-10-13 | course | A6 effort-mismatch [loop] | kata T1-dataclass (T1) |
| 2026-10-14 | course | C3 compaction-amnesia [context] | say G4 |
| 2026-10-15 | course | H7 retry-storm [errors] | kata I5-pass-k (I5) |
| 2026-10-16 | course | A3 forgetful-harness [context] | say C10 |
| 2026-10-17 | course | F6 reward-hack [verify] | kata G4-entropy (G4) |

Learner who has finished only S0 (scope "done"): the S0 false-done incident on all seven days, with say S0 on even days.

Learner who has finished the first six path modules (S0, A1 to A5): over 28 days, 6 distinct incident modules, 4 wires, and 18 of 28 days repeat a module already seen in the previous 7 days.

## Limits

- Browser: two real-input probes, both on site/modules/the-api-call-on-the-wire.html (wrong hunt; card review), with the stored evidence read from localStorage. I did not run tools/qa/run.mjs (section 3's job), nor probe seeds, reload, keyboard, reduced motion, or the no-JavaScript fallback. The on-call page was not clicked; its shift logic was replayed with the real pure function in Node. The Interview Room katas were not run in Pyodide, so their test strength is outside this section.
- Not checked here: factual claims (section 1), and whether checkers catch broken inputs (section 5). tools/check_content.py was run only as a pass/fail baseline.
- Misconception verdicts are a reading-based judgment (see the Coverage note). The 13 "not confronted" calls were checked against the raw page text, including code blocks.
- Five-beat review judged structure and job-fit on 14 pages. It did not judge prose quality.
- Nothing was edited, created, deleted or committed in either worktree or the main tree. The probe server was started and stopped in the same command. No action was denied. The audit worktree's `git status` shows only the pre-existing `.venv` and `node_modules` symlinks.

## Summary (3 lines)

1 blocker, 10 major, 13 minor groups (42 implicit misconceptions and 13 unconfronted ones sit inside the groups above).
Most important: I5.o2 cannot be earned, so Interview Room (I5) and Part I can never show done (course.json:4092; site/modules/interview-room.html:76).
Also confirmed with real clicks: a wrong incident hunt credits its objective (site/assets/components/hx-incident.js:207), and a card review credits none (site/assets/components/hx-cards.js:185).
