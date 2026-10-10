> Evidence for the Phase 1 gate. Screenshots and logs cited below stayed in the reviewer's scratch folder and are not committed; the findings were fixed in the commits after this report (see docs/PHASE1-GATE.md).

# BP-1.8 Pass A: first-time-learner walkthrough (report A)

Reviewer: hx-reviewer (rules: /home/user/ai-harness-eng/.claude/agents/hx-reviewer.md). No project files were edited, created, moved or deleted.
Brief: /home/user/ai-harness-eng/docs/blueprints/BP-1.8-walkthrough.md. Specs: docs/DESIGN.md §6–§9, §11, §12; docs/COMPONENTS.md §2, §5, §6, §8, §10.
Pages: site/index.html (home), site/labs/check.html, site/labs/bench.html, site/labs/clock.html, site/labs/wire.html.
Persona: Sam, career changer, knows basic Python, no AI build experience, 375 × 812 phone on the bus, 10 minutes.

## Method and coverage
- Served site/ with a node:http static server (scratch: bp18/serve.mjs). Chromium 1194 via Playwright 1.56.1 from /opt/pw-browsers. Nothing was installed.
- Real taps (phone, touch emulation), clicks (1280) and Tab / Shift+Tab / Enter / Space / arrow keys (keyboard pass). `__test` hooks were never called.
- Four passes, each running tasks A1–A6 end to end:
  - m375: touch, 375 × 812 (primary).
  - d1280: pointer, 1280 × 900.
  - k1280: keyboard only, 1280 × 900.
  - r375: touch, reducedMotion "reduce", 375 × 812.
- Result: all six tasks complete in all four passes, zero task failures on the final driver.
- Screenshots: /tmp/claude-0/-home-user-ai-harness-eng/4512a573-cc00-58ec-8db9-1f17cfd98bb0/scratchpad/bp18/shots/ (145 files), named `<page>-A<n>-s<k>-<width>.png`. Keyboard shots carry `-kbd`, reduced-motion shots carry `-rm`. Steps s99–s101 are the par-reached and boundary-probe steps on bench.html.
- Per-step logs: bp18/log-m375.jsonl, log-d1280.jsonl, log-k1280.jsonl, log-r375.jsonl (focus, live-region text, scroll, Tab paths). Audit: bp18/audit.json. Probes: bp18/probe-*.mjs, probe-P1-check-commit-no-choice-375.png.
- Driver notes, not product findings: my first runs matched hidden no-JS fallback copies (the authored children of each hx-* element) and used scrollIntoView, which moved Chrome's focus start point. Both were fixed and all four passes re-run on the final driver. Scroll in the keyboard pass is by mouse wheel. Spoke taps hit the 44 px `circle.hit`, the real target.
- Denied commands: none. No `tools/qa/_bp18_*` file was created. git status at the end shows site/assets/components/hx-kata.js modified. That is another agent's work, and I did not touch it.

## Findings
Severity: blocker = wrong fact, broken interaction, failing checker, a learner taught something false, or an accessibility failure that blocks use. Major = a real defect a learner or reviewer would notice. Minor = polish.

### Blockers
None. All six tasks completed in all four passes. No learner-facing wrong fact found: the bench sentences match the computed runs; the check reveal matches the bench; the clock change lines match the boards; the par value was verified (see "Verified").

