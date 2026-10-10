> Verification round for the Phase 1 walkthroughs (evidence for docs/PHASE1-GATE.md). Screenshots and logs stayed in the reviewer's scratch folder.

# BP-1.8 verification round: Pass A and Pass B fixes at HEAD (report verify)

Reviewer: hx-reviewer. No project files were edited, created, moved or deleted.
HEAD: 86e0c33 "WIP (director): Pass B fixes (replay/incident done; kata/cards in progress)". The commit message says kata and cards were still in progress; I checked their current code and behaviour, and the status below says what I saw.
HEAD moved to 2d69aec ("Retire the Phase 0 prototypes", D-048) during the round. Its diff from 86e0c33 touches only site/proto and docs, so no component or lab file changed after my runs and the results above stand. docs/PHASE1-GATE.md (untracked) is not mine. Git status shows no change from me.
Earlier reports are untouched: report-A.md, report-B.md. Old screenshots are untouched; new ones are in bp18/verify/shots/.

## Method and evidence
- Walkthroughs re-run in full with copies of the earlier drivers that write only to bp18/verify/: verifyA.mjs (Pass A, passes m375, d1280, k1280, r375) and verifyB.mjs (Pass B, same four passes). Results: all 8 passes finished with 0 FAILED entries; console lists empty (verify/log-*.jsonl).
- Accessibility audit (read-only, five pages, 375 and 1280): auditv.mjs, output verify/audit.json. Axe: 0 serious or critical; no page over the width; no text under 14 px.
- Probes: probesBv.mjs (output verify/probesBv.json), probeFinal.mjs (verify/probeFinal.json), and probeSlow.mjs (output inline below).
- Serving: the scratch server (bp18/serve.mjs) now has test flags: BAD_WASM_BODY=1 (non-wasm body), HANG_WASM=1 (no response), SLOW_WASM_MS=n (correct wasm after n ms). These flags were not used for the walkthrough passes.
- Caveat: my earlier text/plain test does not reproduce the failure, as the director noted; I used a non-wasm body and a hung response instead.

## 1. The ten majors (7 from Pass A, 3 from Pass B)

