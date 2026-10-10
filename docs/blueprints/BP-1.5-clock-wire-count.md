# BLUEPRINT BP-1.5: `hx-clock` (Turn Clock and Harness Board), `hx-wire` (Wire View), `hx-count`

Phase 1, wave 2. Builder rules: `.claude/agents/hx-builder.md`. You never commit.

## Read first
`docs/COMPONENTS.md` (all; binding), `docs/DESIGN.md` §2–§5, §7.1, §7.9,
§8, §9, §11, §12, `docs/DECISIONS.md` D-035, D-043, `docs/ENGINE.md` §7
(board modules), §10 (wire payloads), `course.json` (wires, modules with
`tag`, path), `site/assets/components/lib/{hx-element,data}.js`,
`site/assets/sim/index.js` (`runTrial`, `tokens`, `loadBoard`), your own
`site/assets/core/shell/clock.js`, `site/assets/core/shell/pure.js` and
`store.js` (module status, due cards), `site/assets/core/glyphs.svg`.

## You own
- `site/assets/components/hx-clock.js`, `hx-clock.css`
- `site/assets/components/hx-wire.js`, `hx-wire.css`
- `site/assets/components/hx-count.js`
- `site/assets/components/lib/clockface.js` (the drawing, moved out of
  `shell/clock.js`), `site/assets/components/lib/board-tags.js` (pure:
  learner tags, scenario-board tags, comes-in)
- `site/assets/components/test/{board-tags,wirediff}.test.mjs` (pure, Node)
- `site/assets/core/**` (still yours: `shell/clock.js` goes away once
  `hx-clock` draws the home board), `tools/gen_pages.py`,
  `tools/tests/test_gen_pages.py`, `site/index.html`, `site/design.html`
- `site/labs/clock.html`, `site/labs/wire.html`

Not `tokens.css`, `context.js` or `components/registry.js` (mine; list the tags
you need registered in your report). Other builders are writing `hx-replay`,
`hx-incident`, `hx-bench`, `hx-num`, `hx-check`, `hx-kata`, `hx-cards`.

## 1. `hx-clock` (DESIGN §7.1)
One face: the eight wires as spokes at their fixed angles (`course.json`
`wires[].angle`), wire colors, line styles and glyphs; drawn at the host's
measured width and redrawn on resize (no text under 14 px, SVG included); on
phones ≥ 343 px wide with the outer labels moved into a numbered legend list
under it (as you built for the home page).

Modes (attributes):
- **`board="learner"`**: the learner's Harness Board, from the store.
  - A core module whose status is done puts its tag on its tag's wire:
    `A3 · history resend` (`course.json` `modules[].tag`).
  - An empty spoke is dashed and says `comes in C9`: the first module on the
    default path whose tag is on that wire (D-043). Compute it in
    `lib/board-tags.js`; never hard-code it.
  - Cards due today on a wire dim its spoke *and* show a `2 cards due` badge.
    A card counts toward its module's tag wire, or for a module without a tag,
    its first wire.
  - The caption is derived from state:
    - nothing earned: `Your board is empty. Each module you finish plugs a tag onto its wire.`
    - otherwise: `{n} of 29 tags plugged.`
  - Re-render on the store's `update` and `import` events.
- **`preview="A3 A4"`** (with `board="learner"`): draw those modules as if
  done, captioned `Example board: A3 and A4 plugged`. Use it for demos only.
- **`board="<scenario board id>"`**: a scenario board's modules as tags. Map
  module to wire:
  - `turn_limit`, `token_budget`, `loop_detect`, `close_books` → loop
  - `output_cap` → context
  - `retry`, `breaker` → errors
  - `permissions`, `sandbox` → permissions
  - `verify_gate` → verify
  - `rules_file` → control
  - `redact` → observe

  Tag labels (exact):
  - `turn limit {max_turns}`, `budget {max_tokens}`, `loop guard {window}`, `close the books`
  - `output cap {max_tokens}`
  - `retry ×{max_attempts}`, `breaker {threshold}`
  - `{mode} by default`, `sandbox`
  - `verify gate`, `rules file`, `redact`

  Numbers use thousands separators. A spoke with no module says `not on this board`.
- **`compare="<old id>,<new id>"`**: the two scenario boards side by side
  (stacked on phones), labelled with each board's `label`.
  - A `Plug it in` key moves the new board's added modules onto their spokes
    on the new face. Two cues: the tag slides in (300 ms, `--ease-signal`) and
    the spoke brightens.
  - Reduced motion: instant, shown by the 2 px ink ring.
  - Nothing moves on its own.
  - Afterwards the key reads `Plugged in` and is disabled.
- **`tape` + `turn`** (plus `board`, `seed`): the Turn Clock playing one turn
  of a run.
  - The hand (loop color) points at the spoke of the current event's wire.
  - Back / Step keys and a counter (`3 / 9`) move through that turn's events.
  - Each step names the event in words beside the face:
    `permission check · Permissions`. Use a small fixed table of event-kind
    labels, one per ENGINE §9 kind.
  - In full motion a pulse travels the rim from spoke to spoke (about 300 ms
    per hop). Reduced motion: the hand jumps.
  - Values (COMPONENTS §10): `turn` (settable, range 1..turns) and `step`
    (read-only).

