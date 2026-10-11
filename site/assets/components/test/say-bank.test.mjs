// The question bank (BP-5.4 §1) and the Design Room prompts (§2): hx-say's bank order and filters, the generated bank
// (40 prompts or more, every course wire and every I5 kind), and the six I5 design prompts against hx-design's own check.
// The components define custom elements at import time, so DOM globals are stubbed.
// Run: node --test "site/assets/components/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { BANK_FILTERS, bankOrder, checkSay, filterLabel } = await import("../hx-say.js");
const { checkDesign, WIRE_IDS } = await import("../hx-design.js");

const data = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const WIRES = ["control", "context", "loop", "errors", "tools", "permissions", "verify", "observe"];
const KINDS = ["design", "debugging", "behavioral"];
const p = (id, wire) => ({ id, wire, objectives: [], prompt: id, model_answer: "x", rubric: ["a", "b", "c", "d"] });
const say = (item) => ({ kind: "say", detail: { item: item.id, ticked: 1, total: 4 } });

test("bankOrder: prompts not answered yet come first, in bank order", () => {
  const bank = [p("a", "loop"), p("b", "loop"), p("c", "loop")];
  assert.deepEqual(bankOrder(bank, [say(bank[1])], "all").map((x) => x.id), ["a", "c", "b"]);
});

test("bankOrder: answered prompts follow, the one answered longest ago first", () => {
  const bank = [p("a", "loop"), p("b", "loop"), p("c", "loop")];
  const evidence = [say(bank[2]), { kind: "shift", detail: {} }, say(bank[0])];
  assert.deepEqual(bankOrder(bank, evidence, "all").map((x) => x.id), ["b", "c", "a"],
    "c was answered before a, so c comes before a; the list's last entry for a is the latest answer");
});

test("bankOrder: a filter keeps one wire or one kind of prompt, and an empty filter gives nothing", () => {
  const bank = [p("a", "loop"), p("b", "design"), p("c", "loop")];
  assert.deepEqual(bankOrder(bank, [], "loop").map((x) => x.id), ["a", "c"]);
  assert.deepEqual(bankOrder(bank, [], "design").map((x) => x.id), ["b"]);
  assert.deepEqual(bankOrder(bank, [], "verify"), []);
  assert.deepEqual(bankOrder([], [], "all"), []);
});

test("the filters are all, the eight wires, and the three I5 kinds, each with a label", () => {
  assert.equal(BANK_FILTERS[0], "all");
  assert.deepEqual(BANK_FILTERS.slice(1, 9), WIRES);
  assert.deepEqual(BANK_FILTERS.slice(9), KINDS);
  assert.equal(filterLabel("all"), "All prompts");
  assert.equal(filterLabel("design"), "Design");
  assert.equal(filterLabel("permissions"), "Permissions", "a wire is labelled by its name, capitalised");
});

test("the generated bank: 40 prompts or more, unique ids, each a valid prompt", () => {
  const bank = data("../../../data/say/bank.json");
  assert.ok(bank.length >= 40, `the bank holds ${bank.length} prompts, 40 or more are needed`);
  assert.equal(new Set(bank.map((x) => x.id)).size, bank.length, "every prompt id is unique");
  bank.forEach(checkSay);
});

test("the generated bank covers every course wire, and design, debugging and behavioral", () => {
  const bank = data("../../../data/say/bank.json");
  const tags = new Set(bank.map((x) => x.wire));
  for (const wire of WIRES) assert.ok(tags.has(wire), `no bank prompt for wire ${wire}`);
  for (const kind of KINDS) assert.ok(tags.has(kind), `no bank prompt of kind ${kind}`);
  for (const kind of KINDS) {
    assert.ok(bank.filter((x) => x.wire === kind).every((x) => x.module === "I5"), `${kind} prompts are I5's`);
  }
});

test("the I5 bank prompts: six design, six debugging, four behavioral, and each carries I5 objectives", () => {
  const i5 = data("../../../data/say/I5.json");
  assert.equal(i5.length, 16);
  i5.forEach(checkSay);
  const count = (wire) => i5.filter((x) => x.wire === wire).length;
  assert.equal(count("design"), 6);
  assert.equal(count("debugging"), 6);
  assert.equal(count("behavioral"), 4);
  assert.ok(i5.every((x) => x.objectives.every((o) => o.startsWith("I5.o"))));
});

test("the six I5 design prompts pass hx-design's own check: clarifying questions, eight wires, risks, cost, rollout", () => {
  const design = data("../../../data/design/I5.json").prompts;
  assert.equal(design.length, 6);
  for (const item of design) {
    checkDesign(item);
    assert.ok(item.objectives.includes("I5.o3"), `${item.id} is I5.o3`);
    assert.deepEqual(Object.keys(item.wires).sort(), [...WIRE_IDS].sort(), `${item.id} answers all eight wires`);
  }
  assert.equal(new Set(design.map((x) => x.id)).size, 6);
});

test("bankOrder with an order: only the prompts in it are new, in that order; answered ones follow as before (D-062)", () => {
  const prompts = [
    { id: "p1", wire: "loop" }, { id: "p2", wire: "loop" }, { id: "p3", wire: "tools" }, { id: "p4", wire: "tools" },
  ];
  const evidence = [{ kind: "say", detail: { item: "p2" } }];
  // p1 and p3 are the pool's new prompts in that order; p4 is outside the pool and is not shown as new.
  assert.deepEqual(bankOrder(prompts, evidence, "all", ["p3", "p1"]).map((p) => p.id), ["p3", "p1", "p2"]);
  // Without an order the bank is as before: every unanswered prompt, in bank order.
  assert.deepEqual(bankOrder(prompts, evidence).map((p) => p.id), ["p1", "p3", "p4", "p2"]);
});
