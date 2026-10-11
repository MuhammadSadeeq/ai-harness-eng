// lib/trace-check.js (BP-4.0 §4): a JSONL trace against scenarios/trace.schema.json. A good trace (the simulator's own
// output, and the sample the Replay Deck links) passes; each kind of bad line is named with its line number.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runTrial, loadTape, loadBoard } from "../../sim/index.js";
import { checkTrace, kindsOf } from "../lib/trace-check.js";

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const schema = JSON.parse(read("../../../../scenarios/trace.schema.json"));
const facts = JSON.parse(read("../../../../site/data/facts.json"));
const sample = read("../../../labs/data/replay-trace.jsonl");

const good = () => {
  const run = runTrial(
    loadTape(JSON.parse(read("../../../../scenarios/b2-spiral.json"))),
    loadBoard(JSON.parse(read("../../../../scenarios/boards/b2-new.json"))),
    1,
    { facts },
  );
  return run.events.map((event) => JSON.stringify(event));
};

const joined = (lines) => lines.join("\n") + "\n";
const edited = (index, change) => {
  const lines = good();
  const row = JSON.parse(lines[index]);
  lines[index] = JSON.stringify(change(row));
  return joined(lines);
};

test("the simulator's own trace passes, event for event", () => {
  const { events, error } = checkTrace(joined(good()), schema);
  assert.equal(error, null);
  assert.equal(events.length, 100);
});

test("the sample trace the Replay Deck links passes", () => {
  const { events, error } = checkTrace(sample, schema);
  assert.equal(error, null);
  assert.equal(events[0].kind, "run_start");
});

test("a trace with a blank last line still passes; a blank line in the middle is named", () => {
  assert.equal(checkTrace(joined(good()), schema).error, null);
  const lines = good();
  lines.splice(3, 0, "");
  const { error } = checkTrace(joined(lines), schema);
  assert.equal(error.line, 4);
  assert.equal(error.message, "line 4: a blank line");
});

test("a line that is not JSON, or not an object, is named with its number", () => {
  const lines = good();
  lines[1] = "{not json";
  let { error, events } = checkTrace(joined(lines), schema);
  assert.equal(error.line, 2);
  assert.match(error.message, /^line 2: not JSON \(/);
  assert.equal(events.length, 1, "the events before the bad line are kept");
  lines[1] = "[1, 2]";
  ({ error } = checkTrace(joined(lines), schema));
  assert.equal(error.message, "line 2: not a JSON object");
});

test("a sequence gap is named the way the page shows it: seq N follows seq M", () => {
  // Line 4 carries seq 5 after line 3's seq 2: the line's own seq, then the seq it follows.
  const lines = good();
  const four = JSON.parse(lines[3]);
  four.seq = 5;
  lines[3] = JSON.stringify(four);
  const { error } = checkTrace(joined(lines), schema);
  assert.equal(error.line, 4);
  assert.equal(error.message, "line 4: seq 5 follows seq 2");
});

test("the first event must be seq 0", () => {
  const { error } = checkTrace(edited(0, (row) => ({ ...row, seq: 1 })), schema);
  assert.equal(error.message, "line 1: the first event has seq 1; it must be 0");
});

test("a run id that changes partway is named", () => {
  const { error } = checkTrace(edited(2, (row) => ({ ...row, run: "other:other:9" })), schema);
  assert.equal(error.line, 3);
  assert.match(error.message, /^line 3: run other:other:9 differs from run b2-spiral:b2-new:1$/);
});

test("a missing field of the kind is named", () => {
  const { error } = checkTrace(edited(0, (row) => {
    const copy = { ...row };
    delete copy.task;
    return copy;
  }), schema);
  assert.equal(error.message, "line 1: run_start needs task");
});

test("a field of the wrong type is named", () => {
  const { error } = checkTrace(edited(1, (row) => ({ ...row, t: "soon" })), schema);
  assert.equal(error.message, "line 2: prompt_built.t must be integer");
});

test("a value the schema fixes is checked: the wire of run_start is loop", () => {
  const { error } = checkTrace(edited(0, (row) => ({ ...row, wire: "tools" })), schema);
  assert.equal(error.message, "line 1: run_start.wire must be \"loop\"");
});

test("a field the schema does not allow is named", () => {
  const { error } = checkTrace(edited(0, (row) => ({ ...row, extra: 1 })), schema);
  assert.equal(error.message, "line 1: run_start has a field the schema does not allow: extra");
});

test("an unknown kind is named", () => {
  const { error } = checkTrace(edited(0, (row) => ({ ...row, kind: "not_a_kind" })), schema);
  assert.equal(error.message, "line 1: kind \"not_a_kind\" is not a trace kind");
});

test("the kinds are the ones the schema lists", () => {
  const kinds = kindsOf(schema);
  assert.ok(kinds.includes("run_start") && kinds.includes("run_end") && kinds.includes("tool_call"));
  assert.equal(new Set(kinds).size, kinds.length, "each kind is listed once");
});
