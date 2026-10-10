import { test } from "node:test";
import assert from "node:assert/strict";
import { Tools, toolDefs, UNKNOWN_LATENCY } from "../tools.js";
import { Vfs } from "../vfs.js";
import { tapeWith } from "./helpers.mjs";

function env(over = {}) {
  const tape = tapeWith({
    workspace: { "a.txt": "hello\n", "b.txt": "x x\n" },
    outside: { "../secret.env": "KEY=1" },
    checks: [{ file: "a.txt", contains: "hello" }],
    test_output: { pass: "2 passed", fail: "1 failed" },
    ...over,
  });
  const vfs = new Vfs(tape.workspace, tape.outside);
  return { tape, vfs, tools: new Tools(tape, vfs) };
}
const call = (name, input) => ({ id: "toolu_1_1", name, input });

test("read_file returns the text, or the exact no-file error", () => {
  const { tools } = env();
  assert.deepEqual(tools.run(call("read_file", { path: "a.txt" })), { ok: true, output: "hello\n" });
  assert.deepEqual(tools.run(call("read_file", { path: "nope.txt" })), {
    ok: false,
    output: "No file at 'nope.txt'. Call list_files to see what exists.",
  });
});

test("write_file reports the character count and then the file reads back", () => {
  const { tools } = env();
  assert.deepEqual(tools.run(call("write_file", { path: "out.txt", content: "hello" })), {
    ok: true,
    output: "Wrote out.txt (5 chars)",
  });
  assert.equal(tools.run(call("read_file", { path: "out.txt" })).output, "hello");
});

test("edit_file: one change, not found, not unique, missing file", () => {
  const { tools, vfs } = env();
  assert.deepEqual(tools.run(call("edit_file", { path: "a.txt", old_text: "hello", new_text: "bye" })), {
    ok: true,
    output: "Edited a.txt (1 change)",
  });
  assert.equal(vfs.read("a.txt"), "bye\n");
  assert.deepEqual(tools.run(call("edit_file", { path: "a.txt", old_text: "zzz", new_text: "q" })), {
    ok: false,
    output: "old_text was not found in a.txt. Read the file again.",
  });
  assert.deepEqual(tools.run(call("edit_file", { path: "b.txt", old_text: "x", new_text: "y" })), {
    ok: false,
    output: "old_text appears 2 times in b.txt; include more context.",
  });
  assert.equal(tools.run(call("edit_file", { path: "gone.txt", old_text: "x", new_text: "y" })).ok, false);
});

test("list_files is sorted and shows only paths inside the workspace", () => {
  const { tools } = env({ workspace: { "b.txt": "1", "a.txt": "2", "sub/c.txt": "3" } });
  assert.deepEqual(tools.run(call("list_files", {})), { ok: true, output: "a.txt\nb.txt\nsub/c.txt" });
});

test("run_command: pytest passes or fails on the checks; ls and cat; anything else is not found", () => {
  const { tools } = env();
  assert.deepEqual(tools.run(call("run_command", { cmd: "pytest" })), { ok: true, output: "2 passed" });
  assert.deepEqual(tools.run(call("run_command", { cmd: "pytest -q" })), { ok: true, output: "2 passed" });
  const bad = env({ checks: [{ file: "a.txt", contains: "bye" }] });
  assert.deepEqual(bad.tools.run(call("run_command", { cmd: "pytest -q" })), { ok: false, output: "1 failed" });
  assert.deepEqual(tools.run(call("run_command", { cmd: "ls" })), { ok: true, output: "a.txt\nb.txt" });
  assert.deepEqual(tools.run(call("run_command", { cmd: "cat a.txt" })), { ok: true, output: "hello\n" });
  assert.equal(tools.run(call("run_command", { cmd: "cat gone" })).output, "No file at 'gone'. Call list_files to see what exists.");
  assert.deepEqual(tools.run(call("run_command", { cmd: "rm -rf build" })), { ok: false, output: "command not found: rm" });
});

test("a check on a missing file fails; no checks means the tests pass", () => {
  const missing = env({ checks: [{ file: "nope.txt", not_contains: "x" }] });
  assert.equal(missing.tools.run(call("run_command", { cmd: "pytest" })).ok, false);
  const none = env({ checks: [] });
  assert.equal(none.tools.run(call("run_command", { cmd: "pytest" })).ok, true);
});

test("custom tools: first matching result, then default; ok flag is kept", () => {
  const { tools, tape } = env({
    custom_tools: [{
      name: "delete_path",
      description: "Delete",
      input_schema: { type: "object" },
      latency_ms: 300,
      results: [{ match: { path: "build" }, output: "Deleted build", ok: true }],
      default: { output: "Nothing there.", ok: false },
    }],
  });
  assert.deepEqual(tools.run(call("delete_path", { path: "build" })), { ok: true, output: "Deleted build" });
  assert.deepEqual(tools.run(call("delete_path", { path: "src" })), { ok: false, output: "Nothing there." });
  assert.equal(tools.latency("delete_path"), 300);
  assert.equal(tape.custom_tools[0].results[0].ok, true);
});

test("latencies: built-ins 100 ms, run_command 2000 ms, unknown tools 100 ms", () => {
  const { tools } = env();
  assert.equal(tools.latency("read_file"), 100);
  assert.equal(tools.latency("run_command"), 2000);
  assert.equal(tools.latency("nope"), UNKNOWN_LATENCY);
  assert.deepEqual(tools.run(call("nope", {})), { ok: false, output: "Unknown tool: nope" });
});

test("tool definitions: listed built-ins in tooldefs order, then custom tools in tape order", () => {
  const tape = tapeWith({
    tools: ["run_command", "read_file"],
    custom_tools: [{ name: "zeta", description: "z", input_schema: { type: "object" } }, { name: "alpha", description: "a", input_schema: { type: "object" } }],
  });
  assert.deepEqual(toolDefs(tape).map((d) => d.name), ["read_file", "run_command", "zeta", "alpha"]);
  assert.deepEqual(Object.keys(toolDefs(tape)[0]), ["name", "description", "input_schema"]);
});
