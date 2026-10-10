# BLUEPRINT BP-0.7-review: first-time-learner walkthrough of the design directions

Reviewer rules: `.claude/agents/hx-reviewer.md` (you never edit project files;
every finding has evidence, a severity and a location). Write your report to
the path you are given, appending as you go.

## What you review
Four directions, each with the same three screens:
- D0 baseline: `site/index.html`, `site/design.html` (specimen only; review
  its look, not the missing interactions)
- D1 "Patch Bay": `site/proto/d1/{index,break,prove}.html`
- D2 "Field Guide": `site/proto/d2/{index,break,prove}.html`
- D3 "Night Shift": `site/proto/d3/{index,break,prove}.html`
The shared contract is `docs/blueprints/BP-0.7-common.md`.

## Method: cognitive walkthrough (Wharton et al. 1994) + heuristics
**Persona:** Sam, a career changer. Knows basic Python, has never built
anything with AI, is on a phone (375 × 812) on the bus, and has 10 minutes.

**Tasks** (do each on 375 px first, then repeat quickly at 1280 px):
- T1 From home, start today's lesson.
- T2 Make a prediction, then replay the run to the end.
- T3 Find the first event where things went wrong.
- T4 Run the bench and say, in one sentence, what the turn limit changed.
- T5 Beat par in the puzzle.

For every step of every task, answer the four walkthrough questions with a
yes/no and one line of evidence:
1. Will Sam try to achieve the right effect here?
2. Will Sam notice that the correct action is available?
3. Will Sam connect that action with the effect wanted?
4. After acting, will Sam see that progress was made?

Drive the real pages with a Playwright script in your scratch folder
(`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, serve `site/` with a small
`node:http` server; never run `playwright install`). Screenshot every step to
your scratch folder (`<dir>-T<n>-s<k>-<width>.png`) and cite those paths.
Use real taps/clicks/keys on visible controls, not the `__test` hooks.
Also try each task with the **keyboard only** at 1280 and with
`reducedMotion: 'reduce'`.

Then note violations of Nielsen's 10 heuristics you saw on the way (with the
screenshot path).

## Scoring (fill one table per direction; 1 = poor, 5 = excellent)
| Criterion | Weight | Score | Evidence |
|---|---|---|---|
| Learning clarity: the mechanism and the real terms come through | 20 | | |
| Intuitive: Sam completes T1–T5 without instructions (count walkthrough "no"s) | 20 | | |
| Fun: Sam would want to press it again (feedback, puzzle feel, satisfaction) | 15 | | |
| Phone ergonomics at 375 px (thumb zone, legibility, nothing cramped) | 15 | | |
| Accessibility (keyboard, reduced motion, focus, contrast, CVD screenshots) | 10 | | |
| Identity and memory: distinct, coherent, helps remember wires and the clock | 10 | | |
| Credibility: feels like professional engineering, not a toy | 5 | | |
| Buildability: could 60+ modules and ~20 components be built in this style | 5 | | |

Weighted total out of 500 per direction.

## Report
Per direction: the walkthrough table (task, step, Q1–Q4, evidence), the top
5 problems (severity, file:line or screenshot), the score table, and the
single best idea worth keeping even if this direction loses. End with a
comparison table of totals and a one-paragraph recommendation (the director
decides).
