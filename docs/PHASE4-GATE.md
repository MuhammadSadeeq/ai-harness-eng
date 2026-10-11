# Phase 4 gate: the build track

**Status:** every item passes on the evidence below. The gate is signed off
on the first commit at or after 9601074 that `tools/ci_local.sh --committed
--qa` passes; the commit is recorded here when it does.

SPEC §10 sets the Phase 4 exit gate: **`check_steps` and parity are green.
The local package passes ruff, mypy and pytest. The eval runner works
offline and with a real model.** D-038 (the owner, at the Phase 0 gate)
rewrote the last item: the eval runner works offline and against the mock
API, and the real-model path is exercised by the learner with their own key.
No real-model spend.

## 1. What was built

| Part | Contents | Commits |
|---|---|---|
| Steps platform (BP-4.0) | Every Rein step runs in the browser: hxshell stands in for commands (D-056), steps take `stdin` and `local`, the Replay Deck opens a learner's trace | 04ec276 |
| Rein steps H3–H11 (BP-4.1) | Real tools inside a wall, the permission gate, a trace, a context budget, retries and a breaker, guards (with the time guard, D-060), the verification gate, project rules, a reviewer sub-agent | aff3f8f, dafb2d5, 009a5d3 |
| The package (BP-4.2) | `python -m rein run`, `eval`, `results`; a live adapter tested against a mock of the Messages API | 712eb06 |
| The capstone kit (BP-4.3) | `tools/parity.py`, seven milestones, a Rust skeleton, the director's private Rust reference (D-046), ENGINE A20 | 9119d11 |
| Guides (BP-4.4) | H0 Rein setup, I4 Rein in Rust, H12 from one file to a project, H13 extensions ranked (with a shipped, tested example) | e601ea8, 9601074, 423b32e |

## 2. The gate items

Evidence: `docs/gate/phase4-evidence.md` (each command, run from the
repository root, with its exit code and final line).

- `check_steps`: 11 steps, 36 breaks, CPython and Pyodide agree.
- Parity: `check_scenarios`, 68 tapes, 423 runs, 7 evals, 17 eval runs,
  parity OK across the JS simulator and the Python runtime; `check_wire`,
  4,237 payloads.
- The package: ruff clean, mypy (strict) clean on 23 files, pytest 725
  passed offline, from the repository root and from `rein/`.
- The eval runner: offline on the D1 suite, its results table scripted and
  repeating exactly; the live path, 31 tests against the mock API, and the
  README's procedure for a learner's own capped run.
- Page QA for H0–H13 and I4: covered by the full gate on the signed-off
  commit.

## 3. Rulings made in the phase

- D-056: every step runs in the browser; D-060: Rein's time guard and its
  status `max_time` (ENGINE A21).
- ENGINE A18 to A21; the h11-rubber-stamp tape gives a reviewer's FAIL as a
  verdict, read through `last_result_contains`, not as a turn limit.
- Rein honors retry-after (as C6 teaches and ENGINE §7 does); its loop guard
  warns once before it ends a run.
- Every command the course shows runs from the repository root.
- A worked example on a page ships with its code and a test that proves its
  numbers (H13).
