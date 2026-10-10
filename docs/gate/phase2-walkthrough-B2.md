# BP-2.6: first-time-learner walkthrough of B2 "The agent loop" (Phase 2 gate)

> Evidence for the Phase 2 gate. Screenshots, logs and probes stayed in the reviewer's scratch folder and are not committed; the findings below cite them by name.

Reviewer: hx-reviewer. No project files were edited, created, moved or deleted. This report is the only file written.
Brief: docs/blueprints/BP-2.6-walkthrough.md. Specs: docs/DESIGN.md §6–§9, §11, §12; docs/COMPONENTS.md §2, §5, §6, §8, §10; docs/AUTHORING.md.
Page: site/modules/the-agent-loop.html (content/B2/*.yaml, katas/B2-loop/, facts/api.yaml, scenarios/b2-spiral.json).
Persona: Sam, career changer, knows basic Python, has used a chatbot, has never built an agent. 375 × 812 phone first, then a desk.
Tree: HEAD 03d7027, with uncommitted changes in site/assets/components/hx-check.js, hx-incident.js, hx-wire.js and site/modules/the-agent-loop.html (the JS builder's reload and reveal work, plus another builder's course-map lines). The four passes ran on HEAD 35ce238 plus the uncommitted tree as it stood at each run's start. Probes ran on the current tree.

## Method and coverage
- Served site/ with a node:http static server (scratch: bp26/serve.mjs). Chromium 1194 via Playwright 1.56.1 from /opt/pw-browsers. Nothing was installed.
- Real taps (phone, touch emulation), clicks (1280), and Tab / Shift+Tab / Enter / Space / arrow keys (keyboard pass). `__test` hooks were never called.
- Four passes, each running tasks 1–6 end to end, on the clean chain:
  - m375: touch, 375 × 812 (primary). Log: bp26/log-m375.jsonl. Exit 0.
  - d1280: pointer, 1280 × 900. Log: bp26/log-d1280.jsonl. Exit 0.
  - k1280: keyboard only, 1280 × 900. Log: bp26/log-k1280.jsonl (rerun with arrow-key roving). Exit 0.
  - r375: touch, reducedMotion "reduce", 375 × 812. Log: bp26/log-r375.jsonl. Exit 0.
- Driver: bp26/walkB2.mjs (scratch, not in the repo). Helpers: bp26/helpers.mjs. Screenshots: bp26/shots/.
- Targeted probes on the current tree: bp26/probeReload.mjs (predict, incident, reload, Wire), bp26/probeTid3.mjs (tool_use_id position in the Wire JSON box), bp26/probeKbd2.mjs (keyboard page error), bp26/probeKey.mjs (⊘ key), bp26/probeCount.mjs (bench cell counts).
- Driver notes, not product findings: the first runs failed on driver selectors (a `nth-of-type` that matched the wrong check; a Tab-only path into roving groups). Both were fixed. On the keyboard pass, "Open the margin note" was a driver assumption: on desktop the margin note is a visible aside with nothing to open, so the step is read, not tapped.
- The kata solution I typed is my own structure, but I had read katas/B2-loop/solution.py during setup, so it is not fully independent of the reference.

## Retest of the coordinator's list (final tree)
| Item | Verdict | Evidence |
|---|---|---|
| Term popovers | FIXED | Runtime (m375, d1280, r375, k1280 logs, dfn-after-tap): the agent-loop dfn goes from no role to role=button, tabindex 0, aria-expanded false then true, and one .term-pop appears. Cause was an object-vs-array mismatch in termEntry; fixed in pure.js. |
| Kata credit (failing run credits nothing) | FIXED | Starter run (0 of 9) leaves the count at 4 of 5 in m375, d1280, r375 (no change from the see credits); the typed solution (9 of 9) brings it to 5 of 5. Not tested: a wrong check answer (B2-c1 and B2-c2 were answered correctly). |
| Fact chips open in a new tab | FIXED | Chip href is the GitHub README; navigated_away false in all four passes (fact-chip events). |
| Fix copy (seed, bench, 12-turn start) | FIXED | Copy now says "The new board starts with a turn limit of 12, a safe guess. The bench runs both boards on the same 20 seeds; each seed is one scripted run, so it repeats exactly." |
| Incident why | FIXED | Found text now names the reply that asks for the edit and the rows that run it: "This reply asks to turn + 1 into - 1 ... and the next rows run that edit." |
| "N of 5 objectives done", done marks | FIXED (copy); marks not captured | Line reads "2 of 5", "4 of 5", "5 of 5 objectives done" in all passes. A screenshot of a done mark in the list was not taken. |
| Reload resets the Break | FIXED on the current tree (uncommitted) | Probe after commit and fix: reload keeps the predict choice checked, the verdict, the found block, and 2 of 5 objectives. The earlier m375 and d1280 passes still reset, because they ran before the change; r375 and k1280 kept the predict lock and verdict. Commit the JS change to make it stick. |
| Late predict reveal | OPEN | Probe: no verdict after Lock in; the verdict appears only after the fix (commit-fix). Same in all four passes (t1 reveal events). |
| tool_use_id in Wire view | PARTLY | The id is in the Request JSON, about 2,250 px down inside a 416 px scroll box (probeTid3: first visible match at scrollTop 2250). The automated scroll to the element did not bring it into view, and the screenshot shows the schema, not the id (shots/see-B2-s5-375.png). Findable by scrolling, but buried. See major 1. |
| ⊘ key on the new board | FIXED | shots/key-newboard-375.png: under the new board, "✓ pass   ⊘ stopped by a limit". |
| data-run on the See code (no Run control) | Accepted | CI-only (check_snippets), backlog B-13, per the coordinator. Not recorded as a finding. |

## Findings
Severity: blocker = wrong fact, broken interaction, failing checker, a learner taught something false, or an accessibility failure that blocks use. Major = a real defect a learner or reviewer would notice. Minor = polish.

### Blockers
None.

### Majors
1. [major, partly fixed] Wire view: finding one tool_use_id needs a learner to scroll inside a 416 px box for about 2,250 px. The Request JSON is a 3,460 px pre inside div.wire-json-scroll; the id is in the messages list near the bottom. Evidence: bp26/probeTid3.mjs; screenshot shots/see-B2-s5-375.png shows only the schema. Fix: point to the line in the figure caption ("look in messages, about halfway down"), or open the box at the messages list, or give the box a "jump to messages" control.

### Minors
2. [minor, open] Late predict reveal. "Not this time." and "Your fix is the one that works." appear only after the incident fix. Sam makes a prediction, hunts for seven steps, and only then learns whether the prediction was right. Evidence: t1 reveal events (all passes) and the probe on the current tree. Fix: show the verdict once the hunt finds row 29, or say on the lock line "Your answer is checked when you fix the run."
3. [minor, open] hx-cards keydown handler reads an unloaded store. Document keydown is bound before setup, and onKey calls `this.cards.get(...)` (hx-cards.js:58; the read is in onKey, around line 244) while the cards are not loaded. Reproduced: a Tab sweep after the predict commit logs "TypeError: Cannot read properties of undefined (reading 'get')" (bp26/probeKbd2.mjs). Console error only; other handlers still run. Fix: return early when `this.cards` is not set.
4. [minor, open] Keyboard: incident rows, clock spokes and card JSON rows are arrow-key groups, so Tab reaches one stop in each. The clock says "Tap a spoke, or use the arrow keys." (hx-clock.js:218), but the incident says only "Tap the first event where things went wrong." Evidence: the first k1280 run was blocked on Tab; the rerun reached rows 9, 20 and 29 with ArrowDown and spokes with ArrowRight (log kbd-roving events). Fix: one line under the incident: "Use the arrow keys to move between events, Enter to pick one."
5. [minor, open] Copy: "The loop above has two." is followed by three named exits (the done claim, the turn limit and the token budget). The See code has two: end_turn and the turn limit. Evidence: content around the exits paragraph (site/modules/the-agent-loop.html, the "Each way out of the loop is an exit" paragraph). Fix: "The code above has two exits: the done claim and the turn limit. A token budget is a third exit, which you will add."

### Verified (no finding)
- Numbers, Fix bench (probeCount, new board at 12 turns): 13 cells "checks pass", 7 cells "stopped by the turn limit"; the sentence reads "With a turn limit of 12 turns, the new board passes 13 of 20 runs." Matches.
- Numbers, Prove bench: old 13 of 20, new 13 of 20; worst case 60 turns to 12 turns; cost ≈ $0.3988 to ≈ $0.0264. The sentence "On the same 20 seeds, the new board passes 13 runs and the old board passes 13 runs. The worst case goes from 60 turns to 12 turns, and from ≈ $0.3988 to ≈ $0.0264." matches the readouts.
- Par boundary: on the pre-copy tree, 6 turns gave 13 of 20 and 5 turns gave 0 of 20 (bp26/log-m375-run1.jsonl, boundary-below-par). On the final tree the boundary sentence was not captured: the driver selector matched the explanatory paragraph. Re-read it before the gate.
- Starter fails 0 of 9 with "NotImplementedError: write the loop here". My typed solution (24 lines: budget checked before each call, one result per tool_use, unknown tool gives is_error) passed 9 of 9 on the first run, about 18 s to type.
- Cards: 9 right, 0 again, "Next due: tomorrow (9 cards)" in m375, d1280, r375 and k1280.
- Say it out loud: no text box is offered (1 of 2; Start, Skip the timer; "Nothing is recorded; this is just for you."). The brief's "type, if offered" does not apply.
- Memory kata: the hint button exists but is hidden (0 visible).
- Beat strip: the NOW mark moves to each beat (see, fix, prove, keep, break).
- Course map: among built modules only B2 is a link; the others read "soon". H1 and H2 are being marked built by another builder in the working tree.
- Console: no errors in m375, d1280, r375 or the k1280 rerun. The hx-cards error (finding 3) appeared only in the Tab-sweep probe.
- Layout: no horizontal overflow on the phone shots (docW 375).
- Keyboard: every task reachable by Tab, Enter and arrow keys; the only driver blocker was the margin-note step (desktop note is always visible).

## Walkthrough table (all four passes; per-pass details in the logs)
| Task | m375 | d1280 | k1280 | r375 |
|---|---|---|---|---|
| 1 Break | Predict answered, Lock in; 2 wrong taps with feedback; row 29 found; name and fix committed. Reveal after the fix. | Same. | Same; rows reached with ArrowDown. | Same. |
| 2 See | Loop spoke card read; B2-c1 and B2-c2 answered (verdicts shown); Wire view; tool_use_id found by scrolling (finding 1); term popover opens; fact chip opens new tab; margin note read. | Same. | Same, except the margin-note step (driver: note is always visible on desktop). | Same. |
| 3 Fix | Bench search to 6 (par); boundary at 5 gives 0 of 20; starter 0 of 9; typed solution 9 of 9. | Same. | Same; typed solution 9 of 9. | Same. |
| 4 Prove | Readouts and sentence match. | Same. | Same. | Same. |
| 5 Keep | Cards 9 of 9 right; say-it (no text box); memory kata with hint hidden; portfolio box. | Same. | Cards via arrow keys into the JSON row. | Same. |
| 6 Progress | Objectives 2, 4, 5 of 5 (done copy); beat strip moves; course map; reload keeps the done count. | Same. | Same; 5 of 5 after reload. | Same; reload keeps verdict and found block. |

## Scoring (1 = poor, 5 = excellent; weighted total out of 500)
| Criterion | Weight | Score | Evidence |
|---|---|---|---|
| Learning clarity | 20 | 4 | Hunt, verdicts and bench sentences match the screen; terms work. Lost points: late reveal, "two exits" copy, buried tool_use_id. |
| Intuitive | 20 | 3 | Reload and reveal logic confusing until the reload fix lands; Wire find needs scrolling. |
| Fun | 15 | 4 | The hunt, the bench puzzle, the kata that passes on the first typed run. |
| Phone ergonomics at 375 px | 15 | 4 | No overflow; the 416 px nested JSON box is the main phone cost. |
| Accessibility | 10 | 3 | Keyboard works with arrows; hx-cards console error; no arrow hint on the incident. |
| Identity and memory | 10 | 4 | Clock spokes, wires and the card deck carry the names. |
| Credibility | 5 | 4 | Chips open sources; the numbers match the bench cells. |
| Consistency | 5 | 4 | "done" copy now matches the list; the ⊘ key matches the grid. |

Weighted total: 4×20 + 3×20 + 4×15 + 4×15 + 3×10 + 4×10 + 4×5 + 4×5 = **370 / 500**. Reference: the approved v2 prototype scored 470.

## Top problems (in order)
1. The Wire find: a learner must scroll inside a 416 px box for about 2,250 px to see a tool_use_id (finding 1).
2. The prediction verdict arrives only after the fix (finding 2).
3. Keyboard learners get no arrow-key hint on the incident rows (finding 4).
4. A console error from the cards keydown handler on any key press before the cards load (finding 3).
5. The "two exits" copy names three exits after saying two (finding 5).

## The one thing that works best
The bench loop. Sam changes the turn limit, runs the 20 seeds, and the cells and the sentence agree (13 of 20 at 12 turns, 0 of 20 at 5 turns on the earlier tree). The number on the screen is the number in the sentence. That is what the brief asks B2 to teach.

## Time
Estimate, not measured. Sam: Break 8–10 min; See 10–12 min; Fix 25–30 min (the kata is the long part for a first loop); Prove 3–5 min; Keep 8–10 min. Total about 55–65 minutes. The module's 60-minute claim is roughly right for a learner who finishes the kata.

## Summary (3 lines)
Findings: 0 blockers, 1 major (the tool_use_id find is buried in a 416 px box), 4 minors open; 8 of the coordinator's items fixed, 1 open (late reveal), 1 partly (tool_use_id).
Most important: a learner must scroll about 2,250 px inside a Wire JSON box to see a tool_use_id; the probe is bp26/probeTid3.mjs.
Score: 370 / 500 against the reference 470; the hunt, the bench and the kata work on phone, desk and keyboard, and the four passes exited with no page errors on touch and pointer.
