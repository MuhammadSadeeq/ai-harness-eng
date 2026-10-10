# HARNESSED: decision log

Every product, design and technical decision, newest last. Each entry says
what was decided, why, and what else was considered. Status is **open**
(awaiting the owner), **default** (SPEC §14 default in use until the owner
answers), or **decided**.

---

## Phase 0 — 2026-10-10

### D-001 · SPEC §14 open decisions use their defaults · *default*
Product name **HARNESSED**; build project **Rein**; primary language
**Python** (TypeScript track in backlog); hosting **GitHub Pages**; licenses
**MIT** for code and **CC BY-NC-SA 4.0** for content; `source/` stays in the
(private) repository and is **excluded from the Pages deploy**; real-model
eval budget **small and capped, the director asks before spending**.
Note for the owner: the repository is private, and GitHub Pages on a private
repository needs a paid GitHub plan; otherwise the site repo must be public
(with `source/` removed from it first).

### D-002 · One order everywhere, including Part C · *decided*
Part C follows the turn order (Control, Context, Loop, Errors, Tools,
Permissions, Verification, Observability). SPEC §3.1 requires one order in
lessons, cards, the board and the interview walk; the SPEC §5 draft order
contradicted it. Alternative: the draft order, which matches the Rein build
order better; rejected because the build is interleaved by prerequisites anyway.

### D-003 · New module S0 "Same model, different harness" · *decided*
A 25-minute concept module that delivers the course thesis first, defines the
vocabulary of a run, and doubles as the polished first-session path (Phase 7).

### D-004 · Part A reordered · *decided*
A5 structured outputs (needed by B1's tool schemas), A6 reasoning and effort,
A7 why a model alone is unreliable (closes Part A and motivates Part B).

### D-005 · C3 compaction and memory split from C4 prompt caching · *decided*
Together they exceed the prose budget; caching has its own lab, kata and incident.

### D-006 · New module F7 "Model migrations" · *decided*
Phase 0 research found 2026 model releases that reject parameters harnesses
relied on (assistant prefill, manual thinking budgets, non-default sampling
settings on some models; to be fact-checked). Migration with regression evals
is routine work for the role. Placed after D3 and A6.

### D-007 · F6 includes eval-environment containment · *decided*
Environments with network reach are a documented risk in 2026 (vendor incident
reports, to be fact-checked); containment is part of building environments.

### D-008 · C1's hook objective requires failing closed · *decided*
A hook that fails open silently stops enforcing its rule.

### D-009 · New components `hx-check` and `hx-sort`; `hx-count` for counts · *decided*
Concept modules need prediction checks; the book's sorting labs need a sorter;
pages need counts from `course.json` without typing them.

### D-010 · G3 tour repository: mini-swe-agent v2.4.6 (MIT) · *decided*
Core loop ≈ 190 lines of Python with tests (R3 research, 2026-10-10).
Rejected: SWE-agent (loop ≈ 1,250 lines), Aider (Apache-2.0, text edit
formats rather than a tool loop, ≈ 2,500-line core), OpenCode and pi
(TypeScript, 60k+ LOC), nanobot, smolagents (libraries or large).

### D-011 · Wire palette: book hue families, alternating lightness · *decided*
Day and night-shift values in DESIGN §3. The book's palette had near-equal
lightness, so clock neighbors merged under color-vision deficiency
(worst neighbor ΔE<sub>OK</sub> 0.8). Alternating lightness raises the worst
neighbor to ≥ 13 under protan, deutan and tritan simulation; all wires ≥ 3:1
against paper and panel. CI thresholds in DESIGN §3.1 (`check_palette.py`).
Alternative: an optimizer's raw output; rejected because it drained chroma
(permissions and verification turned grey).

### D-012 · Glyph system · *decided*
Each wire's glyph is the glyph of its central trace event (hexagon = tools =
`tool_call`, diamond = permissions = `permission`, …). Beats have no glyphs.
Exact SVG path data in DESIGN §4 so no builder draws icons.

### D-013 · Fonts: IBM Plex subsets, renamed · *decided*
Six WOFF2 Latin subsets (≈ 99 KB). Plex's OFL license reserves the name
"Plex", and a subset is a modified version, so the files are renamed Harnessed
Sans / Harnessed Sans Condensed / Harnessed Mono, with the OFL text, IBM's
notice and a FONTLOG. Plex has no `tnum` and lacks ✓/✕, so numeric readouts use
the mono face and status marks are SVG.

### D-014 · Editor: CodeMirror 6, minimal bundle, vendored · *decided*
A minimal set (view, state, commands, language, lang-python, highlighting)
bundled once with esbuild from pinned packages: ≈ 363 KB minified, ≈ 122 KB
gzip, lazy-loaded on kata/step pages only. The bundle is committed with the
script that rebuilds it (`tools/vendor/build_codemirror.mjs`). Monaco rejected
(heavy, weak on phones).

### D-015 · Pyodide 314.0.7, self-hosted, core only · *decided*
Released 2026-09-14 (meets the two-week rule). Loaded from the site itself,
copied from the pinned npm package into `site/vendor/pyodide/` by
`tools/vendor/copy_pyodide.mjs` for local runs and by the Pages workflow at
deploy (never committed: ≈ 13 MB). Reasons: jsDelivr and unpkg are blocked in
the build environment (QA must work here), and self-hosting removes a
third-party runtime dependency. Only the Pyodide core is used; no packages.

