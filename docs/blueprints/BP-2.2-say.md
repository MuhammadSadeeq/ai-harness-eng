# BLUEPRINT BP-2.2: `hx-say` (say it out loud)

Phase 2. Builder rules: `.claude/agents/hx-builder.md`. You never commit.

## Read first
`docs/COMPONENTS.md` (all), `docs/DESIGN.md` §7.9, §8, §9, §11,
`docs/AUTHORING.md` §10 (the `say.yaml` format) and SPEC Appendix C (copied in
AUTHORING), `site/assets/components/lib/{hx-element,data,format}.js`, your
`hx-check.js` (reuse its patterns), `site/assets/core/hx.css`.

## You own
`site/assets/components/hx-say.js`, `hx-say.css`,
`site/assets/components/test/say.test.mjs` (pure logic),
`site/labs/say.html`, `site/labs/data/say-demo.json`.

## Build
`<hx-say src="B2">` shows the prompts from `site/data/say/<ID>.json` (or a demo
`.json`, COMPONENTS §11), one at a time, with `1 of 2` and Previous / Next keys.
For each prompt:
1. The prompt (serif, large) and one line: `Say your answer out loud, as if in an interview. Aim for 60 to 90 seconds.`
2. A timer: `Start` (primary) begins a visible count-up in a readout window;
   it turns amber at 60 s and shows `90 s is plenty` at 90 s; `Stop` ends it.
   Nothing is recorded: the line `Nothing is recorded; this is just for you.`
   sits under the timer. Reduced motion: no pulsing, text only.
3. After Stop (or a `Skip the timer` link), `Show the model answer` reveals the
   model answer (about 120 words) and the rubric as checkboxes (whole-row
   targets ≥ 44 px): `What did your answer include?`
4. `Save my self-grade` records `this.evidence("say", {item, ticked, total, seconds})`
   with the item's `objectives` (from the YAML, not `data-objective`), and shows
   `You covered {ticked} of {total}. Try it again tomorrow.`
5. Once saved, the prompt shows its last result (`Last time: 3 of 4`) from the
   store's evidence when the page is revisited.
- Keyboard: everything; Space starts and stops the timer when its key is focused.
- `selfTest()`: start and stop the timer, reveal, tick two items, save, check
  the result line and the evidence detail, then restore (clear the result line).
- Demo: `site/labs/data/say-demo.json` with two prompts in the AUTHORING §10
  format about the seed scenarios only (the agent loop's exits; why "done" is a
  claim). Model answers about 120 words in the course voice, rubrics of 4 items.
  I review the content.

## Acceptance (quote final lines)
```
node --test "site/assets/components/test/*.test.mjs"
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --only labs/say.html
```
QA 0 failures with its self-test counted. View it at 375 and 1280, both themes.
Tell me to register `hx-say` (paths as before).

## Report
Files; checks and final lines; UI copy beyond the strings above; the demo
content; deviations; open doubts. Don't commit.
