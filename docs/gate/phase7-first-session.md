# Phase 7 first-session walkthrough (BP-7.1): hx-reviewer report

Reviewer: hx-reviewer. Rules: /home/user/ai-harness-eng/.claude/agents/hx-reviewer.md. Brief: /home/user/ai-harness-eng/docs/blueprints/BP-7.1-first-session.md. Evidence rule: BP-6.0 (command output, screenshot path or quote; severity; file:line). Specs: docs/DESIGN.md §9 (targets, 14 px floor, no-JS), §10 (300 KB per page compressed, Pyodide and editor excluded).

Paths: file:line is relative to the worktree /tmp/claude-0/-home-user-ai-harness-eng/4512a573-cc00-58ec-8db9-1f17cfd98bb0/scratchpad/gate-ef3f934 (commit ef3f934). Screenshots and timelines are absolute paths listed in the Evidence index at the end. Scratch: /tmp/claude-0/-home-user-ai-harness-eng/4512a573-cc00-58ec-8db9-1f17cfd98bb0/scratchpad/audit-scratch-7.

## Method and set-up

- Served the worktree's site/ with the director's serve-subpath.mjs under /ai-harness-eng/ on a free port (any other path 404s). Chromium through Playwright from /home/user/ai-harness-eng/node_modules; nothing installed. Nothing in the worktree or the main tree was edited, created, deleted, or touched in git. No __test hook was called. No API key was asked for and no model call was made (the course runs on scripted traces; no network request left the local server in either walk).
- Real input only: taps (touch, phone), mouse clicks and wheel scrolls (laptop). A fresh browser context per persona (no stored progress).
- Time: the page's own clock (Date.now() minus the home page's performance.timeOrigin, read in the page). t = 0 is the first load of the home page. The walk stops at 600 s of this clock or when the placement has sent the persona on.
- Pace (a model, not a measured reader): newcomer reads prose at 170 words a minute and scans logs (the run transcript) at 250; looks 1.2 s before each tap; 3 s to decide a prediction or answer. Engineer reads prose at 250, scans logs at 300; looks 0.6 s; 2 s to decide. Reading is a wait sized to the words on screen, counted as active time. Nothing idles.
- Personas: A, the newcomer: 375 x 812 phone, touch, knows what a chatbot is, has written a little code, has never built an agent. B, the engineer: 1280 x 800 laptop, mouse, has shipped software and called a model API; takes the placement honestly (answers from knowledge).
- Two timed walks were run as records (the reruns below). Run history is at the end.

## Timelines (timed reruns; minute:second on the page's clock)

### A. Newcomer, 375 x 812 touch (reads 91% of the clock; driver time 19 s)

| Time | Step |
|---|---|
| 0:00 | Home loads (first page load). Scroll width 375 = viewport; no text under 14 px. Reads kicker, title, lede (to 0:11), Continue card (0:15), Today's shift card (0:23). |
| 0:24 | Taps Continue (97 x 48). |
| 0:25 | S0 first screen. Reads the lede and objectives (to 1:17). |
| 1:18 | Taps "1 Break" (78 x 44). Reads "This run edits a file, runs the tests and says it is done." (E1). Takes this as true. |
| 1:45 | Reads the prediction. 1:48 picks "It runs the checks before it accepts the claim." (the plausible wrong answer). 1:49 Lock in (182 x 48). |
| 2:19 | Reads the feedback after the lock (85 words). |
| 2:19 to 4:03 | Scans the 433-word run transcript (104 s) before the first hunt tap. |
| 4:05 | Hunt: taps "Removing the spaces instead." (a wrong tap). Reads the note (seq 13). |
| 4:12 | Hunt: taps "All tests pass. Done." Found. 4:22 reads the found block. First point where the persona has a reason rather than a guess: "The model says the tests pass, but it never ran them" (the why). This is the persona's "I get it" moment, inferred from the walk. |
| 4:24 to 4:40 | Names the family (False done), the wire ("Verification & evals"), Commit; fix 1 ("Check the work on every done claim..."), Commit fix. 4:46 reads the result line. |
| 5:52 | Reads the See section (67 s). |
| 5:56 | Plays the replay at 1x. Replay stopped at 6:02 (5.7 s). |
| 7:16 | Reads the Lab text (72 s). 7:18 to 7:21: retries 2 to 1 to 0, Run x20 (settled 1.0 s). 7:47 reads the readouts at 0. |
| 7:49 to 8:17 | Retries 0 to 1, Run x20, readouts at 1 (20 of 20 passing). |
| 8:30 | Check intro. 8:45 picks "One model call, or one tool action." (right). 9:13 reads the reason. |
| 9:27 to 10:00 | Check 2: picks "The model got smarter." (the plausible wrong answer), Check, reads the reason. |
| 10:00 | Stop (budget). Not reached: check 3 and 4, Keep, the placement. |

