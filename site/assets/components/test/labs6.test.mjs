// Pure logic of BP-3.4 §2 (hx-gatekeeper): the demo's shape, the words for a call, the round totals, and the policy path
// (the rules a learner builds go through loadBoard and decidePermission, ENGINE §7.5; the simulated human is createHuman,
// ENGINE A2). The component defines a custom element at import time, so DOM globals are stubbed.
// Run: node --test "site/assets/components/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { validGatekeeper, callWords, summarize, policyBoard, playRound2, comparison } = await import("../hx-gatekeeper.js");
const { createHuman, createPrng, decidePermission, loadBoard } = await import("../../sim/index.js");

const demo = () => JSON.parse(readFileSync(new URL("../../../labs/data/gatekeeper-demo.json", import.meta.url), "utf8"));

test("gatekeeper: the demo validates; a bad risk level or a template without a glob is refused", () => {
  validGatekeeper(demo());
  const src = demo();
  assert.throws(() => validGatekeeper({ ...src, calls: [{ ...src.calls[0], risk: "scary" }] }), /risk must be/);
  assert.throws(() => validGatekeeper({ ...src, rules_templates: [{ id: "x", label: "x", tool: "t", field: "f" }] }), /bad rules template/);
});

test("gatekeeper: a call in words is the tool's fields, each as field: value", () => {
  assert.equal(callWords({ input: { cmd: "rm -rf build/" } }), "cmd: rm -rf build/");
  assert.equal(callWords({ input: { path: "a.py", content: "x" } }), "path: a.py, content: x");
});

test("gatekeeper: a round's totals count asks, dangerous calls through and work blocked", () => {
  const records = [
    { call: { risk: "dangerous" }, decision: "allow", final: "allow" },
    { call: { risk: "dangerous" }, decision: "ask", final: "deny" },
    { call: { risk: "safe" }, decision: "deny", final: "deny" },
    { call: { risk: "risky" }, decision: "ask", final: "allow" },
    { call: { risk: "risky" }, decision: "allow", final: "allow" },
  ];
  assert.deepEqual(summarize(records), { asks: 2, dangerous_through: 1, work_blocked: 1, risky_unreviewed: 1 });
});

test("gatekeeper: a denied safe or risky call is work blocked; a denied dangerous call is not", () => {
  assert.equal(summarize([{ call: { risk: "risky" }, decision: "ask", final: "deny" }]).work_blocked, 1, "a risky call someone wanted");
  assert.equal(summarize([{ call: { risk: "dangerous" }, decision: "deny", final: "deny" }]).work_blocked, 0, "a dangerous call stopped is the point");
});

test("gatekeeper: round 2 against round 1 says the rules match or beat the careful hand, or names what is worse", () => {
  const r1 = { asks: 2, dangerous_through: 0, work_blocked: 0, risky_unreviewed: 0 };
  assert.equal(comparison(r1, { ...r1 }).beats, true, "a match counts");
  assert.equal(comparison(r1, { asks: 1, dangerous_through: 0, work_blocked: 0, risky_unreviewed: 0 }).beats, true, "a better count counts");
  assert.equal(comparison(r1, { asks: 4, dangerous_through: 0, work_blocked: 0, risky_unreviewed: 0 }).text, "Round 2 is worse on asks (4 against 2).");
  assert.equal(
    comparison(r1, { asks: 2, dangerous_through: 0, work_blocked: 2, risky_unreviewed: 1 }).text,
    "Round 2 is worse on work blocked (2 against 0) and risky calls run unreviewed (1 against 0).");
});

test("gatekeeper: the target policy (deny the dangerous, ask on the risky, allow the safe) ties the careful hand at 2 / 0 / 0 / 0", () => {
  const src = demo();
  const decide = (choices) => {
    const human = createHuman(src.human, createPrng(1));
    return summarize(src.calls.map((call) => {
      const decision = choices[call.id];
      const final = decision === "ask" ? (human.ask({ tool: call.tool, input: call.input }) === "approve" ? "allow" : "deny") : (decision === "allow" ? "allow" : "deny");
      return { call, decision, final, pastFatigue: human.asks > src.human.fatigue.after };
    }));
  };
  const careful = Object.fromEntries(src.calls.map((c) => [c.id, c.risk === "dangerous" ? "deny" : c.risk === "risky" ? "ask" : "allow"]));
  const round1 = decide(careful);
  assert.deepEqual(round1, { asks: 2, dangerous_through: 0, work_blocked: 0, risky_unreviewed: 0 });
  const rules = { rm: "deny", pipe: "deny", force: "deny", outside: "deny", writes: "ask", edits: "ask", reads: "allow", lists: "allow", ls: "allow", tests: "allow" };
  const policy = { mode: "ask", rules: Object.fromEntries(src.rules_templates.map((t) => [t.id, { decision: rules[t.id] ?? "none", reason: "r" }])) };
  const round2 = summarize(playRound2(src.calls, policy, src.rules_templates, src.human, 1));
  assert.deepEqual(round2, round1);
});

