# Phase 3 gate walkthrough (BP-3.9): reviewer report

Reviewer: hx-reviewer. Date: 2026-10-11. Brief: `docs/blueprints/BP-3.9-walkthrough.md`.
Scope: seven modules walked in full (A4, C3, C9, D2, F2, G4, T6) on two passes (m375, k1280), then the course checked as one path.
Reviewed state: the working tree on disk. Repo HEAD `aff3f8f`; `git status` lists 132 modified or untracked paths from other builders (rein/*, site/assets/components/hx-cards.js, hx-say.js, hx-readiness.*, lib/data.js, lib/readiness.js, site/assets/core/app.js, hx.css, shell/home.js, site/data/course-core.json, terms.json, site/design.html, glossary.html, index.html, about 60 site/modules/*.html and others). Findings below reflect that tree as it stood during this walk; a later edit by a builder can change them.
I edited no project file. Scripts, logs and screenshots are in scratch only.

## Summary
- Blockers: none confirmed. (I logged one on A4 first and retracted it; see R1.)
- Majors (5): progress credits a tap, not a success (A4); keyboard focus is dropped to the page top after "Show answer" and beat-strip links on every module walked (also on B2); incident events that quote the model fail WCAG 2.5.3 (Label in Name); the course map shows eight built pages as "soon" with no link; term markers are 19 px tall in prose.
- Scores on the B2 rubric: A4 355, C3 375, C9 355, D2 370, F2 355, G4 375, T6 345. None reaches B2's 400. The gap is mostly the shared template: the same two keyboard and touch defects are on B2 (see "Comparison with B2").
- Part 2: no term first used before its owner module; families and laws match course.json; the five benches' prose numbers match the bench on screen; the ten fact spans say no more than their claims except one check chip (minor).

## Method and coverage
- Served `site/` on 127.0.0.1 with a node:http static server (`phase3/server.mjs`). Playwright 1.56.1 with Chromium from `/opt/pw-browsers`. One browser at a time for the walks; the four batches ran as background jobs.
- Each module page was scrolled top to bottom first so the lazy `hx-*` components upgraded, as a reader would scroll.
- m375 (touch, 375 x 812, hasTouch): `locator.tap()` for every control. k1280 (keyboard only, 1280 x 900): Tab to the control, then Space (radios), Enter (buttons and links), arrows (radio groups, incident events, native selects). Real text entry with `keyboard.insertText` into the CodeMirror editor. No `__test` hook was called.
- Exceptions, all disclosed: (a) the touch pass sets native `<select>` values with `selectOption` (a native picker cannot be driven); (b) the keyboard pass focuses the kata editor by script, because Tab from the hint buttons lands in the from-memory kata; (c) pasted code is not used, but the time the from-memory timer reports (0:00) reflects a single insert, not real typing.
- Task mapping (BP-2.6 tasks): Break = prediction, incident, replay (where present); See = wire view, checks, lab (C3 desk levers, C9 gatekeeper, D2 dice); Fix = kata with one hint; Prove = bench; Keep = cards, say-aloud (read only, timer not run), from-memory kata, portfolio box; Progress = objectives line, beat strip, reload.
- T6 is a primer: it has no prediction, incident, replay or bench, so it is judged on its checks, kata, cards and progress.
- Not walked: F2's shift lab (`hx-shift`, drag-and-drop) and the C9 gatekeeper's two-round "by rule" part. Both are scored conservatively for that reason. I did not run any say-aloud timer.
- Logs: `phase3-shots/<ID>-m375/log.jsonl` and `phase3-shots/<ID>-k1280/log.jsonl` (14 walks, 66 to 86 log lines each), screenshots in the same folders (`*.png`, 4 to 10 per walk). Walker config in `phase3/cfg/`.
- Automated audits at each screenshot: horizontal overflow (0 px on all seven at 375), text under 14 px (0 on all seven), targets under 44 px (see M5). Console and page errors: none on any walk.

## Findings

### Blockers
None confirmed.

R1 (retracted). A4 Break: I first read the replay as showing the tool running while the incident says the tests never ran. The replay is a separate component in the "Read every block" section, and the page says so: "The replay below runs the new board on the same seed as the incident." It is not a contradiction. Evidence kept: `phase3-shots/A4-m375/Break-04-replay_first_bad.png`.

### Majors

M1. Progress credits a tap, not a success. Module: A4 (hx-incident has `data-objective="A4.o3"`, `site/modules/the-api-call-on-the-wire.html` line 105). Steps: at 375 wide, tap the radio "It runs the tool request", tap "Lock in my prediction", tap incident event 1 "The run starts". Objectives line: 0 of 5 becomes 1 of 5 (A4.o3). Every one of the eight events did the same when tapped alone (`phase3-shots/credit-0..7`); repeated on the quiet machine (`phase3-shots/credit-repeat`). B2 on the same steps: 0 of 5 (probe-b2credit). Against AUTHORING §13.7 ("only success credits an objective"). Fix: credit on finding the first bad event, not on any tap.

M2. Keyboard focus is dropped to the page top after activation (WCAG 2.4.3 focus order). Modules: all seven walked (k1280), and B2. Steps: keyboard, Tab to "Show answer" in the cards, press Enter. `document.activeElement` is BODY; the next Tab lands on "Again" (`probe-lost`). Same after Enter on the beat-strip link ("3 Fix", or "2 Fix" on T6). A4 also loses focus after Enter on the code "Run" key (`pre[data-run]`, line 137). The log counts: A4 3, the other six 2 each (`phase3-shots/*-k1280/log.jsonl`, `focusLostToBody`). Fix: move focus to the revealed answer, and to the section heading after a beat jump.

M3. Label in Name fails (WCAG 2.5.3, Level A) on incident events that quote the model. Modules: A4 (event 6), C3 (event 6), C9 (event 6), F2 (event 7). Step: at 375, tap the event whose visible text is "“I'll run the tests first.”" The accessible name is "Loop & state: The model asks for 1 tool call: run_command." (`probe-labels`). Name-based taps and keyboard search for the visible quote failed on C3, C9 and F2 in both passes (`phase3-shots/C3-*`, `C9-*`, `F2-*`, "FAILED tap event"). Speech-control users cannot say the visible text. Fix: start the label with the visible text.

M4. Way-finding: the course map shows built pages as "soon". Pages: E1, E2, H0, I1, I2, I3, I4, I6 (`site/index.html` li elements at lines 216, 247, 270, 272 and others; `data-built="false"`, and a visible `<span class="soon">`). Each page exists on disk and is a full page (1,259 to 1,996 words; no stub text). Correctly "soon": H7 to H13 (no page). Excluded by the brief: H3 to H6 and I5 (Interview Room, build track). The map's data-built flag is 20 false and 50 true, while `course.json` marks all 70 modules "planned". The build track may be finishing these pages, but the map and the files disagree now. Repro: at any width, the course map lists E1 as "soon" and it has no link.

M5. Term markers are 19 px tall in prose. Modules: A4 (14 `dfn[data-term]` at 19 px, 34 to 93 px wide, in the prose), T6 (2 seen, `fixture` 50x19, `Parametrize` 93x19), B2 (6). DESIGN §9 sets 44 px for targets. The WCAG 2.5.8 inline-text exception may apply, but §9 is the project rule. Evidence: `phase3/targets.mjs` output. Fix: enlarge the hit area with padding so the line layout does not change.

### Minors

m1. A4-c3 fact chip over-reaches. `site/data/checks/A4.json` (A4-c3, option 2, line 78) attaches `api.max-tokens-incomplete-tool-use` to "Do not run the half-written request; retry with a higher max_tokens value." The claim covers only the docs' retry advice. The "do not run" part is the course's teaching, so the chip should not carry it.

m2. A4 heading repeats: "Read every block and every stop reason" is both the H3 section heading and the from-memory kata title (outline of the page; `hx-kata` memory variant).

m3. A4 prediction text repeats itself: the prose says "The reply has a text block, then a request for a tool. … Predict what the run does next." and the question below says "The reply has a text block, then a tool request." (`phase3-shots/A4-m375/Break-02-predict_locked.png`).

m4. Placeholder in prose before the bench runs: "On the old board, — of 20 runs pass." (C3 and D2, read before the run; after the run the bench shows 0/20 on C3 and 10/20 on D2). Reads as broken copy to a newcomer who has not run the bench yet.

m5. F2 bench label duplicated: "Sessions, progress file progress file" (log `F2-m375`, `read bench text after run`).

m6. D2 percent style mixes "95 %", "80 %", "99 %" (kata and checks) with "80%" (dice component). Also the bench legend "pass / false done" uses the failure-family name without a gloss (`phase3-shots/D2-m375/Prove-07-bench_result.png`).

m7. Home "Continue" stays on S0 after A4 is complete (5 of 5 objectives). `site/assets/core/shell/home.js` picks the first unfinished module in path order. That is defensible, but a learner who just finished A4 is sent back to S0. A decision for the director, not a bug.

m8. Glossary after A4: the header still says "323 terms shown" and shows no per-learner mark (`waymark` probe; text only, not screenshot-checked). Readiness after A4: "Nothing explained yet. Next step: Explain every Control module." I did not run the say-aloud timer, so I cannot say whether readiness should have moved. Recorded as unverified.

m9. Five laws repeat verbatim in a theory and build pair: B1/H2 "The model asks; the harness acts.", B2/H8, C1/H10, C6/H7, C11/H9. Fine if deliberate callbacks; say so in the build modules' margin notes (AUTHORING §13.11).

Not a finding (walker or tool limits, recorded for transparency): the C9 gatekeeper re-renders its Decide button on each timer tick, and touch taps raced the re-render in two runs; the keyboard pass completed Decide. Not confirmed as a product defect; a longer pass on a quiet machine would settle it.

## Scores (B2 rubric; 1 to 5 per criterion, weighted to 500)
Weights: learning clarity 20, intuitive 20, fun 15, phone 15, accessibility 10, identity and memory 10, credibility 5, consistency 5. B2's 400 is the re-score with all criteria at 4 (`docs/gate/phase2-walkthrough-B2.md`).

| Module | LC | Int | Fun | Phone | A11y | Id | Cred | Cons | Total |
|---|---|---|---|---|---|---|---|---|---|
| A4 | 4 | 4 | 3 | 3 | 3 | 4 | 4 | 3 | 355 |
| C3 | 4 | 4 | 4 | 3 | 3 | 4 | 4 | 4 | 375 |
| C9 | 4 | 3 | 4 | 3 | 3 | 4 | 4 | 4 | 355 |
| D2 | 4 | 4 | 4 | 3 | 3 | 4 | 4 | 3 | 370 |
| F2 | 4 | 4 | 3 | 3 | 3 | 4 | 4 | 3 | 355 |
| G4 | 4 | 4 | 4 | 3 | 3 | 4 | 4 | 4 | 375 |
| T6 | 4 | 4 | 2 | 3 | 3 | 4 | 4 | 4 | 345 |

One line each:
- A4 (355): the predict, incident and kata sequence teaches well and the checks explain every option, but a tap credits an objective (M1), Label in Name on the model-quote event (M3), the A4-c3 chip (m1), and the duplicated heading and prompt (m2, m3).
- C3 (375): the desk levers and the two-board bench teach the claim; bench numbers are bound with hx-num and match the screen; Label in Name on event 6 (M3) and the dash placeholder (m4) hold it back.
- C9 (355): honest about its model ("the course's model of a tired reviewer, not a measurement"); the gatekeeper's two rounds and timer are harder to follow than B2's single loop, and the bench shows equal pass rates, so the lesson rests on the text.
- D2 (370): the dice and the bench numbers are bound and match the prose (10/20 and 8/20); lower on the percent style and the legend jargon (m6).
- F2 (355): the handoff kata and the initializer facts are sound; the shift lab was not walked; duplicated bench label (m5).
- G4 (375): the old-board replay matches the incident, the checks explain each option, and all five objectives were credited; scored no higher because the template defects (M2, M5) apply.
- T6 (345): a primer with two checks and a kata, so Fun is 2; the rest matches the others.

Comparison with B2. B2's 400 was re-scored on the criteria it was scored on at the first pass, and its own re-score says target sizes and focus were not re-audited. I ran the same checks on B2: focus is lost after "Show answer" and the beat link (M2), and six term markers are 19 px (M5). On that basis B2 would score Phone 3 and Accessibility 3, which is 375, the same as C3 and G4. B2 does not credit an early incident tap (M1), so A4 is the one module that falls below the bar on progress. The Phase 3 modules are at about the bar; they are not above it.

## Part 2: course as one path
- Sequencing. Scanned 63 pages (53 mapped to a module id). Term markers (`dfn[data-term]`) against the owner module in `content/<ID>/terms.yaml` and the path order: 0 terms are used before their owner. Limit: only `dfn`-marked terms are checked. The Break sections of the seven walked pages carry no term markers, so Break prerequisites were read by hand, not checked mechanically; no undefined term turned up in them.
- Consistency. Course-map `data-family` against `course.json` families: 51 entries, 0 mismatches. The seven pages' laws match `course.json`. Across all 70 laws: no contradictions; five verbatim repeats (m9).
- Numbers, five benches (A4, C3, C9, D2, G4), after a real run. C3: prose "0 of 20" and "20 of 20", hx-num 0 and 20, match the bench. C9: "20 of 20" and "20 of 20" match. D2: hx-num 10 and 8, the prose "the new board passes 8 runs and the old board passes 10", match. A4: no hx-num; the sentence inside the bench reads "the new board passes 20 runs and the old board passes 0", matching the bench's 0/20 and 20/20; trials=20 is set on the component. G4: no hx-num; "twenty trials" matches trials=20. No mismatch found.
- Way-finding. Home Continue points to S0, which exists (`modules/same-model-different-harness.html`); its behaviour after A4 is m7. The course map's "soon" marks are right for H7 to H13 and wrong for the eight pages in M4. Readiness and glossary: m8.
- Truth, ten fact spans (span text against `data/facts.json` claim): (1) api.content-multiple-blocks, A4, ok; (2) api.stop-reason-tool-use, A4, ok; (3) api.stop-reason-end-turn, A4, ok; (4) api.stop-reason-max-tokens, A4, ok; (5) models.sonnet-5-5-price, A4, ok (the span omits the cache price, which says less); (6) api.max-tokens-incomplete-tool-use, A4-c3 chip, over-reaches (m1); (7) api.stop-reason-pause-turn, B2, ok; (8) papers.react-title-id, B2, ok (span is the title only); (9) anthropic.harn-progress-file, F2, ok (keeps the attribution); (10) anthropic.harn-initializer-agent, F2, ok. The other five walked pages carry no `data-fact` spans, so their course-internal claims were not tested for truth.

## Phase 4 and Phase 5: keep and avoid
Keep:
- Predict, then run, then the incident. "Locked in … Now run it." and "Too early: that step was reasonable" teach the failure.
- Every option explains itself after a check ("Tempting." / "Right." / "Wrong."), so wrong picks teach.
- Numbers bound with hx-num, and trials set on the component so the prose cannot drift.
- Honest labels on simulated content ("Illustrative numbers, not from a real…", "not a measurement").
- Progress and reload: the objectives line survived a reload on every module; predictions and checks were verified to survive on A4 only.
- Kata hints as a ladder, and a from-memory variant that starts blank.
- Prose budget: 459 to 597 words inside the beats on the seven pages (AUTHORING §13.10 allows 900).

Avoid:
- Credit on tap (M1). Credit on success only.
- Focus dropped after activation (M2). Move focus to the result.
- Accessible names that differ from the visible text (M3).
- Term targets under 44 px (M5).
- Dash placeholders in prose before a run (m4). Hide the sentence until there is a result.
- Mixed percent style and unglossed family names in bench legends (m5, m6).
- Course-map and data flags that disagree with the pages on disk (M4).

## Limits
- One reviewer, one machine; the machine was shared with the full gate for part of the walk. Batches were rerun where a failure looked like load, and only repeated failures are recorded.
- Scores are my judgements on the evidence above, with the criteria and weights from the B2 rubric; another reviewer could move a point on Fun and Consistency.
- No say-aloud timer run; readiness and glossary effects of completing a say-aloud are unverified.
- F2 shift lab not walked; C9 gatekeeper round two not walked.
