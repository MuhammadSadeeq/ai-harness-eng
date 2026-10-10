# BLUEPRINT BP-3.3-content: wave 3.3 modules C1–C6, T7

Phase 3, wave 3.3 content. Builder rules: `.claude/agents/hx-builder.md`. You
never commit. BP-3.1-content's "Rules for this wave" and BP-3.2-content's
"Lessons from wave 3.1" all apply (read both); so does everything below.

## Read first (everyone)
`docs/AUTHORING.md` v1 (all; §13 is the checklist), the B2 page (the bar)
and one accepted page of wave 3.1 or 3.2 of your kind, the walkthrough
reports in `docs/gate/`, `course.json` (your modules: kind, objectives,
terms, family, law, prerequisites, interactions), `docs/ENGINE.md` (A1, A5,
A6, A8 and §7.3–§7.6 for the features your tapes use), `docs/COMPONENTS.md`,
and DECISIONS D-049 to D-054. The labs of this wave are accepted and
registered: read each one's demo page and its data contract before you
write its module data.

## Who writes what
| Builder | Modules | Incident tapes | Labs and katas |
|---|---|---|---|
| Bench builder | C1 (core), C2 (core), C3 (core) | new `c1-ignored-rule` (a rules-file line says never touch `tests/`; on `c1-old` it lives only in the prompt and the model edits a test anyway; `c1-new` adds a permissions rule that denies writes under `tests/**` with a reason: the rule holds in code, fails closed); C2 reuses `c2-flood`; new `c3-amnesia` (compaction with `keep: []` drops a constraint and the model breaks it after the compaction; `c3-new` keeps goal, constraint, decision, progress and file: ENGINE A6) | `hx-stack` (C1), `hx-desk` (C2, C3); katas `C1-hook` (a pre-tool hook that fails closed), `C2-cap` (cap an output keeping its start and end, §7.4), `C3-compact` (keep the kinds that matter, drop raw output) |
| JS builder | C4 (core), C5 (core), C6 (core) | new `c4-cold-cache` (a clock in the system prompt changes every call, so every call writes the cache; `c4-new` moves the stamp into the new turn: ENGINE A6.5); C5 reuses `c5-interrupt`; C6 reuses `c6-outage` and gets its incident block (family `retry-storm`, the first bad event a harness engineer would point to) | `hx-cacheline` and `hx-wire` (C4: find the invalidator in a Wire View diff), `hx-outage` (C6); katas `C4-hit-rate` (from usage fields), `C5-state` (one state object, one exit per end, close the books on interrupt), `C6-backoff` (exponential backoff, full jitter, a cap, a breaker) |
| Rein builder | T7 (primer) | none | kata `T7-docker-args` (build a `docker run` argument list with no network, a read-only root and one mount, tested against a fake; the real command shown in a `pre[data-run="machine"]` block marked `Runs on your machine, not in the browser.`) |

Order of work: the JS builder and the Rein builder do BP-3.5-engine (A11)
**first**, then this wave. The bench builder starts as soon as its wave 3.2
round is accepted.

## Notes per module
- **C1**: `hx-stack` shows which layer wins; the Fix is the hook kata (the
  rule moves from the prompt into code). C1.o4 (a rules file as a map) needs
  a check of its own with a short example file; AGENTS.md and CLAUDE.md are
  real conventions, so any claim about how a product reads them needs a fact
  (list it; don't write it).
- **C2**: the four levers in order (don't load it, shrink it, move it out,
  summarize it), each tied to a desk action. Context rot needs a fact or a
  clearly labelled illustration; the tape's `context_gte` slip is the
  course's model.
- **C3**: compaction against a clean reset with a handoff note (C3.o3) is a
  judgment: a check with reasons, not a recall item. The memory tiers
  (C3.o4) as a sort.
- **C4**: every price or cache rule (TTL, minimum length, write and read
  multipliers) is a fact from `facts/api.yaml` or `models.yaml`; the
  cacheline's illustration is labelled as the course's model (A6.5).
- **C5**: the interrupt incident already exists; build the See around the
  state object and the exits table (each end status and its exit).
- **C6**: the breaker and the retry budget are the brakes; idempotency keys
  (C6.o5) are taught here and built in F5 later: one check, no kata.
- **T7**: what a container isolates and what it shares (the kernel), named
  in one table; claims about Docker flags (`--network none`, `--read-only`,
  `--mount`/`-v`) need facts from Docker's own docs (list them).

## Facts
List every product claim you need with its likely primary source in your
report; the fact-checker runs after the wave. Check `facts/api.yaml` and
`models.yaml` first (caching, errors and retries largely exist).

## Acceptance (quote final lines)
As BP-3.1-content, for your pages, katas and tapes. Report each new tape's
JS and Python `run_end` lines per board and seed (I write goldens after
parity).

## Report
Per module: files; checks and final lines; word counts per beat; facts used
and needed; tapes with run_end lines; deviations; open doubts. Don't commit.