### Majors
- [major] site/labs/wire.html:24 (and site/assets/components/hx-wire.js:61) — "Show what changed" is already pressed on load because the `diff` attribute turns the diff on. The first tap turns the diff off and removes the "new this turn" marks the button promises to show. Evidence: log-m375.jsonl `diff-state-on-load` pressed "true"; after the first tap `marks-after-tap` marks [] and pressed "false"; screenshots wire-A6-s1-375.png (marks present at load), wire-A6-s6-375.png (marks gone), wire-A6-s7-375.png (back on). Suggested fix: drop the `diff` attribute, or make the toggle state-neutral (for example "Changes: on / off" with aria-pressed), so a tap does what the words say.
- [major] site/index.html:110 and :28–30 — the module codes "C9" (also "C1", "C6", "C11", "C12" in the legend) and the word "due" are never defined on the page. The legend says "Empty: comes in C9" and the face label reads "comes in C9"; the top bar says "Board · 0 due" with no key. Evidence: text search of index.html finds "C9" only in the legend and the course map, and "due" only in the top bar and "0 cards due today"; screenshots home-A1-s3-375.png, home-A1-s2-1280.png. Suggested fix: one line under the clock, "Codes like C9 are module numbers; the course map lists them", and "0 cards due" with "due" explained once.
- [major] site/assets/components/lib/clockface.js:154–158 and site/assets/components/lib/board-tags.js:187–190 (SCENARIO_CODE) — below 520 px the tags on the face show bare codes ("TL", "TB"), and the legend gives only the words. A learner cannot map "TL" to "turn limit". Evidence: clock-A5-s4-375.png shows TL and TB on the loop spoke after Plug it in; the legend under it says "turn limit 12, budget 60,000"; no key on the page. Suggested fix: a key line under the face ("TL turn limit · TB token budget"), or the tag words on the face once the face is at least 343 px wide.
- [major] site/labs/bench.html:23 — the inline number "12" (`hx-num for="bench1" name="knob"`) is a second Tab stop for the same value as the Turn limit knob, and it is 29 × 29 px. hx-num supports `pointer-only` (hx-num.js:6, :74), which the page does not use. Evidence: Tab path on bench.html: skip link → span[spin] "Turn limit" → knob-minus → knob-range → knob-plus → Run ×20 (probe-tab output; log-k1280.jsonl). audit.json, 375 px, bench: span.hx-num-spin 29 × 29 (1280: 30 × 31). Shot: bench-A3-s1-375.png. DESIGN §7.7 allows pointer-only here; DESIGN §9 requires targets ≥ 44 × 44 px. Suggested fix: add `pointer-only` to that hx-num. Give any driving number a 44 px hit area.
- [major] site/assets/components/hx-bench.js:90–97 and :490 — the trial-grid marks ⊘ (stopped by a guard, such as the turn limit) and ‖ (interrupted) have no key on screen. The only keyed mark is "Pass: the run ends done and the checks pass." (line 490). Evidence: bench-A3-s4-375.png shows "⊘ 12" on the new board and "‖ 60" on the old board; the words "interrupted" and "stopped" appear only in aria-labels. Suggested fix: a one-row key under the grid, "✓ pass · ⊘ stopped by a limit · ‖ interrupted".
- [major] site/index.html:67–68 — the first call to action, "Continue" (S0), is a greyed link with aria-disabled and no href. A real tap does nothing, no message appears, and the reason is a small grey line below ("S0 opens soon. Its page is not built yet."). Evidence: probe-p.mjs P2 — after the tap the location stays /index.html and the live text is empty; computed opacity 0.45, cursor not-allowed; screenshot home-A1-s1-375.png. Suggested fix: until S0 exists, say so on the button ("S0 opens soon") or show the next built module as the primary action.
- [major] site/assets/components/hx-clock.js:241 and :259–272 — on the Harness Board the only Tab stop is the Control spoke. The other seven spokes are reachable only by arrow keys, and nothing on the page says so. Evidence: log-k1280.jsonl, A1: Tab lands on `g[spoke-control]`; Permissions is reached by ArrowLeft ×3 (kbd-arrow-focus presses 3). Screenshot home-A1-s3-1280-kbd.png has no instruction. Suggested fix: a visually hidden hint on the figure ("Arrow keys move between wires. Enter opens a card.") linked with aria-describedby, or make each spoke a Tab stop.

