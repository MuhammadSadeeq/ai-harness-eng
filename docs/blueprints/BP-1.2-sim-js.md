# BLUEPRINT BP-1.2: the JS simulator

Phase 1, wave 1. Builder rules: `.claude/agents/hx-builder.md`. You never commit.

## Read first
`docs/ENGINE.md` (all of it, twice; it is the spec and it is exact),
`docs/DECISIONS.md` D-029, D-033, D-039, the shared fixtures in
`scenarios/fixtures/` (`prng.json`, `pyjson.json`, `tooldefs.json`), the dev
tape `scenarios/dev/b2-spiral.json` and boards `scenarios/dev/boards/*.json`,
and `site/data/facts.json` (pricing facts).

## You own
`site/assets/sim/**` (ES modules, no dependencies, no DOM: must run in the
browser and in Node 22) and `tools/sim_cli.mjs`. Nothing else. Builder C is
writing the Python twin (`rein/src/rein/`) at the same time from the same spec;
never read or run their files, and never copy their code: parity only means
something if the two are written independently.

## Build
Modules (names fixed so the Python twin mirrors them): `pyjson.js` (§2),
`prng.js` (§3), `tokens.js` (§4), `tape.js` (load a tape object, apply
defaults, reject non-integers and non-ASCII with clear errors), `model.js`
(the scripted model, §6.1–6.3), `vfs.js` (workspace + outside + links),
`tools.js` (§6.4 built-ins and custom tools), `tooldefs.json` (a
**byte-identical copy** of `scenarios/fixtures/tooldefs.json`), `policy.js`
(globs and decision order, §7.5), `board.js` (load a board, defaults),
`harness.js` (§7.1 exactly, including §7.2–§7.7 and the turn-60 safety stop),
`trace.js` (event construction, redaction, canonical line serialization §10),
`wire.js` (per-turn request/response payloads, §10), `pricing.js` (resolve
`{"fact": id}` from a facts object shaped like `site/data/facts.json`;
`round(p * 1000)` milli), and `index.js` exporting:
`runTrial(tape, board, seed, {facts}) -> {events, wire, result}` and
`runBench(tape, board, n, {facts}) -> {trials: [{seed, status, passed, turns, tokens, cost}], passed, n}`
(trial i uses seed `tape.seed_base + i`).

`tools/sim_cli.mjs run --tape T --board B --seed N [--wire] [--facts site/data/facts.json]`
prints JSONL to stdout (events, or wire payloads with `--wire`), one canonical
line each (sorted keys, no spaces), exit 0; errors to stderr, exit 2.

## Tests (`site/assets/sim/test/*.test.mjs`, run with `node --test site/assets/sim/test/`)
pyjson against every fixture case; prng against all 3,000 fixture outputs;
tokens on fixed strings; each script step type (say, error, branch, when,
repeat, run-out); faults and outage; every built-in tool incl. errors; output
cap; globs and decision order; sandbox (traversal, links, egress); interrupt
with and without close_books and resume; verify_gate pass/fail/unverified;
breaker; backoff with and without jitter and retry_after; the b2-spiral tape on
both boards for seeds 1–5 (assert statuses: on b2-new no run exceeds 12 turns;
pass counts equal on both boards for the same seeds); determinism (same seed →
identical output twice); `tooldefs.json` byte-identical to the fixture.

## Acceptance (quote final lines)
```
node --test site/assets/sim/test/
node tools/sim_cli.mjs run --tape scenarios/dev/b2-spiral.json --board scenarios/dev/boards/b2-new.json --seed 1 | tail -1
node tools/sim_cli.mjs run --tape scenarios/dev/b2-spiral.json --board scenarios/dev/boards/b2-old.json --seed 1 --wire | head -1 | cut -c1-200
```
Also report: for seeds 1–5 on both boards, each run's `status`, `passed`,
`turns` and `cost` (a small table). Any place where ENGINE.md was ambiguous:
list it under open doubts with the choice you made and why.

## Report
Files; checks + final lines; the seed table; deviations; open doubts.