### D-016 · Katas are stdlib-only and run under two runners · *decided*
In the browser and in Node-Pyodide, a small stdlib test runner
(`site/assets/py/hxtest.py`) runs the kata's plain-assert tests. In CPython CI,
the same tests run under pytest *and* hxtest; `check_katas.py` requires the two
to agree. Saves learners ≈ 3 MB of pytest wheels and works offline.

### D-017 · Playwright 1.56.1 · *decided*
It's the version whose Chromium revision (1194) is preinstalled here, so QA
runs without downloads. CI installs the matching browser itself. The newest
release (1.63) would need a mismatched executable path.

### D-018 · Pinned versions (all ≥ 2 weeks old on 2026-10-10) · *decided*
npm: `playwright` 1.56.1, `@axe-core/playwright` 4.13.0, `axe-core` 4.13.0,
`pyodide` 314.0.7, `codemirror` 6.0.2, `@codemirror/state` 6.7.6,
`@codemirror/view` 6.43.13, `@codemirror/commands` 6.11.1,
`@codemirror/language` 6.12.4, `@codemirror/lang-python` 6.2.1,
`@lezer/highlight` 1.2.4, `esbuild` 0.28.2, `@ibm/plex-sans` 1.1.0,
`@ibm/plex-mono` 2.5.0, `@ibm/plex-sans-condensed` 2.0.0.
PyPI: `pytest` 9.1.1, `ruff` 0.16.9, `mypy` 2.3.1, `pyyaml` 6.0.3,
`jsonschema` 4.26.0, `anthropic` 1.8.0, `pydantic` 2.13.5, `fonttools` 4.66.0,
`brotli` 1.2.0. CI Python 3.13 for tools; Rein is tested on 3.11 and 3.13.

### D-019 · Wire validation targets anthropic 1.8.0 types · *decided*
`check_wire.py` validates requests with `pydantic.TypeAdapter` over
`anthropic.types.MessageParam` and responses with `anthropic.types.Message`.
Research found that TypedDict validation checks nested `content` iterables
lazily and drops unknown keys, so the checker must materialize nested lists and
compare key sets itself.

### D-020 · Authoring sources → generated site data · *decided*
Authors write YAML/JSON next to their sources (`content/<ID>/`, `facts/`,
`katas/`, `scenarios/`). `tools/gen_data.py` compiles them into
`site/data/*.json`, which is committed; CI fails if it is stale. The deploy
uploads `site/` (plus the Pyodide copy) and nothing else: no build step for
our own code.

### D-021 · Per-module content folders · *decided*
`content/<ID>/{cards,say,terms,checks}.yaml` so that two builders never own
the same file.

### D-022 · Term first-use rule · *decided*
Each term has one owner module; a module may use it only if it owns it or the
owner is an ancestor. `strict: true` terms are scanned in visible prose;
everyday words are checked only where tagged. Primers require S0 and may define
`local_terms`. A Phase 0 dry run over objectives found and fixed 22 violations.

### D-023 · Prose budget · *decided*
≈ 900 words per module across beats (warn > 900, fail > 1,000), excluding
code, components, cards and prompts. Over budget → split the module.

### D-024 · OWASP items by name · *decided*
OWASP's own repository disagrees with itself about the 2026 numbering
(README: LLM03 Excessive Agency; working file: LLM03 Supply Chain). The course
names risks by title; a number appears only with its own verified fact.

### D-025 · Facts from blocked hosts stay unverifiable · *decided*
No mirrors, no workarounds. Official repositories at pinned commits are
acceptable (`source_alt`). The owner can allow the hosts listed in FACTS §4.

### D-026 · Spaced repetition: Leitner, six boxes · *decided*
Intervals 0, 1, 3, 7, 16, 35 days; a miss returns the card to box 1. Chosen
over SM-2-lite because it's transparent to learners, trivially deterministic in
tests, and makes board energy easy to explain ("3 cards due").

### D-027 · Progress store · *decided*
`localStorage` key `harnessed:v1`, one JSON document with a `schema` number
and migrations. Export and import a JSON file from day one; reset keeps
preferences. The site never asks for, stores or transmits an API key.

### D-028 · Branch · *decided*
The remote repository was empty; all work happens on
`claude/funny-darwin-daqksa`, which becomes its first branch. The owner can
make `main` from it when ready; the Pages workflow deploys only from `main`.

### D-029 · One PRNG per trial, same seeds on every board · *decided*
Comparisons (old board vs new board, bench knobs) give each trial its own
PRNG seeded by the trial number, identical across boards (common random
numbers). A shared stream let one board's extra draws shift the other's
trials: in the Phase 0 fixture it showed a turn limit "changing" the pass
rate (15/20 vs 13/20), which a turn limit can't do. Binding for the Phase 1
simulator and Rein's eval runner.

### D-030 · The kata runner never uses bytecode caches · *decided*
`hxtest.py` loads the kata and its tests from source on every run. Python
validates `.pyc` files by mtime and size, so a same-size edit within one second
ran the learner's old code (found in review; the builder's report had missed
it). Covered by tests that rewrite same-size sources repeatedly and plant a
stale `.pyc`.

### D-031 · Design is open again: exploration before the Phase 0 gate · *decided*
The owner asked for the best UI/UX, fun and intuitive, not bound to the SPEC's
or the book's look. DESIGN.md v1 and its specimen are kept as baseline "D0".
Three further directions are prototyped on the same three screens (home, B2
Break replay, B2 Prove bench with a par puzzle) from one shared fixture, judged
on learning clarity, fun, intuitiveness, phone ergonomics, accessibility,
budget and meaningful motion, with a novice cognitive walkthrough per
prototype. The winner becomes DESIGN.md v2. Prototypes live in `site/proto/`
and are removed once the decision is recorded.
