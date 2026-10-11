# BRIEF BP-6.2: focus, keys and motion (audit 3 and 4 fixes)

Builder rules: `.claude/agents/hx-builder.md`. Rules to read first:
COMPONENTS §1, §4, §6 (the D-063 paragraph is new), DESIGN §8 and §9,
D-063. Evidence: `docs/gate/phase6-audit-3-interaction.md` and
`phase6-audit-4-a11y.md` (copies in the scratch path you are given while the
audits finish).

The base class already carries the D-063 guarantee
(`site/assets/components/lib/hx-element.js`, `#refocus`): after a render
that took focus away, focus goes to the same `data-key`, else the pressed
control's `data-focus-next`, else the component's UI. Do not edit
`hx-element.js`; report anything it gets wrong.

## Part A: JS builder

### A1. [blocker] A filtered replay cannot be stepped by keyboard
`hx-replay.js` `onScrubKey` (:484) and the "−" and "+" buttons (:389–390)
call `go(target)` with no direction, so `snap` returns the event the
playhead already stands on. Pass `dir: Math.sign(target − index)` from all
three. Home and End keep working (Home snaps to the first event on the
wire, End to the last). Add a node test in
`site/assets/components/test/` that drives `snap`/`go` on a filtered run
(ArrowRight four times moves four events on the wire) if the class can be
built without a DOM; otherwise the QA walk below covers it and you say so.

### A2. Controls that a press makes unavailable (D-063 rule 1)
Drop the `disabled` attribute, keep `aria-disabled`, and make the handler
ignore the press while it is set (the hx-kata / hx-say pattern):
- `hx-shift.js:224` Start the next shift; `hx-envbuilder.js:300` Run the
  policy; `hx-evalbench.js:396` Run; `hx-escape.js:354` Replay the attack.
- `hx-clock.js:386–388` Plug it in (once plugged it reads "Plugged in" and
  stays focusable).
- `hx-wire.js:147–157` Previous turn and Next turn at the ends of the range.
- Any other control the walk (A5) finds.

### A3. Controls that hide themselves (D-063 rule 2)
Add `data-focus-next`, naming a visible, keyed successor:
- `hx-replay.js:396–397, :552` Show all → the run-position slider (give it a
  `data-key` if it has none).
- `hx-design.js:363` Show the model answer → the model answer's heading
  (tabindex -1, keyed); `:366` Try again → the first answer field.

### A4. Toggles with no key
`hx-topology.js:222` Isolated / Forked: give each toggle a `data-key` so the
restore finds it after the rebuild.

### A5. QA keyboard walk (D-063 rule 4)
In `tools/qa/run.mjs`, a new pass over every lab page the run includes
(`accepted-labs.txt`; with `--only`, the lab pages named), one view (1280,
light), real keys only (never `__test`):
- Tab through the page, at most 80 stops. At each stop inside an `hx-*`
  element whose focus is a `button` or `[role="button"]` and is not
  `aria-disabled="true"`, press Enter, wait until the page settles (no DOM
  change for 200 ms, at most 2 s), and record a failure if
  `document.activeElement` is BODY:
  `labs/x.html: focus lost to BODY after Enter on "<accessible name>" (hx-y)`.
- Press each control at most twice (by its `data-key` or its name), so a
  loop of Run presses ends.
- Every component is walked on at least one page. A component with no lab
  page is walked on the first module page that mounts it; list the pairing
  in a comment at the top of the pass.
- `--no-keys` skips the pass; `--only` limits it like the other passes.
- The pass must fail on 0fef4ca's code (run it once on the audit worktree,
  `scratchpad/audit-3`, before your fixes, and quote the failure count) and
  pass after them.

### A6. Copy says "Copied" only when it copied
`hx-step.js:204` and `hx-wire.js:407` announce "Copied" whatever
`writeText` does. Announce and show the copied state on resolve; on reject
(or no clipboard) announce "Could not copy. Select the text and copy it."
and do not show the copied state.

### A7. Reduced motion from the stored setting
`hx-incident.js:28, :170` reads only the system query. Use
`this.reducedMotion` (COMPONENTS §1: components never re-implement it).

### Acceptance (A)
`node --test "site/assets/**/test/*.test.mjs"` passes;
`node tools/qa/run.mjs --only $(cd site && ls labs/*.html)` passes with the
walk on (`--only` takes page paths, not a folder) (quote the
walk's line count and the final `qa:` line); the four probes the audits ran
reproduce no loss: Show all, Previous at turn 1, Replay the attack, Plug it
in. Report the failure count of the walk on the audit worktree before your
fixes.

## Part B: design builder

### B1. [major] Term markers alone in a table cell are 19 px tall
`site/modules/the-api-call-on-the-wire.html:163–166` and
`prompt-injection-and-the-trifecta.html:125`. DESIGN §9 exempts a term
marker inside running text, not one that is a cell's only content. Give a
term marker in a `td` or `th` a hit area of at least 44 px tall (the
`.term::before` hit area is the model), without changing how it looks.
Measure at 375 px after the change and quote the boxes.

### B2. [minor] The skip link
`hx.css:36`: `min-height: 44px` on `.skip`. Give `<main id="main">`
`tabindex="-1"` in the page template so the skip link moves focus there
(no visible ring on `main` itself, it is not a control). Quote
`document.activeElement` after Enter on the skip link.

### B3. [minor] Clock spoke focus
`hx-clock.css:15–16`: a focused spoke draws the 3 px focus ring DESIGN §9
requires (outline or a ring on the spoke's hit area, offset outward), not
a dashed node stroke. Screenshot one spoke focused, light and dark.

### B4. [minor] Component reduced-motion blocks override "Full"
`hx-escape.css:53`, `hx-evalbench.css:62`, `hx-incident.css:34`,
`hx-replay.css:44`: a plain `@media (prefers-reduced-motion: reduce)`
block applies even when the learner chose "Full". Scope each the way
`hx.css:338–345` does: system reduce unless `data-motion="full"`, and
always under `data-motion="reduced"`.

### Acceptance (B)
`node tools/qa/run.mjs --only <the pages you touched>` passes; screenshots
and measurements as above.

## Report
One report per builder at the path you are given: each item, the file and
line changed, the evidence asked for, and the checkers' final lines.
