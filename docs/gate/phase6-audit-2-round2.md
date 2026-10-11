# Phase 6 round 2, audit 2 (sequencing and pedagogy)

Reviewer: hx-reviewer audit 2, round 2. Fixed commit 283d660, worktree `scratchpad/audit-2r2` (checked out clean; only the `.venv` and `node_modules` symlinks are untracked). Scratch: `scratchpad/audit-scratch-2r2`. Rulings read: docs/PHASE6-GATE.md, docs/DECISIONS.md D-059 to D-062, docs/COMPONENTS.md section 5. Nothing was edited, created, deleted or committed. Probes used real clicks and keys; no `__test` hook was used. One browser probe ran at a time. Servers were started and stopped inside each command.

## Counts

Round-1 items: 24 (1 blocker, 10 majors, 13 minor groups). Result: FIXED 20, NOT FIXED 2, RULED 2.
NEW problems from the fixes: 3 (1 major, 2 minor). No blocker in round 2.

NOT FIXED: the major M10 (1 of its 13 misconceptions still has no sentence) and minor m9 (two term collisions).

## Round-1 items, one line each

Blocker
- B1 I5.o2 could not be earned. FIXED. Real input (scratch/probe-i5.txt): the Interview Room memory station, opened by a click and set to I5-pass-k, mounts `hx-kata` with `data-objective="I5.o2"` (site/modules/interview-room.html:159). The starter run fails 0/7 with `objectives: []`. The typed solution passes 7/7 with `objectives: ["I5.o2"]`, and that is the only objective it credits.

Majors
- M1 A wrong incident hunt credited its objective. FIXED. Probe P1a (scratch/probe2r2.txt; screenshot scratch/r2-hunt-wrong.png): wrong family, wire and fix, one wrong tap. Stored entry `objectives: []`, detail `family_ok false, wire_ok false, fix_ok false`. Probe P1b, the right family, wire and fix, credits `["A4.o3"]`. Code: site/assets/components/hx-incident.js:207-211 with lib/credit.js `incidentCredit`.
- M2 Card reviews credited nothing. FIXED. Probe P2 (scratch/probe2r2.txt; screenshot scratch/r2-cards.png): one card answered Again, then Got it on seven cards. Evidence `objectives: ["A4.o1".."A4.o5"]`, the set of A4 `cards.yaml` objectives. Code: site/assets/components/hx-cards.js:211 with lib/credit.js `cardCredit`. Limit: a missed card must be answered Got it before the session can finish, so the probe cannot isolate "Again credits nothing".
- M3 A new learner's shift drew incidents from the whole course. FIXED. The new learner's pool is the first path module with an incident, S0 (site/assets/components/lib/pool.js:19-22). Over seven days no module beyond S0 appears (scratch/week2.txt, table A).
- M4 Shift incidents repeated and hunted incidents came back. FIXED, with a limit. A hunted incident returns only after three or more days (site/assets/core/shell/shift.js:184-190). A learner with only S0 done gets the S0 incident on days 1, 4 and 7 and a "Nothing new" note on the others (scratch/week2.txt, table C), not seven days running. The drill remains the same S0 say prompts while only S0 is in the pool (see N3).
- M5 The board and the bank came in course order. FIXED for learners with progress. Board: the first 20 fresh cards for a learner with six modules started come from six modules and four wires, alternating (scratch/board2.txt). Bank: the first 12 prompts come from five modules and four wires. A learner with nothing started still sees only S0 (8 cards, 2 prompts), which is what D-062 says.
- M6 The term-order checker skipped components. FIXED. tools/check_content.py:237-239 and :975 now read the static fallback text inside `hx-*` (`components=True`). The strict scan with `hx-*` included finds 0 early uses in the 70 pages (`strict scan: strict early uses: 0 in hx-*: 0 in prose/other: 0`). The official checker passes all 70 pages and course.json (scratch/check-content-all.txt, scratch/check-content-course.txt).
- M7 F1's check introduced generator and evaluator. FIXED. The F1 check now asks which is an honest reason to add a sub-agent (site/modules/many-agents.html:116-119). Neither word appears on the page.
- M8 A6's cache knob was unexplained. FIXED. site/modules/reasoning-and-effort.html:133 now reads `<span class="fwd" data-term="cache-hit">cache hit rate</span> is the share of input read from the cache, rather than processed again.`
- M9 F7's Break used a term owned by C6 that is not a prerequisite. FIXED by rewording. site/modules/model-migrations.html:104 now reads "which a retry never fixes"; "permanent error" no longer appears. F7's prerequisites are unchanged (course.json:2841), and the Break no longer needs them.
- M10 Thirteen misconceptions had no sentence on their page. NOT FIXED (1 of 13). Twelve now carry a "It is tempting to think that ..., but ..." sentence: C4 k2 (caching, prompt-caching.html), C7 k0 and k2 (tool count and output, tool-design.html), C9 k2 (permissions.html: "permissions replace isolation"), D3 k2 (evals-in-practice.html), F7 k2 (model-migrations.html), T5 k0 (http-and-sse.html), T7 k0 (containers-primer.html), T9 k0 (linux-processes.html: "killing a parent kills its children"), T10 k0 (threads-vs-async.html: "one thread run Python at a time"), A3 k2 (the-stateless-model.html), A5 k2 (structured-outputs.html). Still open: F6 k1 "More tasks fix a weak grader" (course.json:2816). site/modules/environments.html has no sentence on task count; its only grader sentence is "A grader that trusts the wrong file rewards a run that solved nothing." (scratch/misc13 output).

