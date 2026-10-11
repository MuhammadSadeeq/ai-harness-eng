# Phase 5 gate evidence (SPEC §10 Phase 5 row; Appendix D), round 2

Base: HEAD 423b32e. Round 1 was checked on scratchpad/phase5-head (clean HEAD worktree). Round 2 is checked on scratchpad/phase5-head2, a fresh HEAD worktree with the changed files copied in (site/templates/domain-agent.md, eval-study.md, oss-contribution.md, rein-extended.md, site/assets/components/hx-readiness.css). Two symlinks (node_modules, .venv) and one gitignored symlink (site/vendor/pyodide, needed by the kata drill) are the only untracked entries there. Server: python3 -m http.server 8787 --directory site on phase5-head2 (stopped at the end).
Nothing is committed. The changed files are in the main working tree (listed in scratchpad/list-p5.txt).
"P3.L" is not a repo name (coordinator ruling); it is not checked.

Summary:
- 1 say prompts: PASS (134, unchanged from round 1).
- 2 Design Room prompts: PASS (6, unchanged).
- 3 from-memory katas: PASS (10 mapped, unchanged).
- 4 portfolio templates: FIXED, PASS. README skeleton now first in the four I3 templates. take-home.md is linked from the Interview Room (no README needed).
- 5 radar and brag sheet: FIXED, PASS. Seed regenerated from HEAD content; the radar reads it at L3 on all eight wires; brag sheet at 375 has no broken words and fits; print PDF clean.
- 6 placement check: PASS (unchanged from round 1; S0 page, 15 questions).
- 7 on-call shift: PASS on the regenerated seed; shift "done" explained (see 7b).

---

## 1. Say prompts: PASS

Command: python over site/data/say/bank.json; pytest tools/tests/test_gen_data_bank.py -v
Output: 134 prompts; wires control 17, context 14, loop 27, errors 6, tools 10, permissions 10, verify 22, observe 12; design 6, debugging 6, behavioral 4. Rubrics 4 to 5 lines. Bank test: 5 passed.

## 2. Design Room prompts: PASS

Source: site/data/design/I5.json (6 prompts, I5-d1 to I5-d6). Each has clarifying questions (4), an answer and points for each of the eight wires, cheating risks, cost and rollout, all non-empty.

## 3. From-memory katas: PASS

Mapping: loop B2-loop; tool validation A5-validate (T4-schema alternate); retries with a breaker C6-backoff; permission policy C9-policy; compaction C3-compact; trace writer I5-trace-writer; verification gate C11-gate; eval runner D1-eval; pass^k calculator I5-pass-k; idempotent retry F5-idempotent. All from_memory: true, 15 to 30 minutes.
check_katas (round 1, HEAD): "check_katas: 43 katas OK (309 candidates, runners agree)". Not re-run; round 2 does not touch katas.

## 4. Portfolio templates: PASS (fixed in round 2)

Round 1 finding: no README skeleton in any template.
Fix: each of domain-agent.md, eval-study.md, oss-contribution.md, rein-extended.md now starts with "## README" (before "## Question"): name, one line on what was built, how to run from the repo root (rein install line; the commands; the seed), the results table with the rein results columns, Claimed, Not claimed, and a Licence line. The existing sections follow unchanged.
Check (phase5-head2): README is the first section in all four; table header "| Task | Passed of trials | Wilson 95% interval | Tokens | Cost | Scripted |" equals the package's COLUMNS (rein/src/rein/results.py line 12); Claimed, Not claimed and Licence present. Four PASS.
take-home.md: unchanged. Linked from site/modules/interview-room.html line 191 ("../templates/take-home.md"), so the I5 link check passes. It is not one of the four I3 templates, so it needs no README skeleton.

## 5. Radar and brag sheet: PASS (fixed in round 2)