| ID | Status | file:line checked | Fresh evidence |
|---|---|---|---|
| A-M1 Wire diff toggle pressed on load; first tap hides the marks | FIXED | site/assets/components/hx-wire.js:139–150 (new "Changes: Off / On" segment, data-key changes-off / changes-on, On pressed when diff is on); wire.html:24 still has the diff attribute, so On is the default | verify/log-m375.jsonl A6: diff-state-on-load pressed_on "true", pressed_off "false"; after tapping Off, marks-after-tap marks []. Shot verify/shots/wire-A6-s2-375.png: "Changes: Off | On" with On pressed |
| A-M2 "comes in C9" and "0 due" undefined | FIXED | site/index.html:30 ("0 cards due"), :117 (clock-note "C9 and the like are modules. The course map lists them all."), legend rows show "Empty: comes in C9 · Permissions" | verify/shots/home-A1-s3-375.png (legend with module names); index.html copy checked by text search |
| A-M3 TL and TB codes on the face, unkeyed | FIXED | site/assets/components/hx-clock.js:217 (clock-key line under each face: codes and names) | verify/shots/clock-A5-s4-375.png: "TL turn limit · TB token budget" under the face |
| A-M4 Bench inline number a 29 px second tab stop | FIXED | site/labs/bench.html:23 (pointer-only on the inline hx-num); lib hx-num pointer-only path | verify/log-k1280.jsonl A3 and A4 Tab path: skip → knob-minus → knob-range → knob-plus → Run ×20 (no span[spin]). verify/audit.json: no bench small target at 375 or 1280 |
| A-M5 Trial-grid marks ⊘ and ‖ unkeyed | FIXED | site/assets/components/hx-bench.js:28 (MARK_KEY: pass, false done, stopped by a limit, interrupted), :511 (mark-key per board) | verify/shots/bench-A3-s4-375.png: old board "✓ pass ‖ interrupted"; new board "✓ pass ⊘ stopped by a limit" |
| A-M6 Greyed "Continue" tap silent, reason in small print | FIXED (silent tap remains) | site/index.html:67 (button label now "S0 opens soon"), :68 (note) | verify/shots/home-A1-s1-375.png shows the reason on the button. A tap still does nothing, with no message (dead tap, not changed) |
| A-M7 Clock spokes: arrow-key navigation not signposted | FIXED on the Harness Board; PARTLY on clock.html | index.html:117 ("Try this: find the 7 o'clock spoke (arrow keys work too)", visible); hx-clock.js:184–186 (sr-only description, aria-describedby on the face) | home-A1-s3-375.png shows the visible hint. On clock.html the hint is screen-reader-only. Keyboard still reaches only one spoke by Tab (verify/log-k1280 A1: 1 Tab, then 3 ArrowLeft) |
| B-M1 Two incidents share radio names ("family", "wire", "fix") | FIXED | site/assets/components/hx-incident.js:28 and :34 (uid = hxi${++uidCount}); names now hxi1-family / hxi2-family | probesBv.json p1_names_inc1 ["hxi1-family", …], p1_names_inc2 ["hxi2-family", …]; after naming incident 2, p1_inc1_checked_after ["family-false-done"] (incident 1 keeps its choice). Shot verify/shots/probe-P1-shared-radio-fixed-375.png |
| B-M2 Python load can hang with no failure copy | FIXED for the stated failures (copy at about 45–50 s). NEW major N1 (see below) | site/assets/components/lib/py-host.js:8 (LOAD_LIMIT_MS = 45000), :62–64 (load timer → fail), hx-kata.js:104+ (uses the host) | probesBv.json p3_BAD_WASM_BODY: runDisabled true, loading visible at 5–45 s, failedCopy true at 50 s. p3_HANG_WASM: the same at 50 s. Shot verify/shots/probe-P3-HANG_WASM-1280.png: "Python could not load in this browser. Your code is still here, but the tests cannot run." Run disabled, code kept |
| B-M3 Blocked storage: the draft is lost silently | FIXED (kata and cards show a notice; replay and incident keep no typed state) | site/assets/components/hx-kata.js:29 (UNSAVED_COPY), :315 (dom.unsaved), :414 (shown when unsaved); cards show their own notice | probesBv.json p5_blocked_kata: notice "Your code is not saved in this browser. Copy it before you leave.", pageErrors []. probeFinal.json cards_blocked: "This browser is not saving progress, so it will be lost when you leave the page. Export a copy to keep it." |

Count: 10 of 10 majors addressed. 9 FIXED: A-M1 to A-M6, B-M1, B-M2 and B-M3 (B-M2 fixed for the failure states, with new major N1 below). 1 PARTLY: A-M7 (fixed on the Harness Board; clock.html has only a screen-reader hint).

## 2. Minors (spot-check; status against the report that listed them)

Pass A minors (10): FIXED 6, OPEN 4.

| ID | Status | Evidence / where |
|---|---|---|
| A-m1 PAR readout "6" with no unit; "7 values tried" duplicate | FIXED | hx-bench.js:556 (Values tried), readout text in verify log A4 s99: "PAR … 6 turns", "3" tried |
| A-m2 Empty commit silent | FIXED | hx-check.js:113 ("Pick an answer first."); probeFinal a_m2_empty_commit ["Pick an answer first.", …] |
| A-m3 "−" / "+" turn stepper | FIXED | hx-wire.js:119 and :126 (Previous turn / Next turn); verify/shots/wire-A6-s2-375.png shows "Previous" and "Next" as text |
| A-m4 "Today's shift" kicker repeats the heading | FIXED | index.html:74 now "About 10 minutes" |
| A-m5 Footer links 18 px tall | FIXED | verify/audit.json: home has no small targets besides the skip link and the screen-reader-only input |
| A-m6 "Worst run" vs "worst case" | FIXED | hx-bench.js:555 ("Worst case") |
| A-m7 Jargon before teaching ("seeds", "Knob Bench", "Solution space", "token budget", "Eight wires" with no gloss) | PARTLY | "Solution space" renamed to "Every turn limit" (hx-bench.js:561). OPEN: "same 20 seeds" (bench.html:25), "Knob Bench" (bench.html:16 and title), "token budget" (clock.html:51), "Eight wires" (index.html:99) |
| A-m8 Compare faces at 1280 without wire names | OPEN | verify/shots/clock-A5-s2-1280.png: glyphs only, names in the legend below |
| A-m9 Five identical "Control plane, 12 o'clock" tab stops on clock.html | OPEN | verify/log-k1280 A5 path: five `g[spoke-control]` entries with the same name before "Plug it in". Instance names exist only on the SVG (hx-clock.js:239–245), not on the spokes |
| A-m10 Par number shown after three tries (early reveal) | OPEN (left as is) | hx-bench.js:727 ("Par is in the chart. Keep looking."); matches DESIGN §7.6 |

