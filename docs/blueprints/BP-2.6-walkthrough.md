# BRIEF BP-2.6: learner walkthrough of B2 "The agent loop" (Phase 2 gate)

Reviewer rules: `.claude/agents/hx-reviewer.md`. You never edit project files;
you write only the report file you are given. Screenshots and scripts go in the
scratch path you are given (never under `tools/qa/` or `site/`).

B2 is the exemplar: every later module copies it. Judge it as the bar: does it
teach its five objectives to a newcomer, and does every interaction work, at
phone and desktop sizes, by touch, pointer and keyboard?

## Read first
`docs/AUTHORING.md` (all), `docs/DESIGN.md` §6–§9, §11, §12,
`docs/COMPONENTS.md` §2, §5, §6, §8, §10, `course.json` module `B2`, the page
`site/modules/the-agent-loop.html` and its content `content/B2/*.yaml`, the
kata `katas/B2-loop/`, and the facts the page cites (`facts/*.yaml`, by the
`data-fact` ids on the page).

## Persona
Sam: a career changer who knows basic Python (functions, lists, dicts), has
used a chatbot, and has never built an agent. First pass on a 375 × 812 phone,
then at a desk.

## Passes
Serve `site/` with a small static server in your scratch. Chromium from
`/opt/pw-browsers` via Playwright. Real taps, clicks and keys; never call
`__test` hooks. Four passes, each doing every task below end to end:
`m375` (touch, 375 × 812), `d1280` (pointer, 1280 × 900), `k1280` (keyboard
only), `r375` (touch, reduced motion).

## Tasks
1. **Break.** Answer the predict question. The incident unlocks. Find the
   first bad event in the replay, using the replay's own controls. Pick the
   fix.
2. **See.** Read the loop code and run it (its Run control). Tap the loop
   spoke on the clock and read its card. Answer both checks (B2-c1, B2-c2).
   In the wire figure, switch to Wire view and find one `tool_use_id`. Open
   one term popover, one fact chip and the margin note.
3. **Fix.** On the first bench, find the par turn limit by changing the knob
   and running. Read the sentence above the bench (the turn limit and pass
   count it states must match the bench). Write `run_loop` in the kata: start
   from the starter, use one hint, and make all tests pass by typing a
   correct solution (yours; don't paste the reference). Note what a learner
   who has never written a loop would struggle with.
4. **Prove.** Run the second bench and read its sentence. Check that its
   numbers match what is on screen.
5. **Keep.** Review the cards once. Use "Say it out loud" (type, if the
   component offers text). Open the from-memory kata and see what it gives
   you. Read the portfolio box.
6. **Progress and way-finding.** Watch the objectives line move as you work
   (which tasks record evidence?). Use the beat strip to jump to each beat;
   use the course map. Reload the page: what persists?

## What to judge, beyond "it works"
- **Teaching.** After the page, could Sam write a loop with two exits and
  explain each stop reason? Name any step where the page assumes knowledge it
  never gave (an undefined term, a jump in the code, a check that tests
  something not taught). Is the Break hook clear about what went wrong?
- **Truth.** Every product claim is a `.fact` span that says no more than its
  fact's `claim`; every number on screen matches the simulator; nothing is
  taught that is false.
- **Copy.** DESIGN §11: plain words, short sentences, no undefined jargon, no
  hype. Quote any sentence a newcomer would stumble on.
- **Layout and access.** Overlap, cut-off text, text under 14 px, targets
  under 44 px, focus that gets lost, sticky bars covering content, anything
  that relies on color alone.
- **Time.** About how long would Sam need (the module claims 60 minutes)?

## Report
Write `docs/gate/phase2-walkthrough-B2.md` (the only file you write), in the
Phase 1 walkthrough format (`docs/gate/phase1-walkthrough-A.md`): method and
coverage, findings by severity with evidence and suggested fixes, what was
verified, and the 3-line summary.
