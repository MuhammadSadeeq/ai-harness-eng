import { test } from "node:test";
import assert from "node:assert/strict";
import { runWith, ofKind } from "./helpers.mjs";
import { createPrng } from "../prng.js";

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
