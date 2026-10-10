import { test } from "node:test";
import assert from "node:assert/strict";
import { runTrial, runBench, traceLine } from "../index.js";
import { readJsonRepo, FACTS, ofKind } from "./helpers.mjs";

const TAPE = readJsonRepo("scenarios/b2-spiral.json");
const OLD = readJsonRepo("scenarios/boards/b2-old.json");
const NEW = readJsonRepo("scenarios/boards/b2-new.json");
const SEEDS = [1, 2, 3, 4, 5];
const run = (board, seed) => runTrial(TAPE, board, seed, { facts: FACTS });

test("b2-spiral on b2-old, seeds 1-5: every run is stopped by the turn-60 safety stop", () => {
  for (const seed of SEEDS) {
    const { result, events } = run(OLD, seed);
    assert.equal(result.status, "interrupted", `seed ${seed}`);
    assert.equal(result.turns, 60, `seed ${seed}`);
    assert.equal(result.passed, false, `seed ${seed}`);
    assert.equal(ofKind(events, "interrupt")[0].by, "operator");
  }
});

test("b2-spiral on b2-new, seeds 1-5: no run exceeds 12 turns; each ends max_turns", () => {
  for (const seed of SEEDS) {
    const { result } = run(NEW, seed);
    assert.equal(result.status, "max_turns", `seed ${seed}`);
    assert.ok(result.turns <= 12, `seed ${seed} ran ${result.turns} turns`);
    assert.equal(result.turns, 12, `seed ${seed}`);
  }
});

test("pass counts are equal on both boards for seeds 1-5 (no run passes)", () => {
  const passOld = SEEDS.filter((s) => run(OLD, s).result.passed).length;
  const passNew = SEEDS.filter((s) => run(NEW, s).result.passed).length;
  assert.equal(passOld, passNew);
  assert.equal(passNew, 0);
});

test("seeds 1-5 all take the 40% spiral branch: the 4th reply is the repeat's first step", () => {
  for (const seed of SEEDS) {
    const { events } = run(NEW, seed);
    assert.equal(ofKind(events, "model_reply")[3].text, "Almost done: one more fix.", `seed ${seed}`);
  }
});

test("cost regression lock: b2-old 398846000 and b2-new 26438000 nano-units for seeds 1-5", () => {
  for (const seed of SEEDS) {
    assert.equal(run(OLD, seed).result.cost, 398846000, `old seed ${seed}`);
    assert.equal(run(NEW, seed).result.cost, 26438000, `new seed ${seed}`);
  }
});

test("runBench uses seed_base + i and agrees with runTrial for each trial", () => {
  const bench = runBench(TAPE, NEW, 3, { facts: FACTS });
  assert.equal(bench.n, 3);
  assert.deepEqual(bench.trials.map((t) => t.seed), [20261010, 20261011, 20261012]);
  const single = runTrial(TAPE, NEW, 20261011, { facts: FACTS });
  const end = single.events.find((e) => e.kind === "run_end");
  assert.deepEqual(bench.trials[1], {
    seed: 20261011,
    status: single.result.status,
    passed: single.result.passed,
    turns: single.result.turns,
    tokens: single.result.tokens,
    cost: single.result.cost,
    ms: end.t,
  });
});

test("seed_base trials 0-4 exercise both branches: two pass in 6 turns, on both boards", () => {
  for (const board of [OLD, NEW]) {
    const bench = runBench(TAPE, board, 5, { facts: FACTS });
    assert.equal(bench.passed, 2);
    const passing = bench.trials.filter((t) => t.passed);
    assert.deepEqual(passing.map((t) => [t.seed, t.status, t.turns]), [[20261012, "done", 6], [20261013, "done", 6]]);
  }
});

test("determinism: the same seed gives identical event and wire lines, twice", () => {
  for (const board of [OLD, NEW]) {
    const a = run(board, 3);
    const b = run(board, 3);
    assert.deepEqual(a.events.map(traceLine), b.events.map(traceLine));
    assert.deepEqual(a.wire.map(traceLine), b.wire.map(traceLine));
  }
});

test("wire: two payloads (request, response) per turn that got a reply", () => {
  assert.equal(run(NEW, 1).wire.length, 24);
  assert.equal(run(OLD, 1).wire.length, 120);
  const first = run(NEW, 1).wire[0];
  assert.deepEqual(Object.keys(first), ["model", "max_tokens", "system", "tools", "messages"]);
  assert.equal(first.tools.length, 3, "read_file, edit_file, run_command");
  const resp = run(NEW, 1).wire[1];
  assert.equal(resp.id, "msg_1");
  assert.equal(resp.stop_reason, "tool_use");
});
