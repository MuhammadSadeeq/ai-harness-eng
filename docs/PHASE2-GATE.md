# Phase 2 gate: the exemplar

**Status:** passed on 2026-10-10 (director's sign-off, below). SPEC §10 sets two gate conditions for Phase 2:
**the director signs B2 off as "the bar"; AUTHORING.md is final.** Phase 2 also
delivers the Rein steps H1–H2 and the platform every module page uses. Each
part is below, with its evidence.

## 1. B2 "The agent loop", built to final quality

`site/modules/the-agent-loop.html` with `content/B2/*.yaml`, the `b2-spiral`
incident tape and the `B2-loop` kata.

| Beat | What the learner does | Components |
|---|---|---|
| Break | Predicts what a run that has edited and tested several times does next; the replay unlocks; hunts the first bad event; names the family and the wire; picks the fix | `hx-check` (predict), `hx-incident` |
| See | Reads the loop (a snippet CI runs), the Turn Clock, the stop-reason table with facts, two checks, the wire view of what the loop sends, the exits, where the other seven wires plug in | `hx-clock`, `hx-check` ×2, `hx-wire` |
| Fix | Finds the par turn limit on the bench (the sentence above it is bound to the bench with `hx-num`); writes `run_loop` in the kata | `hx-bench` (knob, par), `hx-num`, `hx-kata` |
| Prove | Old board against new on the same 20 seeds, with the honest sentence and the noise line | `hx-bench` |
| Keep | The law, 9 cards, two say-it prompts, the loop again from memory, the portfolio box | `hx-cards`, `hx-say`, `hx-kata` (memory) |

- **Prose:** 885 words (limit 900). Every objective (B2.o1–o5) has a
  component that proves it; every product claim is a verified fact span (15
  page references on B2).
- **Checkers:** `check_content`, `check_facts`, `check_snippets`,
  `check_katas` (CPython, pytest and Pyodide agree), `check_scenarios`
  (goldens, parity), QA (375/768/1280, both themes, axe before and after the
  14 self-tests, page weight 285 KB of 300).
- **Learner walkthrough** (BP-2.6, `docs/gate/phase2-walkthrough-B2.md`):
  four passes (phone, desk, keyboard only, reduced motion), every task done.
  First pass: 0 blockers, 1 major and 11 minors (among them inert term
  popovers on every page, a failing kata run crediting objectives, a reload
  resetting the Break, the tool_use_id buried 2,250 px down the Wire view).
  All fixed; the re-score found **0 open items** and moved the score from
  **370 to 400 / 500** (the approved v2 prototype scored 470; see "Path to 5"
  in the report for what separates them).

## 2. H1 and H2: the build exemplars

`site/modules/rein-1-talk-to-a-model.html` and
`site/modules/rein-2-one-tool-and-the-loop.html`, the `h1-first-block` tape,
the steps `steps/H1`, `steps/H2` (`check_steps`: CPython and Pyodide agree, 5
breaks), 7 cards and 2 say-it prompts each. Light walkthrough
(`docs/gate/phase2-walkthrough-H1-H2.md`): two majors (the H2 replay showed
the clean run; H1.o3 had no path that proves it), both fixed.

## 3. AUTHORING.md is final

v1 (`docs/AUTHORING.md`): the component table matches what shipped, incidents
say how to choose the accepted events, and §13 records twelve lessons from
B2, H1, H2 and the walkthrough. Every Phase 3 blueprint points to it and to
the B2 page as the bar.

## 4. The platform behind every module page

Module pages (generated header and course map, beat strip, progress by
objective with success-only credit, margin notes, term popovers, fact chips
opening sources in a new tab), the lazy component loader, `hx-say`, `hx-step`
with `check_steps`, and reload-safe components (answers and hunts restored
from the store without new evidence).

Ahead of Phase 3 (platform before content, PLAN.md): the labs of waves
3.1–3.3 (11 labs, all QA-gated) and ENGINE amendments A5–A8 in both runtimes
with parity (15 tapes, 90 runs; 8 engine tapes cover every new feature).

## 5. After the re-score: the path to 5

The reviewer named one change per criterion that would lift B2 from 4 to 5
(`docs/gate/phase2-walkthrough-B2.md`, "Path to 5"). Taken before sign-off,
because each one lifts every later module, not only B2:

| Criterion | Change | Where |
|---|---|---|
| Learning clarity | A Run key on every `pre[data-run]` snippet, checked against its expected output | shell (`run.js`), B-13 done |
| Intuitive | The next beat named under the progress line | shell (`module.js`) |
| Fun | A passing kata points to what comes next | `hx-kata` |
| Phone | No nested scroll box in Wire view below 700 px | `hx-wire` |
| Accessibility | 44 px tap areas on term triggers | `hx.css` |
| Identity and memory | Cards: front first; Space or Enter reveals | `hx-cards` |
| Consistency | "par" means the cheapest turn limit only; the hunt says "a good time" | `hx-incident` |
| Credibility | Cite the ReAct paper itself, not its repository | open: the fact-checker tries the ICLR proceedings (arXiv is blocked); wave 3.1's facts brief |

Page weight: B2's first load went from 302 KB (over budget) to 280 KB (facts
and terms fetched once; a 26 KB course-core file for components).

## Sign-off

B2 "The agent loop" is signed off as **the bar** for core modules, and H1–H2
for build modules. AUTHORING.md v1 is final. Every finding of the learner
walkthroughs is closed, and the path-to-5 changes are in, except the ReAct
citation, which waits on a reachable primary source. Phase 3 starts: wave 3.1
content (`docs/blueprints/BP-3.1-content.md`) with three builders, while
wave 3.4's platform (labs and ENGINE A9–A10) finishes in parallel.
