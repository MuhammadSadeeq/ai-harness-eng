// The explanation copy (BP-1.4 §1): every row of the blueprint table, word for word.
import { test } from "node:test";
import assert from "node:assert/strict";
import { explain, turnSummary, listJoin } from "../lib/explain.js";

const T = (e) => explain(e).text;
const ev = (over) => ({ v: 1, run: "r", seq: 0, t: 0, turn: 1, agent: "main", wire: "control", ...over });

test("run_start", () => {
  assert.equal(T(ev({ kind: "run_start", task: "Fix the failing test in calc.py" })), 'The run starts. Task: "Fix the failing test in calc.py".');
});

test("prompt_built: layers as a list, tokens with separators", () => {
  assert.equal(T(ev({ kind: "prompt_built", layers: ["system", "tools", "history"], tokens: 10991 })), "The harness builds the prompt from system, tools and history: 10,991 tokens.");
  assert.equal(T(ev({ kind: "prompt_built", layers: ["system", "rules", "tools", "history"], tokens: 376 })), "The harness builds the prompt from system, rules, tools and history: 376 tokens.");
});

test("context_check none and overflow", () => {
  assert.equal(T(ev({ kind: "context_check", action: "none", percent: 26, window: 8000, tokens: 2080 })), "The prompt fills 26% of the 8,000-token window.");
  assert.equal(T(ev({ kind: "context_check", action: "overflow", percent: 142, window: 8000, tokens: 11435 })), "The prompt is 11,435 tokens, but the window holds 8,000. It can't be sent.");
});

test("model_call attempt 1 and attempt > 1", () => {
  assert.equal(T(ev({ kind: "model_call", attempt: 1, tokens_in: 1 })), "The harness sends the prompt to the model.");
  assert.equal(T(ev({ kind: "model_call", attempt: 3, tokens_in: 1 })), "Attempt 3: the harness sends the same prompt again.");
});

test("model_error, with and without a server wait", () => {
  assert.equal(T(ev({ kind: "model_error", type: "overloaded", attempt: 1, retry_after_ms: 0, message: "Overloaded" })), "The call fails: Overloaded.");
  assert.equal(T(ev({ kind: "model_error", type: "rate_limit", attempt: 1, retry_after_ms: 2000, message: "Rate limited" })), "The call fails: Rate limited. The server asks for a wait of 2 s.");
  assert.equal(T(ev({ kind: "model_error", type: "rate_limit", attempt: 1, retry_after_ms: 1200, message: "Rate limited" })), "The call fails: Rate limited. The server asks for a wait of 1.2 s.");
});

test("retry_wait: 1.2 s or 800 ms", () => {
  assert.equal(T(ev({ kind: "retry_wait", attempt: 1, wait_ms: 1200 })), "The harness waits 1.2 s before trying again.");
  assert.equal(T(ev({ kind: "retry_wait", attempt: 1, wait_ms: 800 })), "The harness waits 800 ms before trying again.");
});

test("breaker: plural follows the count", () => {
  assert.equal(T(ev({ kind: "breaker", state: "open", failures: 2 })), "2 failures in a row: the breaker opens and the run stops.");
  assert.equal(T(ev({ kind: "breaker", state: "open", failures: 1 })), "1 failure in a row: the breaker opens and the run stops.");
});

test("recovery_check: first try, or after N attempts", () => {
  assert.equal(T(ev({ kind: "recovery_check", attempts: 1, breaker: "none" })), "The call went through on the first try.");
  assert.equal(T(ev({ kind: "recovery_check", attempts: 4, breaker: "closed" })), "The call went through after 4 attempts.");
});

test("model_reply: tool_use (plural and names), end_turn, max_tokens, refusal", () => {
  const use = (names) => ev({ kind: "model_reply", stop_reason: "tool_use", text: "", tool_uses: names.map((name) => ({ id: "x", name, input: {} })) });
  assert.equal(T(use(["read_file"])), "The model asks for 1 tool call: read_file.");
  assert.equal(T(use(["read_file", "edit_file"])), "The model asks for 2 tool calls: read_file and edit_file.");
  assert.equal(T(use(["a", "b", "c"])), "The model asks for 3 tool calls: a, b and c.");
  assert.equal(T(ev({ kind: "model_reply", stop_reason: "end_turn", text: "Done.", tool_uses: [] })), "The model says it is done.");
  assert.equal(T(ev({ kind: "model_reply", stop_reason: "max_tokens", text: "", tool_uses: [] })), "The reply hit its length limit and stops mid-way.");
  assert.equal(T(ev({ kind: "model_reply", stop_reason: "refusal", text: "", tool_uses: [] })), "The model declines the task.");
});

