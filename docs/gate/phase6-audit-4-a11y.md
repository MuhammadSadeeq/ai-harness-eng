# Phase 6 audit 4: accessibility and mobile (BP-6.0 section 4)

Audited commit: 0fef4ca. Worktree: scratchpad/audit-4 (clean; node_modules and .venv are symlinks). Scratch: scratchpad/audit-scratch-4.
Brief: docs/blueprints/BP-6.0-audit.md section 4. Binding rules: docs/DESIGN.md section 9 (WCAG 2.2 AA; targets >= 44 x 44 px, with the inline-text exception for a link or term marker inside running text; nothing under 14 px; keyboard for everything; Esc closes popovers; visible 3 px focus ring).
File paths below are relative to the audited worktree root (for example `site/assets/...`). Real keys only; no `__test` hooks; no project files edited.

Totals: 1 blocker, 5 major, 3 minor.

## Findings

### Blocker

- [blocker] site/assets/components/hx-replay.js:482–494 (`onScrubKey`), :385–388 (the "−" and "+" buttons), :199–215 (`snap`) — With a wire filter on, the keyboard cannot step the run. ArrowRight/ArrowLeft/ArrowUp/ArrowDown and "Forward one event" call `go(index ± 1)` with no direction, so `snap` returns the nearest event on the filtered wire, which is the current one.
  Evidence: real-key check `scratchpad/audit-scratch-4/probes/focus_filter.json` on `modules/statistics-for-a-random-system.html` and `modules/same-model-different-harness.html`. Enter on a lane label gives "Showing: Control only"; the slider stays at aria-valuenow 1 ("Event 2 of 24") through four ArrowRight presses; on the same-model page three "+" presses also leave it at 1. The keyboard walk shows the same at "Event 9 of 24" (`kb-modules__same-model-different-harness.json`, arrowFail).
  Suggested fix: pass the direction from `onScrubKey` and the two buttons (`this.go(this.state.index + 1, { dir: 1 })` and `{ dir: -1 }`), so `snap` moves to the next or previous event on the filtered wire. Re-run `focus_filter.mjs` after the change.
  Limit: only the keyboard path was tested; pointer behaviour under a filter was not.

### Major

- [major] site/assets/core/shell/terms.js:73–80 (the Escape handler is on the term marker only), with :46–50 (the popover is inserted after the term, and focus moves to its Close button) — Escape does not close a term popover opened by Enter. DESIGN §9 binds "Esc closes popovers".
  Evidence: real-key walks, `escFail` in each `kb-*.json`: the-turn-clock 25, same-model 48, the-api-call-on-the-wire 78, prompt-caching 42, tool-design 31, statistics 30, prompt-injection-and-the-trifecta 243, cost-and-latency 52, rein-2 44, pytest-primer 34 (every opened popover stayed open). Dedicated check `focus_extra.json`: `termPopoverOpenAfterEsc: true`. Screenshot with focus on Close and the popover open: `scratchpad/audit-scratch-4/focus-shots/term-popover-focus-on-close.png`. The clock card on the same page does close on Escape (`clock-card` handler at hx-clock.js:332–334; `cardOpenAfterEsc: false`), so the term popover is the odd one out.
  Suggested fix: add a `keydown` Escape listener on `pop` that calls `shut()`, keeping the term listener.

- [major] site/modules/the-api-call-on-the-wire.html:163–166 (four rows: `end_turn`, `max_tokens`, `refusal`, `pause_turn`) and site/modules/prompt-injection-and-the-trifecta.html:125 (`Exfiltration`) — A term marker that is the only content of a table cell is 19 px tall. DESIGN §9 exempts only a term marker "inside running text"; a cell holding only the marker is not running text.
  Evidence: `scratchpad/audit-scratch-4/probes/targets-375.jsonl` at 375 px: `end_turn` 74.2 × 19, `max_tokens` 91 × 19, `refusal` 65.8 × 19, `pause_turn` 91 × 19; `Exfiltration` 73.5 × 19 (both `inRunningText: false`, parent `td`).
  Suggested fix: give the marker a 44 px hit area inside the cell (the `.term::before` technique in hx.css:151, sized to the cell), then re-measure at 375.

