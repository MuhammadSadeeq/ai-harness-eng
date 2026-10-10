// Pure tests for lib/board-tags.js: comes-in against D-043, the learner's board, the scenario labels, the board
// changes for "Plug it in", and the turn steps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  comesIn, learnerBoard, dueByWire, wireLevel, tagLabel, scenarioBoard, boardChanges, boardRows, changeText,
  turnCount, turnEvents, stepText, taggedModules,
} from "../lib/board-tags.js";
import { formatInt } from "../lib/format.js";

const load = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));
const course = load("../../../data/course.json");
const boardFile = (id) => load(`../../../data/scenarios/boards/${id}.json`);

test("comes-in matches D-043 for all eight wires", () => {
  const expected = { control: "C1", context: "A3", loop: "A4", errors: "C6", tools: "A5", permissions: "C9", verify: "C11", observe: "C12" };
  for (const [wire, id] of Object.entries(expected)) assert.equal(comesIn(course, wire), id, wire);
});

test("there are 29 tagged core modules, one tag each", () => {
  const tagged = taggedModules(course);
  assert.equal(tagged.length, 29);
  for (const mod of tagged) assert.ok(mod.tag.label && mod.tag.wire, mod.id);
});

test("an empty board has no earned tags; done modules plug onto their wires", () => {
  const empty = learnerBoard(course, { modules: {} });
  assert.equal(empty.earned, 0);
  assert.equal(empty.total, 29);
  const done = learnerBoard(course, { modules: { A3: { status: "done" }, A4: { status: "started" }, A5: { status: "done" } } });
  assert.equal(done.earned, 2);
  assert.deepEqual(done.byWire.context.map((t) => t.id), ["A3"]);
  assert.deepEqual(done.byWire.tools.map((t) => t.id), ["A5"]);
  assert.equal(wireLevel(course, "context", { modules: { A3: { status: "done" } } }), "L1 · can explain");
  assert.equal(wireLevel(course, "context", { modules: {} }), "Not started");
});

test("a card belongs to the module named by its id's prefix before the first dash", () => {
  const today = "2026-10-10";
  const cards = {
    "a3-c1": { due: "2026-10-09" }, // A3 is a context module
    "a3-c2": { due: "2026-10-12" }, // not yet due
    "s0-c1": { due: "2026-10-10" }, // S0 has no tag: its first wire
    "lab-c1": { due: "2026-10-09" }, // not a course module: no wire
  };
  const counts = dueByWire(course, cards, today);
  assert.equal(counts.context, 1);
  assert.equal(counts.verify, 1, "S0's first wire");
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 2);
});

test("scenario labels are exact and numbers carry separators", () => {
  assert.equal(tagLabel("turn_limit", { max_turns: 12 }), "turn limit 12");
  assert.equal(tagLabel("token_budget", { max_tokens: 60000 }), "budget 60,000");
  assert.equal(tagLabel("loop_detect", { window: 3 }), "loop guard 3");
  assert.equal(tagLabel("close_books", {}), "close the books");
  assert.equal(tagLabel("output_cap", { max_tokens: 2000 }), "output cap 2,000");
  assert.equal(tagLabel("retry", { max_attempts: 3 }), "retry ×3");
  assert.equal(tagLabel("breaker", { threshold: 3 }), "breaker 3");
  assert.equal(tagLabel("permissions", { mode: "ask", rules: [] }), "ask by default");
  assert.equal(tagLabel("permissions", { mode: "ask", rules: [{}, {}, {}, {}] }), "4 rules, ask by default");
  assert.equal(tagLabel("permissions", { mode: "ask", rules: [{}] }), "1 rule, ask by default");
  assert.equal(tagLabel("sandbox", {}), "sandbox");
  assert.equal(tagLabel("verify_gate", { max_feedback: 2 }), "verify gate");
  assert.equal(tagLabel("rules_file", {}), "rules file");
  assert.equal(tagLabel("redact", { patterns: ["x"] }), "redact");
  assert.equal(formatInt(1234567), "1,234,567");
  assert.throws(() => tagLabel("nope", {}), /unknown board module/);
});

test("a scenario board puts each module on its wire", () => {
  const b2 = scenarioBoard(boardFile("b2-new"));
  assert.deepEqual(b2.byWire.loop.map((t) => t.label), ["turn limit 12", "budget 60,000"]);
  assert.equal(b2.count, 2);
  assert.throws(() => scenarioBoard({ modules: { unknown_module: {} } }), /unknown board module/);
});

test("Plug it in adds the modules that are new or changed on the new board", () => {
  const changed = boardChanges(boardFile("c9-old"), boardFile("c9-new"));
  assert.deepEqual(changed, ["permissions"]);
  assert.deepEqual(boardChanges(boardFile("b2-old"), boardFile("b2-new")), ["turn_limit", "token_budget"]);
  assert.deepEqual(boardChanges({ modules: { a: { x: 1 } } }, { modules: { a: { x: 1 }, b: { y: 2 } } }), ["b"]);
});

test("the compare rows: one per wire that differs, in clock order, with the words of each side", () => {
  const rows = boardRows(course, boardFile("b2-old"), boardFile("b2-new"));
  assert.deepEqual(rows.map((r) => r.wire.id), ["loop"]);
  assert.equal(changeText(rows[0]), "Loop: nothing → turn limit 12, budget 60,000");
  const c9 = boardRows(course, boardFile("c9-old"), boardFile("c9-new"));
  assert.equal(changeText(c9[0]), "Permissions: ask by default → 4 rules, ask by default");
  assert.deepEqual(boardRows(course, boardFile("c9-new"), boardFile("c9-new")), []);
});

test("turn events and their step text", () => {
  const events = [
    { seq: 0, turn: 0, kind: "run_start", wire: "loop" },
    { seq: 1, turn: 1, kind: "permission", wire: "permissions" },
    { seq: 2, turn: 1, kind: "tool_call", wire: "tools" },
  ];
  assert.equal(turnCount(events), 1);
  assert.equal(turnEvents(events, 1).length, 2);
  assert.equal(stepText(events[1], course), "permission check · Permissions");
});