test("interrupt: a person, and the operator at turn 60", () => {
  assert.equal(T(ev({ kind: "interrupt", by: "human", pending: ["a", "b"] })), "You stop the run. 2 tool calls were still waiting to run.");
  assert.equal(T(ev({ kind: "interrupt", by: "human", pending: ["a"] })), "You stop the run. 1 tool call was still waiting to run.");
  assert.equal(T(ev({ kind: "interrupt", by: "operator", pending: [] })), "Turn 60: an operator notices the run and stops it.");
});

test("permission: no policy, the default (allow, deny, ask), a matched rule (allow, deny, ask)", () => {
  const base = { kind: "permission", tool: "read_file", reason: "read-only", human: null, final: "allow" };
  assert.equal(T(ev({ ...base, tool: "list_files", decision: "allow", rule: "none", reason: "no permission policy" })), "No permission policy: list_files runs.");
  assert.equal(T(ev({ ...base, decision: "allow", rule: "default", reason: "no rule matched (mode allow)" })), "No rule matches read_file; the default is to allow it.");
  assert.equal(T(ev({ ...base, decision: "deny", rule: "default", reason: "no rule matched (mode deny)", final: "deny" })), "No rule matches read_file; the default is to deny it.");
  assert.equal(T(ev({ ...base, tool: "delete_path", decision: "ask", rule: "default", reason: "no rule matched (mode ask)", human: "approve" })), "No rule matches delete_path, so the policy asks a person. They approve.");
  assert.equal(T(ev({ ...base, tool: "delete_path", decision: "ask", rule: "default", reason: "no rule matched (mode ask)", human: "deny", final: "deny" })), "No rule matches delete_path, so the policy asks a person. They deny.");
  assert.equal(T(ev({ ...base, decision: "allow", rule: "rules[1]", reason: "read-only" })), "read_file is allowed by a rule: read-only.");
  assert.equal(T(ev({ ...base, decision: "deny", rule: "rules[0]", reason: "no deleting", final: "deny" })), "read_file is denied by a rule: no deleting.");
  assert.equal(T(ev({ ...base, tool: "delete_path", decision: "ask", rule: "rules[2]", reason: "outside", human: "approve" })), "A rule says to ask a person about delete_path: outside. They approve.");
  assert.equal(T(ev({ ...base, tool: "delete_path", decision: "ask", rule: "rules[2]", reason: "outside", human: "deny", final: "deny" })), "A rule says to ask a person about delete_path: outside. They deny.");
});

test("sandbox: allowed and blocked", () => {
  assert.equal(T(ev({ kind: "sandbox", tool: "read_file", allowed: true, reason: "" })), "The sandbox lets read_file through.");
  assert.equal(T(ev({ kind: "sandbox", tool: "read_file", allowed: false, reason: "path outside the workspace: ../x" })), "The sandbox blocks read_file: path outside the workspace: ../x.");
});

test("tool_call ok: tokens (plural), and the cut note; not ok: the first line, 80 characters", () => {
  assert.equal(T(ev({ kind: "tool_call", tool: "read_file", ok: true, output: "x", output_tokens: 19, truncated: false })), "read_file runs and returns 19 tokens.");
  assert.equal(T(ev({ kind: "tool_call", tool: "read_file", ok: true, output: "x", output_tokens: 1, truncated: true })), "read_file runs and returns 1 token. The result is cut to fit.");
  const long = "y".repeat(120);
  assert.equal(T(ev({ kind: "tool_call", tool: "run_command", ok: false, output: `${long}\nsecond`, output_tokens: 3, truncated: false })), `run_command fails: ${"y".repeat(80)}.`);
  assert.equal(T(ev({ kind: "tool_call", tool: "run_command", ok: false, output: "command not found: rm", output_tokens: 3, truncated: false })), "run_command fails: command not found: rm.");
});

