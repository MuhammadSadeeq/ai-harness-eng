# Phase 1 gate: the engine

**Status:** passed on 2026-10-10 (director's check). The SPEC
gate has no owner sign-off; this page is the record, and Phase 2 starts next.

SPEC §10 sets three gate conditions for Phase 1: **all checkers run in CI;
parity passes on 5 seed tapes; every signature component passes QA at 375 and
1280.** Each one is below, with its evidence.

## 1. All checkers run in CI

CI on `claude/funny-darwin-daqksa` has four jobs: Checkers, Rein on Python 3.11
and 3.13, and Browser QA. Every push is gated first on the same checks run
locally on the committed head (`tools/ci_local.sh --committed --qa`, D-044).

| Check | What it proves | Now |
|---|---|---|
| `ruff`, `mypy --strict` | tools and Rein are clean and typed | clean |
| `pytest tools/tests` | the checkers themselves | 183 passed |
| `render_curriculum --check`, `check_content` | the curriculum and course data agree | 70 modules OK |
| `gen_data --check`, `gen_pages --check` | generated site data and pages are fresh | up to date |
| `check_facts` | every fact is quoted, dated and fresh | 205 facts (194 verified, 11 unverifiable) |
| `check_snippets` | code in pages runs | 0 snippets yet (pages come in Phase 2) |
| `check_katas` (+ `--pyodide`) | starters fail and solutions pass under CPython hxtest, pytest **and** Pyodide | 1 kata, all three agree |
| `check_steps` | Rein build steps apply and run | stub: steps arrive with H1–H2 in Phase 2 |
| `check_scenarios` | tapes, boards and events are valid; JS and Python agree; goldens match; branch coverage | 6 tapes, 36 runs, parity OK |
| `check_wire` | every request/response the harness sends is a valid Messages API payload (anthropic 1.8.0 types) | 594 payloads OK |
| `check_palette` | wire colors keep contrast and color-vision distance, day and night | OK |
| JS unit tests (`node --test`) | simulator, shell, store, component logic | 328 passed |
| Rein tests | the Python reference harness | 265 passed |
| Browser QA (`tools/qa/run.mjs --cvd`) | every page at 375/768/1280 in both themes: axe before and after the self-tests, no text under 14 px (SVG included), no sideways scroll, tokens and fonts load, links resolve, components upgrade, page weight ≤ 300 KB, reduced motion, CVD screenshots | 11 pages, 32 self-tests, 0 failures |

## 2. Parity on the seed tapes

Two runtimes were written from `docs/ENGINE.md` by different builders who
never read each other's code: the browser simulator (`site/assets/sim/`, JS)
and Rein (`rein/`, Python). They must produce **byte-identical** traces.

- **Six** seed tapes (the gate asks for five), each on its old and new board,
  at seeds 0, 1 and 2: **36 golden runs**. Events are committed in full and the
  wire output as a SHA-256 digest (D-042). Branch coverage: the golden seeds
  take every reachable branch option (A3.22).
- Before the rulings, the two runtimes already agreed byte for byte on 3 of
  the 6 tapes across 8 seeds. The three places they split, and every reading
  either builder flagged, became ENGINE amendment A3 (22 rulings, D-040).
- The director re-checked four runs against the JS command line directly,
  outside the checker: events byte-identical, wire digests equal.

| Tape | What it exercises | Old board → new board |
|---|---|---|
| `s0-false-done` | verify gate | false done → done, checks pass |
| `b2-spiral` | turn limit, token budget | 60-turn spiral → stopped at 12 |
| `c2-flood` | output cap vs context overflow | overflow error → done |
| `c5-interrupt` | close the books on resume | orphaned tool call → done |
| `c6-outage` | retry with jitter, breaker | one error ends the run → retries get through, or the breaker stops it |
| `c9-approval` | permission rules vs approval fatigue | dangerous approval → denied by a rule |

## 3. Every signature component passes QA at 375 and 1280

SPEC's list is `hx-replay`, `hx-wire`, `hx-clock`, `hx-board` (the clock with
`board`, D-035), `hx-bench`, `hx-incident`, `hx-kata` and `hx-cards`. Built
with them: `hx-check`, `hx-num`, `hx-count`. Each has a demo page in
`site/labs/`, and each passes default QA with its own self-test driving the
real UI. The demo pages load components through the registry, the same path
real pages use (D-047).

