# BRIEF BP-6.0: the Phase 6 audit (five reviewers)

Reviewer rules: `.claude/agents/hx-reviewer.md`. **Reviewers never edit
project files.** Each writes only its report file and keeps scripts and
screenshots in the scratch path it is given. Start only when the Phase 4 and
Phase 5 gates have passed (SPEC §10). The director gives each reviewer a
clean worktree at the audited commit; the main working tree may hold other
work.

## The evidence rule (SPEC Appendix B), for every finding
- command output, a screenshot path, or a source URL with an exact quote;
- a severity: **blocker** (wrong, broken or unsafe for a learner), **major**
  (misleads, fails a binding rule, or blocks a task), **minor** (rough, does
  not mislead);
- a `file:line`.

A finding without all three is not reported. "Looks fine" is not a finding;
"checked, no problem" is listed as coverage.

## Order and agents
At most four agents run at once (SPEC rule 4). Reviewers 1 to 4 start
together; reviewer 5 starts when the first of them reports. Each reviewer
gets the whole site but samples where its brief says so, and lists in its
report exactly what it covered.

## 1. Technical accuracy
- Every `data-fact` span on every page against its fact's claim (the claim,
  not the source: the fact pass checked the sources). A span that says more
  than its claim is a major.
- Product and API claims that carry no fact span: search the prose for API
  names, model names, prices, limits, status codes and SDK names. Each one
  found without a span is a major.
- Rein's behavior against its claims: for H1 to H13, run every checkpoint
  and every break command a page shows (`tools/check_steps.py` runs them;
  also run three by hand from the repository root as the page prints them)
  and compare with what the page says will happen.
- Numbers: every typed number on 15 pages you pick across parts against the
  component, tape or command that produces it.
- Denied hosts stay denied (D-052 and FACTS §4): an unverifiable fact is
  reported as coverage, never routed around.

## 2. Sequencing and pedagogy
- Prerequisite order and term first use along `course.json`'s `path`: a term
  used before its owner module, a Break that needs an unlisted prerequisite.
- Objectives against assessments: every objective of every module has a
  component that credits it on success (COMPONENTS §5); a prediction never
  credits (check_content B4). An objective credited only by a card review is
  a minor.
- Five-beat quality on 12 modules you pick (two per part A to F, one primer,
  one build step): each beat does its job (AUTHORING §3).
- Misconceptions: each module's `course.json` misconceptions are addressed
  on its page (quote where).
- Interleaving in drills: the on-call shift, the board and the question bank
  mix modules and wires (show a week of shifts from the seeded order).

## 3. Interaction QA
Every component on every page, through `tools/qa/run.mjs` and your own
probes with real input (never `__test` hooks):
- seeded determinism: the same seed gives the same run, twice, in two fresh
  pages;
- edge inputs: an empty answer, a very long answer, a kata with a syntax
  error, a bench at its limits, a reload in the middle of each component;
- reduced motion (pref and system): no travel, no tweening;
- keyboard only: every component's main path;
- the no-JS fallback: every page with JavaScript off reads as a page;
- console errors: none on any page, at load or after the main path.

## 4. Accessibility and mobile
- axe (serious and critical) on every page at 375 and 1280, both themes,
  before and after interaction (QA does this; confirm and read its report);
- 375 px layouts: no horizontal page scroll, no clipped controls, targets
  ≥ 44 px (DESIGN §9; links and term markers in running text are exempt);
- text sizes: nothing under 14 px;
- the wire palette under the three color-blind simulations (QA's CVD
  screenshots): every wire told apart by more than color;
- focus order: keyboard pass on 10 pages you pick, with the focus path
  written down; focus never lost to BODY after an activation (walkthrough
  M2).

## 5. Code and tests
- The Rein package (`rein/`): types (mypy strict), errors (a bad tape, a
  bad board, a missing key), tests that test behavior (pick ten tests: would
  a wrong implementation pass?).
- Parity coverage: which ENGINE features have goldens in both runtimes and
  the Rust reference, and which have none (`tools/parity.py --assign`).
- Kata test strength: for ten katas, write one plausible wrong solution
  each (not one of the kata's own wrong candidates) and report whether the
  tests catch it.
- The checkers: run each `tools/check_*.py` against one broken input you
  make in your scratch copy; a checker that passes a broken input is a major.

## Report
`docs/gate/phase6-audit-<n>-<area>.md`, written to the path you are given:
findings ranked by severity (each with its evidence and `file:line`), then
coverage (what you checked and found clean), then limits (what you could
not check, and why).