### Minors
- [minor] site/assets/components/hx-bench.js:555–557 and :702–718 — the PAR readout shows the bare number "6" under the label "PAR" with no unit, and the "Values tried" window repeats itself ("7 values tried" under the label "Values tried"). Evidence: bench-A4-s99-375.png. DESIGN §11: numbers carry units. Suggested fix: "PAR · 6 turns"; drop one of the two duplicated labels.
- [minor] site/assets/components/hx-check.js:110 and :163–165 — "Lock in my prediction" is aria-disabled until a choice is made. A tap does nothing and no hint appears. Evidence: probe-p.mjs P1 (live text identical before and after the tap); screenshot probe-P1-check-commit-no-choice-375.png. Suggested fix: on a tap with no choice, show "Pick an answer first."
- [minor] site/assets/components/hx-wire.js:118 and :125 — the turn stepper uses "−" and "+" (the numeric-stepper glyphs) for Previous and Next turn; the words exist only in aria-labels. Evidence: wire-A6-s2-375.png, "− Turn 3 of 6 +". DESIGN §7.2 uses Back and Step for turn transport. Suggested fix: visible "Previous turn" / "Next turn" text, or the replay's Back / Step pattern.
- [minor] site/index.html:74–75 — the kicker "Today's shift · about 10 min" and the heading "Today's shift" say the same thing twice. Evidence: home-A1-s1-375.png. Suggested fix: keep one.
- [minor] site/index.html:300–301 — footer links "Design system", "LICENSE-OFL.txt" and "LICENSE-newsreader.txt" are 18 px tall at 375 and 1280 (audit.json: 91 × 18, 107 × 18). DESIGN §9 requires ≥ 44 × 44 px targets. Suggested fix: pad the link boxes to 44 px.
- [minor] site/assets/components/hx-bench.js:555 against :105 and site/labs/bench.html:28 — the same measure is "Worst run" in the readout and "worst case" in the sentence and table header. Evidence: bench-A3-s3-375.png ("Worst run ≈ $0.0264") against the live sentence "The worst case goes from 60 turns to 12 turns". Suggested fix: "Worst case" everywhere.
- [minor] Jargon before its module teaches it (DESIGN §11): "On the same 20 seeds" (site/labs/bench.html:25), "Two boards, the same seeds" and "Tap a seed" (hx-bench.js:486–488), "Knob Bench" (bench.html:16 and <title>), "Solution space" (hx-bench.js:561), "token budget" (site/labs/clock.html:51), and "Eight wires" / "harness" with no definition on the home page (index.html:57, :99). Evidence: bench-A3-s3-375.png, clock-A5-s3-375.png, home-A1-s1-375.png. Suggested fix: a gloss on first use, for example "seed: a fixed random start, so both boards face the same 20 runs".
- [minor] site/assets/components/lib/clockface.js:3 and :6, and site/labs/clock.html:49–60 — at 1280 each compare face is narrower than 520 px, so the wire names are dropped; they appear only in the legend list below. Evidence: clock-A5-s2-1280.png (faces with glyphs only). Suggested fix: label the faces at wide widths, or add names inside the compare plate.
- [minor] site/assets/components/hx-clock.js:241 — on clock.html each clock's first Tab stop is "Control plane, 12 o'clock" with no instance name, so five identical stops come before "Plug it in". Evidence: log-k1280.jsonl, A5 Tab path: skip link, then five `g[spoke-control]` entries. Suggested fix: an aria-label per clock ("Your board", "Old board", "New board").
- [minor] site/assets/components/hx-bench.js:708–719 — the par value is shown in the PAR readout after three distinct tries, while the knob is still at 10 (bench-A4-s4-375.png shows "6"). This matches DESIGN §7.6, but it gives the answer about four steps early. Suggested fix: reveal the marker on the chart, and show the number when the learner reaches par. Consider DESIGN §7.6 wording.