| Component | Demo page | Self-tests | QA |
|---|---|---|---|
| `hx-replay` | labs/replay | 3 | 0 failures |
| `hx-incident` | labs/incident | 2 | 0 failures |
| `hx-clock` (board, scenario boards, compare, one turn) | labs/clock, home | 6 + 1 | 0 failures |
| `hx-wire` | labs/wire | 2 | 0 failures |
| `hx-bench` + `hx-num` | labs/bench | 5 | 0 failures |
| `hx-check` | labs/check | 5 | 0 failures |
| `hx-kata` (Pyodide in a worker) | labs/kata | 2 | 0 failures |
| `hx-cards` | labs/cards | 1 | 0 failures |
| `hx-count` | labs/count | 5 | 0 failures |

## 4. Beyond the gate: does it work for a learner?

QA proves the components are correct and accessible. It can't tell whether a
newcomer understands them, so a fresh reviewer walked every component as Sam
(career changer, basic Python, no AI background) on a phone, at 1280, keyboard
only and with reduced motion, with the same method and rubric as the Phase 0
walkthrough. Reports: `docs/gate/phase1-walkthrough-A.md` and `-B.md`.

| | Pass A (home, check, bench, clock, wire) | Pass B (replay, incident, kata, cards) |
|---|---|---|
| First walk | 375 / 500 · 0 blockers, 7 majors, 10 minors | 385 / 500 · 0 blockers, 3 majors, 14 minors |
| After fixes (verification round) | **445 / 500** · 6 majors fixed, 1 partly | **410 / 500** · 3 majors fixed, 1 new major |

The reference is the approved v2 prototype (470). The verification round
(`docs/gate/phase1-verify.md`) re-checked every major with fresh evidence: 9 of
10 fixed, 1 partly (the arrow-key hint is visible on the home board but only
for screen readers on the clock demo). It found one new major: the kata's 45 s
load cap would fail a slow but working Python download on a phone. Both are
the first fixes of Phase 2 (below); neither touches a gate condition.

## 5. Decisions made in Phase 1
D-039 engine contracts · D-040 the A3 rulings · D-041 the first bad event ·
D-042 golden files and seeds · D-043 board tags in course.json · D-044 pushes
gated on QA · D-045 a pass is a true done · **D-046 the Rust capstone (owner
decision)** · D-047 QA audits upgraded components · D-048 prototypes retired.

## 6. Known gaps, and where they go
- `check_steps` is a stub until Rein steps exist (Phase 2: H1–H2).
- No module pages yet: the home page's Continue says "S0 opens soon".
  Phase 2 builds B2 to final quality first.
- Facts needed later: "the API rejects a history with an unanswered tool_use"
  (C5) has no verified fact yet; the demo card was reworded to a verified one.
- The Rust capstone's tooling (parity runner, skeleton, reference) is Phase 4
  work (D-046).
- Hosting is decided at launch; GitHub Pages on a private repo needs a paid
  plan (PHASE0-GATE §3).

## 7. Carried into Phase 2 (first fixes)
- Kata loading: no hard cap; after 20 s say it is still loading and offer
  `Try again`; fail only on a real error (worker error, init or wasm failure).
  The failure copy stops blaming the browser.
- `hx-clock`: a visible "Tap a spoke, or use the arrow keys." under every face.
- Copy: "Codes like C9 name modules. The course map lists them all."
- Open minors kept on purpose: the par reveal after three tries (DESIGN §7.6),
  the final fix commit in the incident, the jargon on demo pages (module
  pages define every term at first use; the checker enforces it).

## 8. Next: Phase 2, the exemplar
One module to final quality, end to end: **B2 "The agent loop"**, with all
five beats, an incident, a lab, a kata, Prove, cards, say-it prompts and
facts, plus Rein steps H1–H2. The director reviews hardest here and makes
`docs/AUTHORING.md` final; it becomes the bar for every later module.
