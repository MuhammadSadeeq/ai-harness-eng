// ENGINE amendment A7 (docs/ENGINE.md, Amendments): input checks, split results, effort,
// and the order within a tool call.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tapeWith, runWith, kindsOf, ofKind, FACTS } from "./helpers.mjs";
import { checkInput } from "../inputs.js";
import { runTrial } from "../index.js";
import { tokens } from "../tokens.js";

const READ = (path = "a.txt") => ({ say: "read", tools: [["read_file", { path }]] });
const DONE = { say: "done", stop: "end_turn" };
const WS = { "a.txt": "hello\n", "b.txt": "world\n" };
const modelReplies = (events) => ofKind(events, "model_reply");
const toolResults = (wireMsgs) => wireMsgs.flatMap((m) => (m.role === "user" ? m.content.filter((b) => b.type === "tool_result") : []));

// ---------- A7.1: input checks (the unit rules, then the harness)

const SCHEMA = {
  type: "object",
  properties: { path: { type: "string" }, n: { type: "integer" }, x: { type: "number" }, flag: { type: "boolean" },
    list: { type: "array" }, obj: { type: "object" }, mode: { type: "string", enum: ["lines", "words"] }, one: { enum: [1] } },
  required: ["path"],
  additionalProperties: false,
};

test("A7.1 a non-object input is refused first", () => {
  for (const bad of [[], null, "x", 3]) assert.equal(checkInput(SCHEMA, bad), "input must be an object");
});

test("A7.1 required names are checked in schema order", () => {
  assert.equal(checkInput({ required: ["b", "a"] }, {}), "missing required field: b");
  assert.equal(checkInput({ required: ["b", "a"] }, { b: 1 }), "missing required field: a");
});

test("A7.1 unknown fields are refused only with additionalProperties false, in input order", () => {
  assert.equal(checkInput(SCHEMA, { zz: 1, path: "a" }), "unknown field: zz");
  assert.equal(checkInput(SCHEMA, { x: 1, path: "a" }), "", "x is declared in this schema");
  assert.equal(checkInput({ properties: {} }, { anything: 1 }), "", "without additionalProperties false, extras are fine");
});

test("A7.1 declared types: integer rejects 2.5 and booleans, number accepts integers", () => {
  assert.equal(checkInput(SCHEMA, { path: 2 }), "field path must be string");
  assert.equal(checkInput(SCHEMA, { path: "a", n: 2.5 }), "field n must be integer");
  assert.equal(checkInput(SCHEMA, { path: "a", n: true }), "field n must be integer", "a JSON boolean is not an integer");
  assert.equal(checkInput(SCHEMA, { path: "a", n: 3 }), "");
  assert.equal(checkInput(SCHEMA, { path: "a", x: 2.5 }), "", "number accepts any finite number");
  assert.equal(checkInput(SCHEMA, { path: "a", flag: 1 }), "field flag must be boolean");
  assert.equal(checkInput(SCHEMA, { path: "a", list: {} }), "field list must be array");
  assert.equal(checkInput(SCHEMA, { path: "a", obj: [] }), "field obj must be object");
});

test("A7.1 enum: the value must be one of the list, compared by pyjson", () => {
  assert.equal(checkInput(SCHEMA, { path: "a", mode: "bytes" }), 'field mode must be one of: "lines", "words"');
  assert.equal(checkInput(SCHEMA, { path: "a", mode: "words" }), "");
  assert.equal(checkInput(SCHEMA, { path: "a", one: "1" }), "field one must be one of: 1", "the string \"1\" is not the number 1");
});

test("A7.1 the first failure wins, field by field in input order", () => {
  assert.equal(checkInput(SCHEMA, { mode: "bytes", path: 2 }), 'field mode must be one of: "lines", "words"');
  assert.equal(checkInput(SCHEMA, { path: 2, mode: "bytes" }), "field path must be string");
  assert.equal(checkInput(SCHEMA, { bad: 1, path: 2 }), "unknown field: bad");
});

const VALIDATE_TAPE = (script) => ({ script, workspace: WS, tools: ["read_file"] });

