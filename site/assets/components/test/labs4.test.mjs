// Pure logic of BP-3.3 round 2: the desk's levers, fill, recall and questions (hx-desk), and the cache's blocks, prefixes
// and accounting (hx-cacheline, A6.5 via the simulator). The components define custom elements at import time, so DOM
// globals are stubbed. Run: node --test "site/assets/components/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { leverTokens, fillPercent, recallAt, answer, askQuestions } = await import("../hx-desk.js");
const { blockTexts, validOrder, prefixesOf, requestParts, simulateCalls, firstDiffering } = await import("../hx-cacheline.js");
const { resolvePricing } = await import("../../sim/pricing.js");
const facts = JSON.parse(readFileSync(new URL("../../../data/facts.json", import.meta.url), "utf8"));
const { tokens } = await import("../../sim/tokens.js");

const json = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const deskDemo = () => json("../../../labs/data/desk-demo.json");
const cacheDemo = () => json("../../../labs/data/cacheline-demo.json");

test("desk: each lever's tokens (none, removed, capped to a quarter, pointer, summary)", () => {
  const item = { id: "a", label: "A", tokens: 1001, needed: true };
  assert.equal(leverTokens(item, null), 1001);
  assert.equal(leverTokens(item, "dont"), 0);
  assert.equal(leverTokens(item, "shrink"), 251, "ceil(1001 / 4)");
  assert.equal(leverTokens(item, "move"), 20, "the default pointer");
  assert.equal(leverTokens({ ...item, pointer_tokens: 12 }, "move"), 12);
  assert.equal(leverTokens(item, "summary"), 201, "ceil(1001 / 5)");
  assert.equal(leverTokens({ ...item, summary_tokens: 50 }, "summary"), 50);
});

test("desk: the fill is the loaded tokens as a share of the window, rounded", () => {
  const items = [{ id: "a", tokens: 300, needed: true }, { id: "b", tokens: 100, needed: false }];
  assert.equal(fillPercent(items, {}, 1000), 40);
  assert.equal(fillPercent(items, { a: "dont" }, 1000), 10);
  assert.equal(fillPercent(items, {}, 800), 50);
});

test("desk: recall is linear between the curve's points and held at the ends", () => {
  const curve = [[0, 96], [100, 74], [150, 20]];
  assert.equal(recallAt(curve, 50), 85);
  assert.equal(recallAt(curve, 125), 47, "between 74 and 20");
  assert.equal(recallAt(curve, -5), 96);
  assert.equal(recallAt(curve, 300), 20);
});

test("desk: each answer follows its lever (removed wrong, pointer right with a fetch, summary by a kept note, loaded by the draw)", () => {
  assert.deepEqual(answer("dont", 80, false, 0), { right: false, how: "not loaded" });
  assert.deepEqual(answer("move", 80, false, 0), { right: true, how: "one extra fetch" });
  assert.equal(answer("summary", 80, true, 0).right, true);
  assert.equal(answer("summary", 80, false, 0).right, false);
  assert.equal(answer(null, 80, false, 79).right, true, "a draw below the recall is right");
  assert.equal(answer(null, 80, false, 80).right, false, "a draw at the recall is wrong");
  assert.equal(answer("shrink", 80, false, 10).right, true);
});

test("desk: 20 questions cycle over the needed items; the PRNG is drawn only for loaded items", () => {
  const src = deskDemo();
  const needed = src.items.filter((i) => i.needed).length;
  const all = askQuestions(src.items, {}, { recall: 100, keep: [], notes: [], seed: 1, questions: 20 });
  assert.equal(all.results.length, 20);
  assert.equal(all.right, 20, "a recall of 100 is always right");
  const removed = askQuestions(src.items, { [src.items.find((i) => i.needed).id]: "dont" }, { recall: 100, keep: [], notes: [], seed: 1, questions: 20 });
  assert.equal(removed.right, 20 - 20 / needed, "one needed item in four is removed: its five questions are wrong");
  const moved = askQuestions(src.items, { [src.items.find((i) => i.needed).id]: "move" }, { recall: 0, keep: [], notes: [], seed: 1, questions: 20 });
  assert.equal(moved.fetches, 20 / needed);
});

test("desk: the same seed gives the same answers", () => {
  const src = deskDemo();
  const a = askQuestions(src.items, {}, { recall: 79, keep: [], notes: [], seed: 4, questions: 20 });
  const b = askQuestions(src.items, {}, { recall: 79, keep: [], notes: [], seed: 4, questions: 20 });
  assert.deepEqual(a, b);
});

