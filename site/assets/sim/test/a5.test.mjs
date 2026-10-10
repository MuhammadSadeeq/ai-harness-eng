// ENGINE amendment A5 (docs/ENGINE.md, Amendments): history resend off, the history_lt condition,
// first_block_only. One group of tests per item, then the loader and the guard.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tapeWith, boardWith, runWith, kindsOf, ofKind } from "./helpers.mjs";

const READ = (path = "a.txt") => ({ say: "read", tools: [["read_file", { path }]] });
const DONE = { say: "done", stop: "end_turn" };
const NO_RESEND = { history: { resend: false } };
const toolCalls = (events) => ofKind(events, "tool_call");

// ---------- loader (board modules and the tape condition)

test("A5 loader: history {resend: false} and {resend: true} load; any other shape is refused", () => {
  assert.deepEqual(boardWith(NO_RESEND).modules, { history: { resend: false } });
  assert.deepEqual(boardWith({ history: { resend: true } }).modules, { history: { resend: true } });
  assert.throws(() => boardWith({ history: {} }), /resend must be true or false/);
  assert.throws(() => boardWith({ history: { resend: "no" } }), /resend must be true or false/);
  assert.throws(() => boardWith({ history: { resend: false, extra: 1 } }), /extra/);
});

test("A5.1 {\"resend\": true} behaves as absent: every request carries the whole history", () => {
  const { wire } = runWith({ script: [READ(), DONE] }, { history: { resend: true } });
  assert.equal(wire[2].messages.length, 3);
});

test("A5 loader: first_block_only {} loads; parameters are refused", () => {
  assert.deepEqual(boardWith({ first_block_only: {} }).modules, { first_block_only: {} });
  assert.throws(() => boardWith({ first_block_only: { x: 1 } }), /x/);
});

test("A5 loader: history_lt:<n> is a valid condition; a negative or non-integer n is refused", () => {
  const when = (cond) => ({ when: [{ if: cond, then: [DONE] }, { else: [DONE] }] });
  assert.doesNotThrow(() => tapeWith({ script: [when("history_lt:0"), DONE] }));
  assert.doesNotThrow(() => tapeWith({ script: [when("history_lt:12"), DONE] }));
  assert.throws(() => tapeWith({ script: [when("history_lt:-1"), DONE] }), /unknown condition/);
  assert.throws(() => tapeWith({ script: [when("history_lt:x"), DONE] }), /unknown condition/);
  assert.throws(() => tapeWith({ script: [when("history_lt:01"), DONE] }), /unknown condition/);
});

// ---------- item 1: history {"resend": false}

test("A5.1 without resend, every request carries only the task message", () => {
  const { wire, events } = runWith({ script: [READ(), DONE] }, NO_RESEND);
  assert.equal(wire.length, 4, "two calls: a request and a response each");
  assert.equal(wire[0].messages.length, 1);
  assert.equal(wire[2].messages.length, 1, "the second request does not resend the first reply or its results");
  assert.deepEqual(wire[2].messages[0], { role: "user", content: [{ type: "text", text: "do it" }] });
  assert.equal(toolCalls(events).length, 1, "the tool still runs: the harness keeps its own history");
});

test("A5.1 with resend (the default), the second request carries the whole history", () => {
  const { wire } = runWith({ script: [READ(), DONE] }, {});
  assert.equal(wire[2].messages.length, 3, "task, assistant reply, results");
});

test("A5.1 prompt_built names the history layer as not resent, and the prompt is smaller", () => {
  const plain = runWith({ script: [READ(), DONE] }, {}).events;
  const off = runWith({ script: [READ(), DONE] }, NO_RESEND).events;
  const layersOf = (events) => ofKind(events, "prompt_built").map((e) => e.layers);
  assert.deepEqual(layersOf(plain)[1].slice(-1), ["history"]);
  assert.deepEqual(layersOf(off)[1].slice(-1), ["history (not resent)"]);
  const secondTokens = (events) => ofKind(events, "prompt_built")[1].tokens;
  assert.ok(secondTokens(off) < secondTokens(plain), "the second prompt is counted on the sent messages only");
  const check = ofKind(off, "context_check")[1];
  assert.equal(check.tokens, secondTokens(off), "context_check uses the same sent request");
});

test("A5.1 the last_* conditions still read the full history", () => {
  // The read of a missing file gives an is_error result. The next step asks whether the last user
  // message had one: that is read from the full history even though nothing of it is resent.
  const script = [
    READ("missing.txt"),
    { when: [
      { if: "last_result_error", then: [{ say: "retry", tools: [["read_file", { path: "a.txt" }]] }] },
      { else: [{ say: "gave up", stop: "end_turn" }] },
    ] },
    DONE,
  ];
  const { events } = runWith({ script }, NO_RESEND);
  const paths = toolCalls(events).map((e) => e.input.path);
  assert.deepEqual(paths, ["missing.txt", "a.txt"], "last_result_error saw the error in the full history");
});

// ---------- item 2: history_lt:<n>

