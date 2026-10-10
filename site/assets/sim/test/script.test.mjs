import { test } from "node:test";
import assert from "node:assert/strict";
import { ScriptedModel } from "../model.js";
import { createPrng } from "../prng.js";
import { tapeWith } from "./helpers.mjs";

const SNAP = { turn: 1, last_result_error: false, last_denied: false, verify_feedback: false, last_truncated: false };

function model(script, extra = {}, seed = 1) {
  const prng = createPrng(seed);
  return { m: new ScriptedModel(tapeWith({ script, ...extra }), prng), prng };
}

test("say with tools: ids are toolu_<turn>_<k>, stop defaults to tool_use", () => {
  const { m } = model([{ say: "Hi", tools: [["read_file", { path: "a" }], ["list_files", {}]] }]);
  const r = m.call(0, { ...SNAP, turn: 3 });
  assert.equal(r.kind, "reply");
  assert.equal(r.stop_reason, "tool_use");
  assert.deepEqual(r.tool_uses.map((u) => u.id), ["toolu_3_1", "toolu_3_2"]);
  assert.deepEqual(r.content[0], { type: "text", text: "Hi" });
  assert.deepEqual(r.content[1], { type: "tool_use", id: "toolu_3_1", name: "read_file", input: { path: "a" } });
});

test("stop defaults to end_turn without tools; say may be omitted; explicit stop wins", () => {
  const { m } = model([{ say: "one" }, { }, { say: "three", stop: "max_tokens" }]);
  assert.equal(m.call(0, SNAP).stop_reason, "end_turn");
  const empty = m.call(0, SNAP);
  assert.deepEqual(empty.content, []);
  assert.equal(empty.say, null);
  assert.equal(m.call(0, SNAP).stop_reason, "max_tokens");
});

test("an error step fails the call and is consumed; defaults are retry 0 and error_ms 300", () => {
  const { m } = model([{ error: "rate_limit", retry_after_ms: 2000, error_ms: 50 }, { error: "timeout" }, { say: "ok" }]);
  assert.deepEqual(m.call(0, SNAP), { kind: "error", type: "rate_limit", retry_after_ms: 2000, error_ms: 50 });
  assert.deepEqual(m.call(0, SNAP), { kind: "error", type: "timeout", retry_after_ms: 0, error_ms: 300 });
  assert.equal(m.call(0, SNAP).say, "ok");
});

test("branch draws once and picks the first option whose cumulative percent exceeds the draw", () => {
  const first = createPrng(1).percent();
  const { m, prng } = model([{ branch: [{ percent: 60, then: [{ say: "A" }] }, { percent: 40, then: [{ say: "B" }] }] }]);
  const r = m.call(0, SNAP);
  assert.equal(r.say, first < 60 ? "A" : "B");
  assert.equal(prng.draws, 1);
});

test("when picks the first true condition, else the else steps; turn_gte reads the turn", () => {
  const script = [
    {
      when: [
        { if: "last_result_error", then: [{ say: "retry" }] },
        { if: "turn_gte:3", then: [{ say: "late" }] },
        { else: [{ say: "fine" }] },
      ],
    },
  ];
  assert.equal(model(script).m.call(0, SNAP).say, "fine");
  assert.equal(model(script).m.call(0, { ...SNAP, last_result_error: true }).say, "retry");
  assert.equal(model(script).m.call(0, { ...SNAP, turn: 3 }).say, "late");
});

test("repeat with a count splices the steps that many times, then the run-out reply", () => {
  const { m } = model([{ repeat: { steps: [{ say: "r" }], times: 2 } }]);
  assert.equal(m.call(0, SNAP).say, "r");
  assert.equal(m.call(0, SNAP).say, "r");
  const out = m.call(0, SNAP);
  assert.equal(out.say, "(the script has run out)");
  assert.equal(out.stop_reason, "end_turn");
  assert.equal(m.call(0, SNAP).say, "(the script has run out)");
});

test("repeat forever re-splices whenever reached", () => {
  const { m } = model([{ repeat: { steps: [{ say: "f" }], times: "forever" } }]);
  for (let i = 0; i < 5; i += 1) assert.equal(m.call(0, SNAP).say, "f");
});

test("a script that never produces a reply is stopped with an error", () => {
  const { m } = model([{ repeat: { steps: [{ when: [{ if: "last_denied", then: [{ say: "x" }] }] }], times: "forever" } }]);
  assert.throws(() => m.call(0, SNAP), /no reply after 100000 expansions/);
});

test("a fault fails the call before any step is consumed; the draw is one per fault", () => {
  const { m, prng } = model([{ say: "ok" }], { faults: [{ percent: 100, type: "overloaded" }] });
  assert.deepEqual(m.call(0, SNAP), { kind: "error", type: "overloaded", retry_after_ms: 0, error_ms: 300 });
  assert.equal(m.queue.length, 1);
  assert.equal(prng.draws, 1);
});

test("a 0 percent fault never fails; faults are checked in order and stop at the first failure", () => {
  const { m, prng } = model(
    [{ say: "ok" }],
    { faults: [{ percent: 0, type: "api_error" }, { percent: 100, type: "rate_limit" }, { percent: 100, type: "timeout" }] },
  );
  assert.deepEqual(m.call(0, SNAP), { kind: "error", type: "rate_limit", retry_after_ms: 0, error_ms: 300 });
  assert.equal(prng.draws, 2, "the third fault is not drawn once the second fails");
  const ok = model([{ say: "ok" }], { faults: [{ percent: 0, type: "api_error" }] });
  assert.equal(ok.m.call(0, SNAP).say, "ok");
});

test("an outage window fails calls inside [from_ms, to_ms) with no draw and no step", () => {
  const { m, prng } = model([{ say: "ok" }], { outage: { from_ms: 0, to_ms: 20000, type: "overloaded", retry_after_ms: 500 } });
  assert.deepEqual(m.call(0, SNAP), { kind: "error", type: "overloaded", retry_after_ms: 500, error_ms: 300 });
  assert.equal(m.call(19999, SNAP).kind, "error");
  assert.equal(prng.draws, 0);
  assert.equal(m.queue.length, 1);
  assert.equal(m.call(20000, SNAP).say, "ok");
});
