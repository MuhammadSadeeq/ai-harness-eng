# Phase 2 gate: the exemplar

**Status:** draft (director). SPEC §10 sets two gate conditions for Phase 2:
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

## Sign-off

_Pending the "Path to 5" items the director takes before signing._