Minors
- m1 A2 check quoted end_turn, max_tokens and tool_use before their owners. FIXED. None of the three appears in site/modules/tokens-and-the-window.html; checks A2-c1 to c6 remain.
- m2 A4 check and Break named tool definitions and run_command before their owners. FIXED. The A4 Break and check were reworded; run_command appears only inside a code block (site/modules/the-api-call-on-the-wire.html:139).
- m3 B1 check distractor "A higher turn limit" before B2. FIXED. No "turn limit" text remains in site/modules/tools-give-the-model-hands.html.
- m4 H1 check quoted tool_use and run_command. FIXED. They appear only in a code comment (site/modules/rein-1-talk-to-a-model.html:119).
- m5 B3 Break used "output cap" (C2's term). FIXED. site/modules/what-a-harness-is.html:102 now reads "output limit".
- m6 H13 check used "brag sheet" before I2. FIXED. It is now a `fwd` span (site/modules/rein-extensions.html:148).
- m7 I1 used "write-up" (I3's term) and "exponential backoff" and "rate limit" (C6's terms). FIXED. None of the three appears in site/modules/the-job-map.html.
- m8 Closure-only uses: token (H0), rules file (C2), final status (C6, C7), conversation history (T8). FIXED. None of the four appears in its module; the strict scan finds 0 early uses.
- m9 Term collisions: "checkpoint" (Rein's step check, rein-setup.html:91, 94, 106, 114, 116, 124) against F5's checkpoint, and "retry policies" (errors-and-recovery.html:171) against F6's policy. NOT FIXED. The wording is unchanged. Both words are everyday words, so the term check does not read them, and nothing tags or explains them.
- m10 T9 memory-mode kata credited only T9.o2 while listing three objectives. FIXED. Both elements now carry `data-objective="T9.o1 T9.o2 T9.o3"` (site/modules/linux-processes.html:147, :167).
- m11 katas/lab-turn-limit was orphaned metadata. RULED. PHASE6-GATE.md "Ruled, not changed": it is the kata demo page's example. Evidence: site/labs/kata.html and site/data/katas/lab-turn-limit.json reference it.
- m12 A replay credited on any finish. FIXED. Probe P3 (scratch/probe2r2.txt): Step clicked on eval-anatomy.html; the loop hit its 200-click cap, and the replay recorded its finish (status `max_turns`). The stored `replay` entry has `objectives: []` for a run that ended `max_turns`, `passed: false`. Code: site/assets/components/hx-replay.js:230 with lib/credit.js `replayCredit`. The four replay-carrying objectives I checked (F4.o4, E2.o3, D1.o1, C5.o3) each keep a success element on their page, and check_content B4 passes all 70 pages.
- m13 42 misconceptions were addressed only by the topic. RULED. PHASE6-GATE.md "Ruled, not changed": left as they are, since the audit marked the fix optional.

## NEW problems introduced by the fixes

- N1 [major] An on-call kata drill credits I5.o2 under module I5 and starts I5. The drill slot declares `data-objective="I5.o2" data-module="I5"` (site/oncall.html:76), and the shift passes both to the kata it mounts (site/assets/core/shell/shift.js:313). Since the round-2 change, `hx-element.js:113` takes the element's own `data-module` before the page's, so the evidence is filed under I5. `progress.js:23` then starts I5. Evidence (real input, scratch/probe-shift-leak.txt): a real visit to the A3 page starts A3; on the on-call page a real click on "Start the kata" mounts A3-messages with `module: "I5", objective: "I5.o2"`; the typed solution passes, leaving evidence `{module: "I5", objectives: ["I5.o2"], passed: true}` and `modules.I5 = {status: "started", objectives_seen: ["I5.o2"]}`. Consequence (scratch/leak-replay.txt): with I5 started, the shift draws I5's say prompts and offers I5-pass-k on 2026-10-17, although the learner has not visited I5 and I5's prerequisites (I2, I3, D2, G4, F5; course.json I5 block) are unmet. This breaks the amended D-062 rule "a module the learner has not started never joins the pool", and D-061 says a passing kata in the shift credits I5.o2 "and nothing else". Suggested fix: do not put `data-module` on the shift's drill slot. Credit I5.o2 under module null, or let the shift record the kata against its own module without starting I5.
- N2 [minor] For a learner with nothing started, the note "Nothing new to hunt today. Start S0 · … to add its incident" names S0, which is already the pool (the fallback in `poolOf`, pool.js:19-22). Starting S0 changes nothing (scratch/week2.txt, table A, 10-12, 10-13, 10-15, 10-16). Evidence: site/assets/core/shell/shift.js:206-211 names `path.find(... !started.has(id) ...)`, which includes the fallback module. Suggested fix: name the next module only when it is outside the pool, or name the next module after the fallback.
- N3 [minor] With one started module, the drill is the same say prompts every day. The drill comes from the pool only (shift.js:194-195: the kata branch needs a kata in the pool; otherwise the say branch uses the pool's modules). For a learner with only S0 done, the drill is "say S0" on all seven days (scratch/week2.txt, table C). This follows from D-062, but the kata and say alternation that the old drill had (odd days a kata) is lost for any pool without katas. Suggested fix: when the pool has no kata, draw the day's kata from the next started module, or document the single-module drill as intended.

## Replay against the amended D-062 rule (fixed commit, real `pickShift`, Node)

Learner rules checked: the pool is the started or finished modules; with none, the first path module with an incident (S0); an unhunted incident comes first; a hunted one returns only after three or more days; otherwise "no incident" with a note; fresh cards and new prompts come from the pool, round-robin by wire, in a seeded order; the drill comes from the pool.

A. New learner who only does the shift, 2026-10-11 to 17 (scratch/week2.txt):

| day | scope | incident | drill | note |
|---|---|---|---|---|
| 10-11 | first | S0 false-done [verify] | say S0 | |
| 10-12 | first | - | say S0 | Nothing new to hunt today. Start S0 · … (see N2) |
| 10-13 | first | - | say S0 | same note |
| 10-14 | first | S0 false-done [verify] | say S0 | |
| 10-15 | first | - | say S0 | same note |
| 10-16 | first | - | say S0 | same note |
| 10-17 | first | S0 false-done [verify] | say S0 | |

B. New learner who starts the module each note names (visits modules the note asks for), same week: day 1 S0; day 3 note "Start A1"; day 4 A1 incident (verify); day 5 S0 again (three days after day 1); day 6 note "Start A2"; day 7 A2 incident (context). Scope moves from "first" to "started" once a module is started.

C. Learner with S0 done (done, nothing else started), same week: S0 incident on 10-11, 10-14 and 10-17 only (three-day rule); the other days "Nothing new to hunt today. Start A1 · What a model does ..."; the drill is "say S0" every day (N3).

28-day statistics (scratch/long2.txt): new learner who follows notes: incident on 25 of 28 days, 3 distinct incident modules, 2 wires. S0 done only: incident on 10 of 28 days, 1 module, 1 wire, 18 no-incident days. First six path modules done: an incident every day, 6 modules, 4 wires (tools, verify, loop, context). With six modules, a repeat inside seven days is unavoidable, so the round-1 "repeats within 7 days" measure says nothing about the picker any more.

Board and bank, the same pool (scratch/board2.txt): first 20 fresh cards with six modules started: A5 A1 A4 A3 A5 A1 A4 A3 A5 A1 A4 A2 A5 A1 A4 A2 A5 S0 A4 A3, four wires (tools, verify, loop, context). Bank: first 12 prompts A5 A1 A4 A3 A5 S0 A4 A3 A1 A2 S0 A2, four wires. New learner or S0 only: 8 cards and 2 prompts, all S0.

## Coverage

- Re-ran the whole term check on the fixed tree: strict scan 0 early uses, including components (M6); beat-only scan shows only forward `fwd` spans and code identifiers (scratch/term-flags.txt).
- Course data: `tools/check_content.py` passes course.json (70 modules) and all 70 pages (scratch/check-content-course.txt, scratch/check-content-all.txt). The I5 slot (interview-room.html:159) is as ruled. H6 now requires C3 (D-059). F7 prerequisites are unchanged (D3, A6), and its Break no longer needs C6 (M9).
- Objective credit: check_content B4 passes all 70 pages. CREDITING_ELEMENTS (check_content.py:849) is hx-incident, hx-kata, hx-step, hx-bench, plus non-prediction hx-check and the hx-say and station-slot refs; hx-replay is excluded, as D-061 says.
- Rulings D-059 to D-062 and COMPONENTS §5 checked against the code: incidentCredit, cardCredit and replayCredit (lib/credit.js); pool.js; shift.js pickShift; station slot in interview-room.html:159.

## Limits

- Browser: four real-input probes on the fixed commit (wrong and right hunt, card review, replay to its finish) and one for I5.o2 through the Interview Room station with a typed solution. The on-call leak probe (N1) was one real run on a day whose parity made the drill a kata. Not probed: keyboard-only use, reload mid-component, reduced motion, seeds (section 3).
- The shift replay drives the real pure functions in Node, with the learner's behaviour modelled (hunts and drills the offered item; visits the module a note names). A real learner's pace will differ.
- The 42 implicit misconceptions and the m13 "ruling" are taken from PHASE6-GATE.md. I did not re-judge them.
- Not checked here: factual claims (section 1), and whether the checkers catch broken inputs (section 5). The T10 wording "only one thread run Python at a time" is correct in substance; its fact is section 1's to check.

## Summary

FIXED 20 · NOT FIXED 2 · RULED 2 · NEW 3 (1 major, 2 minor).
No blocker: B1 (I5.o2) is fixed and proven with real input; the open items are M10 (one misconception, F6 k1) and m9 (two term collisions).
Most important new problem: N1 (major): a passing on-call kata drill from A3 credits I5.o2 under module I5 and starts I5, so I5's prerequisites are bypassed (site/oncall.html:76; shift.js:313; hx-element.js:113; scratch/probe-shift-leak.txt).
