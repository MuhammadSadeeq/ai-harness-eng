# BLUEPRINT BP-1.8: first-time-learner walkthrough of the Phase 1 components

Reviewer rules: `.claude/agents/hx-reviewer.md`. You never edit project files;
every finding has evidence, a severity and a location. Write your report to
the path you are given, appending as you go.

## What you review
The signature components on their demo pages and the home page, as a learner
meets them. **Pass A** (now): `site/index.html` (the learner's Harness Board),
`site/labs/check.html` (a prediction gating a bench), `site/labs/bench.html`
(the bench and the par puzzle), `site/labs/clock.html` (boards, compare, one
turn), `site/labs/wire.html` (the Wire View). **Pass B** (later, same method,
sent separately): replay, incident, kata, cards.
The specs they implement: `docs/DESIGN.md` §7 and §9, `docs/COMPONENTS.md`.

## Method: cognitive walkthrough (Wharton et al. 1994) + heuristics
**Persona:** Sam, a career changer. Knows basic Python, has never built
anything with AI, is on a phone (375 × 812) on the bus, and has 10 minutes.

**Tasks, Pass A** (each at 375 px first, then quickly at 1280 px):
- A1 On the home page, find out what the Harness Board is, what
  "comes in C9" means, and open one spoke's card.
- A2 On `check.html`, make the first prediction, run the bench, and read
  whether you were right and why.
- A3 On `bench.html`, run the bench and say in one sentence what the turn
  limit changed.
- A4 On `bench.html`, reach par in the puzzle.
- A5 On `clock.html`, compare two boards, plug in the new one, and say what
  changed.
- A6 On `wire.html`, step to turn 3 and find what is new in that turn's
  request.

For every step of every task answer the four walkthrough questions with yes/no
and one line of evidence:
1. Will Sam try to achieve the right effect here?
2. Will Sam notice that the correct action is available?
3. Will Sam connect that action with the effect wanted?
4. After acting, will Sam see that progress was made?

Drive the real pages with a Playwright script in your scratch folder
(`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, serve `site/` with a small
`node:http` server; never run `playwright install`). Use a **375 × 812
viewport screenshot** (not full-page) at every step, plus 1280 × 900;
name them `<page>-A<n>-s<k>-<width>.png` and cite the paths. Use real taps,
clicks and keys on visible controls, never the `__test` hooks. Also do each
task with the **keyboard only** at 1280, and once with
`reducedMotion: 'reduce'`.

Then list violations of Nielsen's 10 heuristics you saw on the way (with the
screenshot path), and any wording a learner without AI background would not
understand (with the exact text).

## Scoring (1 = poor, 5 = excellent)
| Criterion | Weight | Score | Evidence |
|---|---|---|---|
| Learning clarity: the mechanism and the real terms come through | 20 | | |
| Intuitive: Sam completes the tasks without instructions (count the "no"s) | 20 | | |
| Fun: Sam would want to press it again (feedback, puzzle feel, satisfaction) | 15 | | |
| Phone ergonomics at 375 px (thumb zone, legibility, nothing cramped) | 15 | | |
| Accessibility (keyboard, reduced motion, focus, contrast) | 10 | | |
| Identity and memory: helps remember the wires and the clock | 10 | | |
| Credibility: feels like professional engineering, not a toy | 5 | | |
| Consistency across components (same words, same controls, same marks) | 5 | | |

Weighted total out of 500. For reference, the approved v2 prototype scored 470.

## Report
The walkthrough table (task, step, Q1–Q4, evidence), all findings
(`- [severity] file:line — what. Evidence: … Suggested fix: …`), the top 5
problems, the score table, and the one thing that works best. End with the
3-line summary from your rules.