### Verified (no finding)
- Par is correct: at 6 turns 13/20 pass (worst ≈ $0.0099); at 5 turns 0/20 pass; at 4 turns 0/20 pass (bench-A4-s100-375.png, bench-A4-s101-375.png). So "cheapest worst case that keeps every passing run" = 6.
- Check reveal matches the bench: "Not this time. The same runs pass on both boards…", and each option is marked "your pick, tempting" or "right" with its reason (check-A2-s4-375.png, check-A2-s5-375.png).
- Audit (audit.json, five pages at 375 and 1280): no horizontal overflow (docW equals viewport), no visible text under 14 px, no console errors or page errors, and axe-core 4.13 (wcag2a/aa/22aa) shows 0 violations (one incomplete: color-contrast, not evaluated).
- Keyboard pass: all 29 focus samples in log-k1280.jsonl show a 3 px solid outline, rgb(26, 86, 219), matching DESIGN §2 --hx-focus (for example home-A1-s4-1280-kbd.png, check-A2-s2-1280-kbd.png).
- Reduced motion: with reducedMotion "reduce", the plug-in produces 0 running animations and no plug-in class; without it, 2 animations (probe-rm.mjs).
- Live text is announced for the key results (check verdict, bench sentence, "2 modules plugged in.").

## Walkthrough table (m375 pass; Q answers hold for d1280 and r375 unless noted)
Q1 Will Sam try to achieve the effect? Q2 Will Sam notice the action? Q3 Will Sam connect the action with the effect? Q4 After acting, does Sam see progress? Y = yes, N = no. Shots are in bp18/shots/.

| Task | Step (what Sam does) | Q1 | Q2 | Q3 | Q4 | Evidence |
|---|---|---|---|---|---|---|
| A1 | s1 Tap "Board · 0 due" in the top bar | Y | Y | Y | Y | home-A1-s1-375.png → home-A1-s2-375.png: page scrolls to "The Harness Board" (label is "Board", not "Harness Board") |
| A1 | s2 Find "comes in C9" in the legend | Y | Y | N | Y | home-A1-s3-375.png: "Empty: comes in C9"; C9 never defined (major, index.html:110) |
| A1 | s3 Tap the 7 o'clock spoke | Y | Y | Y | Y | home-A1-s3-375.png → home-A1-s4-375.png: card opens. Keyboard (k1280): Q2 N, arrow keys undocumented (major, hx-clock.js:259) |
| A1 | s4 Read the card | Y | Y | Y | Y | home-A1-s4-375.png: question, law, tags, "Level: Not started" |
| A2 | s1 Tap prediction 1 ("Yes. Runs that hit the limit fail…") | Y | Y | Y | Y | check-A2-s1-375.png → check-A2-s2-375.png (radio selected) |
| A2 | s2 Tap "Lock in my prediction" | Y | Y | Y | Y | check-A2-s3-375.png: "Locked in … Now run it."; bench unlocks |
| A2 | s3 Tap "Run ×20" | Y | Y | Y | Y | check-A2-s3-375.png → check-A2-s4-375.png |
| A2 | s4 Read whether right, and why | Y | Y | Y | Y | check-A2-s4-375.png "Not this time."; check-A2-s5-375.png "your pick, tempting" + reasons |
| A3 | s1 Tap "Run ×20" (turn limit 12) | Y | Y | Y | Y | bench-A3-s2-375.png → bench-A3-s3-375.png: 13/20 both boards |
| A3 | s2 Read results; say what the limit changed | Y | Y | Y | Y | bench-A3-s3-375.png, bench-A3-s4-375.png: 60 → 12 turns, ≈ $0.3988 → ≈ $0.0264, "New board: turn limit 12". "⊘ 12" and "‖ 60" unkeyed (major, hx-bench.js:490) |
| A4 | s1 Read the goal and the par readout | Y | Y | Y | Y | bench-A4-s1-375.png: "Hidden. Par appears after 3 different values." |
| A4 | s2–s8 Tap "−", Run ×20, seven times | Y | Y | Y | Y | bench-A4-s2 … s8-375.png: worst case 60 → 12 → 11 → 10 → 9 → 8 → 7 → 6 turns; no stop rule is stated (noted, not a no) |
| A4 | s99 Reach PAR | Y | Y | Y | Y | bench-A4-s99-375.png: "PAR 6" (unit missing, minor) |
| A4 | s100–101 One value below par | Y | Y | Y | Y | bench-A4-s100-375.png: 5 turns → 0/20 pass. Boundary confirmed |
| A5 | s1 Scroll to "Compare two boards: the loop" | Y | Y | Y | Y | clock-A5-s2-375.png: heading and faces reached after about 3 screens |
| A5 | s2 Read "What changes" | Y | Y | Y | Y | clock-A5-s3-375.png: "Loop: nothing → turn limit 12, budget 60,000" |
| A5 | s3 Tap "Plug it in" | Y | Y | Y | Y | clock-A5-s4-375.png: button → "Plugged in", "2 modules plugged in." (TL/TB codes unkeyed, major) |
| A6 | s1 Open the page (it starts on turn 3) | Y | Y | Y | Y | wire-A6-s2-375.png: "Turn 3 of 6" |
| A6 | s2 Tap "−" twice | Y | Y | Y | Y | wire-A6-s3-375.png: "Turn 1 of 6" |
| A6 | s3 Tap "+" twice (to turn 3) | Y | Y | Y | Y | wire-A6-s4-375.png: "Turn 3 of 6" |
| A6 | s4 Find what is new in turn 3 | Y | Y | Y | Y | wire-A6-s5-375.png: "new this turn" ×2, "3 messages unchanged" (diff already on) |
| A6 | s5 Tap "Show what changed" | Y | Y | N | N | wire-A6-s6-375.png: marks vanish; the toggle was already on (major, wire.html:24) |
| A6 | s6 Tap it again | Y | Y | Y | Y | wire-A6-s7-375.png: marks back |

