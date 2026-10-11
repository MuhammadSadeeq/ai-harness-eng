# HARNESSED: component contract

Status: v1.1 (Phase 1). Director-owned. Every `hx-*` element follows these
rules; each component's blueprint adds its own API. DESIGN v2 is the visual
spec; ENGINE.md is the behavior spec for anything that runs a tape.

## 1. Files and registration
- One module per component: `site/assets/components/hx-<name>.js`, which
  defines the element with `customElements.define("hx-<name>", ...)` and
  exports its class. Shared helpers live in `site/assets/components/lib/`.
- Every component **extends `HxElement`** (`lib/hx-element.js`, director-owned),
  which implements §2, §4 (focus kept across renders by `data-key`), §5
  (`this.evidence(kind, detail, objectives?)`; per-item objectives override `data-objective`), the live region (`this.live(text)`), motion
  (`this.reducedMotion`) and §7 (`__test.run` calls your `selfTest()`). A
  component writes `setup()`, `render()` and `selfTest()`; it never re-implements
  these.
- The shell's loader (`site/assets/core/app.js`) imports a component only if
  it is listed in the loader registry and present on the page (BP-1.1).
- Components render in the **light DOM** (no shadow DOM) so `hx.css` applies.
  A component's own CSS lives in `site/assets/components/hx-<name>.css`
  (tokens only, no raw colors), declared as
  `static styles = new URL("./hx-<name>.css", import.meta.url).href`; the base
  adds it once per page and awaits it before the first render. Shared patterns
  (keys, readouts, plates, radios) come from `hx.css` and are reused, not
  copied.

## 2. No-JS fallback
- An element's authored children are its fallback (a figure plus a sentence,
  AUTHORING §6). On upgrade the component moves them into a hidden
  `<div class="hx-fallback" hidden>` (kept for printing and for tests) and
  renders its UI. If anything fails during upgrade, it restores the fallback,
  logs nothing to the console, and sets `data-hx-error`.

## 3. Data
- Tapes and boards are served from `site/data/scenarios/<id>.json` and
  `site/data/scenarios/boards/<id>.json` (copied by `tools/gen_data.py` from
  `scenarios/`); facts from `site/data/facts.json`; course data from
  `site/data/course.json`; cards, say-it prompts and checks from
  `site/data/{cards,say,checks}/<module>.json`.
- Components fetch data with `lib/data.js` (`getTape(id)`, `getBoard(id)`,
  `getFacts()`, `getCourse()`, `getTerms()`, `getContent(kind, moduleId)`), which
  caches each URL once per page. The store and the announcer come from
  `hxContext()` (`core/context.js`), set by the shell.
- Simulations call only `site/assets/sim/index.js` (`runTrial`, `runBench`).
  Components never reimplement harness logic.

## 4. Attributes and state
- Inputs are attributes (strings, kebab-case); `attributeChangedCallback`
  re-renders. Long data is never passed in attributes.
- Every state the learner sees is derived from one state object in `render()`
  (DESIGN §12: no stale status text, no stale live-region messages).
- Settings come from the store's prefs (`motion`, `theme`, `sound`).

## 5. Evidence and progress
- A component keeps its own answers in the store under its own key (for example
  `answers[<item id>]` for hx-check, `hunts[<tape id>]` for hx-incident) and
  restores them on load. A hunt is saved when it ends: a reload in the middle
  of one starts it again (a hunt is a few taps). A restore sets the state only: it emits no evidence, and
  it never credits the same thing twice. A saved answer is used only when it still
  fits its item (`lib/restore.js`).
- When the learner does something that counts (a prediction, a correct
  incident hunt, a kata pass, a bench run, a card review, a say-it self-grade),
  the component dispatches a bubbling `hx-evidence` CustomEvent:
  `{module, objectives: [...], kind, detail}` where `module` comes from
  `<html data-module>` and `objectives` from the element's `data-objective`.
  The shell writes it to the store; components don't touch the store directly
  except for their own UI state (for example a kata's draft code, a card's box).
- Only success credits an objective. Evidence of a failure (a kata run with a
  failing test, a wrong check answer) is still recorded, with an empty
  `objectives` list (`this.evidence(kind, detail, [])`), so it never moves the
  progress line. A prediction is recorded with no objectives, right or wrong:
  it shows the learner committed, not that they know, so a page never puts
  `data-objective` on `mode="predict"` (check_content B4). Per component
  (D-061):
  - `hx-incident`: credits only a correct hunt: the right family, the right
    wire and the right fix. Any other finish is recorded with `[]`.
  - `hx-cards`: each card answered "Got it" credits that card's own
    `objective` from `cards.yaml`; "Again" credits nothing.
  - `hx-replay`: watching to the end proves nothing, so it credits nothing,
    like a prediction. An objective needs a check, hunt, kata, step or
    bench to credit it (check_content B4 counts only those).
  - `hx-bench`: a completed run credits as it is.
  - The on-call shift's drill and the Interview Room's memory station are
    practice of a pattern: a passing memory kata there credits I5.o2
    ("solve timed coding katas from memory"), and nothing else.

