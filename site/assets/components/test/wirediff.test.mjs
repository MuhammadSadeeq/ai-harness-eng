// Pure tests for lib/wirediff.js: the collapse of unchanged leading messages, new and changed messages, and the
// first turn (no previous request: everything is new).
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffMessages, diffRequest, withoutCacheControl } from "../lib/wirediff.js";

const m = (text) => ({ role: "user", content: text });

test("the first turn has no previous request, so every message is new", () => {
  const diff = diffMessages(undefined, [m("a"), m("b")]);
  assert.equal(diff.unchanged, 0);
  assert.deepEqual(diff.rows.map((r) => r.status), ["new", "new"]);
});

test("unchanged leading messages collapse; appended messages are new", () => {
  const prev = [m("a"), m("b")];
  const diff = diffMessages(prev, [m("a"), m("b"), m("c"), m("d")]);
  assert.equal(diff.unchanged, 2);
  assert.deepEqual(diff.rows, [{ index: 2, status: "new" }, { index: 3, status: "new" }]);
  assert.equal(diff.removed, 0);
});

test("a message that changed in the earlier part is marked changed, and later same messages are shown", () => {
  const prev = [m("a"), m("b"), m("c")];
  const diff = diffMessages(prev, [m("a"), m("B"), m("c"), m("d")]);
  assert.equal(diff.unchanged, 1);
  assert.deepEqual(diff.rows, [
    { index: 1, status: "changed" },
    { index: 2, status: "same" },
    { index: 3, status: "new" },
  ]);
});

test("removed messages are counted", () => {
  const diff = diffMessages([m("a"), m("b"), m("c")], [m("a")]);
  assert.equal(diff.unchanged, 1);
  assert.equal(diff.removed, 2);
  assert.deepEqual(diff.rows, []);
});

test("equality is by content, not by object identity", () => {
  const diff = diffMessages([{ role: "user", content: [{ type: "text", text: "x" }] }], [{ role: "user", content: [{ type: "text", text: "x" }] }]);
  assert.equal(diff.unchanged, 1);
});

// ---------- B-16: the diff over a whole request, one part per tool, the system prompt, one per message

const TOOL = (name, description = "does a thing") => ({ name, description, input_schema: { type: "object", properties: {} } });
const req = (over = {}) => ({
  tools: [TOOL("read_file"), TOOL("run")],
  system: "You are a coding agent.",
  messages: [m("task")],
  ...over,
});
const statuses = (diff) => Object.fromEntries(diff.rows.map((r) => [r.part, r.status]));
const cached = (text) => ({ role: "user", content: [{ type: "text", text, cache_control: { type: "ephemeral" } }] });
const plain = (text) => ({ role: "user", content: [{ type: "text", text }] });

test("B-16: the first turn has no previous request, so every part is added", () => {
  const diff = diffRequest(undefined, req());
  assert.deepEqual(statuses(diff), { "tools[0]": "added", "tools[1]": "added", system: "added", "messages[0]": "added" });
});

test("B-16: identical requests show every part as same", () => {
  const diff = diffRequest(req(), req());
  assert.deepEqual([...new Set(diff.rows.map((r) => r.status))], ["same"]);
});

test("B-16: the system prompt changes on its own (the clock is the invalidator on c4-old)", () => {
  const diff = diffRequest(req({ system: "Current time: t=0 ms\n\nYou are a coding agent." }), req({ system: "Current time: t=1420 ms\n\nYou are a coding agent." }));
  assert.deepEqual(statuses(diff), { "tools[0]": "same", "tools[1]": "same", system: "changed", "messages[0]": "same" });
});

test("B-16: one changed tool definition shows as that tool only", () => {
  const diff = diffRequest(req(), req({ tools: [TOOL("read_file"), TOOL("run", "runs the tests")] }));
  assert.deepEqual(statuses(diff), { "tools[0]": "same", "tools[1]": "changed", system: "same", "messages[0]": "same" });
});

test("B-16: a part that differs only in cache_control is breakpoint moved, not changed", () => {
  const diff = diffRequest(req({ messages: [cached("task")] }), req({ messages: [plain("task"), plain("ok")] }));
  assert.equal(statuses(diff)["messages[0]"], "breakpoint moved");
  assert.equal(statuses(diff)["messages[1]"], "added");
});

test("B-16: a content change with the breakpoint moved is changed, not breakpoint moved", () => {
  const diff = diffRequest(req({ messages: [cached("task")] }), req({ messages: [plain("TASK")] }));
  assert.equal(statuses(diff)["messages[0]"], "changed");
});

test("B-16: removed parts come after the current ones, and are named", () => {
  const diff = diffRequest(req({ messages: [m("a"), m("b")], tools: [TOOL("read_file"), TOOL("run")] }), req({ messages: [m("a")], tools: [TOOL("read_file")] }));
  assert.deepEqual(diff.rows.map((r) => [r.part, r.status]), [
    ["tools[0]", "same"],
    ["system", "same"],
    ["messages[0]", "same"],
    ["tools[1]", "removed"],
    ["messages[1]", "removed"],
  ]);
});

test("B-16: withoutCacheControl removes the key at any depth and keeps everything else", () => {
  const value = { a: 1, cache_control: { type: "ephemeral" }, b: [{ c: "x", cache_control: {} }] };
  assert.deepEqual(withoutCacheControl(value), { a: 1, b: [{ c: "x" }] });
});
