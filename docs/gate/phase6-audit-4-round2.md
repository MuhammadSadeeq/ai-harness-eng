# Phase 6 round 2, audit 4: accessibility and mobile (re-check on 312e352)

Worktree: scratchpad/audit-4r2 (commit 312e352, clean; .venv and node_modules symlinked). Scratch: scratchpad/audit-scratch-4r2. Round-1 report: scratchpad/phase6-audit-4-a11y.md. Fix map and rulings: docs/PHASE6-GATE.md, D-063 in docs/DECISIONS.md. Paths below are relative to the worktree root; `probes/…` and `focus-shots/…` are under scratchpad/audit-scratch-4r2.
Rules kept: real keys only (no `__test` hooks), no edits or git changes in any tree, PYTHONDONTWRITEBYTECODE=1, heavy checks one at a time, no background monitors. Nothing was denied.

Result: FIXED 8, NOT FIXED 0, RULED 1 (confirmed), NEW 2 (both minor). Blocker: none in round 2 (the round-1 blocker is fixed).

## Round-1 findings

1. [blocker, round 1] A filtered replay could not be stepped by keyboard — FIXED.
   Fix: hx-replay.js:220 (`stepTo` passes the direction to `go`), :398–399 (the − and + buttons), :504 (the arrow, Home, End and page keys). `snap` (:199–215) is unchanged.
   Evidence: `probes/focus_filter_loop.json` (same-model page, Loop filter, seven loop events): ArrowRight ×4 moves 0 → 3 → 5 → 11 → 13; "+" ×3 moves 13 → 19 → 21 → 23; "−" ×2 moves 23 → 21 → 19; every landing event is on the loop wire; focus stays on the pressed control. `probes/focus_filter_r2.json` (Control filter, both replay pages): 1 → 9 → 17, then the end of the Control wire (`probes/wire-events.txt` lists Control events at 1, 9 and 17 only).

