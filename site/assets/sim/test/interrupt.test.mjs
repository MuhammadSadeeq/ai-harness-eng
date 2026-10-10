import { test } from "node:test";
import assert from "node:assert/strict";
import { runWith, kindsOf, ofKind } from "./helpers.mjs";

const EDIT = { say: "edit", tools: [["edit_file", { path: "a.txt", old_text: "hello", new_text: "bye" }]] };
const READ = { say: "read", tools: [["read_file", { path: "a.txt" }]] };
const DONE = { say: "done", stop: "end_turn" };
const script = [EDIT, READ, DONE];

test("interrupt without resume ends interrupted; the pending call never runs", () => {
  const { events, wire, result } = runWith({ script, interrupt: { turn: 1, resume: false } });
  assert.equal(result.status, "interrupted");
  const i = ofKind(events, "interrupt")[0];
  assert.deepEqual({ by: i.by, pending: i.pending }, { by: "human", pending: ["toolu_1_1"] });
  assert.equal(ofKind(events, "tool_call").length, 0);
  assert.equal(wire.length, 2, "no further model call");
});

test("close_books answers the pending calls; resume then continues, and the edit never ran", () => {
  const { events, wire, result } = runWith({
    script,
    interrupt: { turn: 1, resume: true },
    checks: [{ file: "a.txt", contains: "hello" }],
  }, { close_books: {} });
  assert.equal(result.status, "done");
  assert.equal(result.turns, 3);
  assert.equal(result.passed, true, "the file still says hello");
  assert.equal(ofKind(events, "tool_call").filter((e) => e.tool === "edit_file").length, 0);
  assert.deepEqual(wire[2].messages[2].content[0], {
    type: "tool_result",
    tool_use_id: "toolu_1_1",
    content: "Interrupted by the user before this ran.",
    is_error: true,
  });
});

test("close_books without resume: the pending calls are answered, then the run ends interrupted", () => {
  const { wire, result } = runWith({ script, interrupt: { turn: 1, resume: false } }, { close_books: {} });
  assert.equal(result.status, "interrupted");
  assert.equal(wire.length, 2);
});

test("resume without close_books: the next call fails as invalid_request and the run ends error", () => {
  const { events, wire, result } = runWith({ script, interrupt: { turn: 1, resume: true } });
  const err = ofKind(events, "model_error")[0];
  assert.deepEqual(
    { type: err.type, attempt: err.attempt, message: err.message },
    { type: "invalid_request", attempt: 1, message: "tool_use ids were found without tool_result blocks immediately after" },
  );
  assert.equal(err.t, 300 + ofKind(events, "model_reply")[0].t);
  assert.equal(result.status, "error");
  assert.equal(result.turns, 2);
  assert.equal(wire.length, 2, "the failed call sends nothing");
  assert.deepEqual(kindsOf(events).slice(-3), ["model_error", "trace_write", "run_end"]);
});

test("an interrupt turn with no tool calls does nothing", () => {
  const { events, result } = runWith({ script: [{ say: "just talking", stop: "end_turn" }], interrupt: { turn: 1, resume: false } });
  assert.equal(ofKind(events, "interrupt").length, 0);
  assert.equal(result.status, "done");
});
