# HARNESSED: the plan from Phase 2 to launch

Director-owned. SPEC §10 sets the phases and gates; this page is how the work is
cut into waves so that every module's components, engine features and facts
exist **before** its content is written. Updated at every gate.

## Principles
- **Platform before content.** A content wave starts only when its labs, the
  engine features its incidents need (in both runtimes, with parity), and its
  facts are in place. A builder never fakes a missing feature in prose.
- **Prerequisite order.** Waves follow the default path, so a module's terms and
  facts are already taught when it is written.
- **Two runtimes, two builders.** Every engine feature is an ENGINE.md
  amendment implemented separately in JS and Python; parity and new golden
  traces prove it (D-040).
- **At most four agents at once**, reused between waves.
- **Every wave ends** with checkers green, a fact-checker pass, a director
  review (screenshots at 375 and 1280, facts spot-checked), and a learner
  walkthrough of a sample of its pages.

## Phase 2: the exemplar (now)
B2 to final quality (the bar), plus H1 and H2 (the build bar). Platform:
module pages, `hx-say`, `hx-step` + `check_steps`. Gate: the director signs B2
off; AUTHORING.md is final.

## Phase 3: content waves (Parts S, A, B, C, D, E, F, G, I and the Toolbelt)
| Wave | Modules | Labs to build first | Engine features first (ENGINE amendment) |
|---|---|---|---|
| 3.1 | S0, A1, A2, A3, T1–T3 | `hx-sampler`, `hx-tokenizer`, `hx-forgetful`, `hx-placement` | harness-bug modules: history not resent (A3); scripted confident errors (A1, tape only) |
| 3.2 | A4, A5, A6, A7, B1, B3, B4, T4–T6 | `hx-workbench`, `hx-costcalc`, `hx-sort`, `hx-dice` | reply parser bug `first_block_only` (A4, H1); tool-input schema checks (A5); results split across messages (B1); model effort levels (A6) |
| 3.3 | C1, C2, C3, C4, C5, C6, T7 | `hx-stack`, `hx-desk`, `hx-cacheline`, `hx-outage` | compaction (C3); prompt-cache prefix and pricing (C4); many clients / shared outage (C6) |
| 3.4 | C7, C8, C9, C10, C11, C12, T8 | `hx-scheduler`, `hx-gatekeeper`, `hx-bugcatch` | tool-quality knob (C7); tool-definition loading on demand (C8); cost attribution events (C12) |
| 3.5 | D1, D2, D3, E1, E2, T9 | `hx-evalbench`, `hx-escape` | ENGINE A11: evals over tapes with code and model graders (D1–D3); `last_result_contains`, canaries and `leak` (E1); tool servers, `tool_pins` and `tool_rejected` (E2) |
| 3.6 | F1–F7, T10 | `hx-topology`, `hx-shift`, `hx-envbuilder` | ENGINE A14: sub-agents (F1, H11); sessions and a progress file (F2); crash and resume from the log (F3, F5); ledgers, tool retries and idempotency keys (F5); model profiles, request params and a capability check (F4, F7) |
| 3.7 | G1–G4, I1–I3, I6 | none new (`hx-design`, the Design Room, is built early for I5: BP-5.1) | none expected (G3 tours a real repository) |

Each wave: builders write the modules (2–3 each), a fact-checker verifies every
fact they request, the director reviews. A7 moved from 3.1 to 3.2 because it
requires A4 (prerequisite order). ENGINE amendments A6 (wave 3.3) and A7
(wave 3.2) are specified ahead of their waves so both runtimes can build them
early. (Amendment numbers are not module ids.)

## Phase 4: the build track
Rein steps H3–H13 in the browser (`hx-step`, `check_steps`), the local `rein`
package (tests, eval runner against the mock API, D-038), and the **I4 Rust
capstone** tooling (parity runner, Rust skeleton, the director's reference;
D-046). Every step runs in the browser (D-056: a stand-in for `python <file>.py`
commands); a checkpoint or break the stand-in cannot reproduce is marked `local: true`.

| Blueprint | Work | Builder | Needs first |
|---|---|---|---|
| BP-4.0-steps-platform | `hxshell` stand-in, `stdin` and `local` steps, `hx-replay accept-trace` | JS | none |
| BP-4.1-steps | steps H3–H11 with their pages (output caps, the course's trace, a virtual clock, one status per ending) | Rein | BP-4.0 |
| BP-4.2-package | `rein` command line, a live model behind the harness (mock API only, D-038), eval runner and results | bench | none |
| BP-4.3-capstone | `tools/parity.py`, milestones, the Rust kit, the director's Rust reference | JS | BP-4.0 |
| (later) | H0, H12, H13 guides; I4's page | Rein, bench | BP-4.1, BP-4.2, BP-4.3 |

## Phase 5: career track
Interview Room (I5), Design Room prompts with rubrics, the question bank,
portfolio templates (I3), the readiness radar and brag sheet (I2), the
placement check (S0), the daily on-call shift from the incident tapes.

## Phase 6: audit
Five independent reviewers (SPEC Appendix B), fixes, a second round.

## Phase 7: launch
README, Pages deploy (hosting decided then: D-038), the 10-minute first
session, the facts freshness job, optionally the launch film.
