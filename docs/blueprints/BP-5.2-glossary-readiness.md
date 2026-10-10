# BLUEPRINT BP-5.2-glossary-readiness: the glossary, the readiness radar and the brag sheet

Career-track platform from SPEC §6.4, built now because every module already
feeds it. Builder rules: `.claude/agents/hx-builder.md`. You never commit.

## Read first
SPEC §6.4 (global features), `docs/COMPONENTS.md` (§5 evidence and credit,
§11, §12), `docs/DESIGN.md` §2–§4 (tokens, wires, glyphs), §7, §7.10 (charts),
§8, §9, §11, `site/assets/core/{store.js,app.js}`, `site/assets/core/shell/{evidence,progress,pure}.js`
(how evidence is stored and how a module's objectives get credit),
`site/data/terms.json`, `site/data/course.json` and `course-core.json`, the
evidence kinds the components emit (`grep -rhoE 'this\.evidence\("[a-z_-]+"' site/assets/components`),
and `tools/gen_pages.py` (the pattern for a generated region with `--check`).

## 1. The glossary (`site/glossary.html`, generated)
- A static page in the shell (`app.js`, tokens, `hx.css`), title
  `Glossary · HARNESSED`. Its list sits in a generated region
  `<!-- gen:glossary --> … <!-- /gen:glossary -->`, written by a new
  `tools/gen_glossary.py` from `site/data/terms.json` and `course.json`
  (`--check` exits 1 and names the page when it is stale; the last line is
  `gen_glossary: <n> terms, page up to date` or `… page written`).
- Grouped A–Z, with a letter index at the top (links to each letter). Each
  term: the term (`<dfn id="term-<id>">`), its definition, its wire (glyph and
  short name, from the wire's own token: never colour alone), and where it is
  taught: `Taught in <ID> · <title>` linking to the module page when the module
  is built, else the title and `coming`. Aliases in small text where they differ.
- Works with no JavaScript. With JavaScript, a filter (one text box and one
  wire select, above the list) hides non-matching terms and says
  `<n> terms shown`. The filter is a light-DOM component `hx-filter`
  (registered by me), generic: it filters the `[data-filter-item]` children of
  its target by their text and by `data-wire`.
- Term popovers elsewhere keep working; module pages' `<dfn>` uses may later
  link here (not in this round).

## 2. Readiness (`site/readiness.html` and `hx-readiness`)
- A shell page, title `Readiness · HARNESSED`, holding one component
  `hx-readiness` (no `src`; it reads `site/data/course.json` with
  `getCourse()` for objectives, `course-core.json` with `getCourseCore()` for
  `built`, both from `lib/data.js`, and the store's evidence). No-JS fallback:
  `Readiness is worked out from your progress in this browser. With
  JavaScript on, it shows here.`
- **Levels per wire** (SPEC §6.4, the source's rubric). Pure functions in
  `lib/readiness.js` (no DOM; tested in Node), from the course and the
  evidence list:
  - A module is *explained* when every one of its objectives has credit
    (the same credit the module page counts).
  - **L1 can explain**: every built module on the wire (its `wires` includes
    it; `built` true in `course-core.json`, which gen_data sets when the
    module has a page) is explained, and the wire has at least one built
    module.
  - **L2 have built**: L1, and at least one passing `kata` or `step` (an
    evidence entry with objectives) on a module of the wire.
  - **L3 can defend with data**: L2, and at least one credited `bench`, `par`
    or `design` entry: `bench` and `par` count for their module's wires,
    `design` for every wire.
  - A wire's progress toward its next level is shown as counts:
    `L1: 3 of 5 modules explained`, `L2: 1 kata or step passed`,
    `L3: 0 experiments or design drills`.
- **The radar**: an SVG with eight axes in turn order (Control at 12 o'clock,
  as the Turn Clock), rings for L1–L3, each wire's level as a point on its
  axis, joined into a shape; wire glyphs and short names at the axis ends;
  a one-sentence summary under it (`Strongest: Loop (L2). Next step: explain
  every Context module.`). Always beside it, a table of the same data (wire,
  level in words, next step), which is what screen readers and phones lean
  on; below 700 px the radar sits above the table at full width.
- **Evidence per level**: each wire row opens (a disclosure) to the entries
  behind its level: module, kind in words (`check passed`, `kata passed`,
  `bench run`, `design drill 21 of 37`), date, a link to the module page.
- **The brag sheet**: `Print the brag sheet` (primary) prints a one-page
  summary: an optional name (a text field, stored in the store's prefs as
  `brag_name`), the levels per wire, modules explained (count and list),
  katas and steps passed, bench results (old against new pass counts, from
  the evidence detail), design drills (score), and the date. Print CSS: black
  on white, no chrome, no buttons, fits A4 and Letter; the screen view shows
  a preview of it.
- Empty state (no evidence): every wire at `not started`, and a link to the
  suggested start.

## Shared rules
Nothing under 14 px (print may use 11 pt); marks plus words; reduced motion
means no tweening; `selfTest()` on `hx-readiness` and `hx-filter` drives the
real UI (seeded evidence through a test store, then restored); the module plus
CSS ≤ 40 KB each; page weight ≤ 300 KB at first load; both themes; axe clean.
Links from the rest of the site are mine (the course map region and the home
menu), not this round's.

## Ownership
`tools/gen_glossary.py`, `tools/tests/test_gen_glossary.py`,
`site/glossary.html`, `site/readiness.html`,
`site/assets/components/{hx-filter,hx-readiness}.{js,css}`,
`site/assets/components/lib/readiness.js`,
`site/assets/components/test/readiness.test.mjs`. Taught-in links in the
glossary use the same `built` flag.

## Acceptance (quote final lines)
```
.venv/bin/python tools/gen_glossary.py --check
.venv/bin/python -m pytest -q tools/tests/test_gen_glossary.py
.venv/bin/ruff check tools && .venv/bin/mypy
node --test "site/assets/components/test/*.test.mjs"
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --only glossary.html readiness.html --out <your scratch>/qa
```
QA 0 failures with self-tests counted. View at 375 and 1280, both themes:
the glossary (filtered and not), readiness empty and with seeded evidence (a
wire at each level), a wire's evidence open, and the print preview (Playwright
`page.pdf` or print media emulation). List what you viewed.

## Report
Files; checks and final lines; sizes and page weights; the level rules as
built (any edge you ruled on); UI copy beyond the strings above; deviations;
open doubts. Don't commit.
