# Phase 3 gate: the content waves

**Status:** passed; signed off on 6578297 (below). Every walkthrough
finding is fixed or ruled (e601ea8 closes the last two majors).
SPEC §10 sets the Phase 3 exit gate: **each wave is checker-green and
reviewed, its facts are verified, and its screenshots are approved.** Each
condition is below, with its evidence. Phase 4 (the build track) started
during Phase 3, as the path allows; it is recorded in its own gate.

## 1. The waves

53 modules, from the B2 bar (`docs/PHASE2-GATE.md`). With B2, H1 and H2
(Phase 2) and H3–H5 (Phase 4), 59 of the 70 modules in `course.json` have a
page. The 11 without one are Phase 4 and 5 work: H0, H6–H13, I4, I5.

| Wave | Modules | Blueprint | Commit |
|---|---|---|---|
| 3.1 | S0, A1–A3; primers T1–T3 | BP-3.1-content | 2113d39 |
| 3.2 | A4–A7, B1, B3, B4; primers T4–T6 | BP-3.2-content | c9120ab |
| 3.3 | C1–C6; primer T7 | BP-3.3-content | c9120ab |
| 3.4 | C7–C12; primer T8 (and T9, T10) | BP-3.4-content | c9120ab |
| 3.5 | D1–D3, E1, E2 | BP-3.5-content | 15e5c65, 15ed054 |
| 3.6 | F1–F7 | BP-3.6-content | 15e5c65, 11b21a4, b8eccda |
| 3.7 | G1–G4, I1–I3, I6 | BP-3.7-content | 9136ac5, c73ffb6, 458c064, 394c379 |

Labs and engine work landed ahead of the content that needed them: ENGINE
A6–A19 in both runtimes with parity and goldens, and the labs hx-stack,
hx-outage, hx-desk, hx-cacheline, hx-placement, hx-evalbench, hx-escape,
hx-shift, hx-envbuilder and hx-topology, each with its demo page.

## 2. Checker-green and reviewed

- Every wave was committed through the full local gate
  (`tools/ci_local.sh --committed --qa`, D-044): `check_content`,
  `check_facts`, `check_snippets`, `check_katas` (CPython and Pyodide agree),
  `check_scenarios` (goldens and parity), `check_wire`, `check_steps`, ruff,
  mypy, pytest, the node tests, and browser QA at 375, 768 and 1280 in both
  themes (axe before and after every self-test, the 14 px floor, no
  horizontal scroll, page weight ≤ 300 KB).
- The director reviewed every module before its commit: the page as text
  (prose, beats, checks and their whys), the content files, and element
  screenshots at 375 and 1280. Rounds of notes went back to the builder until
  the bar held. The fixes the reviews forced include G4's Prove measuring a
  symptom fix (ENGINE A19 and a reworked board), F4's real prices inverting
  its lesson (now Opus against Sonnet, a real 2:1 ratio), and three
  prerequisite gaps that forced vague terms (D-057 G1 requires C8, D-058 I5
  requires I3, D-059 H6 requires C3).

## 3. Facts verified

`check_facts: 272 facts OK (235 verified, 37 unverifiable, 0 contradicted)`,
130 page references. Every verified fact has a verbatim quote fetched from a
primary source on its `verified_on` date (fact passes BP-3.0 to BP-3.3 and
BP-3.8). The 37 unverifiable facts are on hosts this environment cannot
reach (D-052: docs.python.org, mypy.readthedocs.io, openreview.net,
openai.com; also rfc-editor.org, whatwg.org, docs.pytest.org,
docs.docker.com, git-scm.com, simonwillison.net). They were never routed
around. A page that uses one says no more than its claim, and the freshness
job re-tries them (Phase 7).

## 4. The walkthrough (BP-3.9)

One reviewer walked seven modules in full as Sam, one per part (A4, C3, C9,
D2, F2, G4 and the primer T6), on a phone (375, touch) and on a desk (1280,
keyboard only), and checked the course as one path. Report:
`docs/gate/phase3-walkthrough.md`.

