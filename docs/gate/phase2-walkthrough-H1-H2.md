# BP-2.6 light pass: learner walkthrough of the build modules H1 and H2

> Evidence for the Phase 2 gate. Screenshots, logs and probes stayed in the reviewer's scratch folder and are not committed; the findings below cite them by name.

Reviewer: hx-reviewer. No project files were edited, created, moved or deleted. This report is the only file written.
Pages: site/modules/rein-1-talk-to-a-model.html (H1), site/modules/rein-2-one-tool-and-the-loop.html (H2).
Content: content/H1/*.yaml, content/H2/*.yaml, steps/H1/step.yaml (chunks and checkpoint), scenarios/h1-first-block.json, scenarios/b2-spiral.json (H2 replay and bench), facts/models.yaml.
Persona: Sam, as in the B2 walkthrough. Light pass: predict and hunt (H1) or replay (H2), one figure, the step's chunk copy and checkpoint run, the bench sentence against its numbers, and the cards.
Tree: HEAD 782d9e5 (committed).

## Method and coverage
- Served site/ with the scratch node:http server (bp26/serve.mjs). Chromium 1194 via Playwright 1.56.1 from /opt/pw-browsers. Nothing was installed. `__test` hooks were never called.
- Passes: m375 (touch, 375 × 812) and d1280 (pointer, 1280 × 900), as asked. No keyboard or reduced-motion pass in this light pass.
- Driver: bp26/walkHX.mjs (scratch). Logs: bp26/log-h1-m375.jsonl, log-h1-d1280.jsonl, log-h2-m375.jsonl, log-h2-d1280.jsonl. Screenshots: bp26/shots/h1-B2-s<k>-<width>.png and h2-B2-s<k>-<width>.png (the shared helper labels the file names "B2"; the prefix tells the module).
- Probes: bp26/probeH.mjs (H1 bench sentence and readouts; H2 replay at the default seed and at seed 1), bp26/probeH2b.mjs (H2 checkpoint verdict and bench sentence).
- Each pass ran: break (predict, then the H1 hunt or the H2 replay), see (the Wire figure and one check where the page has one), fix (Copy new lines, then Run it here), prove (the bench run), keep (the cards, once).
- Driver notes, not product findings: the "check c1" step on H1 found no check item (H1 renders one check, the predict); the driver did not answer H2-c2, so H2.o3 stays open in these logs. "Open the margin note" was not run here.

## Findings
Severity: blocker = wrong fact, broken interaction, failing checker, a learner taught something false, or an accessibility failure that blocks use. Major = a real defect a learner or reviewer would notice. Minor = polish.

### Blockers
None.

### Majors
1. [major] H2 replay shows a different run from the one its prediction describes. The replay defaults to tape.golden_seeds[0], which is seed 0 (hx-replay.js:36). Seed 0 runs 6 turns, ends "done", and reads "The run ends: done, and the checks pass." (bp26/shots/h2-B2-s2-375.png: "Turn 6/6", counter 48 / 48; probeH: counter 0 / 6 at the default). The predict outcome directly above it says "The run went on for many turns. A person stopped it." At seed 1, the incident seed used on B2 (scenarios/b2-spiral.json, incident.seed 1), the same replay runs 60 turns and ends "The run ends: interrupted." (probeH: counter 0 / 60). So the replay Sam is meant to read shows a clean pass, not the spiral. Both passes (m375 and d1280) show the same. Fix: set seed="1" on hx-replay#spiral in site/modules/rein-2-one-tool-and-the-loop.html (line 61), and check the replay ends at the interrupted state.
2. [major] H1.o3 ("Show statelessness on your own machine: three separate runs don't remember each other") has no path that involves running anything on the learner's machine. In the page, hx-say is the only element that credits it (content/H1/say.yaml lists H1.o3). The two cards tagged H1.o3 (content/H1/cards.yaml, H1-k6 and H1-k7) credit nothing, because hx-cards.js:183 emits "cards" evidence with no objectives. In both passes the count stayed at 1 of 3 after all seven cards were answered right. Fix: add a checkable step for H1.o3 (for example, a checkpoint that runs three separate calls and compares their output), and make cards credit the objectives on their content.

### Minors
3. [minor] The checkpoint block clips at 375 px. The command "python rein.py "Say hello" --fake scenar..." and the expected output run past the right edge, so Sam must scroll the code box sideways to read the command and the output (bp26/shots/h1-B2-s6-375.png). Fix: wrap the command over lines, or allow the expected-output block to wrap.
4. [minor] "Run it here" shows "This matches the expected output." (both H1 and H2, both passes), but the progress line does not move. Only "Check my file" credits the step (hx-step.js:214 records evidence in checkMine only). A learner who matches the checkpoint sees no progress and may think the step failed. Fix: say on the verdict line how the step counts, for example "To count this step, check your own file."
5. [minor] Content that the pages do not render: content/H1/checks.yaml defines H1-c1, H1-c2 and H1-c3, and the H1 page renders only H1-p1. content/H2/checks.yaml defines H2-c3, and the H2 page renders H2-c1 and H2-c2. Confirm the intent: render the checks, or remove them from the content.
6. [minor] H1 prove copy uses undefined words: "Pass rate: old 0% (0–16%), new 100% (84–100%). The ranges don't overlap, so this difference is unlikely to be noise." "Ranges" and "noise" are not explained for a newcomer, and the 0–16% range is not defined anywhere. Fix: "The likely range for each board does not overlap, so the gap is not chance." or drop the sentence for Sam.
7. [minor] H1.o2 ("Print a reply with its stop_reason and token usage") is credited by the Break hunt (page line 60), which reads the stop_reason but has Sam print nothing. Fix: credit H1.o2 from a printed reply, or retag the hunt to the objective it teaches.

### Verified (no finding)
- H1 predict: the tempting option locks ("Locked in: 'It runs the tests, reads the output and keeps going.'"). The reveal "Not this time." appears when the hunt starts (B2 fix carried over).
- H1 hunt: wrong taps show "Too early: that step was reasonable."; row 7 (the first bad event, scenarios/h1-first-block.json first_bad_seq 7, seq 6 accepted) is found; family first-block-only, wire loop and fix "Read every tool_use block in the reply, and run each one" are committed. The result reads "It ended as done on turn 1. The tests never ran, and the checks still fail.", matching the scenario's why.
- H1 figure (Wire view, turn 1 of 5): "Next tool_use_id: 1 tool_use_id in this turn. Press Next to find each one."
- H1 step: "Copy new lines" shows "Copied"; "Run it here" finishes in about 3 s with "This matches the expected output." (both passes).
- H1 bench: the sentence "On the same 20 seeds, the new board passes 20 runs and the old board passes 0 runs. The worst case goes from 1 turn to 5 turns, and from ≈ $0.0011 to ≈ $0.0075." matches the readouts (old 0/20, new 20/20; 1 turn vs 5 turns; cost ≈ $0.0011 vs ≈ $0.0075). The grid shows 20 "false done" cells on the old board (bp26/shots/h1-B2-s7-375.png).
- H1 facts: models.ids-current (facts/models.yaml, verified 2026-10-10) matches the page's span, and the default model claude-sonnet-5-5 matches steps/H1/rein.py line 63.
- H1 cards: 7 of 7 right, 0 again, "Next due: tomorrow (7 cards)".
- H2 predict: the tempting option locks ("Locked in: 'The model says it is done, and the loop returns.'").
- H2 figure (Wire view, turn 2 of 6): "2 tool_use_ids in this turn."
- H2 check H2-c1: the correct answer ("One result for each tool_use, all together in the next user message") is reached in both passes.
- H2 step: "Copy new lines" shows "Copied"; "Run it here" shows "This matches the expected output." (probeH2b).
- H2 bench: the sentence "On the same 20 seeds, the new board passes 13 runs and the old board passes 13 runs. The worst case goes from 60 turns to 12 turns, and from ≈ $0.3988 to ≈ $0.0264." matches the readouts (13/20 each; 60 vs 12 turns; ≈ $0.3988 vs ≈ $0.0264). New board cells at 12 turns: 13 "checks pass", 7 "stopped by the turn limit" (probeH2b).
- H2 cards: 7 of 7 right, 0 again.
- Console: no errors on any of the four passes.
- Layout: no horizontal overflow (docW equals the viewport on all four passes).

## Walkthrough table (m375 and d1280 are the same unless noted)
| Module | Task | Result |
|---|---|---|
| H1 | Break | Predict locked; reveal at hunt start; row 7 found; family, wire and fix committed; result matches the scenario. Clear. |
| H1 | See | Wire figure at turn 1 of 5, with Next tool_use_id. The check step found no check item (the page renders only the predict). |
| H1 | Fix | Chunk copy shows "Copied"; checkpoint matches. Progress stays at 1 of 3 (finding 4). Command and output clip at 375 (finding 3). |
| H1 | Prove | Bench sentence matches its readouts. Pass rate sentence uses undefined words (finding 6). |
| H1 | Keep | Cards 7 of 7 right. The objective H1.o3 is not credited by cards (finding 2). |
| H2 | Break | Predict locked. The replay shows seed 0, a clean 6-turn pass, not the spiral (finding 1). |
| H2 | See | Wire figure at turn 2 of 6. Check H2-c1 answered correctly. |
| H2 | Fix | Chunk copy shows "Copied"; checkpoint matches. |
| H2 | Prove | Bench sentence matches its readouts and cell counts. |
| H2 | Keep | Cards 7 of 7 right. H2-c2 was not answered in this pass, so H2.o3 is not credited. |

## Time
Not measured in this pass. The B2 estimate applies in shape: the H2 Break is short (predict and replay), while the H1 and H2 steps need a real file (Check my file) for credit, which is the longer part.

## Summary (3 lines)
Findings: 0 blockers, 2 majors (the H2 replay shows a clean seed 0 run, not the spiral; H1.o3 is credited only by an oral self-grade), 5 minors open.
Most important: the H2 replay ends "done, and the checks pass" under a prediction that says a person had to stop the run; the spiral is seed 1 (hx-replay seed attribute).
Verified: the H1 and H2 bench sentences match their numbers, the checkpoints match on phone and desk, the cards are 7 of 7 on both passes, and no console errors or horizontal overflow.
