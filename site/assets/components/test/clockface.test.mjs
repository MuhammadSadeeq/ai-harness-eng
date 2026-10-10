// Pure tests for lib/clockface.js: the label wrapping that keeps every label inside its line, and the line sizes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapLines, LABEL_CHARS } from "../lib/clockface.js";

test("short text stays on one line", () => {
  assert.deepEqual(wrapLines("comes in C1"), ["comes in C1"]);
});

test("long text wraps at word boundaries into at most two lines", () => {
  const lines = wrapLines("A4 · block-aware reply parser");
  assert.deepEqual(lines, ["A4 · block-aware", "reply parser"]);
  for (const line of lines) assert.ok(line.length <= LABEL_CHARS, line);
});

test("text too long for two lines is cut with an ellipsis on the last line", () => {
  const lines = wrapLines("turn limit 12, budget 60,000, loop guard 3, close the books");
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith("…"));
  for (const line of lines) assert.ok(line.length <= LABEL_CHARS, line);
});
