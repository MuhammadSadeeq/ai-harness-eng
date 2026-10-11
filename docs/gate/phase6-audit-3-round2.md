# Phase 6 audit 3, round 2: interaction QA on 509ef41

Reviewer: hx-reviewer 3 (interaction QA). Fixed commit: 509ef41, checked out clean at `scratchpad/audit-3r2` (untracked only the `.venv` and `node_modules` symlinks; `git status` clean after all runs).
Scratch: `scratchpad/audit-scratch-3r2` (probe scripts, JSON walk logs, `qa-labs/`, `shots/`).
Rules followed: real keys and clicks only (no `__test` hooks; the QA run's own self-tests are the runner's, not mine); no project file edited, created or deleted; no git state change; heavy checks run one at a time; QA with `--jobs 1`; no background monitor.
Rulings used: D-063 (docs/DECISIONS.md:629), COMPONENTS.md §5, §6, §10 (the 509ef41 text), docs/PHASE6-GATE.md.

## Summary of counts

- FIXED: 11 of 14 round-1 items.
- NOT FIXED: 1 (round-1 F7, replay "Show all": the filter's button is fixed; the transcript's own "Show all" still drops focus into the component's root).
- RULED: 2 (round-1 m1 bench aria-disabled; m3 partial hunt not saved on reload).
- NEW: 1 major (N1, a refused copy shows nothing on screen).
- Blocker: none.

## Round-1 findings: status

Round-1 IDs are those of `scratchpad/phase6-audit-3-interaction.md`.

- F1 [major] hx-cards Check drops focus: FIXED. Focus lands on Next (`data-focus-next="next"`). Evidence: `probe-cards-check.mjs` on `modules/prompt-caching.html`: `before: focus button data-key=check "Check"`; after Enter: `check buttons=0, next buttons=1; focus button data-key=next "Next" in hx-cards`. Code: `site/assets/components/hx-cards.js:346` (round-1 citation 318-323).
- F2 [major] hx-incident smooth scroll under stored Reduce motion: FIXED. The scroll reads `this.reducedMotion` (stored pref first). Evidence: `probe-motion.mjs` (real clicks on the toggle, real keys for the hunt): stored Reduce on, system no preference: `data-motion=reduced`, `smooth scrolls: 0`, focus on the "Found." heading; system reduce only: `smooth scrolls: 0`; stored Full, system reduce: `data-motion=full`, `smooth scrolls: 1` (the learner's Full choice is honoured). Code: `site/assets/components/hx-incident.js:169`, `reduced()` removed.
- F3 [major] no-JS blanks (`interview-room.html:204-205`, `oncall.html:71`): FIXED. Evidence: `probe-nojs.mjs` (JavaScript off, all 108 pages): `nojs: 108 pages, 821 hx elements, 2 with issues`; the two flagged pages (`labs/count.html`, `readiness.html`) are the 39-word demo pages that carry their fallback sentence; no page has an empty fallback. Log: `scratchpad/audit-scratch-3r2/nojs-run.log`.
- F4 [major] "Copied" when the copy was refused (`hx-step.js`, `hx-wire.js`): FIXED for the false claim; the new failure path is N1. Evidence: `probe-copy2.mjs` (real Enter on the copy key; three clipboard states): deny (writeText rejects): `key label "Copy new lines"; live "Could not copy. Select the text and copy it."`; allow (writeText resolves): `key label "Copied"; live "Copied"`; no clipboard API: `key label "Copy new lines"; live "Could not copy..."`. Same results on `labs/wire.html` (`"Copy"` / `"Copied"`). Code: `hx-step.js:207, 211`; `hx-wire.js:410, 413`.
- F5 [major] Run / Replay drops focus while running (`hx-shift.js:224`, `hx-envbuilder.js:300`, `hx-evalbench.js:393-397`, `hx-escape.js:354`): FIXED. The busy control is `aria-disabled` and its handler ignores the press. Evidence: `probe-focus-run.mjs`: `shift run ... focus button data-key=run "Start the next shift"`; `envbuilder run ... focus ... data-key=run`; `evalbench run ... focus ... data-key=run`; `escape replay ... focus ... data-key=replay`. `probe-focus-trace.mjs`: focus leaves the old node when the component rebuilds, then the base class restores it onto the new node with the same key (`focus button data-key=run ...` after the trace). Walk: `lostToBody` 0 for the four labs (`keys-b3`, `keys-b4`); the shift and envbuilder runs at `hx-shift.js:224` and `hx-envbuilder.js:300`, evalbench at `hx-evalbench.js:396`, escape at `hx-escape.js:354`.
- F6 [major] Topology toggles have no `data-key` (`hx-topology.js:222`): FIXED. Toggles carry `data-key="context-<name>"` (`hx-topology.js:222`). Evidence: `probe-focus-run.mjs`: `topology Isolated ... focus button data-key=context-isolated "Isolated" in hx-topology`; walk `labs/topology.html` lostToBody 0.
- F7 [major] "Show all" hides itself and drops focus (`hx-replay.js:563`, round-1 citation 552): NOT FIXED (partly).
  - Fixed for the filter's Show all (`data-key="show-all"`, `data-focus-next="run-position"`, `hx-replay.js:407`): `probe-showall.mjs`: `after Enter on Show all: focus div[role=slider] data-key=run-position "Run position"`; next Tab lands on "Forward one event".
  - Not fixed for the transcript's own "Show all" (`button.ev-more`, `lib/transcript.js:241`, no `data-key`, so no successor): a press on it lands focus on the replay's root container (`div` with the component's whole text, shown as "Turn 4/13 · Window 6% ..."), not on the row. Evidence: keyboard walk logs, `scratchpad/audit-scratch-3r2/keys-8-1791719065996.json` (`labs/replay.html`, entry 34): `button[button] "Show all" in hx-replay <- Enter => div "Turn 5/13 · Window 7% · ≈ $0.0053Turn5 / 13Window used7%Cost" in hx-replay`; `keys-4-1791719581248.json` (`modules/permissions.html`, entry 36): the same with "Turn 4/13". Not reproduced in an isolated probe (`probe-evmore.mjs`, `probe-evmore2.mjs`: the state that shows the button did not recur). Round 1's walk logged this button among its four `Show all` losses; I grouped it under the keyed button, so the round-1 finding did not name it.
  - Suggested fix: give the transcript's expand button a `data-key` (for example `ev-more-<index>`) and a `data-focus-next` (the row's text or the next row's button), or re-render only that row.
- F8 [major] "Plug it in" disables itself (`hx-clock.js:386-388`): FIXED. The button uses `aria-disabled`; focus stays on it; a second press does nothing. Evidence: `probe-attrs.mjs`: `clock plug: text="Plugged in" disabled-attr=false aria-disabled=true; focus button data-key=plug "Plugged in"`; `second Enter: text "Plugged in"; still focused: true`. Code: `hx-clock.js:387` (the disabled-to-aria-disabled change), guards at `:511` and `:514`.
- F9 [major] Previous / Next disable at the range end (`hx-wire.js:151`, `:158`; round-1 citations 150 and 157): FIXED. Evidence: `probe-attrs.mjs`: `wire Previous at turn 1: disabled-attr=false aria-disabled=true; focus button data-key=turn-back "Previous turn"; turn "Turn 1 of 6"`; `Enter again: turn "Turn 1 of 6"; focus ... turn-back`.
- F10 [major] Reveal and Try again hide themselves (`hx-design.js:363`, `:366`): FIXED. Reveal names `model-answer` (the "The model answer" heading, `tabindex -1`); Try again names `field-clarify` (the first field). Evidence: `probe-focus-run.mjs`: `design reveal ... focus h3 data-key=model-answer "The model answer" in hx-design`; `probe-design-again.mjs`: `after reveal: focus h3 data-key=model-answer ...`; `after Try again: again hidden=true; focus textarea data-key=field-clarify "" in hx-design`.
- F11 [major] Next conflict hides itself (`hx-stack.js:241`, round-1 citation 240-241; the Next button is built at `:175`): FIXED. Next names `conflict` (the "Conflict 2 of 3" heading, `tabindex -1`). Evidence: `probe-stack-next.mjs`: `after Enter on Next: next hidden=true; focus h3 data-key=conflict "Conflict 2 of 3" in hx-stack`. `probe-stack-leave.mjs`: Tab alone leaves the component within three presses (not a trap).
- m1 [minor] Locked Run uses `aria-disabled` only (`hx-bench.js:648`): RULED. The intended form is `aria-disabled` for a control a press can lock (COMPONENTS.md:128-129, "a control a press can lock takes `aria-disabled`, §6"; D-063, DECISIONS.md:629). Behaviour checked and as described: `probe-locked-run.mjs`: `locked bench Run: ... focusable=button data-key=run "Run ×20"`; `after Enter: lock line "Make your prediction above to unlock the run."; focus ... data-key=run`.
- m2 [minor] Component reduced-motion CSS overrides a stored Full choice (`incident.css:34`, `replay.css:44`, `evalbench.css:62`, `escape.css:53`): FIXED. Each block is scoped to `:root:not([data-motion="full"])`, and a stored reduce is covered by a `:root[data-motion="reduced"]` rule. Evidence: `probe-css-full.mjs`: with a stored Full and system reduce, a `.key` button on `prompt-caching` has `transition-duration 0.08s, 0.15s, 0.15s`; without a stored preference (system reduce) it is `0s`.
- m3 [minor] A hunt is not saved mid-way (`hx-incident.js:219-226`): RULED. COMPONENTS.md:57-58 now says "A hunt is saved when it ends: a reload in the middle of one starts it again". Behaviour as described: `probe-hunt-reload2.mjs`: `before reload: marks=5 ...`, `after reload: marks=0 ...`, no error.

## NEW problems introduced by the fixes

- N1 [major] A refused copy is announced only to screen readers; a sighted learner sees nothing. `site/assets/components/hx-step.js:207, 211` and `hx-wire.js:410, 413`: the failure path calls `this.live(COPY_FAILED)` and does not change the key. The live region is `hx-live sr-only` (`lib/hx-element.js`, `core/hx.css:35`), so the message is not on screen. Evidence: `probe-copy2.mjs deny`: `key label "Copy new lines"; live "Could not copy. Select the text and copy it."`; `probe-copy-shot.mjs`: `live regions: ["hx-live sr-only: \"Could not copy...\" visible=false", ...]`; screenshot `scratchpad/audit-scratch-3r2/shots/copy-denied-step.png` after a real Enter: the key still reads "Copy new lines", with no message. The first run of that probe, with no stub, showed the same result from the headless browser's own refusal, so this is a real path, not only the stub. Suggested fix: show the message as visible text beside the key (or change the key label to "Could not copy: select and copy" for about 3 s), and keep the live announcement.

Where focus lands after each fixed press (the criterion is a visible, sensible control, not only "not BODY"):
- shift Run, envbuilder Run, evalbench Run, escape Replay: the same control (aria-disabled while busy).
- topology Isolated / Forked: the same toggle (`context-isolated`).
- design Show the model answer: the "The model answer" heading; Try again: the first field (`field-clarify`).
- cards Check: Next.
- stack Next conflict: the "Conflict n of 3" heading.
- replay Show all (filter): the run-position slider; the transcript's Show all: the component root (not sensible; F7).
- clock Plug it in: the same button (aria-disabled, shows "Plugged in").
- wire Previous at turn 1: the same button (aria-disabled).
- say Skip the timer: the timer button; Show the model answer: the "Model answer" heading; Save my self-grade: the same button (aria-disabled); Try again: the timer button.
- kata Show the solution: the revealed note paragraph; cards Show answer: the card back paragraph (tabindex -1, by design).

## Coverage: what was re-run, and what it found

- Focus probes (round 1's): `probe-focus-run.mjs` (shift, topology, envbuilder, escape, evalbench, design reveal), `probe-focus-trace.mjs` (the four busy Run controls), `probe-disable.mjs` and `probe-attrs.mjs` (clock, wire), `probe-showall.mjs` (replay), `probe-cards-check.mjs` (cards), `probe-stack-next.mjs` and `probe-stack-leave.mjs` (stack), `probe-design-again.mjs`, `probe-say2.mjs` (say, new successors). All focus results as listed above; no focus on BODY in any of them.
- Copy (rejecting, resolving and absent clipboard): `probe-copy2.mjs` deny / allow / none; `probe-copy-shot.mjs` (screenshot, visibility).
- Motion: `probe-motion.mjs` (three preference combinations, incident hunt by keys); `probe-css-full.mjs` (computed transitions).
- No-JS, all 108 pages: `probe-nojs.mjs`, `nojs-run.log`, as above.
- Keyboard walk (new round, my probe, Tab / Enter / Space / arrows, focus logged after each press; `keys-b1` to `keys-b7`): all 33 accepted labs, five module pages (`prompt-caching`, `permissions`, `rein-7-retries-and-a-breaker`, `eval-anatomy`, `defense-in-layers`), plus `oncall.html` and `modules/interview-room.html`. Result: `lostToBody=0` on every page, `trapped=0`, `hxErr=0`, `consoleErrors=0`. The landing list above comes from the logs (`scratchpad/audit-scratch-3r2/keys-*.json`).
  - One walk loop: `labs/stack.html` logged 399 presses without completing a cycle, because the walk keeps pressing Enter on Next, Start again and the enforce switch. It is a walk artifact: Tab alone leaves the component within three presses (`probe-stack-leave.mjs`).
- QA (the runner's new keyboard walk), `tools/qa/run.mjs --jobs 1 --only` on the 33 accepted labs: `qa: 33 pages, 198 screenshots, 0 failures`. Each lab's walk line reports `0 failures` (80 stops, up to 2 presses per element). Log: `scratchpad/audit-scratch-3r2/qa-labs.log`. Axe (serious and critical) and the other checks in the same run: 0 failures.
- Replay determinism and the seeded labs were not re-run (not in the round-2 scope).

## Limits

- The QA walk's rule is "a press never leaves focus on BODY". It does not test where focus lands, so it passes the transcript's Show all (F7, container landing) and any other landing on a container. Suggested change to the runner: fail a press that leaves focus on the component's root (tabindex -1) or on a non-control, or report it.
- F7's transcript case was seen only in the walk logs; I could not rebuild the exact state in an isolated probe.
- The busy state (`aria-disabled` while running) was not sampled mid-run: the probe's Run finished within 400 ms, so the trace shows the restored focus after the rebuild, not the mid-run attributes. The code path is `hx-shift.js:224`, `hx-envbuilder.js:300`, `hx-evalbench.js:393-397`, `hx-escape.js:354`.
- The copy failure was tested with a stub that rejects (labelled) and with the headless browser's own refusal (no stub installed). No real user-denied permission was tried.
- Chromium only (Playwright 1.56.1, headless). No screen reader, so the announcements (N1, the copy message) are checked as DOM text, not as speech.
- Heading elements added for the focus targets (`h3` in hx-stack, hx-design and hx-say) are not checked by axe's best-practice heading rules, which QA's tag set does not include.
- Not covered by key in either round: hx-sort reordering, hx-kata memory mode, hx-clock spoke arrows, hx-gatekeeper rounds, hx-outage presets, hx-cacheline blocks, and hx-bugcatch cells beyond the first few.
- The machine was shared (load about 6 to 7 during the QA run); no timeout occurred in the round-2 runs.
- The COMPONENTS.md and DECISIONS.md used are the 509ef41 text in the round-2 worktree.

## 3-line summary

1. Round 2 on 509ef41: FIXED 11, NOT FIXED 1 (F7 replay transcript "Show all" lands focus on the replay root), RULED 2 (m1 bench aria-disabled, m3 partial hunt), NEW 1 (N1 major: a refused copy shows nothing on screen).
2. Every fixed press keeps focus on its own control or a named heading or the next control, with one exception (F7, the transcript's "Show all"); the 33 labs, six module pages, the on-call and interview-room pages walk with no focus loss, and QA's new walk passes all 33 labs.
3. No blocker: the one major NOT FIXED (F7) and the one NEW major (N1) are both in components whose main path works; N1 is fixed by showing the copy failure on screen, and F7 by giving the transcript's expand button a key and a successor.
