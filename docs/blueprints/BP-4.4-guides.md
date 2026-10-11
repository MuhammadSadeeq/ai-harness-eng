# BLUEPRINT BP-4.4-guides: H0, I4 (now), then H12 and H13 (after H11)

Phase 4. Builder rules: `.claude/agents/hx-builder.md`. You never commit.
Guide kind: See, Do, Keep (cards and say-it prompts); career kind (I4): See,
Do, Keep with a drill. Prose 500–850 words a page.

## Read first
SPEC Part H and §7.4; DECISIONS D-038, D-046, D-056; `docs/AUTHORING.md`
(§13); `course.json` H0, H12, H13, I4 (objectives, terms, misconceptions);
the H1/H2 pages and the committed H3–H5; `rein/README.md` and
`python -m rein --help` (BP-4.2); `capstone/README.md` and
`tools/parity.py --help` (BP-4.3).

## H0 · Rein setup (JS builder)
- H0.o1 in the browser: what runs where, the stand-in for commands (D-056),
  the first `hx-step` run (H1's checkpoint, embedded with `step="H1"` or a
  link to it; your choice, say why).
- H0.o2 local: Python 3.11+, a virtual environment, the step files from the
  course, a run with `--fake <tape>`. Plain blocks for commands that run on
  the learner's machine, marked so.
- H0.o3 why a scripted model first: repeatable, free, offline.
- H0.o4 (optional): a real model with the learner's own key, from the
  environment only, never in the browser, never in git. Product and API
  claims are facts (`api.*`, `models.*`); the site never asks for a key.

## I4 · Capstone: Rein in Rust (JS builder)
What the capstone proves, how to run `tools/parity.py`, the seven
milestones (counts from `--assign`), the kit, the canonical-JSON trap, and
how to tell it in the Interview Room. Time as the course's estimate. The
director's reference stays out of the page (D-046): the page links the
kit and the judge only.

## H12 and H13 (bench builder, after H11 lands)
- H12: checkpoints as a test suite, the package (`python -m rein`), a real
  eval on a small capped budget with the learner's own key (`--live`,
  `--max-cost-usd`), the first experiment against a baseline, the showcase
  README; the results table is `rein results --markdown`'s. Scripted
  numbers on the page are labelled scripted (D-038).
- H13: extensions ranked by learning and hiring value; scope with a
  measurable criterion first; report a null result honestly.

## Acceptance
`check_content` (whole site), `check_facts`, `check_steps --pyodide` (if
a page embeds a step), and QA on your pages; view each at 375 and 1280.
Report; don't commit.
