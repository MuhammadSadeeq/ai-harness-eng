# Phase 5 gate: the career track

**Status:** every item passes on the evidence below. The gate is signed off
on the first commit at or after f9db7eb that `tools/ci_local.sh --committed
--qa` passes; the commit is recorded here when it does.

SPEC §10 sets the Phase 5 exit gate: **the career-track gate list (Appendix
D) passes.** Evidence: `docs/gate/phase5-evidence.md`, run on a clean HEAD
worktree with real clicks at 375 where a learner acts.

| Appendix D item | Result |
|---|---|
| 40+ say prompts with rubrics, covering every wire plus design, debugging and behavioral | **Pass.** 134 in the bank: all eight wires; design 6, debugging 6, behavioral 4; rubrics 4–6 lines; a test counts them. |
| 6+ Design Room prompts with clarifying questions, a wire-by-wire model answer, cheating risks, cost and rollout | **Pass.** Six (I5-d1 to I5-d6), every field present. |
| 10+ timed from-memory katas: the ten named patterns | **Pass.** Ten mapped (B2-loop, A5-validate, C6-backoff, C9-policy, C3-compact, I5-trace-writer, C11-gate, D1-eval, I5-pass-k, F5-idempotent); a memory blank shows only the names the tests import, and `check_katas` makes every blank fail. |
| 4 portfolio project templates, each with a README skeleton, a results table and a write-up outline | **Pass** after a fix (f9db7eb): the README skeleton was missing. |
| The readiness radar reads real evidence, and the brag sheet prints cleanly | **Pass** after a fix (f9db7eb): words broke mid-word at 375. With a seed built from every built module's real ids, the radar reaches L3 on every wire by its stated rules; the print is two clean A4 pages. |

Also in the Phase 5 row of SPEC §10, and checked: the placement check (S0,
15 questions, end to end at 375), and the daily on-call shift (an incident
hunted, cards reviewed, a memory drill passed, the shift recorded as
evidence). The Interview Room (I5) holds the five stations; the shift and
the stations load only on their own pages (ebce3d9).

Carried to BACKLOG: B-21 (rebuild module status on import of a hand-made
file), B-22 (a mypy run for T1.o3; a check on mypy's output covers it now,
e94e4b7).
