> Evidence for the Phase 1 gate. Screenshots and logs cited below stayed in the reviewer's scratch folder and are not committed; the findings were fixed in the commits after this report (see docs/PHASE1-GATE.md).

# BP-1.8 Pass B: first-time-learner walkthrough (report B)

Reviewer: hx-reviewer. No project files were edited, created, moved or deleted.
Brief: docs/blueprints/BP-1.8-walkthrough.md (same method, persona, rules, passes and scoring as Pass A). Specs: docs/DESIGN.md §7.2 (replay), §7.4 (incident), §7.9, §9, §11, §12; docs/COMPONENTS.md §5, §6, §10, §11. Kata and cards have no section in DESIGN §7; they were checked against §9, §11 and COMPONENTS.
Pages: site/labs/replay.html (section 1, "The almost-done spiral"), site/labs/incident.html (section 1, "A false done"), site/labs/kata.html (practice and memory), site/labs/cards.html (six demo cards).
Persona: Sam, career changer, basic Python, no AI build experience, 375 × 812 phone, 10 minutes.

## Method and coverage
- Served site/ with the scratch node:http server (bp18/serve.mjs). Chromium 1194 via Playwright 1.56.1 from /opt/pw-browsers. Nothing installed.
- Real taps (phone), clicks (1280), and Tab / Shift+Tab / Enter / Space / ArrowUp/Down / End keys (keyboard pass). `__test` hooks never called.
- Passes, each running B1–B4 end to end: m375 (touch, 375×812), d1280 (pointer, 1280×900), k1280 (keyboard only, 1280×900), r375 (touch, reducedMotion reduce, 375×812). All four passes finished with zero task failures on the final driver.
- Screenshots: bp18/shots/ named `<page>-B<n>-s<k>-<width>[-kbd|-rm].png`, e.g. replay-B1-s3-375.png, incident-B2-s8-375.png, kata-B3-s12-375.png, cards-B4-s4-375.png. Logs: bp18/log-B-<pass>.jsonl. Probes: bp18/probes-B.json, probe-py3.mjs, probe-draft.mjs, probe-radio2.mjs, and shots/incident-B-probe-shared-radio-after-375.png.
- Repo during the run: at the start HEAD was 0fe034f with hx-replay.js modified. Commit 45ae71b (Pass A fixes, 16:10 UTC) landed during the run. The d1280 pass ran before it; k1280, r375, m375 and all probes ran after it. The fix commit did not touch hx-incident.js, hx-kata.js, hx-cards.js or lib/py-worker.js. It did change the replay's Friendly detail line (hx-replay.js:368–369). Git status is clean now.
- Driver notes, not product findings: (1) my first server had no .wasm MIME type, so Python never loaded; fixed in the scratch server. (2) Playwright page.route does not intercept Worker requests, so one probe was invalid and was discarded. (3) Radio groups are one Tab stop: keyboard choices use Tab into the group and then ArrowDown (Space if the target is not checked). (4) Kata code was typed as key presses (Enter, Shift+Home, then the line), which handles CodeMirror's auto-indent. (5) The memory timer reading (0:01 to 0:03) reflects scripted typing speed. (6) Radios and JSON rows are re-found by data-key after each change, because a change re-renders the component.

## Findings
Severity: blocker = wrong fact, broken interaction, failing checker, a learner taught something false, or an accessibility failure that blocks use. Major = a real defect a learner or reviewer would notice. Minor = polish.

### Blockers
None. All four tasks completed in all four passes. No wrong fact found: the replay sentences match the simulator, the incident's why and hints match the tape's incident block, the kata's hints match its tests, and the cards' right answers match the card data (checked against labs/data/cards-demo.json, data/katas/lab-turn-limit.json and data/scenarios/s0-false-done.json).

