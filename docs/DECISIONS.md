# HARNESSED: decision log

Every product, design and technical decision, newest last. Each entry says
what was decided, why, and what else was considered. Status is **open**
(awaiting the owner), **default** (SPEC §14 default in use until the owner
answers), or **decided**.

---

## Phase 0 — 2026-10-10

### D-001 · SPEC §14 open decisions · *decided by the owner at the Phase 0 gate (D-038)*
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

### D-032 · Facts registry seeded: 205 entries · *decided*
From the Phase 0 research drafts (BP-0.6F): 194 verified, 11 unverifiable
(blocked hosts or the source doesn't say it). Director spot-check of 20
random verified facts against the live sources: 20/20 quotes present
verbatim (one needed tag-aware matching). Spec facts quoted from Markdown use
the pinned repository file as `source` (FACTS §3); ReAct and tau-bench
citation facts are verified against the authors' own repositories.

### D-033 · Every wire emits at least one event every turn · *decided (Phase 1 schema)*
Prototyping showed that a lane with no events reads as broken (the D1 replay
had empty context and errors lanes, and D0's observability lane was empty).
The Phase 1 trace schema adds per-turn events so each lane shows the turn:
`context_check` (context: prompt tokens vs window, action none/trim/compact),
`recovery_check` or `model_error` (errors: attempts, breaker state, even when
nothing failed), and `trace_write` (observe: what was recorded, what was
redacted). Exact names are fixed in `scenarios/schema.json`.

### D-034 · DESIGN v2: "a field guide with working instruments" · *decided (owner approval at the gate)*
Evidence: three prototypes of the same screens and data (D1 Patch Bay, D2
Field Guide, D3 Night Shift; QA 0 failures each) and an independent
first-time-learner walkthrough with a rubric fixed in advance. Weighted
totals out of 500: D3 400, D2 370, D1 345 (D1 held back by two implementation
blockers). Per criterion the leaders differ: learning clarity D2 (5/5);
fun D1 and D3 (4/5); phone ergonomics D1 and D3; accessibility D3; memory
D1 and D2 (D2's clock plate judged the best memory aid); credibility and
buildability D3. Several low scores are implementation defects, not design
properties.
Decision: one coherent system that takes each direction's best-supported
parts: D2's reading-first page, margin notes, transcript replay with inline
explanations and the clock board; D1's instruments (keys, readout windows,
seed-aligned step grids, par stepper and solution-space chart); D3's incident
flow (page, acknowledge, escalating hints, resolved), seed numbers, sticky
thumb-zone transport, persisted settings and the night console as the dark
theme (the SPEC already calls the dark theme "night shift"). DESIGN.md §12
lists the prototype findings that became rules.
Rejected as the base: D3 alone (dark-first conflicts with the SPEC's
light-first identity and its board is the least memorable), D1 alone
(heaviest to build; a linear rack competes with the clock angles), D2 alone
(least fun; accessibility gaps).

### D-035 · The Harness Board is drawn as the Turn Clock · *decided*
One diagram instead of two: wires as spokes at their clock angles, modules
as tags on their spokes, energy as spoke brightness plus a due badge. It
strengthens the spatial memory the SPEC asks for and removes a second
metaphor. Components `hx-clock` and `hx-board` share one renderer; the board
is the clock with the learner's modules.

### D-036 · Prototype v2 before the gate · *decided*
A unified prototype (`site/proto/v2/`) of the same three screens, built from
DESIGN v2 by reusing the best prototype code, then reviewed with the same
walkthrough, so the owner approves something they can click, not a document.

### D-037 · Accessibility audits run at phone width and after interaction · *decided*
The v2 re-walkthrough found a critical axe error (a phone-only `role="slider"`
without `aria-valuenow`) that CI's QA never saw, because axe ran once per page
at 1280 px on the page as loaded. `tools/qa/run.mjs` now runs axe at 375 and
1280 px in every theme, and again after the page's `__test` hooks have driven
the UI. Verified: the new runner flags the bug on the committed pre-fix
version (`aria-required-attr`, critical, "375/light after interaction"). The
first run also caught a real issue on the D0 specimen (scrollable tables not
keyboard-reachable at 375 px), fixed with `tabindex`, `role="region"` and labels.

### D-038 · Phase 0 gate passed; SPEC §14 answered by the owner · *decided (owner)*
On 2026-10-10 the owner approved **DESIGN v2** and the **CURRICULUM** as the
basis for Phase 1, and answered SPEC §14:
- Names and language: **HARNESSED**, **Rein**, **Python** (defaults kept).
- Licenses: code **MIT**, content **CC BY-NC-SA 4.0**.
- Hosting and the book: **decide at launch**; build privately; `source/` stays
  in the private repository and is never deployed.
- Real-model budget: **no real-model spend.** Consequences: the director
  records no real-model numbers; Rein's real-model adapter is tested against a
  local mock of the Messages API (recorded request/response fixtures validated
  by `check_wire.py`), never the live API; H12 and the eval runner teach
  learners to record their own numbers with their own key, and the course shows
  scripted results labeled as scripted. SPEC §10 Phase 4's gate item "the eval
  runner works … with a real model" becomes "works against the mock API, and
  the real-model path is exercised by the learner"; SPEC §12's "eval runner with
  recorded real numbers" becomes "with a documented procedure and a results
  template the learner fills". The owner can lift this at any phase gate.
- Prototypes `site/proto/d1`–`d3` are removed at the start of Phase 1 (kept in
  git history at `a68f9b0`); `site/proto/v2` stays as the visual reference
  until the Phase 1 design system replaces it.

### D-039 · Engine contracts (docs/ENGINE.md) · *decided*
- Token estimate: `floor(len(json.dumps(x)) / 4)`, the book's rule, applied to
  the whole request (system, tools, messages) so tool definitions count.
- Everything integer (ms, nano-units, percent, tokens) and tapes ASCII-only,
  so JS and Python traces can be byte-identical.
- PRNG: mulberry32, one stream per trial, a fixed draw order.
- Statuses extend SPEC §7.2 with `loop`, `refused`, `max_tokens_reply` and
  `error`; `run_end.passed` (ground truth) is separate from `status` (the
  harness's conclusion), which makes a false done visible in every trace.
- A safety stop at turn 60 ends runaway runs as an operator interrupt.
- D-033 as implemented: control, context, loop, errors and observe emit every
  turn; tools and permissions on tool turns; verify on done claims.

### D-040 · Engine rulings from two independent runtimes (ENGINE A3) · *decided*
- The JS simulator and Rein were built from ENGINE.md by different builders
  that did not read each other's code. On the 6 dev tapes × 8 seeds they
  already agreed byte for byte on b2, c2 and s0 (events and wire); they split
  on c5 (trace_write after a resumed interrupt), c9 (rule names and the
  default reason) and c6 (an empty `--wire` printed a newline). Each builder
  also listed its own readings of unclear text; 21 rulings settle every
  reading where they differed or the text was silent (ENGINE A3).
- Choices and why: the safer reading where a lesson depends on it (a check on
  a deleted file fails; a link escape names both paths; egress hosts are
  lowercased so `EVIL.com` is not a bypass); the reading that keeps D-033
  (every turn writes the trace); a learner-readable string where one is shown
  (`no rule matched (mode ask)`, `rules[2]`); and tape validation for
  degenerate replies instead of runtime rules for them.
- Golden seeds must cover every branch option (A3.22): the b2 seeds 1–5 all
  took the 40% spiral branch, so the goldens never showed the success path.
- `node --test` takes a glob on Node 22 (`"site/assets/**/test/*.test.mjs"`);
  a directory argument fails, so CI and blueprints use the glob.
- JSON module imports (`import … with { type: "json" }`) are accepted for
  `tooldefs.json`: Baseline in all engines since 2025.

### D-041 · Incident hunts: what counts as "the first bad event" · *decided*
- The hunt asks for the first event where things went wrong **as the harness
  engineer sees it**: an ordinary model mistake (a wrong edit) is not the
  failure; the harness letting it through is. Tempting taps get a specific
  reply (`notes`), the symptom at the end (the API error, the operator stop)
  says "look earlier", and events of the same mistake also count
  (`accept_seqs`). Format: ENGINE A4.
- The c6-outage seed tape has **no incident**: with one client, its old board
  (no retry) shows "one transient error ends the run", not the retry-storm
  family (clients retrying in lockstep). C6's incident is designed with its
  outage lab in Phase 3; the tape stays as the parity tape for outages,
  retries, jitter and the breaker.

### D-042 · Golden files and golden seeds · *decided*
- Golden events are committed in full (they are read and diffed in review);
  the wire output is committed as a SHA-256 digest (ENGINE A3.23). Measured:
  the b2-old spiral's wire output is 712 KB for one seed, its events 103 KB.
- Every seed tape uses `golden_seeds: [0, 1, 2]`: seeds 0 and 1 cover every
  branch option of b2 and s0 (the coverage search, A3.22), seed 1 is each
  incident's seed, and one more seed guards against a lucky pair. Three seeds
  × two boards × six tapes = 36 golden runs.
- Parity evidence at this point: with A3 implemented independently in both
  runtimes, events and wire output were identical on all six tapes × 5 seeds
  × both boards (the Rein builder's run of `check_scenarios`, confirmed by the
  director after the JS `--choices` flag lands).

### D-043 · Board tags live in course.json · *decided*
- Each core module has a `tag` `{wire, label}`: what it plugs into the
  learner's Harness Board ("A3 · history resend"). An empty spoke's
  "comes in …" is the first module on the default path whose tag is on that
  wire: control C1, context A3, loop A4, errors C6, tools A5,
  permissions C9, verify C11, observe C12. `check_content` requires a tag on
  every core module, on one of its wires. Build modules raise a wire's level
  (L2) on the readiness radar later; they carry no tag.

### D-044 · Pushes are gated on QA too; demo pages need acceptance · *decided*
- A work-in-progress snapshot passed `ci_local.sh --committed` (which has no
  browser QA) and was pushed; CI's Browser QA then failed on builders'
  unreviewed demo pages. From now on every push is gated on
  `tools/ci_local.sh --committed --qa`.
- Amended 2026-10-11: a push whose commits, since the last commit that passed
  `--committed --qa`, change only `.github/` and `docs/` is gated on
  `tools/ci_local.sh --committed` (no browser QA): nothing QA loads can
  change. Anything else still needs `--qa`. A change to `.github/` is
  then proved by GitHub's CI run on the pushed commit, which the director
  reads.
- Default QA (and CI) checks `site/labs/` pages only once the director accepts
  them (`tools/qa/accepted-labs.txt`, director-owned), matching the component
  registry (only accepted components load on real pages). Builders keep
  checking their own pages with `--only`. The Phase 1 gate requires every demo
  page to be accepted, so nothing can hide there.

### D-045 · A "pass" is a true done · *decided*
- Wherever the course counts passing runs (the bench, pass rates, par, evals
  later), a pass is a run the harness ended `done` **and** whose checks hold.
  A false done is not a pass; neither is a run a guard stopped while the files
  happened to be right (the harness never confirmed it, and the person reading
  the result wouldn't know).
- Found in review: with "checks hold" alone, a turn limit of 4 cut the b2 run
  off after the fix but before the model said done, so 4 counted as feasible
  and par sat on the edge of the range. With true dones the par moves inside
  the range.
- One wording module (`lib/format.js`) for costs (rounded half up to four
  decimals), counts, durations, plurals and status words, used by every
  component.

### D-046 · Rust capstone: I4 "Capstone: Rein in Rust" · *decided (owner, 2026-10-10)*
- The owner chose the Rust track as a **capstone at the end**, for portfolio
  and interviews (backlog B-12, now in scope). It is module **I4** (career
  kind, 60 minutes of guide on the default path; the project itself is
  self-paced like I3's), after the portfolio projects and **before the
  Interview Room** (now I5) so the learner can tell its story there;
  "Twelve weeks after the course" becomes I6. Python stays the primary
  language (D-038 context unchanged).
- What the learner builds: `docs/ENGINE.md` implemented in Rust as a third
  runtime with the same command line, proven by the same golden traces
  (byte-identical events, matching wire digests). The parity runner accepts
  any command, so another language also works; Rust is the suggestion.
- What the course ships (Phase 4, the build track): a learner-facing parity
  runner (`tools/parity.py --cmd "<your binary> run"`), a Rust skeleton
  (argument parsing, file reading, one failing parity run) and a milestone
  checklist. The director has a reference implementation built in Phase 4 to
  prove the capstone is doable here (cargo is available) and to test the
  runner; whether that reference ships publicly is decided at launch, like
  `source/` (a public solution would undercut the portfolio value).

### D-047 · QA audits the upgraded components, and says how many it tested · *decided*
- Found by a builder and the director at the same time: once demo pages
  loaded components through the registry (the real path), QA ran before the
  loader had defined them, so self-tests were skipped and axe and the
  screenshots saw the no-JS fallback; the "0 failures" after that switch did
  not exercise the components.
- QA now waits (up to 60 s, for Python) until every registered `hx-*`
  element on the page is defined and settled, fails any that is not ready or
  fell back (`component not ready`), and prints the number of self-tests per
  page so a silent zero is visible. Re-run: 32 self-tests across 11 pages, all
  passing.
- The base class keeps the no-JS fallback visible while `setup()` loads data
  and swaps the UI in at once, so learners never see an empty figure.

### D-048 · The Phase 0 prototypes are retired · *decided*
- `site/proto/v2` and `site/proto/shared` are removed: every screen they
  showed is now a production component (replay, incident, bench, check,
  clock) on the DESIGN v2 system. They stay in git at `86e0c33`.

### D-049 · Harness bugs are board modules (ENGINE A5) · *decided*
- Several failure families are mistakes in harness code (the forgetful
  harness, reading only the first block, splitting tool results). They are
  modeled as board modules that **add** the bug, so the incident is real
  simulator output and the fix is a board without it; both runtimes implement
  them with parity like any feature.
- What the real API does with a malformed history (split results, an
  unanswered `tool_use`) is a fact question, not a simulator choice: those
  behaviors wait for verified facts (wave 3.2's fact-checker) before the
  simulator models them or a page states them.

### D-050 · Temperature is taught as a concept; facts back the API's current rule · *decided*
- New verified facts (BP-3.0, spot-checked by the director against the
  fetched pages): `temperature` defaults to 1.0 in 0.0–1.0, and models released
  after Claude Opus 4.6 accept only 1.0 (other values are rejected with a 400).
- A1 teaches sampling and temperature as how next-word choice works, in
  `hx-sampler` with illustrative numbers, and states the current API rule as a
  fact: on current Claude models you don't tune temperature, which is one more
  reason a harness can't rely on the model being deterministic.
- The simulator's missing-result error text equals the API's documented
  standard error (`api.tool-use-without-result-error`), so lessons may say
  "the API rejects the request with this error" on that fact.

### D-051 · Wave 3.3 engine scope: compaction and caching in the engine, the fleet in the lab · *decided*
- ENGINE A6 adds what C2–C4's incidents need as traced, parity-checked
  behavior: a harness-side compactor driven by the tape's `notes` (C3: the
  naive board keeps the story and drops the commitments), a one-breakpoint
  prompt cache with exact prefix matching, TTL and the documented price split
  (C4), `system_clock` as the silent invalidator (a harness bug on purpose,
  D-049), and two conditions that let a scripted model react to what the
  request holds (`context_gte`, `sent_lacks`).
- "Many clients" (C6's retry storm across a fleet) is **not** an engine
  feature: one trace is one harness, and a fleet trace would be noise to a
  learner. `hx-outage` models the fleet itself (seeded, labelled as the
  course's model) and reuses the engine's backoff rule (§7.3) for each client,
  so the numbers agree with the single-run traces. C6's own incident stays a
  single-run tape on the existing retry, breaker and outage modules.
- The cache model is labelled on screen as the course's model: it leaves out
  the lookback window and the four-breakpoint limit; prices and the minimum
  length come from facts.

### D-052 · Python's own behavior may be shown by a checked snippet; a `python` facts area · *decided*
- The primers (T1–T10) and build steps teach Python. Where a page says what
  Python does (a dataclass writes `__init__`, `gather` keeps the argument
  order, a timeout kills the child), the strongest evidence is running it: a
  `pre[data-run]` snippet whose output `check_snippets` verifies in CI (and the
  learner can run with the Run key). Such a statement needs no registry fact
  **if the prose says no more than the snippet's output shows**.
- Anything a snippet cannot show (a definition, a guarantee, POSIX signal
  semantics, what Pyodide can't do) still needs a fact with a verbatim quote.
  The new area `python` holds them, sourced from docs.python.org.
- docs.python.org, mypy.readthedocs.io and openreview.net are denied by this
  environment's network policy (BP-3.1-facts: CONNECT 403). Their facts stay
  `unverifiable` until the owner allows those hosts; nothing routes around the
  denial, and pages don't state those claims meanwhile.

## D-053 The gatekeeper's round 2 ties a careful round 1; the lesson is attention, not a better score

- **Context:** BP-3.4 `hx-gatekeeper`. A search over 64,512 policies (the
  four dangerous templates denied or left out, every decision on the other six,
  each default mode) found none that beats a careful hand on all four counts
  (asks, dangerous through, work blocked, risky calls run unreviewed): the
  best total is 2, and 28 policies give exactly 2 / 0 / 0 / 0, the careful
  round 1.
- **Decision:** the tie is the lesson. A good policy gives your most careful
  answer on every call **without anyone watching the stream**, so it holds
  when the reviewer is tired or the timer runs out (round 1 with no answers:
  four dangerous calls get through). The round-2 line says so when round 2 is
  no worse on any count, and otherwise names each count where it is worse,
  with both numbers. "Work blocked" counts denied safe and risky calls, so
  denying all edits to reach 0 asks is not rewarded. Ten templates: rm, a
  pipe into a shell, force push, reads outside the project, writes, tests,
  edits, reads, lists, ls.

## D-054 The Design Room's canvas is eight wire toggles with notes, not drag and drop

- **Context:** SPEC §6.3 describes `hx-design` as "an 8-wire checklist
  canvas: drag wire modules into a design and write notes". Drag and drop
  needs a second, keyboard path to be accessible, and the labs of waves
  3.3–3.4 taught one clear control per thing.
- **Decision:** each wire is one toggle in turn order (`in the design`), and
  switching it on opens its note. Keys and touch work alike; the design is
  still the eight-wire checklist the SPEC asks for, and the reveal sets each
  note beside that wire's model answer (BP-5.1-design-room).

## D-055 Five fact areas for the primers: jsonschema, web, pytest, docker, git

- **Context:** the primers T4 (JSON Schema), T5 (HTTP and SSE), T6 (pytest)
  and T7 (containers) state behaviour of standards and tools that are not
  Anthropic's or Python's. Their pages hold back those claims until a
  primary source backs them.
- **Decision:** four areas, each with one kind of primary source:
  `jsonschema` (the specification and its own guide at json-schema.org),
  `web` (the HTTP RFCs at rfc-editor.org and the server-sent events section
  of the WHATWG HTML standard), `pytest` (docs.pytest.org), `docker`
  (docs.docker.com) and `git` (git-scm.com, for T8). As with D-052, a host the network policy denies leaves
  its facts `unverifiable`, and the page says no more than a checked snippet
  shows.

## D-056 Every Rein step runs in the browser: a stand-in for `python <file>.py`

- **Context:** SPEC Part H says the book's eleven steps run in the browser
  with the FakeModel, but from step 3 on, `run_command` calls
  `subprocess.run`, which Pyodide cannot do, and almost every checkpoint runs
  `python test_calc.py`. PLAN's Phase 4 line ("steps that need a subprocess
  run locally only") would have left nine of eleven steps without a Run
  button.
- **Decision:** the browser's Python gets a stand-in for `subprocess.run`
  (`site/assets/py/hxshell.py`, installed by the runner, never written into
  `rein.py`): it runs `python <file>.py [args]` in the same interpreter, in
  the given folder, with fresh imports, and returns the exit code and output
  a real process would. Anything else (another program, a shell operator)
  returns exit code 127 and says the command needs the learner's machine.
  `check_steps --pyodide` keeps the guarantee honest: a browser run's output
  must equal CPython's real-subprocess output, and a checkpoint or break that
  cannot (it deletes files, needs a timeout to fire, runs another program) is
  marked `local: true`, and `hx-step` shows its command and expected output
  for the learner's machine instead of a Run button. The learner's code is
  the book's real code; only the operating system is stood in for, and the
  page says so (BP-4.0-steps-platform).

## D-057 G1 requires C8, so the product modules can name MCP

- **Context:** G1 maps Claude Code onto all eight wires, and its tools wire
  is MCP servers (fact `harnesses.cc-mcp`). MCP is taught in C8, which was
  not among G1's prerequisites, so the term check (B7) refused the name and
  G1 and G2 had to say "a protocol", which is vaguer than the fact.
- **Decision:** C8 joins G1's prerequisites (with C1, C2, C5–C7, C9, C11 and
  C12); G2, G3 and G4 inherit it through G1. Both are core modules on the
  default path, so the path's length does not change.

## D-058 The Interview Room requires the portfolio module

- **Context:** I5 (the Interview Room) and I6 (twelve weeks after) came
  after the build track on the path, but I5's prerequisites (I2, D2, G4,
  F5) did not include it, so the term check refused "Rein" and "write-up"
  on I6, and the Interview Room's stories had no portfolio behind them.
- **Decision:** I3 (portfolio projects, which requires H12) joins I5's
  prerequisites. I4, the Rust capstone, stays optional for I5: the path
  places it before I5 (D-046), but a learner can rehearse without it.

## D-059 H6 requires C3, so the build step can name compaction

- **Context:** H6 (a context budget) writes `compact()` and records a
  `compaction` event, but C3 (compaction and memory) was not among its
  prerequisites, so the term check made the page call it "a summary".
- **Decision:** C3 joins H6's prerequisites (with H5 and C2). C3 already
  comes before H6 on the path. H5 stays without C12: on the path the trace
  step comes before the observability module, by design.

## D-060 Rein's fourth guard is time, with its own status `max_time`

- **Context:** H8.o1 asks for guards on turns, tokens, time and repeated
  actions, each with its own final status. ENGINE §9 had no status for time,
  and BP-4.1 listed only `max_turns`, `budget`, `loop` and `interrupted`.
  H7 gives Rein a clock (virtual under `--fake`), so a time limit can be
  tested without waiting.
- **Decision:** Rein's H8 adds `--max-seconds N` (off by default). The run
  checks its clock before each model call and ends `max_time` with a `guard`
  line when the limit is passed. The trace schema gains the status and the
  guard name (ENGINE A21). The simulator, the Python runtime and the Rust
  reference stay as they are: no board module asks for a time limit.
- **Also:** Rein's loop guard warns the model once before it ends the run
  with `loop`; the C5 simulator stops at the first repeat. H8 says so.

## D-061 What credits an objective, component by component

- **Context:** the Phase 6 pedagogy audit found that an incident credited
  its objective on any committed fix, right or wrong; that a card review
  credited nothing (cards.yaml's objectives were never read); that a replay
  credited on every finish; and that I5.o2 had no path at all, so I5 and
  Part I could never be done.
- **Decision:** COMPONENTS §5 lists the rule per component. A hunt credits
  only when family, wire and fix are all right; a card credits its own
  objective on "Got it"; a replay credits nothing; a passing memory kata in
  the Interview Room or the shift credits I5.o2. check_content B4 counts an
  objective as covered only by a component that credits on success.


## D-062 The shift, the board and the bank draw from what the learner has seen, mixed

- **Context:** the audit replayed the real shift picker: a new learner got
  incidents from modules not reached yet, a learner with S0 done got the same
  S0 incident seven days running, and fresh cards and say prompts came in
  course order (S0 ×8, A1 ×8 ...). CURRICULUM §3 asks for an incident from
  any family seen so far, and due cards across wires.
- **Decision:** the pool is the modules the learner has started or finished
  (a visit or any evidence); with none, the first path module that has an
  incident. The shift picks an incident not yet hunted when one exists, and
  among those the wire drilled least recently, ties broken by the day's
  seed. Fresh cards and new say prompts come only from that pool,
  round-robin by wire, in a seeded order per day.
- **Amended (2026-10-11), after the replays:** when every incident in the
  pool is hunted, the shift offers the one hunted longest ago if that was at
  least 3 days ago; otherwise it has no incident that day and names the next
  unfinished module, which will add one. A module the learner has not started
  never joins the pool. The drill takes the least recently drilled item in
  the pool. I5.o2 is credited only by a passing memory kata: the slot that
  mounts the kata declares the objective, and check_content B4 reads it.