Pass B minors (14): FIXED 12, OPEN 2.

| ID | Status | Evidence / where |
|---|---|---|
| B-m1 "Reset to starter" in memory mode, blank result | FIXED | probesBv p4_reset_label "Clear the file"; p4_confirm "Clear your code? Your draft will be lost."; p4_after blank |
| B-m2 Hints in the from-memory check | FIXED | hx-kata.js:442 (hint hidden in memory); verify/log-B-m375 kata-B3-s10 shows no hints; practice hints still shown at s6 |
| B-m3 Keystrokes lost in the 500 ms window | FIXED | hx-kata.js:7–8 (flushed at pagehide, when hidden, and on focus-out); probesBv p6_immediate_reload keeps the last line |
| B-m4 Memory timer resets on reload | FIXED | hx-kata.js:118–120 (restore elapsed_ms) and :194 (save elapsed_ms); verify log B3 s12 "Time 0:01" after reload; s13 "Passed from memory in 0:04" |
| B-m5 Guard message as the first failure | FIXED | data/katas/lab-turn-limit.json changed; verify/shots/kata-B3-s3-375.png: "RuntimeError: step() was called more than 50 times: the loop has no second exit yet." |
| B-m6 "Showing: Loop only ·" | FIXED | hx-replay.js:400 ("Showing: Loop only") |
| B-m7 Filter on, detail line names another wire | OPEN (not reproduced this run) | hx-replay.js:368–369 (detail now time and wire). This run's far-right tap landed on a Loop event, so no mismatch appeared; the filter still does not move the playhead |
| B-m8 Strip not labelled | FIXED | hx-replay.js:292 ("Tap or drag to jump" on phones; "Click or drag to jump…" on desktop) |
| B-m9 "Desk" unexplained | FIXED | hx-replay.js:213 ("Window used") |
| B-m10 Squeezed fix rows at 375 | FIXED | verify/shots/incident-B2-s8-375.png: "The one that works" above the text, full-width rows |
| B-m11 "Commit fix" is final | OPEN (left as is) | probesBv p2_wrong_fix: commitDisabled true, no retry text, verdict "That fix does not stop it. The one that works is marked." (hx-incident.js:151–152 unchanged) |
| B-m12 Transcript arrows only | FIXED | hx-incident.js:302–303 (Home and End) |
| B-m13 Progress "3 of 6" jumps to "4 of 7" | FIXED | hx-cards.js:319 (count stays on the queue start); the re-asked card shows an "Again" tag (hx-cards.js:318). Verify trail "3 OF 6Again", then "6 of 6" |
| B-m14 Kata lines wrap on the phone | FIXED | starter reflowed in data/katas/lab-turn-limit.json; verify/shots/kata-B3-s3-375.png: line numbers 1–12 line up |

## 3. New problems the fixes introduced

- N1 [major] site/assets/components/lib/py-host.js:8 (LOAD_LIMIT_MS = 45 s) and :62–64 — a load that succeeds slowly is now failed. Evidence (probeSlow.mjs, wasm delayed 60 s, correct content): samples every 5 s: runDisabled true and failedCopy false up to 45 s; failedCopy true from 50 s; still failedCopy true and runDisabled true at 60, 65, 70, 75 and 80 s, after the wasm had arrived. The host stays failed until a reload (py-host.js:1–3 says so: "A failed host stays failed"). The copy "Python could not load in this browser" then blames the browser for a slow network. For a learner on a phone on a bus, a first load of about 13 MB can take longer than 45 s. Suggested fix: do not fail a load that is still in progress. Show "Still loading… (this can take a minute on a slow connection)" after 45 s, keep waiting, and fail only on a real error or on a much longer limit (for example 120 s). Let a late "ready" revive the host.
- N2 [minor] site/assets/components/hx-kata.js:29 and the post-fix copy "Your code is still here, but the tests cannot run" — with N1 this reads as a browser fault. Fold into N1's fix.
- N3 [minor] site/index.html:117 — "C9 and the like are modules." is correct but awkward for a first-time learner. Polish: "Codes like C9 are module numbers. The course map lists them."
- Other checks, no new problem found: the Changes control and the first tap (A-M1), the empty commit hint (A-m2), the keyboard paths (verify/log-k1280, all tasks completed), reduced motion (verify/log-r375, all tasks completed), axe (0 serious or critical), and no console errors on any page in any pass.

