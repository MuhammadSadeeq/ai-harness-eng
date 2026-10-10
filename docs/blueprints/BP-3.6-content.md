# BLUEPRINT BP-3.6-content: wave 3.6 modules F1–F7 (T10 is built)

Phase 3, wave 3.6 content. Builder rules: `.claude/agents/hx-builder.md`. You
never commit. The rules and lessons of BP-3.1 to BP-3.5 content all apply
(the pages and their content are the deliverable; incidents as figures; a
predict before each Break; every objective assessed; facts as spans that say
no more than their claim; prose 500–850).

## Read first (everyone)
`docs/AUTHORING.md` v1 (§13), the B2 page, an accepted core page of wave 3.4
(`verification.html`, `observability.html`), `course.json` (your modules),
`docs/ENGINE.md` A14–A17 (sub-agents, sessions, crash and resume, ledgers,
idempotency, model profiles) and A11 (evals, for F7.o3), `docs/COMPONENTS.md`,
DECISIONS D-049 to D-055, and the demo pages of your labs. The engine
fixtures `eng-subagents`, `eng-sessions`, `eng-crash`, `eng-idempotency` and
`eng-models` show each feature; your tapes are new, written for the module.

## Who writes what (in this order)
| Builder | Modules | Incident tapes | Labs and katas |
|---|---|---|---|
| Rein builder (now) | F3 (concept), F5 (core), F7 (core) | F3 `f3-lost-session` (a crash mid-run: the plain board starts over and repeats a side effect; `durable_session` resumes from the log); F5 `f5-double-charge` (a lost reply and a retry charge twice; `idempotency` charges once; a ledger check of 1 line); F7 `f7-migration-break` (the new model profile rejects a parameter the old harness sends; `capability_check` drops it; a regression eval `f7-regression` on the old and the new model, A11) | `hx-replay`, `hx-check`, `hx-bench` (F3); `hx-outage`, `hx-bench` (F5); `hx-bench`, `hx-wire`, `hx-evalbench` on `f7-regression` (F7); katas `F5-idempotent` (a retry wrapper that sends one key per logical action), `F7-adapter` (one adapter with capability checks) |
| Bench builder (after D1–D3) | F4 (core) | `f4-cheap-model-trap` (a cheaper model profile fails more often, so the cost per completed task rises; A14.5 profiles) | `hx-costcalc`, `hx-bench`; kata `F4-cost-per-task` (cost per completed task from trial results) |
| JS builder (after BP-3.6-labs) | F1 (core), F2 (core), F6 (core) | F1 `f1-sprawl` (the parent spawns sub-agents again and again; `subagents.max` caps it); F2 `f2-shift-amnesia` (sessions without and with `progress_file`); F6 `f6-reward-hack` (a grader that trusts the workspace tests rewards a tampered suite; pristine tests close it) | `hx-topology` (F1), `hx-shift` (F2), `hx-envbuilder` (F6); katas `F1-brief` (a sub-agent brief whose result can be checked), `F2-handoff` (write a progress note from a run's state), `F6-grader` (a grader that cannot be gamed by the listed hacks) |

## Notes
- **F3** (concept: Break, See, Lab, Check, Keep): brain, hands and session
  (an append-only event log); credentials stay with the brain. Managed-agent
  products need facts (Anthropic's managed agents docs; list them).
- **F4**: caching, batching, effort and model routing, each predicted before
  it is measured (F4.o2); budgets and graceful degradation (F4.o3); latency
  from a trace (F4.o4). Batch API and prices need facts (`api.yaml`,
  `models.yaml`).
- **F5**: token bucket and retry-after (F5.o1) can reuse the outage lab;
  durable execution (F5.o2) is the crash fixture's lesson; rollout (F5.o4) as
  a check with reasons.
- **F7**: a migration guide's breaking changes (F7.o1) need facts from the
  vendor's own migration pages; decide with intervals (F7.o3), on the
  evalbench.
- **F1, F2, F6**: wait for their labs (BP-3.6-labs); the JS builder writes
  them after the labs are accepted.

## Acceptance and report
As BP-3.4-content (per module: files, checks and final lines, words per beat,
facts used and needed, tapes and evals with run_end or summary lines,
deviations, doubts). Don't commit.