Every mode:
- Spokes are one keyboard group (roving focus, arrow keys in clock order).
- Enter or a tap opens the spoke's **card**, a popover anchored to the spoke.
  It shows the wire's question and law (`course.json`), its modules (core
  modules tagged on that wire, with status marks and words), and its level:
  - `Not started`
  - `L1 · can explain` (a tagged module is done)
  - L2/L3 come later; say `Higher levels come from building and measuring.`
  - Esc closes the card and focus returns to the spoke.
- The no-JS fallback is the legend list plus a sentence.
- `selfTest()`: focus a spoke, open its card with Enter and check its
  content, press Esc; in compare mode press `Plug it in` and check the tags;
  in turn mode Step twice and check the hand's wire.

## 2. Home page and generator
- The home board becomes `<hx-clock board="learner">`. Its children (written
  by `gen_pages.py`) are the legend list for a new learner plus the sentence;
  no example board on the home page.
- `gen_pages.py` derives comes-in from the tags with the same rule as
  `lib/board-tags.js` (one Python function, tested against the expected
  values in D-043). Remove `COMES_IN` and `EXAMPLE_PLUGGED`.
- `shell/clock.js` is deleted once `hx-clock` draws the board.

## 3. `hx-wire` (the Wire View, SPEC §6.1)
Attributes: `tape`, `board`, `seed` (defaults as in `hx-replay`: the tape's
`boards[0]` and first golden seed), `turn` (default 1), `mode`
(`friendly` | `wire`, default friendly), `diff` (boolean).
- Data: `runTrial(...).wire` (the per-turn request and response payloads).
- Controls: a turn stepper (− / + keys and `Turn 3 of 12`), a Friendly / Wire
  toggle, and a `Show what changed` toggle that sets `diff`.
- **Friendly** view, as cards:
  - Request: **System** (its text, collapsed after 3 lines, and its tokens);
    **Tools** (names, total tokens); **Messages** (one card per message: role,
    blocks shown as text, `tool_use` (name and input), or `tool_result` (the
    id it answers, the first 3 lines of content, an error mark when
    `is_error`), with tokens per message).
  - Response: stop reason, its blocks, usage.
  - Token counts use the simulator's `tokens()` on that piece.
  - Then the total: `Prompt: {n} tokens of a {window}-token window.`
- **Wire** view: the exact request and response JSON, pretty-printed with a
  2-space indent and keys in the order sent. Each is a focusable, labelled
  scroll region, with a Copy key (`Copied` for 2 s, announced).
- **diff** compares this turn's request with the previous turn's. Unchanged
  leading messages collapse into one row (`24 messages unchanged`) shown in
  `--hx-ink-2`. Messages new this turn are marked `new this turn` (a mark plus
  the word, plus a left rule in `--hx-pass`). Anything that changed in the
  earlier part is marked `changed` (`--hx-warn`, a mark plus the word): in an
  append-only history this never happens, and the lessons on compaction and
  caching rely on showing it when it does. Turn 1 has no previous request:
  `Turn 1: everything is new.` Compute the diff in a pure function (by message
  index plus `pyjson` equality) and test it.
- Values: `turn` (settable, range 1..turns).
- `selfTest()`: step to turn 3, check the message count against the payload,
  toggle Wire and check the JSON parses back to the payload, toggle diff and
  check the `new this turn` count.

## 4. `hx-count`
`<hx-count of="modules">69</hx-count>` shows a number from `course.json`
`counts` (`modules`, `parts`, `wires`, `objectives`, `terms_planned`,
`failure_families`, `minutes_path`, or `modules.<kind>`), with thousands
separators. It is plain text; the typed number is the fallback. If the key is
unknown it sets `data-hx-error` and keeps the fallback. `selfTest()` returns
whether the shown value equals `course.json`'s.

## 5. Demo pages
- `site/labs/clock.html`:
  - a learner board (empty in a fresh browser);
  - `preview="A3 A4 C9"`;
  - `board="b2-new"`;
  - `compare="c9-old,c9-new"`;
  - the turn mode on `tape="c9-approval" board="c9-new" turn="1"`.
- `site/labs/wire.html`:
  - `b2-spiral` on `b2-new`, turn 3, friendly with diff;
  - `c2-flood` on `c2-new`, turn 2, wire mode.
- Both use the AUTHORING §2 skeleton (no beats, no `data-module`), with real
  no-JS fallbacks.

## Acceptance (quote final lines)
```
node --test "site/assets/**/test/*.test.mjs"
.venv/bin/python tools/gen_pages.py --check
.venv/bin/ruff check tools && .venv/bin/mypy
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --only index.html design.html labs/clock.html labs/wire.html
```
QA must report 0 failures. Then view every page at 375 and 1280, light and
dark, and say what you checked. Also report each module's size with its CSS
(≤ 40 KB each) and the home page weight.

## Report
Files; checks and final lines; sizes; the screenshots you reviewed and what you
fixed after looking; all UI copy beyond the strings above; deviations; open
doubts, with the choice you made. Don't commit.