- [major] site/assets/components/hx-replay.js:396–397 (Show all's click calls `toggleWire(null)`) and :552 (`r.showAll.hidden = !shown`) — Enter on "Show all" leaves focus on BODY. The click clears the wire filter, the same render hides the focused button, and nothing moves focus.
  Evidence: `scratchpad/audit-scratch-4/probes/focus_extra.json`: `afterShowAllEnter` BODY; `showAllAfter` `hidden: true, display: none`; the next Tab goes to the Transcript region. Walk losses on 5 pages: cost-and-latency, rein-2, same-model, statistics, the-api-call-on-the-wire (`kb-*.json`, "Show all").
  Suggested fix: after a render that hides the button, move focus to `r.filterLine` (or the lane label that was just pressed).

- [major] site/assets/components/hx-wire.js:147–151 (the Previous button: `back.disabled = this.state.turn <= 1`), with the focus restore in site/assets/components/lib/hx-element.js:160–170 (`#safeRender`) — Enter on "Previous turn" at turn 2 leaves focus on BODY. The step takes the turn to 1, which disables the button, and a disabled button cannot take the focus restore.
  Evidence: `scratchpad/audit-scratch-4/probes/focus_turns.json`: "Turn 2 of 4", Enter on Previous, `activeElement` BODY, then "Turn 1 of 4" with Previous `disabled: true`. Enter on Next afterwards keeps focus on Next. The walks show the same loss on prompt-caching and rein-2 (`kb-*.json`, "Previous turn").
  Suggested fix: when the pressed control becomes disabled, move focus to the other stepper control (Next) or to the "Turn n of m" text, before the render.

- [major] site/assets/components/hx-escape.js:354 (the Replay button: `disabled: s.running`) — Enter on "Replay the attack" leaves focus on BODY, and it does not come back when the run ends. The button is disabled during the run, so the focus restore cannot land on it, and the restore does not run again when focus is already on BODY.
  Evidence: `scratchpad/audit-scratch-4/probes/focus_replay.json`: `justAfterEnter` and `final` both report BODY, with the button enabled again at the end. The trifecta walk loses focus on every press, 39 times (`kb-modules__prompt-injection-and-the-trifecta.json`).
  Suggested fix: use `aria-disabled` only and keep the `running` guard inside `replay()` (already present), so focus stays on the button; or move focus to the result when the run completes.

### Minor

- [minor] site/assets/core/hx.css:36 (`.skip`) — The skip link is 133 × 39 px. DESIGN §9 sets 44 × 44 px for targets with no exemption for keyboard-only controls.
  Evidence: `targets-375.jsonl`, the `a.skip` entry on all 108 pages (for example `index.html`, 133 × 39).
  Suggested fix: `min-height: 44px` on `.skip`.

- [minor] site/index.html:17 and the same markup on every page; `<main id="main">` — Enter on the skip link leaves `document.activeElement` on BODY on all 108 pages. The next Tab lands inside `#main` on 107 of 108 pages (the exception, `labs/count.html`, has no focusable element inside `#main`, so the Tab wraps back to the skip link). The Tab order is right, but focus does not land on the target.
  Evidence: `targets-375.jsonl`, fields `skipEnter` (BODY, 108/108) and `skipThenTab` (inMain true, 107/108).
  Suggested fix: `tabindex="-1"` on `<main id="main">` and focus it from the skip link, as `focusBeatOnJump` (`site/assets/core/shell/module.js`) already does for beats.

- [minor] site/assets/components/hx-clock.css:15–16 — Clock spokes show focus as a 4 px node stroke in focus blue, dashed, with the spoke's own outline removed, not the 3 px focus ring DESIGN §9 requires.
  Evidence: `scratchpad/audit-scratch-4/probes/focus_spoke.json`: for each of the eight spokes when focused, `.node` stroke rgb(26, 86, 219), stroke-width 4px, dash 3px/3px, group outline `none 0px`, and `:focus-visible` true. The change is visible (`scratchpad/audit-scratch-4/focus-shots/spoke-focus-normal.png`), but the focused blue Control spoke reads close to its unfocused blue wire ring at that scale.
  Suggested fix: draw the 3 px ring with `outline` (or an extra circle) on the spoke's `.hit` area, offset outward.

## Coverage

What was checked and found clean. Numbers come from the files named.

1. axe (serious and critical fail, moderate warn; QA report.json). The full 108-page QA run was rerun in six chunks (`scratchpad/audit-scratch-4/qa-r2/out-0..5/report.json`, `probes/queue5.log`, exits all 0). Merged: 108 pages; 860 axe views at 375 and 1280, light and dark, before and after interaction (428 after); violations at any impact: 0; QA failures: 0; warnings: 0. My own axe run with the QA tag set on the 10 keyboard pages at 375 and 1280, light and dark (40 views, `probes/axe-incomplete.jsonl`) also gives 0 violations. Its "incomplete" items were resolved by reading the computed colours and the DOM (`probes/contrast_incomplete.json`): the "More below" cue, the fact chips, and the "−" key all sit at 15.9:1 or better; the Menu button's `aria-controls="menu-sheet"` target is present in the markup (`site/modules/the-turn-clock.html:38`).
2. 375 px layouts (targets, clipping, scroll). `probes/targets-375.jsonl`: all 108 pages; 10,529 visible interactive elements measured, through the label box for visually hidden radios, checkboxes and file inputs. Horizontal scroll: 0 pages with scrollWidth above the viewport (also 0 QA failures). Clipped controls: 0 (no control clipped by an overflow-hidden ancestor, none with cut-off text). Outside the viewport: 66 items, all `cm-content` inside `div.cm-scroller` (the code editor's own horizontal scroll; keyboard-reachable, `tabindex` 0), plus 16 links in `div.table-wrap` scrollers (scrollable by design). 870 interactive elements are under 44 px: 108 skip links (minor, above); 374 links on text lines (332 "Taught in <link>" lines on the glossary; 42 "Before this: <link>" prerequisite lines), judged exempt under the DESIGN §9 reading for a link in running text; 383 term markers and inline controls in running text, exempt; 5 term markers as the only cell content (major, above).
3. 14 px floor. QA's SMALL_TEXT check ran in all 654 page views (108 pages at 375, 768 and 1280, light and dark): 0 failures. Charts and SVG text were measured at rendered size by QA.
4. CVD (QA's Machado 2009 severity 1.0 filter, linear RGB). QA wrote full-page simulations at 1280 light for every page (`qa-r2/out-*/*-cvd-*.png`). Wire components: `audit-scratch-4/cvd-el/` holds normal, protan, deutan and tritan element shots of the first two wire components on each of 12 pages (hx-clock, hx-wire, hx-cacheline, hx-placement). Judged by eye: the turn clock (`audit-scratch-4/cvd-el/modules__the-turn-clock-hx-clock-0-*.png`), the design page palette (`qa-full/design-cvd-protan.png`) and the index board (`qa-full/index-cvd-protan.png`): each wire has its own name, glyph, clock angle, line style (solid, dashed, dotted, dash-dot) and text label, so none depends on hue alone. Palette arithmetic: `tools/qa/check_palette.py` passes for day and night. Not judged: the prompt-caching wire element captured the friendly view, which has no wire colours (see limits).
5. Keyboard focus path on 10 pages (1280, light; real keys). The step-by-step path is in `scratchpad/focus-paths/<page>.txt` (one line per Tab stop, activation and result). Summary:

| page | Tab stops | activations | focus lost to BODY | Escape did not close a popover |
|---|---|---|---|---|
| modules/same-model-different-harness | 145 | 55 | 1 (Show all) | 48 |
| modules/the-api-call-on-the-wire | 189 | 85 | 1 (Show all) | 78 |
| modules/the-turn-clock | 128 | 32 | 0 | 25 |
| modules/prompt-caching | 148 | 49 | 1 (Previous turn) | 42 |
| modules/tool-design | 139 | 38 | 0 | 31 |
| modules/statistics-for-a-random-system | 150 | 56 | 1 (Show all) | 30 |
| modules/prompt-injection-and-the-trifecta | 300 (cap) | 250 | 39 (Replay the attack) | 243 |
| modules/cost-and-latency | 155 | 59 | 1 (Show all) | 52 |
| modules/rein-2-one-tool-and-the-loop | 170 | 70 | 2 (Show all, Previous turn) | 44 |
| modules/pytest-primer | 127 | 42 | 0 | 34 |

   Clean on these pages: no keyboard trap (`trap: false` on all ten; CodeMirror does not bind Tab); focus indicator visible on every stop except the clock spokes (above) and the editors' content nodes, whose 3 px ring is on `.cm-editor` (`focus_editor.json`: outline 3 px in light and dark on the kata editor); radio groups move with ArrowDown (rein-2, the-turn-clock); clock spokes move with the arrows and Enter opens the card, whose Escape closes it and returns focus to its spoke (`focus_extra.json`); transcript rows (`ev-main`) keep focus on Enter; the M2 walkthrough items are fixed on these pages: "Show answer" moves focus to the revealed answer, beat links move focus to the beat heading, and the kata "Run" keys keep focus (pytest-primer, the-api-call-on-the-wire, cost-and-latency, rein-2, and others).
6. Phone chrome (375). The Menu sheet (`dialog`): Enter from the Menu button moves focus into the dialog; Escape closes it and returns focus to the Menu button (`probes/mobile-menu.json`, index and the-turn-clock).
7. Skip link. On all 108 pages the first Tab lands on the skip link to `#main` (`targets-375.jsonl`, `skip`).
8. Static HTML pass, all 108 pages (`probes/static_html.py`): `lang` present; exactly one `h1`; no heading level skipped; no `img` without `alt`; no unnamed `svg` figure; no empty link; titles unique.
9. Reduced motion (QA's check, 1280): 0 running animations over 150 ms in any page.
10. Live regions: one polite region per component (`lib/hx-element.js` `live()`), announcing only on text change (replay: `hx-replay.js:573–574`), as DESIGN §9 asks.
11. Page weight: largest page 262.7 KB, all under the 300 KB budget (QA).
12. Earlier walkthrough items, rechecked by reading the code and running the real-key walks: M3 (incident/transcript names start with the visible text, `lib/transcript.js:231–234`) is fixed; M5 (term markers get a 44 px hit area, `hx.css:151`) is in place; M2 (focus after "Show answer", beat links, Run keys) is fixed on these pages but not for Show all, Previous turn or Replay (findings above).

## Limits

- No screen reader was run (no NVDA, JAWS or VoiceOver on this Linux container). Accessible names and roles were checked through the DOM and axe only.
- No touch device or touch emulation. Target sizes are layout boxes (getBoundingClientRect), not hit tests. Term-marker hit areas (`::before` pseudo-elements) were not measured; the marker boxes are 19 px.
- The keyboard pass covers 1280 px only, and 10 pages. The walk is capped at 300 Tab presses; prompt-injection-and-the-trifecta reached the cap, so its path is partial. Enter on the kata Run keys started Pyodide runs; kata results were not judged.
- Pointer (mouse) behaviour of the filtered replay was not tested, so the blocker is stated for the keyboard only.
- The first full QA run (`qa-full`) was killed at page 99 of 108 when its background command hit the time limit (the log shows a browser-closed error); its 99 pages logged no fail or warn lines. The complete set was rerun in six chunks (`qa-r2`), with report.json for each. Under contention from the gate run, the observability page at 768 px dark timed out at 300 s while settling; a solo re-run (`qa-recheck-observability`) passed with 0 failures, so it is not counted.
- CVD simulations are QA's filter, judged by eye, not measured per wire. The wire component element shots on the 12 pages show the friendly view on some pages (prompt-caching) and so say nothing about wire colours there; the Wire view was not captured.
- The step editor (CodeMirror in hx-step): rein-2 has no CodeMirror editor (its code is a `pre`), so the step-editor focus ring was not observed. The kata editor's ring was verified.
- The glossary and prerequisite links are judged exempt by reading DESIGN §9 as "a link in a line of text". A stricter reading would add 374 minor items.
- Zoom above 100 % and reflow below 375 px were not checked (not in the brief).
- The Escape counts include popovers opened earlier in the same walk, which stayed open; each count is a true failure to close.

## Summary

1 blocker, 5 major, 3 minor (9 findings). Clean on all 108 pages: axe (375 and 1280, both themes, before and after interaction: 0 violations at any impact), the 14 px floor, horizontal scroll at 375, 768 and 1280, and reduced motion.
Most important: with a wire filter on, the replay cannot be stepped from the keyboard (hx-replay.js:482–494, :199–215); Escape does not close term popovers (terms.js:73).
Focus is lost to BODY on Show all, Previous turn and Replay the attack, and the 375 px targets, skip link and clock focus ring need fixes before sign-off.
