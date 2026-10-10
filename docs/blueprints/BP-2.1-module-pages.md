# BLUEPRINT BP-2.1: module pages (the field guide page) and two carried fixes

Phase 2. Builder rules: `.claude/agents/hx-builder.md`. You never commit.

## Read first
`docs/DESIGN.md` §6.2–§6.4, §7.7, §9, §11, §12; `docs/AUTHORING.md` §2–§7, §10
(the page skeleton, beats, voice, terms, components, facts); `docs/COMPONENTS.md`;
`course.json` (modules, kinds, wires, parts); `site/data/terms.json`,
`site/data/facts.json`; your own `tools/gen_pages.py`, `site/assets/core/**`;
`tools/check_content.py` (it checks module pages today: read it before you
change anything it verifies).

## You own
`site/assets/core/**` (not `tokens.css` or `context.js`), `tools/gen_pages.py`,
`tools/tests/test_gen_pages.py`, `tools/check_content.py` and its tests
(only the module-page structure rules named below), `site/labs/module.html`
(a specimen), `site/index.html`, `site/design.html`. Not `site/modules/**`:
module pages are written by content builders; your generator fills their
marked regions.

## 1. What a module page looks like (DESIGN §6.3)
The author writes the static page from the AUTHORING §2 skeleton. You make it a
field-guide page:
- **Header**, generated into `<!-- gen:module-meta -->…<!-- /gen -->` inside
  `header.module-head` by `gen_pages.py` from `course.json`: wire chips (glyph +
  wire name), minutes, `By the end you can` with the objectives as a list,
  prerequisites (built ones as links, unbuilt ones as text with "soon"), and
  the **beat strip** (`1 Break · 2 See · 3 Fix · 4 Prove · 5 Keep`, or the
  kind's beats), each a link to its section. The author's plate label, `<h1>`
  and lede stay hand-written; the checker keeps verifying them.
- **Beat strip** sticky under the top bar on ≥ 700 px; the current beat is
  marked as you scroll (a mark plus the word "now", not color alone).
- **Reading column** ≤ 64ch; figures (`figure`, `hx-*`) step out to 60rem on
  desktop and go full width on phones, each with its plate label and "Try
  this" caption where the author wrote one.
- **Margin notes**: `aside.note` in the author's prose (a term, a fact chip or a
  "why this number" note) sits in a 260 px right margin aligned to its
  paragraph on ≥ 1100 px; on phones it becomes a tap-to-expand inline note
  (a `details` the shell upgrades, or the native `details` itself).
- **Terms**: `dfn[data-term]` (the defining use) and `.term[data-term]` (later
  uses) open a popover with the term's definition from `terms.json` (Esc
  closes; focus returns). A term not in `terms.json` stays plain text.
- **Facts**: `.fact[data-fact]` gets its chip ("verified Oct 2026", linking the
  source) from `facts.json`; an unknown or unverified id gets no chip and
  `data-hx-error` (the checker fails the page anyway).
- **Keep beat**: `p.law` set large in the serif with the module's wire glyph;
  `aside.portfolio` ("What to show from this module") as a plate; `aside.realterm`
  styled as a quiet side note.
- **Progress**: the shell marks a module **visited** on first load and **done**
  when every objective has at least one `hx-evidence` entry whose `objectives`
  include it (store `modules[<id>] = {status, objectives_seen: [...]}`). The
  header shows `2 of 5 objectives shown` with a progress mark, derived from the
  store. A done core module puts its tag on the learner's Harness Board (you
  built that rule in `hx-clock`).
- **Course map** drawer and rail, top bar and footer as on the home page;
  `gen_pages.py` writes the course map region into every module page too.
- The page is complete and readable with scripts off.

## 2. Generator and checker
- `gen_pages.py` discovers `site/modules/*.html` and fills, in each, the
  `gen:module-meta` and `gen:course-map` regions (it fails if a module page
  lacks one, exit 2). Module pages are added to the home course map and the
  rail as links once they exist (you already render "soon" for missing ones).
- `check_content.py`: allow the generated regions' markup (`nav`, `ol`, `li`, `a`,
  `span`, `svg`, …) inside the marked regions only; everything else it checks
  stays as is. Add tests for both.

## 3. Specimen
`site/labs/module.html`: a specimen module page with every pattern above (beats
in order, two margin notes, a term popover, a fact chip on a verified fact, a
`p.law`, a portfolio aside, a real-term aside, and one `hx-replay` figure from the
registry) under a plate label `Specimen · not a lesson`. Its prose is neutral
placeholder text about the page itself (what each part is for), not course
content. It uses a fake `data-module`-free header, filled by you by hand (the
generator only fills real module pages).

## 4. Carried fixes (from the Phase 1 verification round)
- `hx-clock`: under every face, a visible line `Tap a spoke, or use the arrow keys.`
  (replaces the home-only caption addition; keep the screen-reader description).
- Home: `Codes like C9 name modules. The course map lists them all.` (replaces
  "C9 and the like are modules…").

## Acceptance (quote final lines)
```
node --test "site/assets/**/test/*.test.mjs"
.venv/bin/python tools/gen_pages.py --check
.venv/bin/python -m pytest -q tools/tests
.venv/bin/ruff check tools && .venv/bin/mypy
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --only index.html labs/module.html labs/clock.html
```
QA 0 failures. View `labs/module.html` at 375, 768 and 1280, light and dark,
and say what you checked (margin notes at 1280, inline notes at 375, the sticky
beat strip, the popover). Report sizes of any new shell modules.

## Report
Files; checks and final lines; what each part became; UI copy you wrote;
deviations; open doubts (with the choice you made). Don't commit.
