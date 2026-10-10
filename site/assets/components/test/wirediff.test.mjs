// Pure tests for lib/wirediff.js: the collapse of unchanged leading messages, new and changed messages, and the
// first turn (no previous request: everything is new).
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffMessages } from "../lib/wirediff.js";

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