## 4. Re-scores (same table and weights as the earlier reports)

Pass A (earlier 375):

| Criterion | Weight | Was | Now | Why |
|---|---|---|---|---|
| Learning clarity | 20 | 4 | 5 | C9 and the module names, TL/TB key, mark key, PAR in turns, "Worst case". Left: seed and Knob Bench jargon, early par reveal |
| Intuitive | 20 | 3 | 4 | Zero "no"s across the four passes, against four before. Not 5: the labelled Continue is still a silent tap, and the spokes need arrow keys |
| Fun | 15 | 4 | 4 | Unchanged |
| Phone ergonomics | 15 | 4 | 5 | No small targets except the skip link; bench number now a 44 px target; footer padded |
| Accessibility | 10 | 4 | 4 | Bench tab stop removed and arrow hint visible on home. Left: identical spoke names, sr-only hint on clock.html, identical tab stops |
| Identity and memory | 10 | 4 | 5 | Codes keyed under the face; the legend names each module; the mark key |
| Credibility | 5 | 4 | 4 | Unchanged |
| Consistency | 5 | 3 | 4 | "Worst case", "Previous / Next", "Changes: Off / On" in place. Left: "Board" against "Harness Board", "Knob Bench" against "Lab" |

Weighted total: 5×20 + 4×20 + 4×15 + 5×15 + 4×10 + 5×10 + 4×5 + 4×5 = 100 + 80 + 60 + 75 + 40 + 50 + 20 + 20 = **445 / 500** (was 375).

Pass B (earlier 385):

| Criterion | Weight | Was | Now | Why |
|---|---|---|---|---|
| Learning clarity | 20 | 4 | 4 | Guard message, "Window used", "Again" tag. Left: detail-line mismatch (B-m7 not reproduced), commit final, jargon gap |
| Intuitive | 20 | 4 | 4 | One "no" by design (typed fix shows nothing until Run) |
| Fun | 15 | 4 | 4 | Unchanged |
| Phone ergonomics | 15 | 4 | 5 | Full-width fix rows; strip caption; kata line numbers aligned |
| Accessibility | 10 | 3 | 4 | Radio names fixed; Home and End added; failure copy and notice; the flush. Not higher: the 45 s cap (N1) is a load failure, not an a11y item, so it does not count here |
| Identity and memory | 10 | 4 | 4 | "Again" tag and wire filter; the replay still cannot show a filter-consistent detail (B-m7) |
| Credibility | 5 | 4 | 3 | N1: a successful slow load is reported as "could not load in this browser", which damages the sense of engineering care |
| Consistency | 5 | 3 | 4 | Radio names, "Reset" copy, "Window used", card counter, "Showing:" line all fixed |

Weighted total: 4×20 + 4×20 + 4×15 + 5×15 + 4×10 + 4×10 + 3×5 + 4×5 = 80 + 80 + 60 + 75 + 40 + 40 + 15 + 20 = **410 / 500** (was 385).

## 5. Counts
- Majors (10): 9 FIXED, 1 PARTLY (A-M7 on clock.html); no major unaddressed. New major N1 (slow load fails at 45 s).
- Minors Pass A (10): 6 FIXED, 4 OPEN (A-m7 partly, A-m8, A-m9, A-m10). A-m10 was left on purpose (DESIGN §7.6).
- Minors Pass B (14): 12 FIXED, 2 OPEN (B-m7 not reproduced, B-m11 left on purpose).
- New problems: 1 major (N1), 2 minors (N2, N3).
- Blockers: none.
