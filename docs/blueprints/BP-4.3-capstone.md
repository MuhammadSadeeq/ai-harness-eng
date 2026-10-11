# BLUEPRINT BP-4.3-capstone: I4 "Rein in Rust": the parity runner, the kit, a reference

Phase 4. Builder rules: `.claude/agents/hx-builder.md`. You never commit.
Decision: D-046 (the owner's capstone: `docs/ENGINE.md` in Rust as a third
runtime, proven by the same golden traces).

## Read first
D-046; `docs/ENGINE.md` in full (§1–§11 and amendments A1–A18: the spec
you implement); `tools/check_scenarios.py` (how parity is judged today) and
`tools/sim_cli.mjs`, `rein/src/rein/sim.py` (the command line every runtime
shares: `run --tape T --board B --seed N [--wire | --choices] [--facts F]`,
`eval --eval E --board B [--scenarios D] [--facts F]`); `scenarios/golden/`
(JSONL traces, `.wire.sha256` digests, choices files if any). Read the JS
and Python runtimes only for the command line and file layout: the Rust
reference is written from ENGINE.md, like the other two were.

## You own
`tools/parity.py` and `tools/tests/test_parity.py` (new), `capstone/`
(new, at the repository root, never under `site/`): `capstone/README.md`
(the learner's guide and milestone checklist), `capstone/milestones.json`,
`capstone/rust-skeleton/` (the kit), `capstone/reference/` (the director's
reference; private until launch, D-046).

## 1. `tools/parity.py`: the learner's judge
- `python tools/parity.py --cmd "<command> run" [--milestone M3] [--only TAPE]
  [--jobs N]`: for every golden run (tape, board, seed) in the chosen
  milestones, runs the command with `--tape --board --seed` (and again with
  `--wire` and `--choices` where a golden exists for them), compares stdout
  with the golden byte for byte (wire: the sha256 of the output), and prints
  one line per failing run with the first differing line, both sides, and
  the event's `seq` and `kind`. Last line: `parity: <k> of <n> runs match
  (M1–M3)`; exit 0 only when all match. Evals likewise through `eval`.
- No dependency beyond the standard library; it never edits goldens; a
  command that crashes or times out (10 s per run) is a failing run with its
  stderr's last line.
- Tests: `python -m rein.sim run` (with `PYTHONPATH=rein/src` in the
  environment; the command runs without a shell) and `node tools/sim_cli.mjs run` both
  match 100%; a command that drops one field, reorders keys, or prints a
  float differently is caught with the right line; a missing binary is a
  clear error.

## 2. Milestones: `capstone/milestones.json`
Seven milestones, in the order a learner builds:
M1 the core run (§1–§11: tape, scripted model, board, events, cost);
M2 A1–A3 (overflow, the simulated human, rulings); M3 A4–A5 (incidents,
harness bugs); M4 A6–A8 (compaction, caching, input checks, split results,
effort); M5 A9–A10 (tool design, tools on demand, tamperable tests);
M6 A11–A13 (evals, injection, provenance); M7 A14–A18 (sub-agents, sessions,
crash and resume, ledgers, model profiles, branch pointers). Each golden run
belongs to the lowest milestone that has every feature its tape and board
use; write the rule as code (`tools/parity.py --assign` prints the
assignment, and a test fails if a golden has no milestone), not by hand.

## 3. The kit: `capstone/rust-skeleton/`
A Cargo project the learner copies out: argument parsing for the shared
command line, reading the tape and board JSON (`serde_json`), printing one
`run_start` event in the canonical JSON (§2), and a README section on the
one thing most likely to bite: canonical JSON and number formatting. It
builds with `cargo build` and fails parity on its first run with a readable
message. `capstone/README.md`: what the capstone proves, how to run
parity, the milestone checklist (what each milestone adds, which ENGINE
sections to read, how many runs it unlocks), how to tell the story in the
Interview Room (I5), and time expectations stated as the course's estimate.

## 4. The reference: `capstone/reference/`
Your own implementation of ENGINE.md in Rust (stable toolchain, `cargo
1.97`; crates from crates.io are fine; no `unsafe`). It must pass
`tools/parity.py --cmd "capstone/reference/target/release/rein-rs run"` at
100% on every milestone, evals included. Build it milestone by milestone and
report the count after each, so a stall is visible early. Where ENGINE.md is
ambiguous and the two runtimes agree, the goldens are the ruling: write the
ambiguity in your report (it becomes an ENGINE amendment), never patch a
golden. `cargo clippy -- -D warnings` and `cargo test` pass.

## Acceptance (quote final lines)
```
.venv/bin/python -m pytest -q tools/tests/test_parity.py
PYTHONPATH=rein/src .venv/bin/python tools/parity.py --cmd ".venv/bin/python -m rein.sim run"
.venv/bin/python tools/parity.py --cmd "node tools/sim_cli.mjs run"
(cd capstone/reference && cargo build --release && cargo clippy -- -D warnings && cargo test)
.venv/bin/python tools/parity.py --cmd "capstone/reference/target/release/rein-rs run"
(cd capstone/rust-skeleton && cargo build)
```

## Report
Files; checks and final lines; the parity count after each milestone; ENGINE
ambiguities found; open doubts. Don't commit.
