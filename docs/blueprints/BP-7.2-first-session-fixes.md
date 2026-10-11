# BRIEF BP-7.2: fixes from the first-ten-minutes walkthrough

Builder rules: `.claude/agents/hx-builder.md`. Evidence:
`docs/gate/phase7-first-session.md` (the walkthrough report). The director has
already fixed the content and copy items (the S0 Break sentence and the wire
gloss, the prediction question, the say model answer, the placement reasons
and its note, the check intro, the on-call lede, the placement link on the
home page and the S0 head).

## Part A: JS builder (the bench)

### A1. [blocker] An unverified run is keyed as "interrupted"
`hx-bench.js:30` (MARK_KEY) and `:131–137` (`markOf`): any status the code
does not list falls through to the pause mark, keyed "interrupted". A run the
verify gate stopped ends `unverified` and must say so: its own mark (pick a
glyph from `site/assets/core/glyphs.svg` not used by another status, or add
one in the sprite's style) and its own key line, "unverified: the checks still
fail". Check every status the engine can end with (`docs/ENGINE.md`) against
`markOf`, so none falls through to a wrong word; "interrupted" stays only for
the statuses that mean it.

### A2. [major] Par counts what S0's lab is about
S0's lab is about passing more runs. Its par rule (`par="cheapest-worst-case"`:
the cheapest worst case that passes at least as many runs as the old board)
lands on 0 retries, where the new board passes 13 of 20, the same as the old
board. Add a second mode, `par="most-passes"`: among the knob values, those
that pass the most runs are feasible; par is the one with the lowest worst
cost (on a tie, the smallest value). Implement it in `lib/stats.js` next to
`sweepPar`, with tests (S0's sweep: 0 → 13, 1 → 20, 2 → 20, so par is 1).
Each mode has its own goal line and par line in `hx-bench.js` (`GOAL_LINE`,
`PAR_LINE` at :24–25): for the existing mode, say what it does ("Par: the
cheapest worst case that passes at least as many runs as the old board."); for
the new one, "Par: the cheapest setting that passes the most runs." Then on
`site/modules/same-model-different-harness.html` set the bench's
`par="most-passes"` and replace the lab's sentence "The bench marks par: the
setting with the lowest worst-case cost that still passes at least as many
runs as the old board." with "The bench marks par: the cheapest setting that
passes the most runs." Change nothing else on that page. Every other bench
keeps its mode and its par value (list them and their par before and after).

### A3. [major] The par readout's unit is the knob's
`hx-bench.js:786`: `plural(sweep.par.value, "turn")` reads "PAR 0 turns" for
the verify retries knob. Use the knob's own unit, from the same place the
knob's label comes from (`:509`): turns for a turn limit, retries for verify
retries, and so on for every knob a page uses.

### Acceptance (A)
`node --test "site/assets/**/test/*.test.mjs"` passes; QA on
`modules/same-model-different-harness.html` and every page with an
`hx-bench` (quote the `qa:` line); real clicks on the S0 bench at 0, 1 and 2
retries show the key "unverified", par at 1 and the readout in retries
(screenshot).

## Part B: Rein builder (a way forward at the end of each module)

### B1. [major] The end of a module has no visible next step on a phone
On phones the course map is closed, so the end of S0 shows nothing to press.
Add a generated region `gen:next` to every module page, written by
`tools/gen_pages.py` from `course.json`'s `path`, right after the last beat
section and before the rail: `<nav class="module-next" aria-label="Next on
the path"><a class="btn" href="<slug>.html">Next: <id> · <title></a></nav>`.
The last module on the path gets a link back to the home page instead
("Back to the course map"). Toolbelt primers not on the path get no region.
`check_content` B9 must accept the region's markup and require it on every
path module (a fixture and a test). Regenerate the pages; `gen_pages.py
--check` passes.

### Acceptance (B)
`.venv/bin/python -m pytest -q tools/tests`, ruff and mypy clean;
`check_content` passes all pages; QA at 375 and 1280 on three module pages
(the first, one in the middle, the last on the path) with a screenshot of the
end of S0 at 375.
