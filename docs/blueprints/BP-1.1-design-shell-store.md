# BLUEPRINT BP-1.1: production design system (v2), app shell, progress store

Phase 1, wave 1. Builder rules: `.claude/agents/hx-builder.md`. You never commit.

## Read first
`docs/DESIGN.md` v2 (all; the spec), `site/assets/core/tokens.css` (director-
owned: read, never edit), the approved prototype `site/proto/v2/` (its
`style.css`, `app.js`, `prefs.js`, `clock.js` are the starting point: reuse
and clean up, don't reinvent), `docs/AUTHORING.md` §2, §5–§7,
`docs/DECISIONS.md` D-013, D-026, D-027, D-034–D-037, and
`site/data/{course,facts,terms}.json`.

## You own
`site/assets/core/` (except `tokens.css`): `hx.css`, `app.js`, `store.js`,
`shell/*.js` (if you split the shell), `glyphs.svg`, `test/**`;
`site/assets/fonts/**`; `tools/vendor/build_fonts.py`; `package.json` and
`package-lock.json` (add `@fontsource/newsreader` pinned exactly, released ≥ 2
weeks ago; nothing else); `site/index.html`; `site/design.html`. Two other
builders work in `site/assets/sim/`, `rein/`, `scenarios/` and `tools/`: don't
touch theirs. Leave `site/proto/` alone (it's removed after you're done).

## Build
1. **Fonts.** Add Newsreader static latin 400, 400 italic, 600 (from
   `@fontsource/newsreader`, copied, not variable) with its license, update
   FONTLOG; remove the Condensed face (DESIGN v2 dropped it) from the files and
   `build_fonts.py`. Budget ≤ 135 KB for the seven files; report sizes.
2. **`hx.css`**: the DESIGN v2 system: reading page (column, margin notes ≥
   1100 px, tap-to-expand notes on phones), plates and figure labels,
   instruments (keys with the pressed edge, readout windows, steppers,
   sliders, whole-row radios), chips, term popovers, fact chips, callouts,
   tables (scrollable wrappers are keyboard-focusable regions), code, the
   phone transport bar pattern, both themes (night shift: bordered plates),
   reduced motion. Only tokens for colors (no raw hex outside tokens.css).
3. **Glyph sprite**: keep every v1 symbol; add `g-sandbox` (the diamond with a
   wall: `M12 2.8l9.2 9.2-9.2 9.2L2.8 12z` + `M7.5 12h9`) for the `sandbox`
   event (DESIGN §4 event list gets it via the director).
4. **`app.js` shell** on every page: one-row top bar (52 px; 56 px max on
   phones) with wordmark, the page's module code/title (from
   `<html data-module>` + `site/data/course.json`), a board button (mini clock
   + due count from the store), Menu sheet on phones (nav, Day/Night/Auto,
   Reduce motion), course map (rail ≥ 1100 px, drawer below) from
   `course.json` parts and modules with progress marks from the store, footer
   (export, import, reset, theme, motion, licenses, "facts verified as of"
   from the oldest verified fact). **Component loader**: a fixed registry
   object `{ "hx-xxx": "../components/hx-xxx.js" }` (empty for now; wave 2
   fills it), imports only registered tags present on the page, and leaves
   unregistered tags as their no-JS fallback without errors. **Fact chips** for
   `[data-fact]` (DESIGN §7, FACTS §6), **term popovers** for `[data-term]`
   and `dfn[data-term]` (from `terms.json`; graceful when empty), an
   `announce(msg)` live-region helper that replaces its message (D-037 lesson).
5. **`store.js`** (D-027): key `harnessed:v1`; document
   `{schema: 1, prefs: {theme, motion, sound}, modules: {}, beats: {}, cards: {}, evidence: [], predictions: []}`;
   `load()`, `save()`, `update(fn)`, `subscribe(fn)`, `exportJSON()` (string)
   and `downloadExport()` (a `harnessed-progress-YYYY-MM-DD.json` file),
   `importJSON(text)` (validates shape and schema number, migrates older
   schemas through a `MIGRATIONS` table, rejects bad files with a clear
   message and changes nothing), `reset({keepPrefs: true})`. All storage access
   is guarded: with storage unavailable the course still works in memory and
   says once that progress won't be saved.
6. **Pages**: `site/index.html` becomes the v2 home (as in the prototype:
   Continue computed from the path and the store, today's shift, path
   progress, and an `<hx-clock board>` element containing a static SVG
   fallback of the clock board copied from the prototype's rendered output);
   `site/design.html` becomes the v2 specimen (surfaces both themes, wires,
   glyphs incl. events and marks, type scale with the three families,
   instruments, chips, callouts, fact chip, term popover, margin note, tables).

## Tests (`site/assets/core/test/*.test.mjs`, `node --test site/assets/core/test/`)
store: defaults, update/subscribe, export→import round trip, bad JSON, wrong
schema, migration from a fake schema 0, reset keeps prefs, unavailable storage
(a throwing fake). Shell helpers that are pure (progress marks from store +
course, Continue target, oldest fact date, loader registry filtering).

## Acceptance (quote final lines)
```
node --test site/assets/core/test/
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --cvd     # site pages, 0 failures (axe at 375 and 1280, both themes, after interaction)
tools/ci_local.sh
```
Look at `index` and `design` screenshots at 375 and 1280 in both themes and
fix what's wrong before reporting. Report font sizes and page weights.

## Report
Files; checks + final lines; font sizes; page weights; screenshots reviewed
and what changed; deviations; open doubts.
