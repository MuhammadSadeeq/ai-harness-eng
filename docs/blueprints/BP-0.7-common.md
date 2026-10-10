# BLUEPRINT BP-0.7 (common): design-direction prototypes

Phase 0 design exploration (DECISIONS D-031). Three builders each build one
**direction** (BP-0.7-D1, -D2, -D3) on the **same three screens, same data,
same mechanics**, so the director can compare designs, not content. This file
is the shared contract; your direction file adds the look, feel and motion.
Builder rules: `.claude/agents/hx-builder.md`. You never commit.

The owner's ask, verbatim in spirit: **the best design, UI/UX, a fun
experience, an intuitive approach.** Judge every choice by: would a learner
with no AI background understand what to do without instructions, and would
they *want* to press the button again?

## Read first
- `docs/DESIGN.md` §3 (wires: ids, order, clock angles), §4 (glyph path data:
  reuse the shapes; recolor and restyle them for your direction), §9 (motion
  rules), §10 (accessibility). DESIGN v1's *look* is baseline D0 — you are
  building an alternative, so don't copy its surfaces, type or layout.
- `site/proto/shared/fixture.json` (the data; also importable as
  `import { FIXTURE } from "../shared/fixture.js"`). Never edit it.
- `course.json` → `wires` (names, questions, laws).
- Look at `tools/qa/out/design-*.png` to see D0, so you know what *not* to repeat.

## You own
`site/proto/<your-dir>/` only: `index.html` (home), `break.html`, `prove.html`,
`style.css`, `app.js` (ES module; may split into a few modules), `fonts/`
(woff2 + each font's license file), any `.svg`. Nothing else in the repo.
Scratch (for `npm install` of font packages, etc.): your builder scratch dir.

## Hard constraints
- Static HTML + CSS + vanilla ES modules. **No frameworks, no third-party JS,
  no external URLs** (fonts self-hosted from npm packages you install in
  scratch; copy only latin woff2 files you use plus their license).
- Works and looks intentional at **375 px and 1280 px** (768 must not break).
  No horizontal page scroll. **No text under 14 px.** Touch targets ≥ 44 px.
- Keyboard: everything operable; visible focus; arrows where natural
  (scrubber, lists, slider). `aria-live="polite"` announcements for replay
  progress (throttled to at most one per turn) and results.
- **Reduced motion** (`prefers-reduced-motion` *and* an on-page toggle):
  no travelling or springy motion; instant state changes; learner-paced stepping.
- Colors: use your direction's wire palette exactly. Wires are never shown by
  color alone (glyph and/or name always present).
- Each page ≤ 300 KB transferred (fonts included).
- Zero console errors. axe: no serious/critical violations.

## Screen 1 — Home (`index.html`)
What a returning learner sees. One obvious primary action.
1. **Continue** card: "B2 · The agent loop — 1 Break" with the primary button
   → `break.html`.
2. **Today's on-call shift** (≈ 10 min): 1 incident (the "almost done"
   spiral), 6 cards due, 1 say-it drill. Button "Start shift" → `break.html`.
3. **Harness Board**: the 8 wires in turn order (your direction decides the
   shape). Two modules are plugged in: "history resend" (context, from A3)
   and "block-aware reply parser" (loop, from A4). Context shows "2 cards due"
   (dimmer/de-energized *and* a text badge). Empty sockets say what plugs in
   later (e.g. loop: "turn limit · B2", tools: "tool registry · B1").
4. **Path progress**: Start ✓, Part A ✓, Part B in progress (B1 ✓, B2 now),
   Parts C–I ahead. Compact; tappable rows (they can go nowhere).
5. A theme toggle only if your direction has a second theme; a motion toggle always.

## Screen 2 — Break (`break.html`): the cold open of B2
1. **Setup** (2–3 short sentences, plain English): the agent's job (fix the
   failing test in `calc.py`), and that its loop stops only when the model says
   it's done.
2. **Prediction gate**: `FIXTURE.incident.prediction` as 4 options; the replay
   stays locked until the learner picks one and presses "Lock in". Their pick
   stays visible.
3. **Replay** of `FIXTURE.trace` (73 events, 14 turns, virtual seconds `t`):
   - Transport: play/pause, step back, step forward, speed 1×/2×/4×, and a
     scrubber. **Learner-paced by default**: play is available, but the
     first press of "step" should feel natural (make step prominent).
   - Readouts that update with the current event: turn number; a
     **context bar** (current prompt tokens from the latest `prompt_built`
     event vs an 8,000-token window, with the percentage in text); a **cost
     meter** (the latest `model_reply.cost`, shown as `≈ 0.031 units`).
   - **Event detail**: the selected/current event in two views,
     *Friendly* (one plain sentence, e.g. "The model said 'Almost done: one
     more fix.' and asked to edit calc.py") and *Wire* (the event JSON,
     monospaced). A toggle switches them.
   - **Repetition cue**: when an event repeats an earlier action (same tool and
     same input as a previous `tool_call`), mark it subtly ("seen at turn 4").
   - **Phone (< 700 px)**: the main view is a **vertical event list** (one row
     per event, glyph + wire + one-line summary; current row highlighted,
     auto-scrolled), with a compact **8-lane overview strip** (all 73 events as
     marks) that also works as a scrubber; transport bar **sticky at the
     bottom** in the thumb zone.
   - **Desktop**: a **lane timeline** (8 lanes in turn order, events at `t`)
     plus the event detail panel beside it; the vertical list may also be
     available.
