import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTape } from "../tape.js";
import { loadBoard } from "../board.js";
import { parseStrictJson } from "../pyjson.js";
import { BASE_TAPE, tapeWith } from "./helpers.mjs";

test("defaults: human denies, no interrupt, no faults, no outage, empty lists", () => {
  const t = tapeWith();
  assert.deepEqual(t.human, { default: "deny", deny_if: {}, fatigue: null });
  assert.equal(t.interrupt, null);
  assert.deepEqual(t.faults, []);
  assert.equal(t.outage, null);
  assert.deepEqual(t.workspace, { "a.txt": "hello\n" });
  assert.equal(t.title, "Test tape");
});

test("loading a loaded tape again gives the same tape", () => {
  const once = tapeWith({ human: { default: "approve", fatigue: { after: 2, approve_percent: 50 } } });
  assert.deepEqual(loadTape(once), once);
});

test("integers only: a float is refused with the field named", () => {
  assert.throws(() => tapeWith({ window: 100.5 }), /not an integer: 100.5/);
});

test("ASCII only: a typographic character is refused", () => {
  assert.throws(() => tapeWith({ task: "café" }), /not ASCII/);
});

test("no non-negative canonical-integer keys (A3.13): \"1\" is refused; \"-3\" is fine", () => {
  assert.throws(() => tapeWith({ workspace: { "1": "x" } }), /non-negative canonical-integer key "1"/);
  assert.equal(tapeWith({ workspace: { "-3": "x" } }).workspace["-3"], "x");
});

test("unknown built-in tool, unknown step field, unknown condition, branch sum", () => {
  assert.throws(() => tapeWith({ tools: ["fly"] }), /unknown built-in tool "fly"/);
  assert.throws(() => tapeWith({ script: [{ say: "x", bogus: 1 }] }), /unknown field "bogus"/);
  assert.throws(
    () => tapeWith({ script: [{ when: [{ if: "nope", then: [] }] }] }),
    /unknown condition "nope"/,
  );
  assert.throws(
    () => tapeWith({ script: [{ branch: [{ percent: 60, then: [] }, { percent: 30, then: [] }] }] }),
    /must sum to 100, got 90/,
  );
});

test("unknown error type, bad interrupt turn, bad human default, custom tool name clash", () => {
  assert.throws(() => tapeWith({ script: [{ error: "meltdown" }] }), /unknown error type "meltdown"/);
  assert.throws(() => tapeWith({ interrupt: { turn: 0 } }), /turn must be an integer >= 1/);
  assert.throws(() => tapeWith({ human: { default: "maybe" } }), /default must be "approve" or "deny"/);
  const custom = {
    name: "read_file",
    description: "x",
    input_schema: { type: "object" },
  };
  assert.throws(() => tapeWith({ custom_tools: [custom] }), /tool name "read_file" is already taken/);
});

test("a tape file with a float literal is refused before validation", () => {
  const text = JSON.stringify(BASE_TAPE).replace('"window":100000', '"window":1.0');
  assert.throws(() => parseStrictJson(text), /integers only/);
});

test("boards: unknown module, unknown parameter, bad jitter, defaults", () => {
  assert.throws(() => loadBoard({ id: "b", modules: { warp: {} } }), /unknown module "warp"/);
  assert.throws(() => loadBoard({ id: "b", modules: { turn_limit: { max_turns: 3, extra: 1 } } }), /unknown field "extra"/);
  assert.throws(
    () => loadBoard({ id: "b", modules: { retry: { max_attempts: 3, base_ms: 1, cap_ms: 2, jitter: "half" } } }),
    /jitter must be/,
  );
  const b = loadBoard({ id: "b", modules: { permissions: { mode: "ask", rules: [{ decision: "deny", tool: "*", reason: "no" }] } } });
  assert.deepEqual(b.modules.permissions.rules[0], { decision: "deny", tool: "*", match: {}, reason: "no" });
  assert.equal(b.label, "b");
});
