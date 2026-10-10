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
  (`this.evidence(kind, detail)`), the live region (`this.live(text)`), motion
  (`this.reducedMotion`) and §7 (`__test.run` calls your `selfTest()`). A
  component writes `setup()`, `render()` and `selfTest()`; it never re-implements
  these.
- The shell's loader (`site/assets/core/app.js`) imports a component only if
  it is listed in the loader registry and present on the page (BP-1.1).
- Components render in the **light DOM** (no shadow DOM) so `hx.css` applies.
  CSS for a component goes in `hx.css` under a `/* hx-<name> */` section, using
  tokens only.

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
- When the learner does something that counts (a prediction, a correct
  incident hunt, a kata pass, a bench run, a card review, a say-it self-grade),
  the component dispatches a bubbling `hx-evidence` CustomEvent:
  `{module, objectives: [...], kind, detail}` where `module` comes from
  `<html data-module>` and `objectives` from the element's `data-objective`.
  The shell writes it to the store; components don't touch the store directly
  except for their own UI state (for example a kata's draft code, a card's box).

## 6. Accessibility and motion (binding)
- DESIGN §9 in full: keyboard operable, visible focus, targets ≥ 44 px,
  nothing under 14 px, no color-only meaning, live regions derived from state
  and replaced on change (at most one message per turn during replay).
- Motion only through the motion tokens; reduced motion (pref or system)
  removes travel and tweening (DESIGN §8).
- Every interactive role has its required ARIA (a `role="slider"` has
  `aria-valuenow/min/max/text`, D-037).

## 7. Test hook
Every component instance exposes `el.__test = { run: async () => boolean }`
that drives the **real UI** (clicks, keys) through its main path and returns
`true` only if the expected end state is reached. The QA runner calls it and
then audits the page again (D-037). Hooks must not depend on timing: they
await the component's own `ready` promise and step deterministically.

## 8. Demo pages
Each component has a demo page `site/labs/<name>.html` (the AUTHORING page
skeleton without beats) that shows it in its main configurations at 375 and
1280 px. QA runs on every demo page.

## 9. Size
A component module plus its CSS stays under 40 KB uncompressed; shared code
goes in `lib/`. Pages still meet the 300 KB budget with all their components.