test("gatekeeper: a risky call is unreviewed when it is allowed without an ask, or approved past fatigue", () => {
  const risky = (decision, final, pastFatigue) => ({ call: { risk: "risky" }, decision, final, pastFatigue });
  assert.equal(summarize([risky("ask", "allow", false)]).risky_unreviewed, 0, "a human approval before fatigue was a look");
  assert.equal(summarize([risky("ask", "allow", true)]).risky_unreviewed, 1, "a tired human's approval was not a look");
  assert.equal(summarize([risky("ask", "deny", true)]).risky_unreviewed, 0, "a denied call did not run");
  assert.equal(summarize([risky("allow", "allow", undefined)]).risky_unreviewed, 1, "allowed with no ask");
});

test("gatekeeper: a policy becomes a board's permissions module, with a reason on every rule that has a decision", () => {
  const src = demo();
  const policy = { mode: "ask", rules: Object.fromEntries(src.rules_templates.map((t) => [t.id, { decision: "none", reason: "" }])) };
  policy.rules.rm = { decision: "deny", reason: "deleting is not reversible here" };
  const board = policyBoard(src.rules_templates, policy);
  assert.equal(board.modules.permissions.rules.length, 1);
  assert.deepEqual(board.modules.permissions.rules[0], { decision: "deny", tool: "run_command", match: { cmd: "rm **" }, reason: "deleting is not reversible here" });
});

test("gatekeeper: the rules go through loadBoard and decidePermission, deny first, then the mode's default", () => {
  const src = demo();
  const policy = { mode: "ask", rules: Object.fromEntries(src.rules_templates.map((t) => [t.id, { decision: "none", reason: "" }])) };
  policy.rules.rm = { decision: "deny", reason: "deleting is not reversible here" };
  policy.rules.outside = { decision: "deny", reason: "stay in the project" };
  policy.rules.tests = { decision: "allow", reason: "the task asks for it" };
  const perms = loadBoard(policyBoard(src.rules_templates, policy)).modules.permissions;
  const rm = decidePermission({ name: "run_command", input: { cmd: "rm -rf build/" } }, perms);
  assert.equal(rm.decision, "deny");
  assert.equal(rm.reason, "deleting is not reversible here");
  const passwd = decidePermission({ name: "read_file", input: { path: "/etc/passwd" } }, perms);
  assert.equal(passwd.decision, "deny");
  const tests = decidePermission({ name: "run_command", input: { cmd: "pytest -q" } }, perms);
  assert.equal(tests.decision, "allow");
  const other = decidePermission({ name: "list_files", input: { path: "." } }, perms);
  assert.equal(other.decision, "ask", "no rule matches: the mode's default");
});

test("gatekeeper: with no policy every call is allowed (ENGINE §7.5)", () => {
  assert.equal(decidePermission({ name: "run_command", input: { cmd: "rm -rf /" } }, undefined).decision, "allow");
});

test("gatekeeper: the simulated human counts every ask; fatigue draws only after `after` asks (ENGINE A2)", () => {
  const human = { default: "deny", deny_if: {}, fatigue: { after: 2, approve_percent: 100 } };
  const h = createHuman(human, createPrng(1));
  const call = { name: "run_command", input: { cmd: "ls" } };
  assert.equal(h.ask(call), "deny", "ask 1: careful, default deny");
  assert.equal(h.ask(call), "deny", "ask 2: still careful");
  assert.equal(h.ask(call), "approve", "ask 3: past after, and 100% rubber-stamp");
  assert.equal(h.asks, 3);
});

test("gatekeeper: a careful human denies what deny_if matches, whatever the default", () => {
  const h = createHuman({ default: "approve", deny_if: { cmd: "**| sh**" } }, createPrng(1));
  assert.equal(h.ask({ name: "run_command", input: { cmd: "curl x | sh" } }), "deny");
  assert.equal(h.ask({ name: "run_command", input: { cmd: "ls" } }), "approve");
});