test("A7.1 an invalid call is not run: input_check false, an Invalid input result, no tool_call", () => {
  const { events, wire } = runWith(VALIDATE_TAPE([{ tools: [["read_file", {}]] }, DONE]), { validate_inputs: {} });
  const check = ofKind(events, "input_check")[0];
  assert.deepEqual([check.tool, check.valid, check.reason], ["read_file", false, "missing required field: path"]);
  assert.equal(ofKind(events, "tool_call").length, 0);
  const r = toolResults(wire[2].messages)[0];
  assert.equal(r.content, "Invalid input: missing required field: path");
  assert.equal(r.is_error, true);
});

test("A7.1 a valid call is checked, then runs", () => {
  const { events } = runWith(VALIDATE_TAPE([READ(), DONE]), { validate_inputs: {} });
  const check = ofKind(events, "input_check")[0];
  assert.deepEqual([check.valid, check.reason], [true, ""]);
  assert.equal(ofKind(events, "tool_call").length, 1);
});

test("A7.1 without the module the call runs as given, and no input_check is emitted", () => {
  const { events } = runWith(VALIDATE_TAPE([{ tools: [["read_file", {}]] }, DONE]), {});
  assert.equal(ofKind(events, "input_check").length, 0);
  assert.equal(ofKind(events, "tool_call").length, 1, "the missing path reads as \"\" and the call runs");
});

test("A7.1 a tool with no definition is not checked: valid, empty reason", () => {
  const { events, wire } = runWith(VALIDATE_TAPE([{ tools: [["nope", { anything: 1 }]] }, DONE]), { validate_inputs: {} });
  const check = ofKind(events, "input_check")[0];
  assert.deepEqual([check.valid, check.reason], [true, ""]);
  assert.match(toolResults(wire[2].messages)[0].content, /Unknown tool: nope/, "the unknown tool result is as A3.2 says");
});

test("A7.1 order within a tool call: permission, sandbox, input check, run", () => {
  const { events } = runWith(VALIDATE_TAPE([READ(), DONE]), { validate_inputs: {}, sandbox: { egress: [] }, permissions: { mode: "allow", rules: [] } });
  const kinds = kindsOf(events);
  const at = kinds.indexOf("permission");
  assert.deepEqual(kinds.slice(at, at + 4), ["permission", "sandbox", "input_check", "tool_call"]);
});

test("A7.1 a denied call is not checked; no input_check event", () => {
  const { events } = runWith(VALIDATE_TAPE([{ tools: [["read_file", {}]] }, DONE]),
    { validate_inputs: {}, permissions: { mode: "deny", rules: [] } });
  assert.equal(ofKind(events, "input_check").length, 0);
});

test("A7.1 a sandbox-blocked call is not checked", () => {
  const { events } = runWith(VALIDATE_TAPE([{ tools: [["read_file", { path: "/etc/x" }]] }, DONE]),
    { validate_inputs: {}, sandbox: { egress: [] } });
  assert.equal(ofKind(events, "input_check").length, 0);
});

// ---------- A7.2: split results

const TWO = { tools: [["read_file", { path: "a.txt" }], ["read_file", { path: "b.txt" }]] };

test("A7.2 split results: one user message per result, in call order", () => {
  const { wire } = runWith({ workspace: WS, script: [TWO, DONE] }, { split_results: {} });
  const msgs = wire[2].messages;
  assert.equal(msgs.length, 4, "task, assistant, one result, one result");
  assert.equal(msgs[2].role, "user");
  assert.equal(msgs[3].role, "user");
  assert.deepEqual(msgs[2].content.map((b) => b.tool_use_id), ["toolu_1_1"]);
  assert.deepEqual(msgs[3].content.map((b) => b.tool_use_id), ["toolu_1_2"]);
});

test("A7.2 split results are not a missing-result error (the run of user messages counts)", () => {
  const { result } = runWith({ workspace: WS, script: [TWO, DONE] }, { split_results: {} });
  assert.equal(result.status, "done");
});