Totals: 23 steps × 4 questions = 92 answers. N answers: 3 on the pointer passes (A1 s2 Q3; A6 s5 Q3 and Q4). The keyboard pass adds 1 (A1 s3 Q2). All six tasks complete without instructions, but Sam needs a retry on the Wire toggle and must guess the C9 code.

## Nielsen heuristics seen on the way (screenshot paths under bp18/shots/)
- H1 Visibility of status: silent taps on a greyed "Continue" and on "Lock in my prediction" with no choice (probe-P1-check-commit-no-choice-375.png; home-A1-s1-375.png). The diff toggle is pressed on load, so its label contradicts its state (wire-A6-s1-375.png, wire-A6-s6-375.png).
- H2 Match with the real world: "comes in C9" and "0 due" (home-A1-s3-375.png); "TL", "TB" on the face (clock-A5-s4-375.png); "On the same 20 seeds" (bench-A3-s3-375.png).
- H4 Consistency: "Board · 0 due" in the top bar against "The Harness Board" heading (home-A1-s1-375.png); "Worst run" against "worst case" (bench-A3-s3-375.png); "−" / "+" turn steppers against the replay's Back / Step (wire-A6-s2-375.png).
- H5 Error prevention: a primary button that goes nowhere until the page is built (home-A1-s1-375.png).
- H6 Recognition over recall: unkeyed ⊘ and ‖ marks (bench-A3-s4-375.png); unkeyed TL/TB codes (clock-A5-s4-375.png); module codes C9/C1 (home-A1-s2-1280.png).
- H7 Flexibility: keyboard users need undocumented arrow keys to reach seven of the eight spokes (home-A1-s3-1280-kbd.png).
- H8 Minimalist design: duplicated "Today's shift" kicker and heading (home-A1-s1-375.png).
- H10 Help: no definition of seed, knob, solution space or par on the demo pages (bench-A3-s3-375.png, bench-A4-s99-375.png). The home "Try this: find the 7 o'clock spoke" line helps (home-A1-s2-1280.png).

## Wording a learner without AI background would not understand (exact text)
| Exact text | Where | Why it blocks Sam |
|---|---|---|
| "Empty: comes in C9" | home legend, index.html:110 | C9 is a module code, never defined on the page |
| "Board · 0 due" / "0 cards due today" | index.html:30, :79 | "due" never explained |
| "TL" "TB" (tags on the face) | clock-A5-s4-375.png | bare codes, no key |
| "On the same 20 seeds" / "Two boards, the same seeds" / "Tap a seed" | bench.html:25; hx-bench.js:488 | "seed" undefined |
| "Knob Bench" / "knob" | bench.html:16 | jargon before the module that teaches it |
| "Solution space" | hx-bench.js:561 | jargon; the caption under it helps |
| "token budget" | clock.html:51 | "token" not taught yet |
| "Eight wires" / "harness" | index.html:57, :99 | "wire" and "harness" are the central terms and are not defined on the home page |
| "Worst run" | hx-bench.js:555 | a different word for "worst case" in the same plate |
| "⊘" "‖" (no words on screen) | hx-bench.js:90–97 | the marks carry the meaning with no key |