### B. Engineer, 1280 x 800 mouse (reads 90% of the clock; looks and decisions about 60 s)

| Time | Step |
|---|---|
| 0:00 | Home loads. Scroll width 1280 = viewport; no text under 14 px. Reads lede (0:07), Continue card (0:10), scans the Path (0:32). |
| 0:33 | Clicks Continue (97 x 48). |
| 1:09 | Reads the S0 head (lede, objectives). |
| 1:10 | Clicks "1 Break" (78 x 44). |
| 1:30 | Prediction: picks "It ends the run as done, because nothing checks the claim." (right, decided in 2 s). Lock in. |
| 1:44 | Reads the feedback. The engineer already had the mechanism; the page confirms it. |
| 3:10 | Scans the transcript (87 s). |
| 3:12 to 3:24 | Clicks "All tests pass. Done." (found); family False done; wire verify; Commit; fix 1; Commit fix. 3:28 result line. |
| 4:13 | Reads See (45 s). 4:16 sets 2x; 4:17 Play. Replay done about 2 s later. |
| 5:08 | Reads Lab (49 s). 5:09 to 5:14: retries 2 to 1 to 0, Run x20. 5:31 readouts at 0. 5:32 to 5:34: retries 1, Run x20. 5:51 readouts at 1. |
| 6:00 to 7:59 | Check: four questions, each answered right, Check, reads the reason (15 to 23 s each). |
| 7:59 | Skips Keep's cards and the say-aloud timer to reach the placement (the engineer's choice; the cards and say were probed separately, see Coverage). |
| 8:39 | Reads the Keep paragraphs (41 s). Placement note at 8:46. |
| 8:50 | Placement started. Answers questions 1 to 8 honestly (each about 8 s to read, a tap on the option and Next). |
| 10:00 | Stop (budget) at placement question 9 of 15. Not reached: the placement result. |

Placement result (untimed probe P5 with the same honest answers, E7): "Suggested start: Control plane: instructions as law"; the skip list names A1 to A7 and B1 to B4. The walk did not reach this within 10 minutes.

## Findings (ranked; each with evidence and file:line)

### Blockers

- [blocker] modules/same-model-different-harness.html:92 — The Break's lead sentence says the run "runs the tests and says it is done". The run never runs them. The module's own next paragraph says "Nothing ran them" (line 110), and the incident's explanation says the model "never ran them". Evidence: scenarios/s0-false-done.json:156 ("The model says the tests pass, but it never ran them, and the harness takes its word."); scenarios/golden/s0-false-done.s0-old.1.jsonl (the replay seed, seq 5 to 23): model_reply "Reading slug.py.", tool_call read_file, model_reply "Removing the spaces instead.", tool_call edit_file, model_reply "All tests pass. Done.", run_end status done; no run_command and no verify event (same in .0 and .2). On screen at the phone walk: E1. Suggested fix: "This run edits a file and says it is done. Predict what the harness does next."

- [blocker] content/S0/say.yaml:6 (the model answer shown by "Show the model answer") — "With no retries, the new board passed fewer trials, because a false done was accepted." Both halves are false. At zero retries the new board passes 13 of 20, the same as the old board (13 of 20; E2 and the bench readouts). Its failed seeds end "unverified, checks fail", not "done": with max_feedback 0 a failed verify returns "unverified" (site/assets/sim/harness.js:678 to 685); the cell says "Seed 1, new board: unverified, checks fail" (E10). The gate refuses the false done; it does not accept it. Evidence: E9 (the model answer on screen); sim code at site/assets/sim/harness.js:678 to 685. Suggested fix: "With no retries, the new board passes 13 of 20, the same as the old board: the gate stops each false done as unverified, and nothing sends the model back to fix it. With one retry, every trial passed."