### Majors
- [major] site/assets/components/hx-incident.js:225, :237, :256 — the naming and fix radios are named with literals ("family", "wire", "fix"), not per instance. incident.html has two incidents, so both share one radio group per name. After incident 2 is named, incident 1's chosen family radio is cleared, though incident 1 still shows "Right.". Evidence: probes-B.json p1_cross: before inc1Checked ["family-false-done"]; after inc1Checked [], inc2Checked ["family-orphaned-tool-call"]; the radio count for name "family" is 6 across the page (p1_both_found_family_inputs). Screenshot shots/incident-B-probe-shared-radio-after-375.png: green "Right." on False “done” with an empty, disabled radio. Arrow keys can also cross between the two incidents (not separately tested). Suggested fix: prefix names per instance, as hx-cards does (hx-cards.js:323 and :427 use `${this.uid}-…`).
- [major] site/assets/components/lib/py-worker.js:8–17 (init) and site/assets/components/hx-kata.js:104–111 and :130–140 (worker message and error handling) — when Pyodide cannot compile its wasm, the load neither resolves nor rejects, so the worker never posts "error". The kata shows "Loading Python (about 13 MB, the first time only)…" with Run disabled, and the promised FAILED copy ("Python could not load in this browser…") never appears. Evidence: probe-py3.mjs with the scratch server serving .wasm as application/octet-stream (BAD_WASM_MIME=1): at about 5, 30, 60 and 90 s runDisabled true, loading line visible, failedCopy false. Console: "wasm instantiation failed!" and "Incorrect response MIME type. Expected 'application/wasm'". With the correct type, Python is ready in about 2 s (log-B-m375.jsonl python-ready 2294 ms). This only happens on a misconfigured host, but then the failure state the component promises is unreachable. Suggested fix: a load timeout in startWorker (about 45 s) that settles "failed" and shows FAILED_COPY; state the .wasm MIME requirement in the deploy notes.
- [major] site/assets/components/hx-kata.js:276–279 (saveDraft's catch: "Storage is blocked: the draft lives in this page only") and the lab pages — when localStorage is blocked, a typed memory draft is lost silently on reload. No page error. The store's notice goes only to the screen-reader live region (core/shell/announce.js, class sr-only), and the visible status line (data-store-status) exists only on index.html and design.html, not on the four lab pages. Evidence: probe-draft.mjs C: typed "def run_turns… turns = 0" with storage blocked, then after reload "# Write it from memory.\n" (blank); pageErrors []. grep: data-store-status appears only in index.html:295 and design.html:280. Suggested fix: show a visible line on lab pages when drafts cannot be saved ("Your draft is not saved in this browser; copy it before you leave").

### Minors
- [minor] site/assets/components/hx-kata.js:372 and :500, and :30 (RESET_ASK) — in memory mode the button reads "Reset to starter" and the confirm reads "Replace your code with the starter? Your draft will be lost.", but the reset loads a blank file ("# Write it from memory."). Evidence: probes-B.json p4_reset_button "Reset to starter", p4_confirm, p4_after_reset "# Write it from memory." Fix: "Clear the file" in memory mode.
- [minor] site/assets/components/hx-kata.js:387 — "Show hint 1…3" appears in memory mode too, so the from-memory check can be answered with hints. Evidence: kata-B3-s10-375.png (memory section shows "Show hint 1"). Fix: hide hints in memory mode, or say that hints count against the time. Confirm the intended rule with the spec owner.
- [minor] site/assets/components/hx-kata.js:19 (DRAFT_DELAY_MS = 500) — keystrokes typed in the last 500 ms are lost on a reload. Evidence: probe-draft.mjs B: "extra = 1" typed, then an immediate reload, restored "turns = 0" only. Fix: flush the draft on pagehide and blur.
- [minor] site/assets/components/hx-kata.js:317–335 (elapsedMs and the clock) — after a reload the memory timer restarts at 0:00 although the draft survives, so "Passed from memory in …" counts only from the reload. Evidence: kata-B3-s12-375.png "Time 0:00" with the draft restored; kata-B3-s13-375.png "Passed from memory in 0:01." Fix: store the elapsed time with the draft.
- [minor] site/data/katas/lab-turn-limit.json (tests: GUARD = 50) — the first failure a learner sees on the starter is "RuntimeError: step was called more than 50 times", not the assertion text ("after 3 turns without done, return max_turns"). Evidence: kata-B3-s3-375.png (2 of 5 pass; the message row). Fix: show the assertion message, or a plain line for the guard ("Your loop has no exit yet").
- [minor] site/assets/components/hx-replay.js:358 — the filter line ends with a dangling separator: "Showing: Loop only ·". Evidence: replay-B1-s6-375.png. Fix: drop the "·".
- [minor] site/assets/components/hx-replay.js:368–369 — with the filter on, the detail line still names the current event's wire ("t = 149.4 s · Errors") while the list shows only Loop rows. Evidence: replay-B1-s6-375.png and replay-B1-s6-1280.png. Fix: move the playhead to a filtered event when the filter is set, or name the filter in the detail line.
- [minor] site/assets/components/hx-replay.js:194 (strip keydown) and the lanes strip — on the phone the eight-lane strip is the only fast way to the end of the run, and nothing labels it as scrubbable. Learners used Step instead. Evidence: replay-B1-s1-375.png (strip with no caption); the end was reached with a tap on the far right (replay-B1-s5-375.png). Fix: a caption under the strip ("Tap or drag to jump").
- [minor] site/assets/components/hx-replay.js:179 and :333 — the readout "Desk 0%" (context used) is not explained where it first appears. Evidence: replay-B1-s1-375.png. Fix: one gloss on first use ("Desk: how full the model's window is").
- [minor] site/assets/components/hx-incident.js:256–262 (fix rows) — on 375 px, once "The one that works" is shown, the mark takes half of each fix row, and the fix text wraps to about six lines in a narrow column. Evidence: incident-B2-s8-375.png. Fix: put the mark above the text, on its own line.
- [minor] site/assets/components/hx-incident.js:151–152 (commitFix) — "Commit fix" is final. After a wrong fix the fix rows are disabled and there is no second try; the page says "That fix does not stop it. The one that works is marked." Evidence: probes-B.json p2_wrong_fix (commitDisabled true, fix-1 checked and disabled, retry click timed out). Fix: allow one retry, or say before commit that the choice is final.
- [minor] site/assets/components/hx-incident.js:292–299 (keydown map) — the transcript moves only with ArrowUp/Down/Left/Right, one row per press. There is no Home, End or jump, so from the top a keyboard learner needs 21 ArrowDown presses to reach the first bad event (row 21). The count is derived from the roving list (24 rows); the k1280 log shows the same stepping ("1x ArrowUp" from row 22 to row 21). Cards support Home and End (hx-cards.js:382–390). Fix: add Home and End.
- [minor] site/assets/components/hx-cards.js:311 — when a miss is re-queued, the progress counter jumps from "3 of 6" to "4 of 7" (the card is shown again). Evidence: cards-B4-s4-375.png (the wrong answer) and the progress trail in log-B-m375.jsonl. Fix: "1 card comes back" in the summary line, or keep the total fixed.
- [minor] site/assets/components/hx-kata.js:359 (editor) — on 375 px the starter's long docstring lines wrap inside the editor, so the visible line numbers no longer match the code lines. Polish only. Evidence: kata-B3-s3-375.png.

### Verified (no finding)
- Replay: the spiral's first repeat shows as "seen at turn 3" on the playhead row at event 40 (turn 5), an identical pytest run that fails with "expected 6" (replay-B1-s3-375.png). The end of the run reads "Turn 60: an operator notices the run and stops it." and "The run ends: interrupted." (replay-B1-s6-375.png, filtered view). Play at 4× advances, and Pause stops it. The filter, the Wire view and Show all work on both layouts (phone select; desktop lane labels).
- Incident: wrong taps answer under the tapped row: "Too early: that step was reasonable." (row 5), the note plus, after the second wrong tap, the hint "Find the moment the model claims success. What checked that claim?" (row 13), "Too late: things had already gone wrong before this." (row 22). Row 21 is found with the why. Naming shows "Right." on False “done” and "Right. The trouble is on the Verification & evals wire." Result: "Your fix is the one that works." and "3 wrong taps." (incident-B2-s2 to s8).
- Kata: the three hints unlock one at a time. The typed fix gives "5 of 5 tests pass". Practice code is restored after reload (before and after: 294 characters). Memory draft is restored after reload (see the answer below).
- Cards: the wrong answer shows "Not quite." and "Right answer: Context & memory". The missed card comes back in the same session. The summary "7 reviewed: 6 right, 1 again. Next due: tomorrow (6 cards)." matches the Leitner rules (box 2 = one day). Spot-bug, order and name-family cards show "Right." and the right answer.
- Keyboard pass: all four tasks completed. Radio groups work as one Tab stop plus arrows. The transcript's roving tab stop works. Focus rings are visible: 18 focus samples in log-B-k1280.jsonl show a 3 px solid outline.
- Reduced motion: no CSS animations run during replay playback in either mode (probes-B.json p5).
- axe-core: not run in Pass B (the audit was Pass A's). Console: no errors or page errors on any page in any pass except the wasm probe (expected).

### Director's question: does the memory draft come back after reload?
Yes, in normal storage. Evidence: `reload-memory restored: true` in all four passes (log-B-m375, d1280, k1280, r375). The text after reload matches the text before it (probe-draft A). Three limits:
1. Storage blocked (for example a locked-down or private setup): the draft is lost silently (major, above).
2. A reload within 0.5 s of the last keystroke loses those keystrokes (minor, above).
3. The timer restarts at 0:00 after a reload (minor, above).
The builder's blank result may come from (1) or (2). I could not reproduce a blank draft on normal storage.

## Walkthrough table (m375 pass; Q answers hold for d1280, k1280 and r375 unless noted)
Q1 Will Sam try to achieve the effect? Q2 Will Sam notice the action? Q3 Will Sam connect the action with the effect? Q4 After acting, does Sam see progress? Y = yes, N = no.

| Task | Step (what Sam does) | Q1 | Q2 | Q3 | Q4 | Evidence |
|---|---|---|---|---|---|---|
| B1 | s1 Open the replay (paused at event 1 of 484) | Y | Y | Y | Y | replay-B1-s1-375.png: "Turn 0/60", Step and Play visible; no autoplay |
| B1 | s2 Step four times | Y | Y | Y | Y | replay-B1-s2-375.png: counter 14/484, inline sentence "t = 3.0 s · Loop" |
| B1 | s3 Keep stepping until the repeat cue appears | Y | Y | Y | Y | replay-B1-s3-375.png: at 40/484 (turn 5) the pytest run is marked "seen at turn 3" and failed "expected 6" |
| B1 | s4 Play at 4× for 4 s, then Pause | Y | Y | Y | Y | replay-B1-s4-375.png: counter 72/484 |
| B1 | s5 Jump to the end (far right of the strip; End on keyboard) | Y | Y (weak) | Y | Y | replay-B1-s5-375.png: counter 477/484 (the end text, "The run ends: interrupted.", is in replay-B1-s6-375.png); strip not labelled (minor) |
| B1 | s6 Filter to Loop & state (select on phone, lane label on desktop) | Y | Y | Y | Y | replay-B1-s6-375.png: only Loop rows; "Showing: Loop only ·" (minor) |
| B1 | s7 One Step with the filter on | Y | Y | Y | Y | replay-B1-s7-375.png: 478/484, "t = 151.0 s · Loop" |
| B1 | s8 Switch the current event to Wire view | Y | Y | Y | Y | replay-B1-s8-375.png: the event's JSON |
| B1 | s9 Show all | Y | Y | Y | Y | replay-B1-s9-375.png |
| B2 | s1 Open the first incident | Y | Y | Y | Y | incident-B2-s1-375.png: "Tap the first event where things went wrong." |
| B2 | s2 Wrong tap 1: row 5 "Reading slug.py." | Y | Y | Y | Y | incident-B2-s2-375.png: "Too early: that step was reasonable." |
| B2 | s3 Wrong tap 2: row 13 "Removing the spaces instead." | Y | Y | Y | Y | incident-B2-s3-375.png: the note, then the hint after the second wrong tap |
| B2 | s4 Wrong tap 3: row 22 "The trace records 5 events." | Y | Y | Y | Y | incident-B2-s4-375.png: "Too late: things had already gone wrong before this." |
| B2 | s5 Tap row 21 "All tests pass. Done." | Y | Y | Y | Y | incident-B2-s5-375.png: "Found." and the why |
| B2 | s6–s7 Choose False “done” and Verification & evals, Commit | Y | Y | Y | Y | incident-B2-s7-375.png: "Right." on both, after Commit (s6 is before Commit, no verdict yet) |
| B2 | s8 Choose the first fix ("Check the work on every done claim…"), Commit fix | Y | Y | Y | Y | incident-B2-s8-375.png: "Your fix is the one that works.", "3 wrong taps." (fix text squeezed, minor) |
| B3 | s1 Open practice; Python loads near the viewport | Y | Y | Y | Y | kata-B3-s1-375.png: Run disabled, "Loading Python (about 13 MB, the first time only)…" |
| B3 | s2 Python ready (about 2 s on this machine) | Y | Y | Y | Y | kata-B3-s2-375.png: Run enabled |
| B3 | s3 Run the tests on the starter | Y | Y | Y | Y | kata-B3-s3-375.png: "2 of 5 tests pass"; first failure "RuntimeError: step was called more than 50 times" (minor) |
| B3 | s4–s6 Show hint 1, hint 2, hint 3 | Y | Y | Y | Y | kata-B3-s4 to s6-375.png: hints appear one at a time |
| B3 | s7 Type the loop with a second exit (for-loop, as hint 3) | Y | Y | Y | N | kata-B3-s7-375.png: no test feedback until Run (by design: the tests judge) |
| B3 | s8 Run the tests after the fix | Y | Y | Y | Y | kata-B3-s8-375.png: "5 of 5 tests pass" |
| B3 | s9 Reload: is the practice code still there? | Y | Y | Y | Y | kata-B3-s9-375.png: yes, same text (294 characters) |
| B3 | s10 Memory mode: blank file, timer note, hint button | Y | Y | Y | Y | kata-B3-s10-375.png: "# Write it from memory.", "The timer starts when you type.", "Show hint 1" (minor) |
| B3 | s11 Type two lines from memory; the timer starts | Y | Y | Y | Y | kata-B3-s11-375.png |
| B3 | s12 Reload: does the memory draft come back? | Y | Y | Y | Y | kata-B3-s12-375.png: RESTORED, timer 0:00 (minor) |
| B3 | s13 Write the function from memory, run | Y | Y | Y | Y | kata-B3-s13-375.png: "5 of 5 tests pass. Passed from memory in 0:01." |
| B4 | s1 Open; progress 1 of 6 | Y | Y | Y | Y | cards-B4-s1-375.png |
| B4 | s2 Term card: Show answer, Got it | Y | Y | Y | Y | cards-B4-s2-375.png: the key line appears after Show answer |
| B4 | s3 Wire-question card: Show answer, Got it | Y | Y | Y | Y | cards-B4-s3-375.png |
| B4 | s4 Which-wire card: wrong answer (Loop & state), Check | Y | Y | Y | Y | cards-B4-s4-375.png: "Not quite.", "Right answer: Context & memory", progress "3 OF 7" (minor) |
| B4 | s5 Spot-the-bug card: the row that breaks the pair, Check | Y | Y | Y | Y | cards-B4-s5-375.png: "Right." |
| B4 | s6 Order card: four items moved into turn order, Check | Y | Y | Y | Y | cards-B4-s6-375.png: "Right." |
| B4 | s7 Name-the-family card: Approval fatigue, Check | Y | Y | Y | Y | cards-B4-s7-375.png: "Right." |
| B4 | s8 The missed card returns: answer it right | Y | Y | Y | Y | cards-B4-s8-375.png: "Right." |
| B4 | s20 Summary | Y | Y | Y | Y | cards-B4-s20-375.png: "7 reviewed: 6 right, 1 again. Next due: tomorrow (6 cards)." |

Totals: 39 steps × 4 questions = 156 answers. N: 1 (B3 s7 Q4, by design). Weak Y: B1 s5 Q2. Keyboard pass adds one N: the incident's transcript arrow keys are not signposted (Q2), and the spoke-style arrow navigation has the same gap as Pass A's M7. All tasks completed without instructions in every pass.

## Nielsen heuristics seen on the way (shots under bp18/shots/)
- H1 Visibility of status: the shared radio group clears incident 1's choice while "Right." stays (incident-B-probe-shared-radio-after-375.png). The kata's loading line stays forever with no failure (probes-B p3, probe-py3 output). The memory draft is lost with no visible message (probe-draft C).
- H4 Consistency: "Reset to starter" loads a blank file in memory mode (probes-B p4). "Desk" and "Loop only ·" (replay-B1-s6-375.png).
- H5 Error prevention: a final commit with no second try (incident fix; probes-B p2).
- H6 Recognition: "seen at turn 3" needs reading the row to know what repeats (replay-B1-s3-375.png). The strip has no label (replay-B1-s1-375.png).
- H7 Flexibility: the transcript needs 21 arrow presses from the top (derived; log-B-k1280.jsonl shows the same stepping).
- H9 Error recovery: the Python failure has no recovery message (probe-py3 output under the wrong MIME type).
- H10 Help: "Desk" (replay readout) and the guard message "step was called more than 50 times" (kata-B3-s3-375.png).

## Wording a learner without AI background would not understand (exact text)
| Exact text | Where | Why it blocks Sam |
|---|---|---|
| "Desk 0%" | replay readout, hx-replay.js:333 | context window, named "desk" with no gloss |
| "RuntimeError: step was called more than 50 times" | kata first failure, lab-turn-limit.json tests | the guard's message, not the rule the learner must follow |
| "Passed from memory in 0:01." | kata, hx-kata.js:487 | timed after reload (minor, above) |
| "Showing: Loop only ·" | hx-replay.js:358 | dangling separator |
| "Reset to starter" (memory mode) | hx-kata.js:372 | wrong target (minor, above) |

## Scoring (1 = poor, 5 = excellent; weighted total out of 500)
| Criterion | Weight | Score | Evidence |
|---|---|---|---|
| Learning clarity: mechanism and real terms come through | 20 | 4 | The repeat cue and the sentences (replay-B1-s3-375.png); the hint ladder and the why (incident-B2-s2 to s5); the memory and from-memory framing. Lost points: "Desk", the guard message, the unexplained strip |
| Intuitive: tasks completed without instructions (count "no"s) | 20 | 4 | All four tasks completed in all passes. One "no" (typed fix, no feedback until Run, by design) and one keyboard "no" (transcript arrows not signposted) |
| Fun: wants to press again | 15 | 4 | Play at 4× and the repeat cue (replay); the escalating hunt (incident); "Passed from memory in" (kata); the summary and "Right." (cards) |
| Phone ergonomics at 375 px | 15 | 4 | Transport in the thumb zone, 48 px keys, no overflow. Lost points: the squeezed fix rows, wrapped kata code, the unlabelled strip |
| Accessibility | 10 | 3 | Full keyboard path, 3 px focus rings, reduced motion. Lost points: shared radio names across incidents (cross-talk), a stuck Python load with no failure path, arrow-only transcript without Home and End, and silent draft loss under blocked storage |
| Identity and memory: helps remember the wires and the clock | 10 | 4 | The repeat cue and "new" marks; Wire view; the wire names in the incident naming step |
| Credibility: professional engineering, not a toy | 5 | 4 | Real simulator runs; real Python tests; the cards' Leitner rules match the summary |
| Consistency across components | 5 | 3 | Same radio name in two incidents; "Reset to starter" in memory mode; "Desk"; "3 of 6" to "3 of 7" |

Weighted total: 4×20 + 4×20 + 4×15 + 4×15 + 3×10 + 4×10 + 4×5 + 3×5 = **385 / 500**. Pass A scored 375. Reference: the approved v2 prototype scored 470.

## Top 5 problems (in order)
1. Two incidents share one radio group: naming the second clears the first's choice while it still says "Right." (hx-incident.js:225, :237, :256).
2. The kata's Python failure is unreachable: a misconfigured host leaves "Loading Python" forever, with no message (py-worker.js:8–17; hx-kata.js:104–111).
3. Silent draft loss when storage is blocked: no visible notice on the lab pages (hx-kata.js:276–279; core/shell/announce.js).
4. Memory mode: "Reset to starter" loads a blank file, hints are available in the from-memory check, and the timer resets on reload (hx-kata.js:372, :387, :317–335).
5. Keyboard reach in the incident transcript: 21 arrow presses to the first bad event, no Home or End; and the fix commit is final (hx-incident.js:292–299, :151).

## The one thing that works best
The incident hunt. Three wrong taps each answered under the tapped row ("Too early: that step was reasonable.", the note plus the hint after the second miss, "Too late: things had already gone wrong before this."). The right row then opened "Found." with the why, and the naming and fix steps said "Right." or "Your fix is the one that works." (incident-B2-s2 to s8). A learner who starts with no idea where the failure is gets to the answer and the reason with no instructions.

## Summary (3 lines)
Findings: 0 blockers, 3 majors, 14 minors (17 total); all four tasks completed in all four passes.
Most important: the two incidents on incident.html share one radio group, so naming the second clears the first's chosen family while it still shows "Right." (hx-incident.js:225, probes-B.json p1_cross, incident-B-probe-shared-radio-after-375.png).
Score: 385 / 500 (Pass A 375; prototype 470); the incident hunt works best. Memory draft: restored after reload on normal storage; blank only if storage is blocked (silently) or the reload comes within 0.5 s of the last key.