5a. The seed. Round 1's seed predated H9, H10, H11, H13, so every wire read L0. Round 2: scratchpad/phase5/seedgen/ regenerates it from HEAD content: extract.py reads the built modules (69), their compiled checks (site/data/checks), say items (site/data/say), katas (katas/*/meta.yaml), hx-step and hx-bench and hx-placement and hx-sort elements in each module page, and the I5 design prompts. bench.mjs runs each unique bench (34 configurations, 45 elements) on its old and new boards with the simulator the component uses (runBench, trial i on seed_base + i) and records the same summary the component emits. build_seed.py writes the entries in the component shapes (module, objectives, kind, detail, at) and the module records the store holds after a visit (status, objectives, objectives_seen).
Result: 499 evidence entries (check 253, say 134, bench 45, kata 42, step 11, sort 7, design 6, placement 1). Modules done 68; T1 started (see gap below). The old seed is kept as scratchpad/progress-seed-v1.json; the new one is scratchpad/progress-seed.json.
Gap found: T1.o3 ("Run mypy and fix a type error it reports") has no component that credits it (T1's checks cover o1 and o2 only). T1 is on no wire (wires: []), so no wire level depends on it. Content gap to decide.

5b. The radar (imported through the footer Import on readiness.html, then reloaded). The page's own readiness() gives:
- Summary: "Every wire is at L3."
- explained modules: 68.
Per wire (L1 "x of x modules explained"; L2 kata or step passed; L3 experiments or design drills):
- Control: L1 11 of 11; L2 6; L3 10. Level 3.
- Context: L1 19 of 19; L2 11; L3 16. Level 3.
- Loop: L1 25 of 25; L2 14; L3 22. Level 3.
- Errors: L1 11 of 11; L2 5; L3 9. Level 3.
- Tools: L1 16 of 16; L2 9; L3 13. Level 3.
- Permissions: L1 17 of 17; L2 11; L3 16. Level 3.
- Verification: L1 23 of 23; L2 13; L3 18. Level 3.
- Observability: L1 18 of 18; L2 9; L3 13. Level 3.
Which rule gives each level (lib/readiness.js, wireReadiness):
- L1 (can explain): every built module on the wire is explained, and there is at least one. Every wire's built modules are all explained.
- L2 (have built): L1, and at least one passing kata or step on a module of the wire (any module, built or not). Counts above.
- L3 (can defend with data): L2, and at least one credited bench or par on a module of the wire, or a credited design drill (design counts for every wire). Counts above include the six I5 design drills.
Check that the L3 rule is not only the design drills: with design entries removed (same readiness() call), every wire is still L3 from its bench and par entries: Control 4, Context 10, Loop 16, Errors 3, Tools 7, Permissions 10, Verification 12, Observability 7.
Radar screenshots: scratchpad/phase5/radar-v2-1280.png and radar-v2-375.png.

5c. The brag sheet at 375 (round 1 defect: "Permissi ons", "Verificati on", "Reas on"). Cause: .sheet-levels th, td had overflow-wrap: anywhere. Fix (hx-readiness.css only):
- overflow-wrap: normal on those cells (words never split).
- Under 700px: the wire names stay on one line; the cells take sp-1 side padding, so the four columns fit the phone sheet.
Check on phase5-head2 (brag-v2.mjs, a range check on every word in the table):
- 375: no broken words; table scroll width 275 of 275 (no scroll); page overflow 0.
- 1280: no broken words; table 636 of 636; page overflow 0.
- Variant check (brag-variants.mjs): the headings wrapping at spaces with normal padding overflowed by 50px at 375 (325 of 275); the final padding variant fits exactly.
Screenshots: scratchpad/phase5/brag-v2-375.png (viewed: all words whole, the table fits), brag-v2-1280.png.
Print: page.pdf (print media, A4) of the sheet on phase5-head2: scratchpad/phase5/readiness-print-v2.pdf, 2 pages. Page 1 viewed: the wire table, "Modules explained (68)", "42 katas and 11 steps passed", bench lines, all in order, nothing clipped. Words checked by pdftotext: Permissions, Verification, Observability, Reason, Set by you.

## 6. Placement check: PASS (not changed in round 2)

Component: hx-placement src="S0" on site/modules/same-model-different-harness.html (S0.o5). Content: content/S0/placement.yaml (15 questions). Probe (round 1, phase5-head): 15 real clicks at 375, "Where to start", "Suggested start: What a model does", no overflow, no page errors. The round 2 change does not touch it.

## 7. On-call shift at 375: PASS (re-run on phase5-head2 with the regenerated seed)

Probe: scratchpad/phase5/probe7b.mjs (fresh context; seed imported through the footer Import; the shift page at 375).
- Shift at start: incident "From C6 · Errors are the main path, a module you have done." (done scope now uses the seeded module records); cards "Nothing is due yet. Start your board with 20 new cards."; drill "From C3: Write a compactor that keeps the commitments."
- Due cards: none were due (the seed has no card state). Real clicks reviewed one new card: "Show answer", then "Got it" (card counter 1 of 20 to 2 of 20).
- Incident (c6-outage): tapped row 8 (the second 200 ms retry wait); "Found."; family Retry storm; wire Errors & recovery; fix "Retry with exponential backoff, jitter and a cap". Stored: wrong_taps 0, family_ok, wire_ok, fix_ok all true.
- Drill (C3-compact, from memory). Attempt history, stated in full:
  1. Run 1 (earlier probe, same seed): my first code returned a dict and missed the rules; 1 of 6 pass. The failed run was recorded as a kata entry (passed false) in that run's store.
  2. Run 2 (the one reported; a fresh context): the code followed the rules in the kata's meta.yaml hints (keep notes with turn before the current turn and kind in keep; summary heading and one line per kept note, "- (nothing kept)" when none; new history keeps the summary and the last two messages, and returns the messages unchanged when fewer than five or the last is not a user message). The hints are in the repo's meta.yaml; the in-app hint button was hidden until a run had failed, and it was not pressed, so hints_shown is 0. Result: 6 of 6 pass, "Passed from memory in 0:04". Stored kata: passed true, tests 6 of 6, hints_shown 0, solution_shown false, mode memory.
  The reported attempt was informed by the hint text, not written cold. Say so if you need a cold attempt.
- Record: "Recorded for today"; shift entry {incident c6-outage, drill C3-compact, incident_done true, drill_done true}.
- Evidence: the store went from 499 to 502. Footer export (phase5/export-after-shift.json): 502 entries; kinds check 253, say 134, bench 45, placement 1, kata 43, sort 7, step 11, design 6, incident 1, shift 1.
Screenshots: scratchpad/phase5/oncall-1-start-375.png, oncall-2-cards-375.png, oncall-3-incident-375.png, oncall-4-drill-375.png, oncall-5-recorded-375.png.

7b. The caveat ("No module is done yet" against "65 explained").
- The shift's done reads state.modules[id].status === "done" (core/shell/shift.js, doneModuleIds). The course map reads the same record through partMarks/moduleStatus (core/shell/pure.js, status done/started/todo). The module progress line reads store.state.modules[id].status (core/shell/module.js line 28). Same field, same "done" meaning.
- "Explained" is the radar's rule (lib/readiness.js explainedModules): every objective of the module credited by evidence entries that name the module. It does not look at the module record.
- "Done" is the store's status (core/shell/progress.js): the page is visited (noteVisit records the module's objectives) and every objective is seen (noteEvidence). A module can be explained by evidence and not done when its page was never visited. An imported seed with evidence and no module records has exactly that.
- Round 1: the seed had modules {} and no visits, so 0 done and 65 explained. The note was right for that store.
- Round 2: the regenerated seed has module records, so done 68 and explained 68 agree, and the note now names the seeded modules.
- Decision for you: an import does not rebuild the module status from evidence. A hand-made or old progress file can show modules explained on the radar and todo on the course map. I changed nothing.

---

## Gaps and decisions

1. T1.o3 has no crediting component. Content gap; T1 is on no wire, so no radar level changes. Decide: add a component or drop the objective.
2. Import does not rebuild module status from evidence (7b). Decide whether it should.
3. The brag sheet's scroll container (.sheet-table) has no tabindex, and the markup is JS, so this fix is CSS only. At 375 the table now fits and does not scroll, so the keyboard question does not arise there; at narrower widths it would scroll without a tabindex.
4. The drill's reported attempt used the kata's meta hints (not pressed in-app; hints_shown 0). A cold attempt would need a new kata run.
5. The worktree needs site/vendor/pyodide (gitignored) for the kata drill; a clean HEAD checkout without it cannot run katas in the browser.