test("A5.2 history_lt counts the messages in the request about to be sent", () => {
  // Before the second call: with resend the request has 3 messages; without resend it has 1.
  const script = [
    READ(),
    { when: [
      { if: "history_lt:2", then: [READ()] },
      { else: [DONE] },
    ] },
    DONE,
  ];
  const resend = toolCalls(runWith({ script }, {}).events).length;
  const notResent = toolCalls(runWith({ script }, NO_RESEND).events).length;
  assert.equal(resend, 1, "with resend, 3 messages: the else branch ends the run");
  assert.equal(notResent, 2, "without resend, 1 message: the then branch reads again");
});

test("A5.2 history_lt:1 is false before the first call: the request has the task, one message, and 1 < 1 fails", () => {
  const script = [{ when: [{ if: "history_lt:1", then: [READ()] }, { else: [DONE] }] }, DONE];
  assert.equal(toolCalls(runWith({ script }, {}).events).length, 0);
  assert.equal(toolCalls(runWith({ script }, NO_RESEND).events).length, 0);
});

// ---------- item 3: first_block_only {}

// No say: content[0] is the first tool_use block, which is the one the buggy harness reads.
const TWO_READS = {
  tools: [["read_file", { path: "a.txt" }], ["read_file", { path: "b.txt" }]],
};

test("A5.3 first_block_only: the harness runs the first tool_use block only; the next call fails (A5 ruling a)", () => {
  const { events, wire, result } = runWith({ script: [TWO_READS, DONE], workspace: { "a.txt": "x\n", "b.txt": "y\n" } },
    { first_block_only: {} });
  assert.deepEqual(toolCalls(events).map((e) => e.input.path), ["a.txt"], "b.txt is never read");
  assert.equal(ofKind(events, "permission").length, 1, "one call, one permission decision");
  assert.equal(ofKind(events, "model_reply")[0].tool_uses.length, 2, "model_reply still lists every tool_use");
  assert.equal(wire[1].content.filter((b) => b.type === "tool_use").length, 2, "the stored reply keeps every block");
  assert.equal(wire.length, 2, "the refused second request writes no wire payload (A3.16)");
  assert.equal(result.status, "error", "the second tool_use has no result: the next call is refused");
  const err = ofKind(events, "model_error");
  assert.equal(err.length, 1);
  assert.equal(err[0].type, "invalid_request");
  assert.equal(err[0].message, "tool_use ids were found without tool_result blocks immediately after");
});

test("A5 ruling (a): the missing-result check is not gated on a resume", () => {
  const { result } = runWith({ script: [TWO_READS, DONE], workspace: { "a.txt": "x\n", "b.txt": "y\n" } },
    { first_block_only: {} });
  assert.equal(result.status, "error");
  assert.equal(result.turns, 2, "the refused call still counts as the second turn");
});

test("A5.3 first_block_only: a text block before the tool_use means no call is read", () => {
  // The reply has say (content[0] is text) and a tool_use: the harness found no call.
  const script = [{ say: "Reading.", tools: [["read_file", { path: "a.txt" }]] }];
  const { events, result } = runWith({ script }, { first_block_only: {} });
  assert.equal(toolCalls(events).length, 0, "no tool ran");
  assert.equal(ofKind(events, "permission").length, 0, "no permission was asked");
  assert.equal(result.status, "done", "stop_reason tool_use with no call takes the end_turn branch");
  assert.equal(result.turns, 1);
});

test("A5.3 first_block_only with no call: the verify gate runs, as on end_turn", () => {
  const script = [{ say: "Reading.", tools: [["read_file", { path: "a.txt" }]] }];
  const { events } = runWith({ script, checks: [{ file: "a.txt", contains: "never" }] },
    { first_block_only: {}, verify_gate: { max_feedback: 0 } });
  assert.equal(ofKind(events, "verify").length, 1, "the end_turn branch includes the verify gate");
  assert.equal(ofKind(events, "verify")[0].passed, false);
});

test("A5.3 first_block_only: the calls read are the same as without the module when content[0] is the only tool", () => {
  const one = [{ tools: [["read_file", { path: "a.txt" }]] }, DONE];
  const plain = runWith({ script: one }, {}).events;
  const fbo = runWith({ script: one }, { first_block_only: {} }).events;
  assert.deepEqual(kindsOf(fbo), kindsOf(plain));
  assert.deepEqual(toolCalls(fbo).map((e) => e.input), toolCalls(plain).map((e) => e.input));
});

test("A5 ruling (b): with first_block_only the interrupt's pending lists the calls read", () => {
  const { events, result } = runWith({ script: [TWO_READS, DONE], interrupt: { turn: 1, resume: false } },
    { first_block_only: {} });
  assert.deepEqual(ofKind(events, "interrupt")[0].pending, ["toolu_1_1"], "only the first block was read");
  assert.equal(result.status, "interrupted");
});

test("A5 ruling (b): no call read means the interrupt does not fire that turn", () => {
  const script = [{ say: "Reading.", tools: [["read_file", { path: "a.txt" }]] }, DONE];
  const { events, result } = runWith({ script, interrupt: { turn: 1, resume: false } }, { first_block_only: {} });
  assert.equal(ofKind(events, "interrupt").length, 0, "no tool was read, so the interrupt does not fire");
  assert.equal(result.status, "done", "the turn takes the end_turn branch");
});