test("A7.2 the missing-result check still fires for an id that no message in the run answers", () => {
  // first_block_only reads one block; the other has no result in any message after the reply.
  const { events, result } = runWith({ workspace: WS, script: [TWO, DONE] }, { split_results: {}, first_block_only: {} });
  assert.equal(result.status, "error");
  assert.equal(ofKind(events, "model_error")[0].message, "tool_use ids were found without tool_result blocks immediately after");
});

test("A7.2 results_split: true when the request has two user messages in a row", () => {
  const script = [TWO, { when: [{ if: "results_split", then: [{ say: "serial", tools: [["read_file", { path: "a.txt" }]] }] }, { else: [{ say: "parallel", stop: "end_turn" }] }] }, DONE];
  const split = runWith({ workspace: WS, script }, { split_results: {} });
  assert.equal(modelReplies(split.events)[1].text, "serial");
  const plain = runWith({ workspace: WS, script }, {});
  assert.equal(modelReplies(plain.events)[1].text, "parallel");
});

test("A7.2 results_split is false when the history is not resent (the request holds the task only)", () => {
  const script = [TWO, { when: [{ if: "results_split", then: [{ say: "serial", stop: "end_turn" }] }, { else: [{ say: "fallback", stop: "end_turn" }] }] }];
  const { events } = runWith({ workspace: WS, script }, { split_results: {}, history: { resend: false } });
  assert.equal(modelReplies(events)[1].text, "fallback");
});

test("A7.2 the results_split condition is refused with arguments", () => {
  assert.throws(() => tapeWith({ script: [{ when: [{ if: "results_split:x", then: [DONE] }, { else: [DONE] }] }, DONE] }), /unknown condition/);
});

// ---------- A7.3: effort

const EFFORT = { default: "medium", thinking_tokens: { low: 100, medium: 400, high: 500, xhigh: 1500, max: 2400 } };

test("A7.3 the tape's effort block is validated: levels, integers, and no extra keys", () => {
  assert.equal(tapeWith().effort, null, "absent means null");
  assert.deepEqual(tapeWith({ effort: EFFORT }).effort, { default: "medium", thinking_tokens: EFFORT.thinking_tokens });
  assert.doesNotThrow(() => tapeWith({ effort: { thinking_tokens: { high: 3 } } }), "every field is optional");
  assert.throws(() => tapeWith({ effort: { default: "ultra" } }), /effort default must be one of/);
  assert.throws(() => tapeWith({ effort: { thinking_tokens: { ultra: 1 } } }), /ultra/);
  assert.throws(() => tapeWith({ effort: { thinking_tokens: { high: -1 } } }), /high/);
  assert.throws(() => tapeWith({ effort: { thinking_tokens: { high: 1.5 } } }), /high/);
  assert.throws(() => tapeWith({ effort: { level: "high" } }), /level/);
});

test("A7.3 the board's effort level must be a level name", () => {
  assert.throws(() => boardWithEffort("ultra"), /level must be one of/);
  assert.deepEqual(boardWithEffort("low").modules.effort, { level: "low" });
});
import { loadBoard } from "../board.js";
function boardWithEffort(level) { return loadBoard({ id: "e", modules: { effort: { level } } }); }

test("A7.3 thinking tokens count as output: usage, output_tokens_details, and 20 ms each in latency", () => {
  const plain = runWith({ workspace: WS, script: [READ(), DONE] }, {});
  const withEffort = runWith({ workspace: WS, script: [READ(), DONE], effort: { default: "high", thinking_tokens: { high: 500 } } }, {});
  const a = modelReplies(plain.events)[0];
  const b = modelReplies(withEffort.events)[0];
  assert.equal(b.usage.output_tokens - a.usage.output_tokens, 500);
  assert.deepEqual(b.usage.output_tokens_details, { thinking_tokens: 500 });
  assert.equal(b.t - a.t, 20 * 500, "latency grows by 20 ms per output token");
});