## Scoring (1 = poor, 5 = excellent; weighted total out of 500)
| Criterion | Weight | Score | Evidence |
|---|---|---|---|
| Learning clarity: mechanism and real terms come through | 20 | 4 | Predict → run → "Not this time" with reasons (check-A2-s5-375.png); honest sentences with ≈ and computed numbers (bench-A3-s3-375.png). Lost points: C9, due, TL/TB, seed, unkeyed ⊘ / ‖ marks |
| Intuitive: completes tasks without instructions (count "no"s) | 20 | 3 | 3 pointer "no"s (C9 meaning; Wire toggle ×2) + 1 keyboard "no" (arrow keys). All six tasks completed |
| Fun: wants to press again | 15 | 4 | The par puzzle with a solution-space chart and a hatched infeasible zone (bench-A4-s99-375.png); "PAR" state; instant feedback on Plug it in |
| Phone ergonomics at 375 px | 15 | 4 | 48 px keys, no overflow, no text under 14 px, legend list replaces labels. Lost points: 29 px inline number, 18 px footer links |
| Accessibility | 10 | 4 | Full keyboard path, 3 px focus rings, reduced motion honoured, axe 0 violations. Lost points: undocumented arrow keys, extra tab stops, silent disabled controls |
| Identity and memory: helps remember the wires and the clock | 10 | 4 | Fixed clock angles, glyphs and legend (home-A1-s2-1280.png); "new this turn" marks (wire-A6-s5-375.png). Lost points: TL/TB codes, no names on compare faces at 1280 |
| Credibility: professional engineering, not a toy | 5 | 4 | Computed numbers, honest sentences, par verified at its boundary. "Knob", "seed" and the disabled Continue read a little toy-like |
| Consistency across components | 5 | 3 | "Worst run" against "worst case"; "−/+" turn steppers; "Board" against "Harness Board"; toggle state against label |

Weighted total: 4×20 + 3×20 + 4×15 + 4×15 + 4×10 + 4×10 + 4×5 + 3×5 = **375 / 500**. Reference: the approved v2 prototype scored 470.

## Top 5 problems (in order)
1. The Wire View "Show what changed" is pressed on load, so the first tap hides the change marks (wire.html:24).
2. The Harness Board's codes are never keyed: "comes in C9", "0 due", and "TL" / "TB" on the face at phone width (index.html:110; clockface.js:154–158).
3. The trial grid uses ⊘ and ‖ with no key, so the bench results need a tap per cell to read (hx-bench.js:490).
4. The primary paths have dead ends with no message: the greyed "Continue" and the silent "Lock in my prediction" (index.html:67–68; hx-check.js:163–165).
5. Keyboard and touch targets: the spokes are arrow-only for keyboard users, and the bench's inline number is a 29 px second tab stop (hx-clock.js:259; bench.html:23).

## The one thing that works best
The predict → run → reveal loop on check.html. Sam picked the intuitive "Yes", locked it in, ran the bench, and the reveal said "Not this time. The same runs pass on both boards…", with "your pick, tempting" and a reason for each option (check-A2-s4-375.png, check-A2-s5-375.png). The outcome matches the bench numbers, and it works the same on phone, desktop, keyboard and reduced motion.

## Summary (3 lines)
Findings: 0 blockers, 7 majors, 10 minors (17 total), with 0 failed tasks across four passes.
Most important: the Wire View's "Show what changed" is pressed on load, so the first tap hides the very marks it promises (site/labs/wire.html:24; wire-A6-s6-375.png).
Score: 375 / 500 against the reference 470; the predict-and-reveal loop on check.html works best.
