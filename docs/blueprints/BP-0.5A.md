# BLUEPRINT BP-0.5A: design specimen, fonts, QA runner, palette check

Phase 0. Builder rules: `.claude/agents/hx-builder.md` (read it first; it
binds you). Director: the main session. You never commit.

## Read first
- `docs/DESIGN.md` (all of it; it is the spec for everything visual here)
- `site/assets/core/tokens.css` (director-owned: read, never edit)
- `course.json` → `wires` (text for wire names, questions, laws)
- `docs/DECISIONS.md` D-011 … D-018

## You own (create/edit only these)
```
.gitignore
package.json  package-lock.json
LICENSE  LICENSE-CONTENT.md  README.md
site/index.html  site/design.html
site/assets/core/hx.css  site/assets/core/glyphs.svg  site/assets/core/app.js
site/assets/fonts/  (6 woff2 files, LICENSE-OFL.txt, FONTLOG.txt)
tools/vendor/build_fonts.py
tools/qa/run.mjs  tools/qa/check_palette.py
```
Do not touch anything else (especially `tokens.css`, `course.json`, `docs/`,
other `tools/` files, `.venv/`). Use the existing venv read-only:
`/home/user/ai-harness-eng/.venv/bin/python` (has fonttools, brotli, ruff, mypy).
Scratch: `/tmp/claude-0/-home-user-ai-harness-eng/4512a573-cc00-58ec-8db9-1f17cfd98bb0/scratchpad/build/A/` (delete its contents at the end).

## Build

### 1. Node config
- `package.json`: `{"name":"harnessed","private":true,"type":"module","engines":{"node":">=22"}}`
  with **exact** devDependencies: `playwright` 1.56.1, `@axe-core/playwright` 4.13.0,
  `axe-core` 4.13.0, `@ibm/plex-sans` 1.1.0, `@ibm/plex-mono` 2.5.0,
  `@ibm/plex-sans-condensed` 2.0.0. Scripts: `"qa": "node tools/qa/run.mjs"`,
  `"fonts": "python3 tools/vendor/build_fonts.py"`. Create the lockfile with
  `npm install --save-exact`. Never run `playwright install`.
- `.gitignore`: `node_modules/`, `.venv/`, `__pycache__/`, `*.pyc`, `.mypy_cache/`,
  `.ruff_cache/`, `.pytest_cache/`, `tools/qa/out/`, `site/vendor/pyodide/`, `.DS_Store`.

### 2. Fonts (`tools/vendor/build_fonts.py`)
Inputs (from `node_modules/@ibm/<pkg>/fonts/complete/woff2/`): Sans Regular,
Sans Italic, Sans SemiBold, Sans Condensed SemiBold, Mono Regular, Mono SemiBold.
For each: subset with fontTools (`fontTools.subset`) to unicodes
`U+0000-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2190-2199,U+2212,U+2248,U+2260,U+2264-2265`,
layout features `kern,liga,zero`, flavor woff2. **Rename** (OFL reserved font
name "Plex"; DESIGN §5): in the `name` table, records 1, 3, 4, 6, 16, 17, 21, 22
must not contain "Plex": map "IBM Plex Sans Condensed"→"Harnessed Sans Condensed",
"IBM Plex Sans"→"Harnessed Sans", "IBM Plex Mono"→"Harnessed Mono", and
PostScript names "IBMPlexSansCond…"/"IBMPlexSans-…"/"IBMPlexMono-…" →
"HarnessedSansCond…"/"HarnessedSans-…"/"HarnessedMono-…". Keep records 0, 7,
13, 14 (notices). Set `head.modified = head.created` so output is reproducible.
After writing, re-open each file and assert the rule. Outputs:
`site/assets/fonts/harnessed-sans-400.woff2`, `harnessed-sans-400i.woff2`,
`harnessed-sans-600.woff2`, `harnessed-sans-cond-600.woff2`,
`harnessed-mono-400.woff2`, `harnessed-mono-600.woff2`. Copy the package's
`LICENSE.txt` verbatim to `site/assets/fonts/LICENSE-OFL.txt`. Write
`FONTLOG.txt`: source packages and versions, the subset ranges, the rename,
the reason (OFL reserved name), today's date. Print each file's size.

