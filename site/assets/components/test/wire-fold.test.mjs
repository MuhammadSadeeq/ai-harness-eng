// The Wire view's folded tools array (lib/wire-hits.js: toolsRange, foldTools). Run: node --test "site/assets/components/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { toolsRange, foldTools, toolUseHits } from "../lib/wire-hits.js";

const request = {
  model: "m", max_tokens: 4096, system: "sys",
  tools: [{ name: "read_file", description: "Read", input_schema: { type: "object", properties: { path: { type: "string" } } } },
    { name: "run_command", description: "Run", input_schema: { type: "object" } }],
  messages: [
    { role: "assistant", content: [{ type: "tool_use", id: "toolu_1_1", name: "read_file", input: { path: "a.txt" } }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1_1", content: "hello" }] },
  ],
};
const text = JSON.stringify(request, null, 2);

test("toolsRange finds the top-level tools array, from its opening line to its closing line", () => {
  const range = toolsRange(text);
  const lines = text.split("\n");
  assert.equal(lines[range.start], '  "tools": [');
  assert.ok(/^ {2}\],?$/.test(lines[range.end]));
  assert.equal(range.comma, true, "tools is followed by messages");
});

test("toolsRange is null when the text has no tools array", () => {
  assert.equal(toolsRange(JSON.stringify({ messages: [] }, null, 2)), null);
});

test("foldTools shows one line for the tools and keeps every other line in order", () => {
  const range = toolsRange(text);
  const folded = foldTools(text, range, "2 definitions, ≈ 40 tokens");
  assert.equal(folded.lines.length, text.split("\n").length - (range.end - range.start));
  assert.equal(folded.lines[range.start], '  "tools": 2 definitions, ≈ 40 tokens,');
  const shown = folded.lines.join("\n");
  assert.ok(!shown.includes('"description": "Read"'), "a definition is folded away");
  assert.ok(!shown.includes('"name": "run_command"'), "the second definition is folded away too");
  assert.ok(folded.lines.join("\n").includes('"messages": ['), "messages stay");
});

test("foldTools maps the lines of the messages to their displayed lines, and folded lines to -1", () => {
  const range = toolsRange(text);
  const folded = foldTools(text, range, "x");
  const full = text.split("\n");
  const messageLine = full.findIndex((l) => l.includes('"tool_use_id": "toolu_1_1"'));
  assert.equal(folded.lines[folded.map[messageLine]], full[messageLine], "a message line is shown at its mapped place");
  assert.equal(folded.map[range.start + 1], -1, "a definition line is folded away");
});

test("the Next tool_use_id finder still finds the same ids in the folded request", () => {
  const hits = toolUseHits(text, JSON.stringify({ content: [] }, null, 2));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, "toolu_1_1");
  const folded = foldTools(text, toolsRange(text), "x");
  assert.equal(folded.lines[folded.map[hits[0].line]].includes("tool_use_id"), true);
});