## 6. Accessibility and motion (binding)
- DESIGN §9 in full: keyboard operable, visible focus, targets ≥ 44 px,
  nothing under 14 px, no color-only meaning, live regions derived from state
  and replaced on change (at most one message per turn during replay).
- Motion only through the motion tokens; reduced motion (pref or system)
  removes travel and tweening (DESIGN §8).
- Every interactive role has its required ARIA (a `role="slider"` has
  `aria-valuenow/min/max/text`, D-037).
- A press never leaves focus on BODY (D-063). A control a press can make
  unavailable (busy, end of a range, done) takes `aria-disabled="true"` and
  its handler ignores the press, never the `disabled` attribute. A control
  that hides itself on a press names its successor with
  `data-focus-next="<key>"`. The base moves focus to the same key, else that
  successor, else the component's UI. QA's keyboard walk of the lab pages
  checks it.

## 7. Test hook
Every component instance exposes `el.__test = { run: async () => boolean }`
that drives the **real UI** (clicks, keys) through its main path and returns
`true` only if the expected end state is reached. The QA runner calls it and
then audits the page again (D-037). Hooks must not depend on timing: they
await the component's own `ready` promise and step deterministically. A hook
that puts the learner's state back ends with `this.restoreAfterTest(saved)` in
its `finally`, never a bare `setState(saved)`: the audit after interaction runs
`run({ keep: true })`, so it sees the results a learner sees.

## 8. Demo pages
Each component has a demo page `site/labs/<name>.html` (the AUTHORING page
skeleton without beats) that shows it in its main configurations at 375 and
1280 px. QA runs on every demo page.

## 9. Size
A component module plus its CSS stays under 40 KB uncompressed; shared code
goes in `lib/`. Pages still meet the 300 KB budget with all their components.

## 10. Components talking to each other
Components link by id: `for="<id>"` names another element in the same page.
Three small protocols, nothing else:

- **Gate.** Runnable components (`hx-replay`, `hx-bench`, `hx-incident`)
  accept a boolean `locked` attribute. While it is present their run controls
  are unavailable, never hidden (`aria-disabled` or `disabled`; a control a
  press can lock takes `aria-disabled`, §6), and one line says
  "Make your prediction above to unlock the run." Removing it unlocks them.
  `hx-check mode="predict" for="<id>"` removes it when the learner commits.
- **Results.** When a runnable component finishes, it dispatches a bubbling
  `hx-result` CustomEvent, once per finish:
  - `hx-replay`: the playhead reaches the last event for the first time:
    `{source: "replay", status, passed, turns, cost}`.
  - `hx-bench`: a Run ×N completes:
    `{source: "bench", old: Stats, new: Stats}` with
    `Stats = {n, passed, worst_turns, worst_cost, mean_cost}` (integers;
    `mean_cost` floored).
  - `hx-incident`: two stages, both bubbling `hx-result`:
    `{source: "incident", stage: "start"}` when the hunt starts (the first
    allowed tap), and `{source: "incident", stage: "end", wrong_taps, seconds, fix_ok}`
    once the fix is committed. A predict check reveals on the first `hx-result`
    of its target, whatever the stage, so a prediction on an incident is shown
    as soon as the learner starts the hunt. `huntStage()` returns `"none"`,
    `"started"` or `"finished"` for the same states.
    A replay's `hx-result` (at its last event) has no stage and counts as an end.
  A predict check with `for` listens for its target's `hx-result` and then
  reveals.
- **Values.** A component with numbers others can read or drive implements
  `hxValue(name) -> integer | null`, `hxSetValue(name, integer)` (ignored when
  the value is read-only) and `hxRange(name) -> {min, max, step} | null`
  (null for read-only), optionally `hxLabel(name) -> string` (what the value
  is, for an accessible name such as "Turn limit"), and dispatches a bubbling
  `hx-change` `{name, value}` whenever a value changes. `hx-num for="<id>" name="<value>"`
  binds to it (DESIGN §7.7). Each component's blueprint lists its value names.

## 11. Content sources in demo pages
`src` on `hx-cards`, `hx-check` and `hx-say` is a module id (`B2`, read from
`site/data/<kind>/B2.json`) or, on demo pages only, a path ending in `.json`
relative to the page (`site/labs/data/…`). Demo content is still reviewed
content: correct, in the course voice, and short.

## 12. Shared wording
Costs, counts, durations, plurals, what counts as a pass, and how a run's end
status is said all come from `lib/format.js` (director-owned, D-045). No
component formats these itself.