### 3. CSS (`site/assets/core/hx.css`)
First line `@import url("tokens.css");`. Then six `@font-face` rules
(`font-display: swap`) mapping the files above to families
`Harnessed Sans` (400 normal, 400 italic, 600), `Harnessed Sans Condensed` (600),
`Harnessed Mono` (400, 600). Then base styles exactly per DESIGN:
- `html` background `var(--hx-paper)`; `body` draws the grid (§2: minor 16 px,
  major 80 px, two repeating linear-gradients each direction), font
  `var(--font-sans)`, size `var(--fs-body)`, line height `var(--lh-body)`, color ink.
- h1/h2 in `--font-cond` 600 with `--fs-h1`/`--fs-h2`, h3 sans 600 `--fs-h3`; `.lede`.
- `.skip` link (visible on focus), `:focus-visible` 3 px `--hx-focus` ring, offset 2 px.
- `.plate`, `.plate.ticked` (corner ticks per §6.4), `.plate-label` (mono 600,
  14 px, uppercase, .06em tracking, ink-2).
- `.wire-chip` (uses `--c` set per wire: `.wire-chip[data-wire=control]{--c:var(--w-control)}` …), glyph + ink text on tint, 1 px border at 45 %.
- `.term` (dotted underline), `.fact-chip` (+ `.stale`), `.btn`, `.btn.primary`,
  `.btn.quiet`, `input`/`select` (44 px, `--hx-rule-strong` border), `pre`/`code`
  (code bg/ink, `--fs-code`), syntax classes `.syn-kw .syn-str .syn-num .syn-com .syn-fn .syn-op`,
  `.law`, `aside.realterm`, `aside.warn`, `aside.noise`, tables + `.table-wrap`
  (`overflow-x:auto`), `.num` (mono).
- `@media (prefers-reduced-motion: reduce)` and `[data-motion=reduced]`: no
  transitions/animations over 150 ms. `@media print`: no grid, white paper.
- Nothing may render below 14 px at any width. No horizontal page scroll at 375 px.

### 4. Glyph sprite (`site/assets/core/glyphs.svg`)
One `<svg xmlns="http://www.w3.org/2000/svg">` containing `<symbol id="g-NAME" viewBox="0 0 24 24">`
for every glyph in DESIGN §4.1, §4.2, §4.3, using the **exact path data** given
there, `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`.
Separate symbols for variants: `g-box-filled`, `g-flag-filled`,
`g-nested-filled`, `g-cache-read`, `g-cache-write`, `g-permission-allow`,
`g-permission-ask`, `g-permission-deny`, `g-shield-pass`, `g-shield-fail`,
`g-hexagon-fail`, `g-switch-open`, `g-switch-closed`, `g-prog-0`, `g-prog-1`, `g-prog-2`.
Filled parts use `fill="currentColor"`. Do not invent shapes.

### 5. `site/assets/core/app.js` (tiny; the real shell is Phase 1)
ES module. Reads `localStorage["harnessed:v1"]` (JSON `{schema:1, prefs:{theme, motion}}`)
inside try/catch; applies `data-theme` (`light`/`dark`; absent for `auto`) and
`data-motion` (`full`/`reduced`; absent for `auto`) on `<html>`. Exports
`setPref(name, value)` which saves and applies. Buttons with
`data-set-theme="light|dark|auto"` or `data-set-motion="full|reduced|auto"`
call it. Must log nothing and never throw when storage is unavailable.

### 6. Pages
Both pages: the skeleton of AUTHORING §2 (lang, viewport, title
`<name> · HARNESSED`, `hx.css`, `app.js` module, skip link, `<main id="main">`).
- `site/index.html` (placeholder home): wordmark "HARNESSED" (Condensed 600,
  .04em) with an 8-tick connector mark (eight 3 px × 12 px rounded bars in the
  wire colors, turn order), one paragraph: "An interactive course that takes
  you from zero to a hireable AI harness engineer." (exact), the eight wires as
  a list in turn order (glyph via `<svg><use href="assets/core/glyphs.svg#g-…"/></svg>`
  in the wire color, name, question, law — text copied from `course.json`), and
  a link "Design system specimen" to `design.html`.