test("A7.3 without an effort block there is no output_tokens_details", () => {
  const { events, wire } = runWith({ workspace: WS, script: [READ(), DONE] }, {});
  assert.equal("output_tokens_details" in modelReplies(events)[0].usage, false);
  assert.equal("output_tokens_details" in wire[1].usage, false);
});

test("A7.3 the level in force: board, then tape default, then high", () => {
  const tape = { workspace: WS, script: [READ(), DONE], effort: EFFORT };
  assert.equal(modelReplies(runWith(tape, { effort: { level: "low" } }).events)[0].usage.output_tokens_details.thinking_tokens, 100, "board wins");
  assert.equal(modelReplies(runWith(tape, {}).events)[0].usage.output_tokens_details.thinking_tokens, 400, "tape default medium");
  const noDefault = { workspace: WS, script: [READ(), DONE], effort: { thinking_tokens: { high: 900 } } };
  assert.equal(modelReplies(runWith(noDefault, {}).events)[0].usage.output_tokens_details.thinking_tokens, 900, "high when neither is given");
});

test("A7.3 a level missing from the table gives 0 thinking tokens", () => {
  const tape = { workspace: WS, script: [READ(), DONE], effort: { default: "low", thinking_tokens: { high: 900 } } };
  assert.equal(modelReplies(runWith(tape, {}).events)[0].usage.output_tokens_details.thinking_tokens, 0);
});

test("A7.3 thinking is not in the content and never enters the history", () => {
  const { wire } = runWith({ workspace: WS, script: [READ(), DONE], effort: EFFORT }, {});
  assert.equal(JSON.stringify(wire[1].content).includes("thinking"), false);
  assert.deepEqual(wire[2].messages[1].content, wire[1].content, "the assistant message is the reply, without thinking");
});

test("A7.3 effort_gte compares the level in force", () => {
  const script = [{ when: [{ if: "effort_gte:high", then: [{ say: "deep", stop: "end_turn" }] }, { else: [{ say: "quick", stop: "end_turn" }] }] }];
  assert.equal(modelReplies(runWith({ workspace: WS, script, effort: EFFORT }, {}).events)[0].text, "quick", "medium in force");
  assert.equal(modelReplies(runWith({ workspace: WS, script, effort: EFFORT }, { effort: { level: "xhigh" } }).events)[0].text, "deep", "board xhigh");
});

test("A7.3 effort_gte refuses a name that is not a level", () => {
  assert.throws(() => tapeWith({ script: [{ when: [{ if: "effort_gte:none", then: [DONE] }, { else: [DONE] }] }, DONE] }), /unknown condition/);
});

test("A7.3 output_config is in the wire request when the board sets effort, and only then", () => {
  const board = runWith({ workspace: WS, script: [READ(), DONE] }, { effort: { level: "low" } }).wire;
  assert.deepEqual(board[0].output_config, { effort: "low" });
  assert.deepEqual(board[2].output_config, { effort: "low" });
  const tapeOnly = runWith({ workspace: WS, script: [READ(), DONE], effort: EFFORT }, {}).wire;
  assert.equal("output_config" in tapeOnly[0], false, "a tape effort block alone does not set output_config");
});

test("A7.3 cost counts the thinking tokens at the output price", () => {
  const { events, result } = runWith({ workspace: WS, script: [DONE], effort: { default: "high", thinking_tokens: { high: 500 } } }, {});
  const r = modelReplies(events)[0];
  assert.equal(r.cost, r.usage.input_tokens * 1000 + r.usage.output_tokens * 1000, "fixed test prices");
  assert.equal(result.tokens.output, r.usage.output_tokens);
});

// ---------- the fixtures: one per module, run on a board with it and without

const FIX = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const fixtureTape = (name) => JSON.parse(readFileSync(FIX(`${name}.json`), "utf8"));
const fixtureBoard = (name) => JSON.parse(readFileSync(FIX(`${name}.board.json`), "utf8"));

