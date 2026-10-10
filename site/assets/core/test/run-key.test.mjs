// Tests for the Run key's pure helpers (backlog B-13): the output comparison as tools/check_snippets.py makes it, the
// line under the output for data-output and data-raises, and what the key says while Python loads, runs and fails.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DIFFER_COPY, FAILED_COPY, LOADING_COPY, MATCH_COPY, NOT_RAISES_COPY, RAISES_COPY, RUNNING_COPY, SLOW_COPY,
  TIMEOUT_COPY, keyStatus, matchLine, normalizeOutput, raisedLine,
} from "../shell/run-pure.js";

test("the output is compared as check_snippets compares it", () => {
  assert.equal(normalizeOutput("done\n"), "done");
  assert.equal(normalizeOutput("done"), "done");
  assert.equal(normalizeOutput("a  \r\nb\t\n\n\n"), "a\nb");
  assert.equal(normalizeOutput("a\rb"), "a\nb");
  assert.equal(normalizeOutput(""), "");
});

test("a snippet with data-output says whether its output matches", () => {
  assert.equal(matchLine({ stdout: "done\n", error: "" }, { output: "done" }), MATCH_COPY);
  assert.equal(matchLine({ stdout: "done", error: "" }, { output: "done\n" }), MATCH_COPY);
  assert.equal(matchLine({ stdout: "no\n", error: "" }, { output: "done" }), DIFFER_COPY);
  assert.equal(matchLine({ stdout: "", error: "" }, { output: "done" }), DIFFER_COPY);
});

test("a run that raises does not match its output, even when the printed text does", () => {
  assert.equal(matchLine({ stdout: "done\n", error: "ValueError" }, { output: "done" }), DIFFER_COPY);
});

test("without data-output or data-raises the key says nothing about the output", () => {
  assert.equal(matchLine({ stdout: "anything\n", error: "" }, {}), null);
  assert.equal(matchLine({ stdout: "anything\n", error: "" }, { output: null, raises: null }), null);
});

test("data-raises: the key says whether the snippet raised that error", () => {
  assert.equal(matchLine({ stdout: "", error: "ValueError" }, { raises: "ValueError" }), RAISES_COPY);
  assert.equal(matchLine({ stdout: "", error: "KeyError" }, { raises: "ValueError" }), NOT_RAISES_COPY);
  assert.equal(matchLine({ stdout: "x\n", error: "" }, { raises: "ValueError" }), NOT_RAISES_COPY);
});

test("the line for a raised error names the exception", () => {
  assert.equal(raisedLine("ValueError"), "Raised ValueError.");
  assert.equal(raisedLine(""), "");
});

test("while a run is in hand the key shows loading, then slow with Try again, then failed with Try again", () => {
  assert.deepEqual(keyStatus({ running: true, state: "loading", slow: false }), { text: LOADING_COPY, retry: false });
  assert.deepEqual(keyStatus({ running: true, state: "loading", slow: true }), { text: SLOW_COPY, retry: true });
  assert.deepEqual(keyStatus({ running: true, state: "failed", slow: false }), { text: FAILED_COPY, retry: true });
  assert.deepEqual(keyStatus({ running: true, state: "ready", slow: false }), { text: RUNNING_COPY, retry: false });
});

test("a settled run leaves its message; Try again shows only when Python failed", () => {
  assert.deepEqual(keyStatus({ running: false, state: "ready", slow: false, message: TIMEOUT_COPY }),
    { text: TIMEOUT_COPY, retry: false });
  assert.deepEqual(keyStatus({ running: false, state: "failed", slow: false, message: FAILED_COPY }),
    { text: FAILED_COPY, retry: true });
  assert.equal(keyStatus({ running: false, state: "ready", slow: false, message: null }), null);
});

test("the still-loading, failed and timeout copy is hx-kata's", () => {
  const kata = readFileSync(new URL("../../components/hx-kata.js", import.meta.url), "utf8");
  for (const copy of [SLOW_COPY, FAILED_COPY, TIMEOUT_COPY]) {
    assert.ok(kata.includes(copy), `hx-kata.js no longer says: ${copy}`);
  }
});