- `site/design.html` (the specimen the owner will review): sections, each in a
  `.plate.ticked` with a plate label:
  1. **Wires**: 8 rows in turn order: glyph (24 px, wire color), color swatch,
     name, id, clock position, a 120 px SVG line sample in the wire's line
     pattern (DESIGN §3 "Line"; `solid-heavy` = solid 3.5 px), question, law.
  2. **Trace event glyphs**: table of DESIGN §4.2 rows (glyph in its wire's color, kind, wire).
  3. **UI marks** (§4.3), each with its word.
  4. **Type**: h1, h2, h3, lede, body paragraph, small, mono, a Python code
     block with syntax classes, a plate label.
  5. **Components**: buttons (primary, secondary, quiet), wire chips (all 8),
     a term, fact chips (verified and stale, with `check`/`bang`/`ext` marks),
     callouts (law, real term, warn, noise), a table with a numeric mono
     column, a labeled input.
  6. **Turn Clock (static)**: exactly DESIGN §8.1 geometry (viewBox 400; face
     r 168; observability rim r 182 in its pattern; 12 ticks; numerals 12/3/6/9;
     sockets at r 150 at the §3 angles as 44 px circles with 22 px glyphs; labels
     at r 196 on ≥ 420 px; under 420 px hide the outer labels and show a legend
     list below the clock; center model box 64 × 40 "model"; the hand from the
     center to the loop socket). One signal pulse travels the rim in a loop
     using CSS animation, ≈ 2.4 s per lap, with a visible pause button; under
     reduced motion there is no travel: the loop socket gets a 2 px ink ring.
  7. **Replay lanes (static)**: 8 lanes, glyph + name labels (names hidden
     under 480 px), a few event glyphs on each, time axis in mono.
  8. A theme switcher (day / night / auto) and a motion switcher (full / reduced / auto).

### 7. QA runner (`tools/qa/run.mjs`)
Node ESM using `playwright` (chromium) and `@axe-core/playwright`.
- Flags: `--only <path...>` (relative to `site/`, default: every `*.html`
  under `site/` except `site/vendor/`), `--out <dir>` (default `tools/qa/out`),
  `--widths 375,768,1280`, `--themes light,dark`, `--cvd`, `--no-axe`.
- Serves `site/` itself with `node:http` on 127.0.0.1 and a random port, with
  MIME types for html, css, js, mjs, svg, json, woff2, wasm, png, txt.
- Per page × width × theme (context `viewport {width, height: 900}`,
  `colorScheme` light/dark): fail on any console `error`, `pageerror`, failed
  request or HTTP ≥ 400; fail if `documentElement.scrollWidth > innerWidth`;
  at 375 px fail if any visible element with its own text node has computed
  font-size < 14 px (list the selectors); full-page screenshot to
  `<out>/<page>-<width>-<theme>.png`; run every `hx-*` element's
  `el.__test?.run()` if present (await; a throw or `false` fails).
- Once per page (1280, light): axe with tags `wcag2a, wcag2aa, wcag21a,
  wcag21aa, wcag22aa`; fail on `serious`/`critical`, print `moderate` as warnings.
- Once per page with `reducedMotion: 'reduce'`: fail if any running animation
  (`document.getAnimations()`) has duration > 150 ms.
- **Page weight**: sum the transferred bytes of every response during the
  first load at 1280 px, excluding URLs under `/vendor/pyodide/` and
  `/vendor/codemirror`; fail above 300 KB; print each page's total.
- `--cvd`: at 1280 light, inject an SVG with three `feColorMatrix` filters
  (`color-interpolation-filters="linearRGB"`) using the Machado et al. 2009
  severity-1.0 matrices (protan, deutan, tritan — the same as in
  `check_palette.py`), apply `filter:url(#…)` to `<html>`, and screenshot
  `<out>/<page>-cvd-<type>.png`.
- Write `<out>/report.json`; last stdout line exactly
  `qa: <pages> pages, <shots> screenshots, <n> failures`; exit 1 on any failure.

### 8. Palette check (`tools/qa/check_palette.py`)
Python 3.11+, typed (mypy strict), `main(argv: list[str] | None = None) -> int`.
Parse `site/assets/core/tokens.css`: day values from the first `:root {` block,
night values from the `:root[data-theme="dark"]` block, and assert the
`prefers-color-scheme: dark` block declares identical values. Analyze
`--hx-paper`, `--hx-panel` and the eight `--w-*` in turn order using the
reference math below. Thresholds (DESIGN §3.1): every wire contrast ≥ 3.0 vs
paper and vs panel; adjacent pairs on the ring (control–context … observe–control)
≥ 12 under normal, protan, deutan and tritan; any pair ≥ 8 normal and ≥ 3.5 per
CVD type. Print a table per theme; last line `check_palette: day OK, night OK`
or `check_palette: FAILED (<n> problems)`; exit 1 on failure.

Reference math (port it with types):
```python
def lin(c): return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4
def lum(rgb): r,g,b = [lin(c) for c in rgb]; return 0.2126*r + 0.7152*g + 0.0722*b
def contrast(a,b): hi,lo = sorted([lum(a),lum(b)], reverse=True); return (hi+0.05)/(lo+0.05)
M = {'protan': [[0.152286,1.052583,-0.204868],[0.114503,0.786281,0.099216],[-0.003882,-0.048116,1.051998]],
     'deutan': [[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]],
     'tritan': [[1.255528,-0.076749,-0.178779],[-0.078411,0.930809,0.147602],[0.004733,0.691367,0.303900]]}
# simulate: linear rgb -> clamp(0..1, M @ rgb); normal = identity
def oklab(r,g,b):  # linear rgb in
    l=0.4122214708*r+0.5363325363*g+0.0514459929*b; m=0.2119034982*r+0.6806995451*g+0.1073969566*b
    s=0.0883024619*r+0.2817188376*g+0.6299787005*b; l,m,s=[x**(1/3) for x in (l,m,s)]
    return (0.2104542553*l+0.7936177850*m-0.0040720468*s, 1.9779984951*l-2.4285922050*m+0.4505937099*s,
            0.0259040371*l+0.7827717662*m-0.8086757660*s)
# distance = 100 * euclidean(oklab(a), oklab(b))
```
Expected with current tokens (sanity check, from the director's run): day
deutan min ≈ 5.2, day adjacent min ≈ 13.2; night adjacent min ≈ 17.5.

### 9. Licenses and README
- `LICENSE`: the standard MIT text, `Copyright (c) 2026 The HARNESSED authors`.
- `LICENSE-CONTENT.md`: course content (`site/modules/`, `content/`, scenario
  narrative text, `docs/`) is CC BY-NC-SA 4.0 with the link
  https://creativecommons.org/licenses/by-nc-sa/4.0/ ; code (`tools/`, `rein/`,
  `katas/`, `site/assets/**/*.js`, `site/assets/py/`) is MIT; fonts are SIL OFL
  1.1 (see `site/assets/fonts/`); `source/` is the owner's book, all rights
  reserved, not part of the site.
- `README.md`: title "HARNESSED", one-sentence description (as on the home
  page), "Status: Phase 0 (foundations)", how to run locally (venv + `pip
  install -r requirements-dev.txt`, `npm ci`, the checker commands from
  AUTHORING §11), the repo layout (SPEC §11), licenses, and this exact empty
  generated block (another tool fills it; never type counts):
  ```
  <!-- BEGIN GENERATED: counts -->
  <!-- END GENERATED -->
  ```

## Acceptance (all must pass; quote the final output lines)
```
.venv/bin/python tools/vendor/build_fonts.py        # run twice; sha256sum of the 6 files identical both times
.venv/bin/python tools/qa/check_palette.py
.venv/bin/ruff check tools/qa tools/vendor
.venv/bin/mypy tools/qa/check_palette.py tools/vendor/build_fonts.py
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/qa/run.mjs --cvd
```
Then open these screenshots yourself and fix anything that looks wrong:
`design-375-light.png`, `design-1280-light.png`, `design-1280-dark.png`,
`design-cvd-deutan.png`, `index-375-light.png`.

## Report (short)
```
REPORT BP-0.5A
Files: …
Checks: <command> → <final line>   (one per acceptance command; font sizes; page weights)
Deviations: … | none
Open doubts: … | none
```