test("the validate fixture: two invalid calls on the module board, none on the plain board", () => {
  const on = runTrial(fixtureTape("a7-validate"), fixtureBoard("a7-validate-on"), 1, { facts: FACTS });
  const off = runTrial(fixtureTape("a7-validate"), fixtureBoard("a7-validate-off"), 1, { facts: FACTS });
  assert.equal(ofKind(on.events, "input_check").filter((e) => !e.valid).length, 2);
  assert.equal(ofKind(off.events, "input_check").length, 0);
  assert.equal(on.result.status, "done");
});

test("the split fixture: the scripted model slips to one call at a time only when results are split", () => {
  const on = runTrial(fixtureTape("a7-split"), fixtureBoard("a7-split-on"), 1, { facts: FACTS });
  const off = runTrial(fixtureTape("a7-split"), fixtureBoard("a7-split-off"), 1, { facts: FACTS });
  assert.equal(modelReplies(on.events)[1].text, "One at a time from now.");
  assert.equal(modelReplies(off.events)[1].text, "Still in parallel.");
});

test("the effort fixture: the board sets the level in force, and the thinking tokens follow it", () => {
  const low = runTrial(fixtureTape("a7-effort"), fixtureBoard("a7-effort-low"), 1, { facts: FACTS });
  const max = runTrial(fixtureTape("a7-effort"), fixtureBoard("a7-effort-max"), 1, { facts: FACTS });
  const off = runTrial(fixtureTape("a7-effort"), fixtureBoard("a7-effort-off"), 1, { facts: FACTS });
  assert.equal(modelReplies(low.events)[0].usage.output_tokens_details.thinking_tokens, 100);
  assert.equal(modelReplies(max.events)[0].usage.output_tokens_details.thinking_tokens, 2400);
  assert.equal(modelReplies(off.events)[0].usage.output_tokens_details.thinking_tokens, 400, "the tape default");
  assert.equal(modelReplies(max.events)[0].text, "Thinking hard.", "effort_gte:high holds at max");
  assert.equal(modelReplies(low.events)[0].text, "Quick look.", "effort_gte:high does not hold at low");
});

// ---------- the shared backoff rule (ENGINE 7.3), exported for hx-outage

import { backoffWait } from "../index.js";
import { createPrng } from "../prng.js";

test("7.3 backoffWait: base doubles per attempt and is capped; jitter none is the base", () => {
  const retry = { max_attempts: 9, base_ms: 100, cap_ms: 500, jitter: "none" };
  const prng = createPrng(1);
  assert.equal(backoffWait(1, retry, prng, 0), 100);
  assert.equal(backoffWait(2, retry, prng, 0), 200);
  assert.equal(backoffWait(3, retry, prng, 0), 400);
  assert.equal(backoffWait(4, retry, prng, 0), 500, "capped at cap_ms");
});

test("7.3 backoffWait: retry_after_ms is a floor", () => {
  const retry = { max_attempts: 9, base_ms: 100, cap_ms: 500, jitter: "none" };
  assert.equal(backoffWait(1, retry, createPrng(1), 2000), 2000);
  assert.equal(backoffWait(1, retry, createPrng(1), 50), 100);
});

test("7.3 backoffWait: jitter full draws below(base + 1), and only then", () => {
  const retry = { max_attempts: 9, base_ms: 100, cap_ms: 500, jitter: "full" };
  const a = createPrng(7);
  const b = createPrng(7);
  assert.equal(backoffWait(2, retry, a, 0), b.below(201), "the same draw as below(base + 1)");
  const none = { ...retry, jitter: "none" };
  const c = createPrng(9);
  const d = createPrng(9);
  backoffWait(2, none, c, 0);
  assert.equal(c.below(1000), d.below(1000), "jitter none draws nothing");
});

test("7.3 the harness uses the exported rule: a retried run has the same retry_wait as backoffWait", () => {
  const retry = { max_attempts: 3, base_ms: 100, cap_ms: 500, jitter: "full" };
  const { events } = runWith({ workspace: WS, script: [{ error: "overloaded", error_ms: 300 }, DONE] }, { retry });
  const wait = ofKind(events, "retry_wait")[0];
  assert.equal(wait.wait_ms, backoffWait(1, retry, createPrng(1), 0), "the run uses seed 1 (runWith default)");
});