test("cache: a growing block is a base message plus one message per turn, each turn written at its own call", () => {
  const block = { id: "h", part: "messages", changes: "grows", text: "Conversation so far:", turn_text: "a turn." };
  assert.equal(blockTexts(block, 1).length, 2, "the base and the first turn");
  assert.equal(blockTexts(block, 3).length, 4);
  assert.equal(blockTexts(block, 3)[3], "turn 3: a turn.");
  assert.equal(blockTexts(block, 2)[1], blockTexts(block, 3)[1], "earlier turns never change");
});

test("cache: the API's order: tools before system before messages; within a part any order", () => {
  const blocks = cacheDemo().blocks;
  assert.equal(validOrder(blocks, ["tools", "system", "clock", "rules", "task", "history"]), true);
  assert.equal(validOrder(blocks, ["system", "tools", "clock", "rules", "task", "history"]), false);
  assert.equal(validOrder(blocks, ["tools", "system", "rules", "clock", "history", "task"]), true, "within messages, any order");
});

test("cache: the prefixes follow A6.5: P(1) is the tools, P(2) the system and tools, then one per message", () => {
  const blocks = cacheDemo().blocks;
  const order = ["tools", "system", "rules", "task", "history"];
  const parts = requestParts(blocks, order, 3);
  assert.equal(parts.messages.length, 5, "the task, the history base and three turns");
  const prefixes = prefixesOf(parts);
  assert.equal(prefixes.length, 2 + parts.messages.length);
  assert.equal(prefixes[prefixes.length - 1].tokens, tokens({ system: parts.system, tools: parts.tools, messages: parts.messages }));
});

test("cache: a block that changes every call breaks every later hit, wherever it sits (the silent invalidator)", () => {
  const data = cacheDemo();
  const price = resolvePricing(data.pricing, facts);
  const run = (order) => simulateCalls({ blocks: data.blocks, order, calls: 6, gap: 30000, rules: data.cache_rules, price });
  assert.equal(run(["tools", "system", "clock", "rules", "task", "history"]).hit_percent, 0);
  assert.equal(run(["tools", "system", "rules", "clock", "task", "history"]).hit_percent, 0);
  assert.equal(firstDiffering(data.blocks, ["tools", "system", "clock", "rules", "task", "history"]), "clock");
});

test("cache: without the clock, the task before the growing history hits and the reverse misses", () => {
  const data = cacheDemo();
  const price = resolvePricing(data.pricing, facts);
  const blocks = data.blocks.filter((b) => b.id !== "clock");
  const run = (order) => simulateCalls({ blocks, order, calls: 6, gap: 30000, rules: data.cache_rules, price });
  const good = run(["tools", "system", "rules", "task", "history"]);
  assert.ok(good.hit_percent > 50, `hit ${good.hit_percent}`);
  assert.ok(good.saving_percent > 0);
  assert.equal(good.rows[0].read, 0, "call 1 writes");
  assert.equal(run(["tools", "system", "rules", "history", "task"]).hit_percent, 0);
});

test("cache: a prompt below the minimum is neither read nor written", () => {
  const data = cacheDemo();
  const price = resolvePricing(data.pricing, facts);
  const result = simulateCalls({ blocks: data.blocks, order: ["tools", "system", "rules", "task", "history"], calls: 3, gap: 30000, rules: { min_tokens: 10 ** 9, ttl_ms: 300000 }, price });
  assert.equal(result.hit_percent, 0);
  assert.equal(result.rows[0].write, 0);
  assert.equal(result.rows[0].uncached, result.rows[0].prompt);
});

test("stamp: the time joins the new turn, so no block changes and the history hits every call", () => {
  const data = cacheDemo();
  const price = resolvePricing(data.pricing, facts);
  const stamped = ["tools", "system", "rules", "task", "history"];
  const result = simulateCalls({ blocks: data.blocks, order: stamped.slice(), calls: 6, gap: 30000, rules: data.cache_rules, price, stamped: ["clock"] });
  assert.ok(result.hit_percent > 50, `hit ${result.hit_percent}`);
  assert.ok(result.saving_percent > 0);
  assert.equal(firstDiffering(data.blocks, ["tools", "system", "clock", "rules", "task", "history"], ["clock"]), null);
});

test("stamp: a stamped block is not a block of its own, so the API's order ignores it", () => {
  const blocks = cacheDemo().blocks;
  const broken = ["tools", "system", "rules", "task", "clock", "history"];
  assert.equal(validOrder(blocks, broken), false, "a system block after a message");
  assert.equal(validOrder(blocks, broken, ["clock"]), true, "stamped, the clock is no longer in the order");
});

