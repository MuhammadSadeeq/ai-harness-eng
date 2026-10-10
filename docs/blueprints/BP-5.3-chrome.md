# BLUEPRINT BP-5.3-chrome: the top bar, the menu and the footer on every page

A gap found in review: module pages have no top bar, no Menu sheet and no
footer (the AUTHORING §2 skeleton left them out). So a learner on a module
page has no wordmark home, no theme or motion toggle, no Board button, no
progress export (SPEC §6.4: export from day one) and no "facts verified as
of" line. DESIGN §6.2 requires all of them on every page. Builder rules:
`.claude/agents/hx-builder.md`. You never commit.

## Read first
DESIGN §6.1–§6.2, §7.9, §9; `site/labs/module.html` (the approved shell
markup: top bar, Menu sheet, footer); `site/index.html`, `glossary.html`,
`readiness.html` (their hand-written top bars); `site/assets/core/shell/{chrome,footer,settings}.js`
and `app.js` (what the shell wires up and the selectors it expects:
`[data-topbar]`, `.module-id .mod-code`, `[data-menu-btn]`, `[data-menu-sheet]`,
`[data-theme-slot]`, `[data-motion-slot]`, `[data-due-text]`,
`[data-store-status]`, `[data-export]`, `[data-import]`, `[data-reset]`,
`[data-facts-line]`, `[data-facts-oldest-iso]`); `tools/gen_pages.py` (its
regions and `--check`); `tools/check_content.py` B9 (`GENERATED_REGIONS`,
`GEN_TAGS`).

## What to build
1. **Two generated regions**, written by `tools/gen_pages.py` on every shell
   page: module pages (`site/modules/*.html`) and the top-level pages
   (`index.html`, `glossary.html`, `readiness.html`, `design.html`).
   - `<!-- gen:topbar --> … <!-- /gen:topbar -->` right after the skip link:
     the `header.topbar[data-topbar]` (wordmark linking home; on a module
     page the `.module-id` with its code and title; the page nav **Course,
     Glossary, Readiness** with `aria-current="page"` on the current one; the
     Board button linking to the home page's `#board`; the theme and motion
     slots; the Menu button), then the `dialog.menu-sheet` with the same
     pages and settings.
   - `<!-- gen:footer --> … <!-- /gen:footer -->` right before `</body>`:
     the footer from `labs/module.html` (store status, Export, Import,
     Reset, the Design system link, the fonts and licences line, the facts
     line).
   - Links carry the right prefix for the page's depth (`../` on module
     pages). The markup is the approved one; change nothing in its look.
2. **Migration in gen_pages**: when a page lacks a region's markers, insert
   them at the anchors above, then fill them; `--check` reports a page whose
   markers are missing or whose region is stale, as it does today. Running
   `gen_pages.py` once adds the chrome to every page, including pages other
   builders are writing (generated regions only: touch nothing else in them).
   Replace the hand-written top bars of `index.html`, `glossary.html`,
   `readiness.html` and `design.html` with the generated region (keep the
   home page's other generated regions as they are).
3. **check_content B9**: `topbar` and `footer` join `GENERATED_REGIONS` for
   module pages, and the tags the regions use join `GEN_TAGS` (only those).
   Update its fixtures and tests to match.
4. **Layout**: the top bar is 52 px, sticky from 700 px and scrolling away
   on phones (DESIGN §6.2). On module pages, check the course map rail's
   sticky offset and in-page anchors (`#break`, `#see` …) so that nothing
   hides under the bar (`scroll-margin-top`). Change `hx.css` only where the
   module layout needs it.

## Ownership
`tools/gen_pages.py` (the chrome regions and the migration; nothing else in
it), `tools/tests/test_gen_pages*.py`, `tools/check_content.py` (B9's two
lists only) and its tests and fixtures, `site/assets/core/hx.css` (layout
offsets only), and the generated regions of every page. Pages' authored
content stays as it is.

## Acceptance (quote final lines)
```
.venv/bin/python tools/gen_pages.py --check
.venv/bin/python tools/check_content.py
.venv/bin/python -m pytest -q
.venv/bin/ruff check tools site/assets/py && .venv/bin/mypy
node --test "site/assets/**/test/*.test.mjs"
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --out <your scratch>/qa
```
QA on every page at 0 failures, page weights within 300 KB (quote the
heaviest page's weight before and after). View B2 at 375 and 1280, both
themes: the bar, the Menu sheet open on the phone, the footer, a jump to
`#prove` with the heading visible below the bar, and the theme toggle on a
module page. Export progress on a module page and confirm a file downloads.

## Report
Files; checks and final lines; weights before and after; what you viewed;
deviations; open doubts. Don't commit.