4. **Reveal** when the replay reaches `run_end`: the outcome in one line
   ("It never stopped on its own: 14 turns, ≈ 0.138 units, until a person
   pressed stop."), whether their prediction was right, and *why each option
   is tempting* (write one short line per option).
5. **Find the first bad moment** (mini Incident Room): "Tap the first event
   where things went wrong." Correct = `FIXTURE.incident.first_bad_seq`
   (turn 6's edit). Wrong taps get a hint ("Too late: the loop was already
   repeating" / "Too early: that step was reasonable"). Show a timer and a
   par of 60 s *only after* they finish (no pressure while solving). On
   success show `FIXTURE.incident.why`, then the fix choice
   (`fixes`, `correct_fix`) with a one-line reason for each option.
6. Footer CTA: "Fix it → Prove" (→ `prove.html`).

## Screen 3 — Prove (`prove.html`): measure the fix, then beat par
1. **Two boards**: Old ("one exit: the model says done") and New ("+ turn
   limit 12 + token budget"), side by side on desktop, stacked on phones.
2. **Run ×20**: one button runs both boards on the same 20 seeds
   (`FIXTURE.bench.old/new`). Trials appear one by one (≈ 1.5 s total at full
   motion; instant under reduced motion), each as a small mark showing its
   status (done / interrupted / stopped at the limit) with a glyph, and its
   turns. Tapping a mark shows seed, status, turns, cost. Make "same seed,
   same model behavior" visible (e.g. linked marks across the two boards).
3. **Results** (computed from the data, never hard-coded): pass rate per board
   (both 13/20), worst-case turns (46 vs 12), worst-case cost, mean cost; two
   small-multiple histograms (turns, cost) on shared axes. Then the honest
   sentence: "The turn limit didn't make the agent smarter: the same 13 runs
   pass. It made every run end, and cut the worst case by about 9×." and the
   noise sentence: "These runs are scripted, so they repeat exactly; real
   models vary." (Compute "9×" from the data; round to a whole number.)
4. **Beat par** (the puzzle): "Find the turn limit with the cheapest worst
   case that loses no passing run." A control for the limit (2–30, start 12).
   Recompute live with `FIXTURE.puzzle.rule` and `cost_by_turns`: passes = trials
   with `fixes && needs <= limit`; each run's turns = `needs` if it passes, else
   `limit`; worst case = max cost. Show passes (red/negative state when below 13),
   worst-case cost, and a **solution-space chart**: every limit 2–30 plotted
   (x = limit, y = worst-case cost), losing-pass limits marked, the learner's
   choice highlighted. When they hit limit 6, celebrate ("Par: no lost passes,
   cheapest worst case") with your direction's juice. Don't reveal par before
   they have tried at least 3 values.
5. **Plug it in**: after par (or any try), a button "Plug the turn limit into
   your board" animates the module into the loop socket of a mini board; the
   loop wire's socket shows the new module.

## Test hooks (QA runs them)
Wrap each screen's main interactive area in a custom element named
`<hx-proto-home>`, `<hx-proto-break>` or `<hx-proto-prove>` (the QA runner
calls `__test.run()` on every element whose tag starts with `hx-`). Give the
instance `__test = { run: async () => boolean }`. `run()` must drive the real
UI and return `true` only if it works:
- break: pick option 3, lock in, step to the end, check the reveal text
  exists, tap the event with `first_bad_seq`, check success state.
- prove: press Run ×20, wait for results, check both pass rates read 13/20,
  set the limit to 6, check the par state appears.
- home: check 8 sockets render and the primary action links to break.html.

## Acceptance (quote final lines)
Other builders run QA at the same time in their own `--out` folders; never
write to another builder's folder. If a run times out under load, retry once.

```
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --out tools/qa/out/<dir> --only proto/<dir>/index.html proto/<dir>/break.html proto/<dir>/prove.html --cvd
```
must end `0 failures`. Then **look at your own screenshots** in
`tools/qa/out/<dir>/` (`proto__<dir>__<page>-<width>-<theme>.png`, 375 and 1280, light/dark if you have
both, CVD) and fix what looks wrong or unclear. Also take 3 extra screenshots
mid-interaction yourself with a small Playwright script in your scratch dir
(break at 375 px mid-replay; prove at 1280 after Run ×20; prove at 375 at par)
and save them to `tools/qa/out/<dir>/proto__<dir>__extra-*.png`.

## Report
```
REPORT BP-0.7-<Dn>
Files: …
Checks: qa → <final line>; page weights
Screenshots reviewed (and what you changed after looking): …
What a first-time learner would find fun here: <2 lines>
Where they might get stuck: <2 lines>
Deviations: … | none
Open doubts: … | none
```

## Addendum (binding): research findings folded in (R5, 2026-10-10)
1. **No autoplay on load.** The replay starts paused at event 0; play exists,
   but stepping is the default action (animation can outrun perception;
   learners segment events themselves).
2. **Explanations sit on the event, not only in a side panel** (split
   attention). The Friendly sentence for the current event appears right next
   to it (inline under the row on phones; a callout anchored to the event on
   desktop). The detail panel is for the Wire JSON and extra fields.
3. **Never drag-only.** Every draggable or scrubbable value also has a visible
   readout, − / + steppers (≥ 44 px) and arrow-key support (WCAG 2.5.7; APG
   slider pattern).
4. **Filter by wire.** Activating a lane label (or a wire chip on phones)
   isolates that wire's events; activating it again shows all. The current
   filter is shown in text ("Showing: Tools").
5. **Restraint in juice.** At most two feedback cues per action (for example
   a pulse plus a state change, not pulse + sound + shake + confetti). Nothing
   flashes more than 3 times per second; any automatic motion longer than 5 s
   has a pause control.