- [blocker] site/assets/components/hx-bench.js:30 and :131 to 137 — The bench's mark key labels the double-bar mark "interrupted", and markOf() falls through to that mark for any status it does not list, so an "unverified" run is keyed as interrupted. On screen after a zero-retries run the new board's key reads "pass" and "interrupted", while the tapped seed reads "Seed 1, new board: unverified, checks fail, 3 turns" (E10). The learner is told a run was interrupted when it ended unverified. Suggested fix: give "unverified" its own mark in markOf and its own MARK_KEY line (for example "unverified: the checks still fail").

### Majors

- [major] content/S0/checks.yaml:4 and :10 (site/data/checks/S0.json is generated from it) — The prediction's question states the outcome it asks about, and option 3 repeats it. Question: "The model says the tests pass, and the run ends as done. What does the harness do next?" Option 3: "It ends the run as done, because nothing checks the claim." The premise already says the run "ends as done", so the choice is between "checks it" and "accepts it" by reading, not by a mental model. Evidence: E1 (the premise and option 3 on the phone screen). The engineer picked option 3 at 1:30. Suggested fix: remove "and the run ends as done" from the question and let the options carry the outcome.

- [major] site/assets/components/hx-bench.js:786 — The par readout formats the par value with the unit "turn": `plural(sweep.par.value, "turn")`. The par value is the verify-retries setting (the knob is labelled "Verify retries", hx-bench.js:509). On screen, the readout reads "PAR 0 turns" under "Verify retries" (E2). A learner reads a retry count as a number of turns. Suggested fix: use the knob's own unit ("retries").

