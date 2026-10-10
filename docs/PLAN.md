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
| 3.1 | S0, A1, A2, A3, A7, T1–T3 | `hx-sampler`, `hx-tokenizer`, `hx-forgetful`, `hx-dice`, `hx-placement` | harness-bug modules: history not resent (A3); scripted confident errors (A1, tape only) |
| 3.2 | A4, A5, A6, B1, B3, B4, T4–T6 | `hx-workbench`, `hx-costcalc`, `hx-sort` | reply parser bug `first_block_only` (A4, H1); tool-input schema checks (A5); results split across messages (B1); model effort levels (A6) |
| 3.3 | C1, C2, C3, C4, C5, C6, T7 | `hx-stack`, `hx-desk`, `hx-cacheline`, `hx-outage` | compaction (C3); prompt-cache prefix and pricing (C4); many clients / shared outage (C6) |
| 3.4 | C7, C8, C9, C10, C11, C12, T8 | `hx-scheduler`, `hx-gatekeeper`, `hx-bugcatch` | tool-quality knob (C7); tool-definition loading on demand (C8); cost attribution events (C12) |
| 3.5 | D1, D2, D3, E1, E2, T9 | `hx-evalbench`, `hx-escape` | an eval set of tapes (D1–D3); conditions on tool output for injection (E1); tool provenance (E2) |
| 3.6 | F1–F7, T10 | `hx-topology`, `hx-shift`, `hx-envbuilder` | sub-agents (F1, H11); sessions and resume from a trace (F2, F3); idempotency keys on tool side effects (F5); model swap (F7) |
| 3.7 | G1–G4, I1–I3, I6 | `hx-design` (Design Room) | none expected (G3 tours a real repository) |

Each wave: builders write the modules (2–3 each), a fact-checker verifies every
fact they request, the director reviews.

## Phase 4: the build track
Rein steps H3–H13 in the browser (`hx-step`, `check_steps`), the local `rein`
package (tests, eval runner against the mock API, D-038), and the **I4 Rust
capstone** tooling (parity runner, Rust skeleton, the director's reference;
D-046). Steps that need a subprocess run locally only (`runs_in_browser: false`).

## Phase 5: career track
Interview Room (I5), Design Room prompts with rubrics, the question bank,
portfolio templates (I3), the readiness radar and brag sheet (I2), the
placement check (S0), the daily on-call shift from the incident tapes.

## Phase 6: audit
Five independent reviewers (SPEC Appendix B), fixes, a second round.

## Phase 7: launch
README, Pages deploy (hosting decided then: D-038), the 10-minute first
session, the facts freshness job, optionally the launch film.
