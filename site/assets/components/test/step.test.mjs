// Pure tests for lib/step-logic.js on the compiled steps (site/data/steps/H1.json and H2.json, from steps/): the copy
// text of a chunk, the diff marks, the match with the expected output, and the first line that differs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  addedLines, diffRows, expectedError, matches, firstDifference, prettyScript,
} from "../lib/step-logic.js";

const load = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));
const h1 = load("../../../../site/data/steps/H1.json");
const h2 = load("../../../../site/data/steps/H2.json");

test("the copy text of chunk 1a is exactly the lines it adds, in order", () => {
  const chunk = h1.chunks[0];
  const added = addedLines(chunk);
  assert.equal(added.length, 13);
  assert.equal(added[0], '"""Rein: a small coding-agent harness, built one step at a time.');
  assert.equal(added.join("\n") + "\n", h1.rein.split("\n").slice(0, added.length).join("\n") + "\n");
});

test("a chunk with two hunks copies the added lines of both hunks", () => {
  const chunk = h2.chunks[0];
  assert.equal(chunk.hunks.length, 2);
  const added = addedLines(chunk);
  const perHunk = chunk.hunks.map((hunk) => addedLines({ hunks: [hunk] }).length);
  assert.equal(added.length, perHunk[0] + perHunk[1]);
});

test("diff rows carry the mark and the text; context has no mark", () => {
  const rows = diffRows(h1.chunks[1].hunks[0].diff);
  assert.equal(rows[0].kind, "ctx");
  assert.equal(rows[0].mark, "");
  assert.equal(rows.find((row) => row.kind === "add").mark, "+");
  assert.equal(diffRows("-old line\n+new line\n").map((row) => row.mark).join(","), "−,+");
});

test("the match rule: stdout and no error, or an error name", () => {
  assert.equal(matches({ stdout: "x\n", error: "" }, "x\n"), true);
  assert.equal(matches({ stdout: "x\n", error: "KeyError" }, "x\n"), false);
  assert.equal(matches({ stdout: "", error: "FileNotFoundError" }, "error: FileNotFoundError\n"), true);
  assert.equal(matches({ stdout: "", error: "KeyError" }, "error: FileNotFoundError\n"), false);
  assert.equal(expectedError("error: KeyError\n"), "KeyError");
  assert.equal(expectedError("plain output\n"), null);
});

test("the first differing line is reported with both texts", () => {
  assert.equal(firstDifference("a\nb\n", "a\nb\n"), null);
  assert.deepEqual(firstDifference("a\nB\n", "a\nb\n"), { line: 2, got: "B", expected: "b" });
  assert.deepEqual(firstDifference("a\n", "a\nb\n"), { line: 2, got: "", expected: "b" });
});

test("the checkpoint's expected output of step 2 starts with the task line", () => {
  assert.equal(h2.checkpoint.expected.split("\n")[0], "task     Find the bug in demo/calc.py");
  assert.equal(h2.checkpoint.setup[0], "reset_demo");
});

test("the script pretty-prints with two spaces", () => {
  const scenario = h2.scenarios["scenarios/02_read.json"];
  const pretty = prettyScript(scenario);
  assert.equal(JSON.parse(pretty).replies.length, 3);
  assert.match(pretty, /\n  "replies": \[/);
});