2. [major] Escape does not close a term popover — FIXED.
   Fix: terms.js:51–58 (a keydown Escape listener on the popover; the term's own listener at :99 remains).
   Evidence: `probes/focus_extra.json`: `termPopoverOpenAfterEsc: false` (round 1: true). Keyboard walks on all 10 pages: `escFail` 0 (round 1: 25 to 243 per page). Every opened popover closed on Escape, and focus returned to the term (`kb-*.json`, `afterEsc`: dfn, span or the clock's g).

3. [major] Table-cell term markers are 19 px tall — RULED, and my test confirms the ruling.
   The 44 px tap area is the `dfn[data-term]::before` / `.term::before` rule at hx.css:153 (top 0, height 44 px, left and right −2 px). No code change was made.
   Evidence: `probes/cell_before.json`: computed `::before` height 44 px and width 70 to 95 px for `end_turn`, `max_tokens`, `refusal`, `pause_turn` (the-api-call-on-the-wire) and the `Exfiltration` cell (trifecta page, same rule). Real mouse clicks (`probes/cell_hit.json`): a click 0 to 43 px below each marker's top opens that term, for all five cells; a click 4 px above it, or 44 px and lower, lands on the cell and opens nothing. DESIGN §9 allows invisible hit areas; the visible box stays 19 px, which is accepted.

4. [major] Show all drops focus to BODY — FIXED.
   Fix: hx-replay.js:407 (`data-focus-next="run-position"` on Show all), :380 (the slider's `data-key`), and the base's successor step in hx-element.js:181 and :188–199 (`#refocus`).
   Evidence: `probes/focus_extra.json`: after Enter on Show all, focus is `div key=run-position "Run position"`; the next Tab is "+" (`nextTabAfterShowAll`). The five pages that lost focus here in round 1 lose none in round 2 (see the walk table). Round-2 case with a locked replay: NEW 2 below.

5. [major] Previous turn drops focus at turn 1 — FIXED.
   Fix: hx-wire.js:151 (Previous uses `aria-disabled`, not `disabled`), :158 (Next), and the handler clamps at :109–112.
   Evidence: `probes/focus_turns.json`: Enter on Previous at turn 2 gives "Turn 1 of 4" with focus still on `button key=turn-back`, aria-disabled true; Enter on Next then gives turn 2, focus still on Next. `probes/disabled_press.json`: a press on Previous at turn 1 leaves turn 1 and focus on Previous. Walk losses on prompt-caching and rein-2: 0 (round 1: 1 and 1).

6. [major] "Replay the attack" drops focus — FIXED.
   Fix: hx-escape.js:354 (no `disabled` attribute, `aria-disabled` only); the guard in `replay()` at :208 keeps a second press from starting a run.
   Evidence: `probes/focus_replay.json`: focus is on `button key=replay "Replay the attack"` before Enter, just after it and at the end. Trifecta walk: 0 losses (round 1: 39), and the walk now ends naturally at 123 Tab stops (round 1: capped at 300 by the press loop).

7. [minor] Skip link is 39 px tall — FIXED.
   Fix: hx.css:36 (`min-height: 44px`, `display: flex`).
   Evidence: `probes/targets-375.jsonl`: the skip link box is 44 px tall on all 108 pages.

8. [minor] Enter on the skip link leaves focus on BODY — FIXED.
   Fix: `<main id="main" tabindex="-1">` (e.g. site/modules/the-turn-clock.html:55, site/index.html:59); `#main:focus { outline: none }` at hx.css:39, because the target is not a control.
   Evidence: `probes/targets-375.jsonl`, `skipEnter.active` is `main.module` on 108 of 108 pages (round 1: BODY on 108). The next Tab lands inside `#main` on 107 of 108 pages, the same as round 1 (`labs/count.html` has nothing focusable inside `#main`).

9. [minor] Clock spoke focus is a dashed node stroke, not the 3 px ring — FIXED.
   Fix: hx-clock.css:16–17 (the 3 px focus ring is drawn on the spoke's 44 px `.hit` circle; the node keeps its wire colour at 2.5 px).
   Evidence: `probes/focus_spoke.json`: for each of the eight spokes when focused, `.hit` stroke rgb(26, 86, 219), 3 px, box 44 × 44; `.node` back to the wire colour and 2.5 px. `focus-shots/spoke-focus-normal.png` and `cvd-el/spoke-zoom-round2.png` show a clear solid blue ring around the Control spoke.

## NEW problems introduced by the fixes

N1. [minor] A press on a dimmed (aria-disabled) control does nothing and says nothing.
   Since D-063, these controls stay in the tab order: Previous at turn 1, Next at the last turn, Move up on the first item, Move down on the last, the clock's "Plugged in", and Replay while a run is going. Focus lands on them, and they are visible and dimmed, so the landing is sensible. A press is a no-op (guards: hx-wire.js:109–112, hx-cards.js:249–257 `moveItem`, hx-clock.js:394 `plugIn`). Nothing explains why the control is unavailable, although screen readers announce aria-disabled as unavailable.
   Evidence: `probes/disabled_press.json` (Previous at turn 1: turn unchanged, focus on Previous).
   Suggested fix (optional): a short live line on a press at an end ("Turn 1 is the first turn"), or leave as is.

N2. [minor] With a prediction gate, Show all moves focus onto a locked slider.
   Before a prediction, the run-position slider is `tabindex -1` with `aria-disabled="true"`. The base's `usable()` (hx-element.js:31) accepts it, so focus lands on a control that cannot be operated until the learner predicts. Not BODY, but not a useful landing.
   Evidence: `probes/focus_locked_showall.json` (statistics page, no prediction): after Enter on Show all, focus is `div key=run-position`, `tabindex -1`, `aria-disabled true`; the next Tab goes to the Transcript.
   Suggested fix: when the strip is locked, name a usable control in `data-focus-next` (the first lane label), or have `usable()` reject `aria-disabled="true"`.

No blocker was found in round 2.

## Keyboard walk on the ten round-1 pages (1280 px, light, real keys)

Stops, presses, focus lost to BODY and Escape failures, round 1 → round 2. Full paths are in `scratchpad/audit-scratch-4r2/focus-paths/<page>.txt` (round 2) and `scratchpad/audit-scratch-4/focus-paths/<page>.txt` (round 1).

| page | Tab stops | presses | focus lost to BODY | Escape did not close a popover |
|---|---|---|---|---|
| modules/same-model-different-harness | 145 → 149 | 55 → 58 | 1 → 0 | 48 → 0 |
| modules/the-api-call-on-the-wire | 189 → 191 | 85 → 87 | 1 → 0 | 78 → 0 |
| modules/the-turn-clock | 128 → 129 | 32 → 33 | 0 → 0 | 25 → 0 |
| modules/prompt-caching | 148 → 165 | 49 → 61 | 1 → 0 | 42 → 0 |
| modules/tool-design | 139 → 139 | 38 → 38 | 0 → 0 | 31 → 0 |
| modules/statistics-for-a-random-system | 150 → 155 | 56 → 61 | 1 → 0 | 30 → 0 |
| modules/prompt-injection-and-the-trifecta | 300 (cap) → 123 | 250 → 34 | 39 → 0 | 243 → 0 |
| modules/cost-and-latency | 155 → 156 | 59 → 60 | 1 → 0 | 52 → 0 |
| modules/rein-2-one-tool-and-the-loop | 170 → 176 | 70 → 76 | 2 → 0 | 44 → 0 |
| modules/pytest-primer | 127 → 126 | 42 → 41 | 0 → 0 | 34 → 0 |

No keyboard trap on any page. The extra Tab stops on prompt-caching and the others are controls round 1 never reached, because a focus loss restarted the walk from the top. Focus landings that are not controls are content the press revealed (`p.card-back`, `p.kata-note`, `pre.wire-json`), as the M2 fix intends. Nothing landed on a component container. The clock's spoke and editor "no visible focus" entries are the same false positives as round 1 (the probe reads the group's outline, not the `.hit` ring or `.cm-editor`).

## Other checks

- 375 px target sweep, all 108 pages (`probes/targets-375.jsonl`): 10,571 interactive elements (round 1: 10,529); 763 under 44 px (round 1: 870). The drop is the 108 skip links, now 44 px. The remaining undersized items are the same categories as round 1: 332 glossary "Taught in" links and 42 "Before this" prerequisite links (text-line links, exempt), and 5 table-cell term markers (RULED, finding 3). No new category. Horizontal scroll: 0 pages wider than the viewport. Clipped controls: 0. Outside the viewport: 67 items, all `cm-content` inside `cm-scroller` (round 1: 66).
- axe at 375 and 1280, both themes, before interaction, on the 15 lab pages that render the changed components (cards, clock, design, envbuilder, escape, evalbench, incident, module, replay, say, shift, stack, step, topology, wire): 60 views, 0 violations (`probes/axe-labs-a.jsonl`, `probes/axe-labs-b.jsonl`). The incomplete items are the kinds round 1 already resolved (the menu's aria-controls, colour cases on images and overlaps).
- Mobile Menu sheet and phone chrome were not re-run; they are not round-1 findings.

## Limits

- Pointer (mouse) behaviour of the filtered replay was not tested; the blocker is confirmed for the keyboard only.
- The replay's "Replaying…" state lasts under 150 ms, so it was not seen in a poll; focus was checked just after Enter and at the end.
- The keyboard walks and the targeted checks are at 1280 px only; the 375 px keyboard path was not re-walked.
- axe on the labs was run before interaction only. The full QA rerun was not repeated (per the director's instruction).
- "Move up" was not pressed with real keys (the probe did not reach the revealed reorder card); its guard was read in code (hx-cards.js:249–257, aria-disabled at :453–457).
- The other `aria-disabled` conversions were checked by the walks and by the presses listed above, not one by one.

## Summary

FIXED 8, NOT FIXED 0, RULED 1 (table-cell term markers: the 44 px tap area is confirmed by real clicks), NEW 2 (both minor: N1 silent presses on dimmed controls, N2 Show all onto a locked slider).
No blocker: the round-1 blocker (a filtered replay could not be stepped by keyboard) is fixed; four ArrowRight presses now move four events on the seven-event Loop wire, and the − and + buttons move too.
Round-2 walks on the ten pages show 0 focus losses to BODY, 0 Escape failures and no keyboard trap; the 375 px target sweep and the axe checks on the changed labs add no new blocker or major.