| Module | A4 | C3 | C9 | D2 | F2 | G4 | T6 |
|---|---|---|---|---|---|---|---|
| Score / 500 | 355 | 375 | 355 | 370 | 355 | 375 | 345 |

B2 scored 400 on its re-score. On the walker's focus and target checks, which
the B2 re-score did not repeat, B2 is at 375 too: the Phase 3 modules are at
the bar, not above it. As one path: no term used before the module that
teaches it, families and laws consistent with `course.json`, the prose
numbers in five benches match the bench on screen, and nine of ten fact spans
say no more than their claims (the tenth is m1).

Findings: 0 blockers, 5 majors, 9 minors.

| Id | Finding | Outcome |
|---|---|---|
| M1 | A tap in an incident credited an objective | **Fixed** (1178fca): a prediction credits no objective. Every predict check carried `data-objective`, and it revealed on the hunt's first tap. `check_content` B4 now rejects it. Re-probed: all eight A4 events leave the progress line at 0 of 5. |
| M2 | Focus dropped to the page after "Show answer", a beat link and a Run key | **Fixed**: the beat strip focuses the beat's heading, a second press included (5c1e8e1); "Show answer" focuses the answer, and the Run key keeps focus while it runs (e601ea8). Probed with real keys on B2, A4 and T6. |
| M3 | Label in Name on events that quote the model | **Fixed** (e601ea8): an event button's name is its visible text; the lane and the summary are its description. Probed on A4, C3, C9 and F2. |
| M4 | Built pages marked "soon" in the course map | **Not a product defect.** The walk read the director's working tree, whose generated chrome was older than HEAD (commits are assembled in a clean worktree). At HEAD every built page is linked. The assemble step now regenerates the working tree's pages after each commit. |
| M5 | Term markers 19 px tall | **Ruled**: DESIGN §9 now exempts links and term markers in running text (WCAG 2.5.8's inline exception). |
| m1–m6 | A4 chip over-reach, repeated heading and prompt, dash placeholders before a run, F2's doubled label, percent style | **Fixed** (e601ea8). Rulings: "95%" with no space; a sentence with run numbers starts "After the run," and the dash reads "not run yet". B2's retry option stays: its why says no more than the fact. |
| m7 | Continue sends a learner back to S0 after A4 | **Fixed** (5c1e8e1). Ruling: Continue resumes where the learner left off, in the module of the latest evidence if unfinished, else the next unfinished one. |
| m8 | The glossary shows no per-learner mark | **No change**: no spec line asks for one (BP-5.2 specifies the filter count only). |
| m9 | Five laws repeat in theory and build pairs | Deliberate: a build module restates its theory module's law and links back to it with a margin note (AUTHORING §13.11) |

## 5. Open items carried forward

- BP-4.5-facts added seven verified facts for the later pages, spot-checked
  against their sources: the postmortem's three causes (G1.o3 now names
  them), the SDK reading `ANTHROPIC_API_KEY`, where keys are made, the Models
  API and its entries, thinking blocks in tool loops, and the SDK's
  `max_retries` option. `check_facts`: 279 facts, 242 verified.
- The loader loaded a component inside a closed `details` eagerly; it now
  waits for the details to open (5c1e8e1).
- Page weight: the heaviest pages (A4, D2) are at 299 KB of 300. QA now
  weighs a page when its requests stop (4135d39), and a font subset is in
  flight to restore headroom.
- A self-test that restores state after itself (`restoreAfterTest`) is
  silent when the restore fails; the after-interaction audit runs with
  `keep: true`, so QA still sees the learner's end state.

## Signed off

On 6578297 (2026-10-11): `tools/ci_local.sh --committed --qa` passed: every
checker, the package, and browser QA on 108 pages (972 screenshots, 0
failures; pages that timed out in the pool were re-checked alone and passed).
