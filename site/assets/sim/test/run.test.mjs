import { test } from "node:test";
import assert from "node:assert/strict";
import { runWith, kindsOf, ofKind, tapeWith, FACTS } from "./helpers.mjs";
import { runTrial } from "../index.js";
import { loadBoard } from "../board.js";

const READ = (path = "a.txt") => ({ say: "read", tools: [["read_file", { path }]] });
const DONE = { say: "done", stop: "end_turn" };

test("one read then done: the event sequence, ids and clock follow section 7.1 and 9", () => {
  const { events, result } = runWith({ script: [READ(), DONE] });
  assert.deepEqual(kindsOf(events), [
    "run_start", "prompt_built", "context_check", "model_call", "recovery_check", "model_reply",
    "permission", "tool_call", "trace_write",
    "prompt_built", "context_check", "model_call", "recovery_check", "model_reply", "trace_write",
    "run_end",
  ]);
  assert.deepEqual(events.map((e) => e.seq), events.map((_, i) => i));
  assert.equal(events[0].run, "t:t-board:1");
  assert.equal(events[0].wire, "loop");
  const reply1 = ofKind(events, "model_reply")[0];
  assert.equal(reply1.t, 600 + 20 * reply1.usage.output_tokens, "model latency is 600 + 20 per output token");
  assert.equal(ofKind(events, "tool_call")[0].t, ofKind(events, "model_reply")[0].t + 100, "read_file takes 100 ms");
  assert.equal(result.status, "done");
  assert.equal(result.turns, 2);
});

test("cost is cumulative nano-units: prompt * input_milli + output * output_milli, per turn", () => {
  const { events, result } = runWith({ script: [READ(), DONE] });
  const replies = ofKind(events, "model_reply");
  const inTotal = replies.reduce((s, r) => s + r.usage.input_tokens, 0);
  const outTotal = replies.reduce((s, r) => s + r.usage.output_tokens, 0);
  assert.equal(result.cost, (inTotal + outTotal) * 1000);
  assert.equal(replies[0].cost, (replies[0].usage.input_tokens + replies[0].usage.output_tokens) * 1000);
  assert.equal(replies[1].cost, result.cost);
  assert.deepEqual(result.tokens, { input: inTotal, output: outTotal });
});

test("A1: a prompt over the window is an overflow: one model_call, 300 ms, invalid_request, run ends error, no fault draw", () => {
  const { events, wire, result } = runWith({ window: 20, tools: [], faults: [{ percent: 100, type: "overloaded" }] });
  const check = ofKind(events, "context_check")[0];
  assert.equal(check.action, "overflow");
  assert.equal(kindsOf(events).filter((k) => k === "model_call").length, 1);
  const err = ofKind(events, "model_error")[0];
  assert.equal(err.type, "invalid_request");
  assert.equal(err.message, `prompt is too long: ${check.tokens} tokens > 20 maximum`);
  assert.equal(err.attempt, 1);
  assert.equal(err.retry_after_ms, 0);
  assert.equal(err.t, 300);
  assert.equal(result.status, "error");
  assert.equal(result.turns, 1);
  assert.equal(result.cost, 0);
  assert.equal(wire.length, 0);
});

test("A1 does not fire when the prompt fits, even at the limit", () => {
  const first = runWith({ tools: [] }).events;
  const tokensNeeded = ofKind(first, "context_check")[0].tokens;
  const fits = runWith({ tools: [], window: tokensNeeded });
  assert.equal(ofKind(fits.events, "context_check")[0].action, "none");
  assert.equal(fits.result.status, "done");
});

test("turn_limit: a guard before turn 3 ends max_turns and carries the finished turn", () => {
  const { events, result } = runWith({ script: [READ(), READ(), READ(), DONE] }, { turn_limit: { max_turns: 2 } });
  const g = ofKind(events, "guard")[0];
  assert.deepEqual({ guard: g.guard, limit: g.limit, value: g.value, turn: g.turn }, { guard: "max_turns", limit: 2, value: 2, turn: 2 });
  assert.equal(result.status, "max_turns");
  assert.equal(result.turns, 2);
});

test("loop_detect: the last window tool calls identical ends the run loop", () => {
  const { events, result } = runWith({ script: [READ(), READ(), READ(), DONE] }, { loop_detect: { window: 2 } });
  assert.equal(ofKind(events, "guard")[0].guard, "loop");
  assert.equal(result.status, "loop");
  assert.equal(result.turns, 2);
});

test("token_budget: the guard reads tokens_in + tokens_out so far", () => {
  const { events, result } = runWith({ script: [READ(), DONE] }, { token_budget: { max_tokens: 1 } });
  const g = ofKind(events, "guard")[0];
  assert.equal(g.guard, "budget");
  assert.equal(g.value, result.tokens.input + result.tokens.output);
  assert.equal(result.status, "budget");
  assert.equal(result.turns, 1);
});

test("the turn-60 safety stop ends an endless run as interrupted, by the operator, with no pending calls", () => {
  const { events, result } = runWith({ script: [{ repeat: { steps: [READ()], times: "forever" } }] });
  assert.equal(result.status, "interrupted");
  assert.equal(result.turns, 60);
  assert.equal(ofKind(events, "model_call").length, 60);
  const i = ofKind(events, "interrupt")[0];
  assert.deepEqual({ by: i.by, pending: i.pending, turn: i.turn }, { by: "operator", pending: [], turn: 60 });
});