- [major] site/assets/components/hx-bench.js:25 with :498 and :796, against site/assets/components/lib/stats.js:79 to 87 and modules/same-model-different-harness.html:135 — The bench marks par at zero retries, the setting where the new board does exactly what the old board does (13 of 20 both; E2). The rule the code uses (feasible if passed >= the old board's passes, then the lowest worst cost) is the module's rule, so par is 0 and the lab never says why a setting that adds nothing is "par". The at-par line reads "Par: the cheapest worst case that keeps every passing run." (hx-bench.js:25), which is not the rule (at least as many as the old board) and sounds like "no passing run lost", which is not what 0 retries shows. The module's own answer (content/S0/say.yaml:6) says one retry passes every trial, so the bench and the answer point at different settings with no explanation. Suggested fix: either define par so it names the best setting that passes the most runs, or state in the lab that par 0 means the gate adds nothing without a retry; align the at-par line with the rule.

- [major] content/S0/placement.yaml:64 (A-3's reason) with site/assets/components/hx-placement.js:147 and :151 — The reason for question A-3 is "Tempting. The course shows what each call carries in A3." The placement shows each question's reason whatever the answer, so a learner who answered the right option ("Only what the harness sends with the call") reads "Question 7: right" followed by "Tempting." (E8). The label for a wrong-but-plausible option sits on the right answer. Suggested fix: write the reason for the right answer ("Right. ...") and keep the "Tempting" lines for options, or show reasons per pick.

- [major] the Phase 7 first-session path: modules/same-model-different-harness.html:66 and site/index.html:72 and :80 — There is no ten-minute first session. The S0 module says 25 minutes (module:66; home card index.html:72), and its placement sits at the end. Neither persona reached the placement result in ten minutes: the newcomer stopped at check 2 at 10:00, the engineer at placement question 9 of 15 at 10:00 (timelines A and B). The only "About 10 minutes" on the home page (index.html:80) labels today's shift card, not the course's first session, so a learner can read it as the course's first ten minutes. Suggested fix: offer the placement earlier (it is already built: hx-placement), or tell the learner where the first ten minutes end, and move the "About 10 minutes" label off the shift card or qualify it.

- [major] site/index.html:62 to 63 (and :7) — The first screen does not say what the course asks of you, how long it takes, or that you can skip ahead. The lede is "From zero to a hireable AI harness engineer, one replayable run at a time." The engineer read the lede (0:07), scanned the Path (0:32), and clicked Continue at 0:33 without learning the length: the course map sums to 3,000 minutes across 70 modules (50 hours; data-minutes in index.html), and the total appears nowhere on the page. "From zero" also reads as a beginner course to an engineer, and the placement, which is the way to skip, is not mentioned on the home page (no "placement" or "skip" other than "Skip to content", index.html:17). Suggested fix: one line under the lede with the total time and the placement ("Know some of this? Take the 15-question placement to see where to start."), and the level.

- [major] site/assets/core/shell/chrome.js:44 with site/assets/core/hx.css:329 — On phones the course map is closed (courseMap.open = wide.matches, under 1100 px), so the end of S0 has no visible next step. After the placement and the "What to show" box, the page shows a "Course map" heading with nothing under it, and no link to A1 in the visible page (E5). On the laptop the open rail links A1 (E6). A learner who skips the placement at 375 has no way forward on the page except the course map's disclosure. Suggested fix: at the end of a module, show "Next: A1 · What a model does" as a plain link, not behind the disclosure.

### Minors

- [minor] modules/same-model-different-harness.html:95 (ten fallbacks on this page, 69 module pages) — The no-script fallback reads as a stage direction: "Without JavaScript, the question is: the model says the tests pass…" A reader without scripts is told about the test rather than given the question. Evidence: E3 (JavaScript-off render). Fix: write the fallback as the question itself.

- [minor] site/assets/components/hx-placement.js:11 with :142 and :147 — "This is not a test you can fail." sits above a result that scores "Start here: 4 right of 4 questions" and marks each question "right" or "not right". The copy and the scoring disagree in tone. Evidence: E7. Fix: keep the note and drop the verdict words, or say "not graded".

- [minor] content/S0/placement.yaml:28 — The reason for S-3 names "the Turn Clock", which is module B4 (course.json path); a newcomer has not reached it when the placement shows the reason. Fix: "It is the clock of a run, with the harness's settings beside it."

- [minor] site/assets/components/hx-incident.js:349 ("Which wire?") and modules/same-model-different-harness.html:208 — "wire" is used in the hunt before the module defines it (line 208 is the first definition). The home's Board defines it (index.html:105), but the newcomer did not scroll to the Board in the first ten minutes. Not measured as a hesitation (the walk does not model one), so minor. Fix: a three-word gloss at the first use.

- [minor] modules/same-model-different-harness.html:149 — "The reason for each answer shows after you choose." The reasons show after Check, not after the choice (driver output: before Check no reasons; after Check, "Tempting…" and "Right…" appear). Fix: "after you check your answer".

- [minor] site/oncall.html:59 vs its own fresh-learner line — The lede says "One incident from a module you have done", but for a learner who has done nothing the page says "You have not started a module yet, so this incident is the first on the path: S0" (E4). The page handles the case; the lede does not. Fix: make the lede say "from a module you have done, or the first one on your path".

- [minor] the run transcript in hx-incident (433 words, 24 rows) — The transcript is the only text between the prediction and the first tap, so a newcomer spends 104 s (and an engineer 87 s) scanning it before they can act. It works, and it is the evidence; the length is the cost. Fix (optional): collapse the rows before the claim behind "Show the steps" with the claim visible.

## What worked well (keep)

- The hunt teaches by its feedback: a wrong tap names the reason ("Too early" or "Too late"), the note at seq 13 says the wrong edit is ordinary, and the hint appears on the second wrong tap (site/assets/components/hx-incident.js:144 to 151).
- Every check option gets a reason after Check: "Tempting." for the plausible wrong answer, "Right." or "Wrong." for the others (content/S0/checks.yaml).
- The Lab's two boards meet the same seeds, the knob is one setting, and the readouts state the trade in words.
- The beat strip marks where the learner is ("3 Lab NOW" in E10; "Next" in the progress line of module.js:90).
- The placement is honest about its effect: "every module stays open", and the skip list says the checks are still there for proof. The suggested start is a real link to a built module.
- Progress is explicit: Export progress, Import progress and Reset progress are in the footer (E5, probe2 output), and the module says where progress is kept.
- Pyodide does not load: 0 Pyodide requests in either walk (see the page weight table).
- Phone layout: no horizontal scroll on home or S0 (scroll width = viewport at 375 in both walks). Every control the walks tapped measured at least 44 px in both directions; the smallest on the phone walk were the beat-strip links (78 x 44), and the replay's 2x control at the laptop size measured 44 x 44.

## Coverage: checked and clean

- Home at 375 and 1280: scroll width = viewport; no text under 14 px (checks at home and S0, both walks); no console error or 4xx in either walk (consoleMsgs empty, status4xx empty, failed empty).
- Break prediction (S0-p1): answer index 2 (content/S0/checks.yaml:12) matches the golden trace (the old board ends done with no check). Wrong-option feedback at checks.yaml:7; right-option feedback at :11.
- Hunt: the claim is seq 21 (scenarios/s0-false-done.json "first_bad_seq": 21); family false-done; wire verify; the correct fix is fix-0 ("Check the work on every done claim: run the tests before ending"). Real clicks on 24 transcript rows, family and wire radios, and fix-0..fix-2 all work (driver passes).
- Bench (real clicks, driver pass): retries 0 gives 13 of 20 for both boards (the same); retries 1 gives 20 of 20 for the new board; retries 2 gives 20 of 20. S0-c2 ("the pass rate rises") is right; the model answer's "with one retry, every trial passed" is right; the "fewer" and "accepted" parts are the blocker above.
- Golden traces: on the old board the model says "All tests pass. Done." and the run ends done with no test run in all three seeds; on the new board seed 0 passes at the first verify, seeds 1 and 2 fail once, then pytest and a fix (matches the Lab text "If they fail, the model gets the failure and another try").
- Placement: 15 questions (module line 219 says "fifteen"); all-right result routes to C1 (probe P5, E7); the skip list is right for that path.
- Footer: Export progress, Import progress, Reset progress (footer.js; probe2 output); matches S0-c4 and module lines 210 and 217.
- Clock spoke, cards and Say (probe, not timed): the verify spoke card reads "verify gate Verification…"; cards flip with Show answer and Got it (8 cards); Say's timer starts and stops, and Show the model answer reveals (no errors; E9).
- Model calls and keys: no request to a host other than the local server in either walk; no API-key prompt in assets/components, assets/core or assets/sim (grep). Say is self-graded: no typing, no model call.
- Pyodide: only hx-kata.js and hx-step.js import the Pyodide host (assets/components/lib/py-host.js). The S0 path uses none of them.

## Page weight and load (DESIGN §10: 300 KB per page compressed, Pyodide and editor excluded)

Gzip (level 9) of each file the page requested, measured from the gate worktree (the local server does not compress; a static host would).

| Page or part | Requests | Gzip (KB) | Against 300 KB |
|---|---|---|---|
| Home (both walks) | 56 | 176.6 | within |
| S0 on load (both walks) | 66 | 223.7 | within |
| S0 lazy components as the reader scrolled: newcomer +32.4 (total 256); engineer +72.8 (total 296.5) | 9 / 24 | | within; the engineer's walk is at 99% |
| Fonts (7 woff2, both pages) | | 96.9 | within 135 KB |
| Pyodide | 0 in both walks | | not loaded |

Raw (uncompressed) on the local server: home 411 KB, S0 568 KB. Load time on localhost (not a network measure): home load event 161 ms (phone) and 233 ms (laptop). Nothing heavy loads in the first ten minutes.

## Limits

- Chromium only, one emulated phone (375 x 812, touch) and one laptop (1280 x 800). No real device, no Firefox or Safari.
- The reading pace is a model (170 and 250 words a minute). Totals follow from it. "I get it" moments are my reading of the walk's events, not a measure.
- Not in the timed walks: cards, the clock, Say, the placement's result and reasons, the suggested start (C1 was not followed), and the Keep section (the engineer skipped it). These were probed untimed (P5, P6, probe-keep) and are listed as coverage.
- Keyboard-only, reduced motion, colour-blind palette, axe, and the no-JS pass beyond the S0 Break belong to the other audit and QA; not walked here.
- Run timings are localhost. Load time over a network was not measured.
- A QA run (tools/qa/run.mjs, another process on this machine) was active during the walks. It shares the CPU, so the walks are a little slower than on a quiet machine. I did not touch it.
- Probes were untimed and used real clicks; they are evidence for findings, not persona timings.

## Run history

- Run 1 newcomer was superseded. Its Play tap took 121 s of the 600 s: a helper waited up to 30 s per call for the lazily mounted Replay, four times. Fixed with a 300 ms timeout (walk-lib.mjs, reach); a dry pass of the newcomer's path then took 15.4 s of driver time. Run 1 is kept as timeline-A-run1-superseded.jsonl with shots in shots/run1-superseded/. Its observations match the rerun.
- Run 1 engineer was stopped during the same fault and is kept as timeline-B-run1-killed.jsonl (partial). Its observations match the rerun.
- The timed records are the reruns: timeline-A.jsonl (newcomer, 600 s, stopped in check 2) and timeline-B.jsonl (engineer, 600.1 s, stopped at placement question 9 of 15).

## Evidence index (absolute paths)

- E1 /tmp/claude-0/-home-user-ai-harness-eng/4512a573-cc00-58ec-8db9-1f17cfd98bb0/scratchpad/audit-scratch-7/shots/A-break-sentence.png (phone, the Break sentence and the prediction premise)
- E2 .../audit-scratch-7/shots/P1-par-after-three-values.png (laptop, retries 0 after three values: "PAR 0 turns", old 13/20, new 13/20)
- E3 .../audit-scratch-7/shots/P2-nojs-break.png (JavaScript off, Break section: the fallback copy)
- E4 .../audit-scratch-7/shots/P3-start-shift-fresh-375.png (fresh learner, Start shift)
- E5 .../audit-scratch-7/shots/P4-end-of-S0-375.png (phone, end of S0: collapsed Course map, no next link)
- E6 .../audit-scratch-7/shots/P4-end-of-S0-1280.png (laptop, end of S0: A1 link in the open rail)
- E7 .../audit-scratch-7/shots/P5-placement-result.png (placement, all right: "Suggested start: Control plane")
- E8 .../audit-scratch-7/shots/P5-why-7.png ("Question 7: right" then "Tempting…")
- E9 .../audit-scratch-7/shots/P6-say-model-answer.png (Say model answer with "a false done was accepted")
- E10 .../audit-scratch-7/shots/P7-bench-keys-retries-0.png (retries 0: key "interrupted"; "Seed 1, new board: unverified, checks fail")
- E11 .../audit-scratch-7/shots/A-home-first-screen.png (phone, home first screen)
- E12 .../audit-scratch-7/shots/A-S0-first-screen.png (phone, S0 first screen)
- Timelines: .../audit-scratch-7/timeline-A.jsonl and timeline-B.jsonl (timed reruns; summary line at the end of each)
- Golden trace: /tmp/claude-0/-home-user-ai-harness-eng/4512a573-cc00-58ec-8db9-1f17cfd98bb0/scratchpad/gate-ef3f934/scenarios/golden/s0-false-done.s0-old.1.jsonl

## Summary (3 lines)

1. Findings: 3 blockers, 7 majors, 7 minors (the blockers are the Break sentence that says the run runs the tests, the Show-the-model-answer mechanism, and the bench key that labels unverified runs as interrupted).
2. The one that matters most: the first module teaches a false fact about its own run (modules/same-model-different-harness.html:92; the traces show no test run), and two other learner-facing statements about the same lab are wrong (content/S0/say.yaml:6; hx-bench.js:30 and :131 to 137).
3. Neither persona reached the placement's result in ten minutes (the newcomer stopped in check 2, the engineer at placement question 9 of 15), so there is no ten-minute first session as built; Pyodide never loaded, and S0 is 224 to 297 KB gzip per page, within the 300 KB budget.
