import { test } from "node:test";
import assert from "node:assert/strict";
import { runWith, ofKind, tapeWith } from "./helpers.mjs";
import { createPrng } from "../prng.js";
import { createHuman } from "../human.js";
import * as sim from "../index.js";

const RM = (cmd) => ({ say: "rm", tools: [["run_command", { cmd }]] });
const DONE = { say: "done", stop: "end_turn" };
const ASK_BOARD = { permissions: { mode: "ask", rules: [] } };

function asks(human, cmds, seed = 1) {
  const r = runWith({ tools: ["run_command"], script: [...cmds.map(RM), DONE], human }, ASK_BOARD, seed);
  return ofKind(r.events, "permission");
}

test("ask with no human fields: the default answers, and the mode's ask is reported as such", () => {
  const [p] = asks({ default: "approve" }, ["ls"]);
  assert.deepEqual({ decision: p.decision, rule: p.rule, human: p.human, final: p.final }, {
    decision: "ask", rule: "default", human: "approve", final: "allow",
  });
  const [q] = asks({ default: "deny" }, ["ls"]);
  assert.deepEqual({ human: q.human, final: q.final }, { human: "deny", final: "deny" });
});

test("deny_if: a careful human denies when every field glob matches; empty deny_if means the default", () => {
  const [matching] = asks({ default: "approve", deny_if: { cmd: "rm *" } }, ["rm -rf build"]);
  assert.equal(matching.human, "deny");
  assert.equal(matching.final, "deny");
  const [none] = asks({ default: "approve", deny_if: {} }, ["rm -rf build"]);
  assert.equal(none.human, "approve");
});

test("deny_if needs every field: a field the input lacks does not match", () => {
  const [p] = asks({ default: "approve", deny_if: { cmd: "rm *", path: "x*" } }, ["rm -rf build"]);
  assert.equal(p.human, "approve");
});

test("fatigue: no draw before the (after+1)th ask; from then on, below approve_percent approves without looking", () => {
  const cmds = ["rm a", "rm b", "rm c"];
  const ps = asks({ default: "approve", deny_if: { cmd: "rm *" }, fatigue: { after: 2, approve_percent: 100 } }, cmds);
  assert.deepEqual(ps.map((p) => p.human), ["deny", "deny", "approve"]);
  assert.deepEqual(ps.map((p) => p.final), ["deny", "deny", "allow"]);
});

test("the fatigue draw is percent(): strictly below approve_percent approves; equal is careful", () => {
  const first = createPrng(1).percent();
  assert.ok(first > 0 && first < 99, "fixture-dependent: seed 1 first draw is mid-range");
  const approve = asks({ default: "approve", deny_if: { cmd: "rm *" }, fatigue: { after: 0, approve_percent: first + 1 } }, ["rm -rf build"]);
  assert.equal(approve[0].human, "approve", "draw below approve_percent: rubber stamp");
  const careful = asks({ default: "approve", deny_if: { cmd: "rm *" }, fatigue: { after: 0, approve_percent: first } }, ["rm -rf build"]);
  assert.equal(careful[0].human, "deny", "draw equal to approve_percent: the careful human denies");
});

test("the human's answer maps to final: approve -> allow, deny -> deny, and a denied call returns Denied: reason", () => {
  const r = runWith({ tools: ["run_command"], script: [RM("rm -rf x"), DONE], human: { default: "deny" } }, ASK_BOARD);
  assert.equal(ofKind(r.events, "tool_call").length, 0);
  assert.equal(ofKind(r.events, "permission")[0].reason, "no rule matched (mode ask)");
  assert.equal(r.wire[2].messages[2].content[0].content, "Denied: no rule matched (mode ask)");
});

// ---------- createHuman (A2): one implementation for the harness and the labs

// A PRNG spy: percent() returns the given values in turn and counts its draws.
const spyPrng = (values) => {
  let i = 0;
  const spy = { draws: 0, percent() { spy.draws += 1; const v = values[i % values.length]; i += 1; return v; } };
  return spy;
};
const CALL = (cmd) => ({ name: "run_command", input: { cmd } });

test("createHuman is exported from the simulator", () => {
  assert.equal(typeof sim.createHuman, "function");
});

test("createHuman counts every ask, and draws only once the fatigue threshold is passed", () => {
  const prng = spyPrng([0]);
  const h = createHuman({ default: "approve", deny_if: {}, fatigue: { after: 2, approve_percent: 50 } }, prng);
  h.ask(CALL("a"));
  h.ask(CALL("b"));
  assert.equal(prng.draws, 0, "asks 1 and 2 do not draw (after = 2)");
  assert.equal(h.ask(CALL("c")), "approve", "ask 3 draws 0, below 50: the rubber stamp");
  assert.equal(prng.draws, 1);
  assert.equal(h.asks, 3, "every ask counts");
});

test("createHuman without fatigue never draws, however many asks", () => {
  const prng = spyPrng([0]);
  const h = createHuman({ default: "deny", deny_if: {}, fatigue: null }, prng);
  for (const cmd of ["a", "b", "c", "d"]) assert.equal(h.ask(CALL(cmd)), "deny");
  assert.equal(prng.draws, 0);
  assert.equal(h.asks, 4);
});

test("createHuman: a draw at or above approve_percent falls through to deny_if, then the default", () => {
  const prng = spyPrng([10]);
  const h = createHuman({ default: "approve", deny_if: { cmd: "rm *" }, fatigue: { after: 0, approve_percent: 10 } }, prng);
  assert.equal(h.ask(CALL("rm x")), "deny", "draw 10 is not below 10: deny_if matches");
  assert.equal(h.ask(CALL("ls")), "approve", "no deny_if match: the default");
  assert.equal(prng.draws, 2, "each ask after the threshold draws once");
});

test("createHuman: deny_if needs every field, and an empty deny_if means the default", () => {
  const h = createHuman({ default: "approve", deny_if: { cmd: "rm *", path: "x*" }, fatigue: null }, spyPrng([0]));
  assert.equal(h.ask(CALL("rm -rf build")), "approve", "the path field is missing: no match");
  const e = createHuman({ default: "deny", deny_if: {}, fatigue: null }, spyPrng([0]));
  assert.equal(e.ask(CALL("ls")), "deny");
});

test("the harness's answers are createHuman's answers on the run's own PRNG stream", () => {
  const raw = { default: "approve", deny_if: { cmd: "rm *" }, fatigue: { after: 1, approve_percent: 40 } };
  const cmds = ["rm a", "ls", "rm b", "ls", "rm c"];
  const r = runWith({ tools: ["run_command"], script: [...cmds.map(RM), DONE], human: raw }, ASK_BOARD, 7);
  const want = createHuman(tapeWith({ human: raw }).human, createPrng(7));
  const expected = cmds.map((cmd) => want.ask(CALL(cmd)));
  assert.deepEqual(ofKind(r.events, "permission").map((p) => p.human), expected);
  assert.equal(want.asks, cmds.length);
});