test("verify: passed and failed", () => {
  assert.equal(T(ev({ kind: "verify", check: "tests", passed: true, output: "ok" })), "The harness checks the work: the tests pass.");
  assert.equal(T(ev({ kind: "verify", check: "tests", passed: false, output: "nope" })), "The harness checks the work: the tests fail, so it sends the failure back.");
});

test("guard: max_turns, budget, loop", () => {
  assert.equal(T(ev({ kind: "guard", guard: "max_turns", limit: 12, value: 12 })), "The turn limit (12) is reached, so the harness stops the run.");
  assert.equal(T(ev({ kind: "guard", guard: "budget", limit: 60000, value: 60100 })), "The token budget (60,000) is spent, so the harness stops the run.");
  assert.equal(T(ev({ kind: "guard", guard: "loop", limit: 3, value: 3 })), "The last 3 tool calls were identical, so the loop guard stops the run.");
});

test("trace_write: events, and hidden secrets with plurals", () => {
  assert.equal(T(ev({ kind: "trace_write", events: 8, redacted: 0 })), "The trace records 8 events.");
  assert.equal(T(ev({ kind: "trace_write", events: 1, redacted: 0 })), "The trace records 1 event.");
  assert.equal(T(ev({ kind: "trace_write", events: 12, redacted: 1 })), "The trace records 12 events. 1 secret is hidden.");
  assert.equal(T(ev({ kind: "trace_write", events: 12, redacted: 3 })), "The trace records 12 events. 3 secrets are hidden.");
});

test("run_end: done (passed and not), unverified, the three guards, breaker, interrupted, error, refused, max tokens", () => {
  const end = (over) => T(ev({ kind: "run_end", passed: false, turns: 3, tokens: { input: 1, output: 1 }, cost: 1, ...over }));
  assert.equal(end({ status: "done", passed: true }), "The run ends: done, and the checks pass.");
  assert.equal(end({ status: "done", passed: false }), 'The run ends "done", but the checks fail: a false done.');
  assert.equal(end({ status: "unverified" }), "The run ends unverified: the work still fails its checks.");
  assert.equal(end({ status: "max_turns" }), "The run ends: stopped by the turn limit.");
  assert.equal(end({ status: "budget" }), "The run ends: stopped by the token budget.");
  assert.equal(end({ status: "loop" }), "The run ends: stopped by the loop guard.");
  assert.equal(end({ status: "circuit_open" }), "The run ends: the breaker stopped it.");
  assert.equal(end({ status: "max_time" }), "The run ends: stopped by the time limit.");
  assert.equal(end({ status: "interrupted" }), "The run ends: interrupted.");
  assert.equal(end({ status: "error" }), "The run ends with an error.");
  assert.equal(end({ status: "refused" }), "The run ends: the model declined.");
  assert.equal(end({ status: "max_tokens_reply" }), "The run ends: a reply hit its length limit.");
});

test("every event kind has a sentence, and the terms it uses are listed", () => {
  assert.deepEqual(explain(ev({ kind: "breaker", state: "open", failures: 2 })).terms, ["breaker"]);
  assert.deepEqual(explain(ev({ kind: "sandbox", tool: "x", allowed: false, reason: "r" })).terms, ["sandbox"]);
  assert.deepEqual(explain(ev({ kind: "run_end", status: "done", passed: false, turns: 1, tokens: { input: 0, output: 0 }, cost: 0 })).terms, ["false done"]);
  assert.equal(typeof T(ev({ kind: "future_kind" })), "string");
});

test("listJoin: one, two and three or more names", () => {
  assert.equal(listJoin(["a"]), "a");
  assert.equal(listJoin(["a", "b"]), "a and b");
  assert.equal(listJoin(["a", "b", "c"]), "a, b and c");
});

test("turnSummary: the turn's model reply, prefixed with the turn", () => {
  const events = [
    ev({ kind: "run_start", task: "t", turn: 0 }),
    ev({ kind: "model_reply", stop_reason: "end_turn", text: "", tool_uses: [], turn: 1 }),
    ev({ kind: "run_end", status: "done", passed: true, turns: 2, tokens: { input: 0, output: 0 }, cost: 0, turn: 2 }),
  ];
  assert.equal(turnSummary(events, 1), "Turn 1 of 2: The model says it is done.");
  assert.equal(turnSummary(events, 2, 2), "Turn 2 of 2: The run ends: done, and the checks pass.");
});