test("verify_gate passes: a done claim with checks holding ends done with passed true", () => {
  const { events, result } = runWith({ script: [DONE], checks: [{ file: "a.txt", contains: "hello" }] }, { verify_gate: { max_feedback: 1 } });
  const v = ofKind(events, "verify")[0];
  assert.deepEqual({ check: v.check, passed: v.passed, output: v.output }, { check: "tests", passed: true, output: "ok" });
  assert.equal(result.status, "done");
  assert.equal(result.passed, true);
});

test("verify_gate fails twice: feedback once, then unverified; the feedback text is sent to the model", () => {
  const { events, wire, result } = runWith(
    { script: [DONE, { say: "still done", stop: "end_turn" }], checks: [{ file: "a.txt", contains: "bye" }] },
    { verify_gate: { max_feedback: 1 } },
  );
  assert.equal(ofKind(events, "verify").length, 2);
  assert.equal(ofKind(events, "verify")[0].output, "nope");
  assert.equal(result.status, "unverified");
  assert.equal(result.turns, 2);
  assert.equal(result.passed, false);
  const feedback = wire[2].messages[wire[2].messages.length - 1];
  assert.deepEqual(feedback, { role: "user", content: [{ type: "text", text: "Verification failed: nope Fix it, then say done." }] });
});

test("without verify_gate a done claim is just done: a false done is possible and shows in passed", () => {
  const { result } = runWith({ script: [DONE], checks: [{ file: "a.txt", contains: "bye" }] });
  assert.equal(result.status, "done");
  assert.equal(result.passed, false);
});

test("output_cap keeps 2*max_tokens characters at each end and states the count cut", () => {
  const { events } = runWith({ workspace: { "big.txt": "x".repeat(1000) }, script: [READ("big.txt"), DONE] }, { output_cap: { max_tokens: 10 } });
  const tc = ofKind(events, "tool_call")[0];
  const expected = `${"x".repeat(20)}\n[... 960 characters cut; ask for a smaller range ...]\n${"x".repeat(20)}`;
  assert.equal(tc.output, expected);
  assert.equal(tc.truncated, true);
  assert.equal(tc.output_tokens, Math.floor(JSON.stringify(expected).length / 4));
});

test("output under the cap is untouched and not truncated", () => {
  const { events } = runWith({ script: [READ(), DONE] }, { output_cap: { max_tokens: 100 } });
  assert.equal(ofKind(events, "tool_call")[0].output, "hello\n");
  assert.equal(ofKind(events, "tool_call")[0].truncated, false);
});

test("redact replaces patterns in events and counts them on trace_write; the model still sees the text", () => {
  const { events, wire } = runWith(
    { workspace: { "secret.txt": "KEY=sk-test-planted\n" }, script: [READ("secret.txt"), DONE] },
    { redact: { patterns: ["sk-test-planted"] } },
  );
  assert.equal(ofKind(events, "tool_call")[0].output, "KEY=[REDACTED]\n");
  const writes = ofKind(events, "trace_write");
  assert.equal(writes[0].redacted, 1);
  assert.equal(writes[1].redacted, 0);
  assert.ok(JSON.stringify(wire[2].messages).includes("sk-test-planted"), "wire payloads are not events");
});

test("trace_write.events counts the events since the previous trace_write, and they add up", () => {
  const { events } = runWith({ script: [READ(), READ(), DONE] });
  const writes = ofKind(events, "trace_write");
  const flushable = events.filter((e) => e.kind !== "trace_write" && e.kind !== "run_end");
  assert.equal(writes.reduce((s, w) => s + w.events, 0), flushable.length);
});

test("all tool results of one reply go in ONE user message", () => {
  const { wire } = runWith({ script: [{ say: "two", tools: [["read_file", { path: "a.txt" }], ["list_files", {}]] }, DONE] });
  const msg = wire[2].messages[2];
  assert.equal(msg.role, "user");
  assert.deepEqual(msg.content.map((b) => b.tool_use_id), ["toolu_1_1", "toolu_1_2"]);
});

test("a deny rule gives Denied: <reason>, no tool_call, and last_denied steers the script", () => {
  const board = {
    permissions: {
      mode: "allow",
      rules: [{ decision: "deny", tool: "run_command", match: { cmd: "rm *" }, reason: "no deleting" }],
    },
  };
  const script = [
    { say: "rm", tools: [["run_command", { cmd: "rm -rf x" }]] },
    { when: [{ if: "last_denied", then: [{ say: "noted", stop: "end_turn" }] }, { else: [{ say: "not denied", stop: "end_turn" }] }] },
  ];
  const { events, wire } = runWith({ script, tools: ["run_command"] }, board);
  const p = ofKind(events, "permission")[0];
  assert.deepEqual({ decision: p.decision, rule: p.rule, reason: p.reason, human: p.human, final: p.final }, {
    decision: "deny", rule: "rules[0]", reason: "no deleting", human: null, final: "deny",
  });
  assert.equal(ofKind(events, "tool_call").length, 0);
  assert.deepEqual(wire[2].messages[2].content[0], {
    type: "tool_result", tool_use_id: "toolu_1_1", content: "Denied: no deleting", is_error: true,
  });
  assert.equal(ofKind(events, "model_reply")[1].text, "noted");
});

test("the run_end passed flag is the ground truth on the final workspace", () => {
  const tape = tapeWith({ script: [DONE], checks: [{ file: "a.txt", contains: "hello" }] });
  const { result } = runTrial(tape, loadBoard({ id: "x", modules: {} }), 3, { facts: FACTS });
  assert.equal(result.passed, true);
});
