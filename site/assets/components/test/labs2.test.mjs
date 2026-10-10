// Pure logic of the BP-3.2 labs: the sort's scoring, the workbench's rules, floor and tape copy, and the cost
// calculator's models and arithmetic. The lab modules define custom elements at import time, so DOM globals are stubbed.
// Run: node --test "site/assets/components/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { scorePlacement } = await import("../hx-sort.js");
const { ruleHolds, misuseOf, writeMisuse, resolvePointer } = await import("../hx-workbench.js");
const { familiesOf, familyOf, familyLabel, tierFor, priceText, costs } = await import("../hx-costcalc.js");

test("sort: an item is right when it is in its bucket; an unplaced item is wrong", () => {
  const items = [{ id: "a", bucket: "x" }, { id: "b", bucket: "y" }, { id: "c", bucket: "x" }];
  const r = scorePlacement(items, { a: "x", b: "x" });
  assert.deepEqual(r.results, { a: true, b: false, c: false });
  assert.equal(r.right, 1);
  assert.equal(r.total, 3);
});

const tool = {
  name: "search_files_now",
  description: "Use this when you need to search the files in the project.",
  schema: { type: "object", properties: { query: { type: "string", description: "What to find." } } },
};

test("workbench: each rule kind holds or fails on the definition", () => {
  assert.equal(ruleHolds({ kind: "contains", field: "description", text: "when" }, tool), true, "the description says 'Use this when'");
  assert.equal(ruleHolds({ kind: "contains", field: "description", text: "use this when" }, tool), true);
  assert.equal(ruleHolds({ kind: "min_length", field: "name", length: 10 }, tool), true);
  assert.equal(ruleHolds({ kind: "min_length", field: "name", length: 30 }, tool), false);
  assert.equal(ruleHolds({ kind: "has_description_for_every_property" }, tool), true);
  const undescribed = { ...tool, schema: { type: "object", properties: { query: { type: "string" } } } };
  assert.equal(ruleHolds({ kind: "has_description_for_every_property" }, undescribed), false);
});

const rules = [{ test: { kind: "contains", field: "description", text: "when" }, weight: 15 }, { test: { kind: "has_description_for_every_property" }, weight: 20 }];

test("workbench: the misuse rate is the base minus the weights that hold, never below the floor of 2%", () => {
  assert.deepEqual(misuseOf(40, rules, tool), { percent: 40 - 35, held: 2 }, "both rules hold: 40 minus 15 and 20");
  assert.deepEqual(misuseOf(40, rules, { ...tool, description: "x" }), { percent: 20, held: 1 });
  assert.equal(misuseOf(10, rules, { ...tool, description: "Use this when.", schema: tool.schema }).percent, 2, "floor 2");
});

test("workbench: the misuse branch is named by a JSON pointer; the option gets the percent, the others share the rest", () => {
  const tape = { script: [{ say: "x" }, { branch: [{ percent: 60, then: [] }, { percent: 40, then: [] }] }] };
  const copy = writeMisuse(tape, "/script/1", 1, 25);
  assert.deepEqual(copy.script[1].branch.map((b) => b.percent), [75, 25]);
  assert.deepEqual(tape.script[1].branch.map((b) => b.percent), [60, 40], "the original tape is not changed");
});

test("workbench: the remainder is shared in proportion to the other options, and always totals 100", () => {
  const tape = { script: [{ branch: [{ percent: 30, then: [] }, { percent: 10, then: [] }, { percent: 60, then: [] }] }] };
  // option 2 gets 50; the other 50 points split 30:10 = 37.5 and 12.5, so 38 and 12 (the tie goes to the first)
  const even = writeMisuse(tape, "/script/0", 2, 50).script[0].branch.map((b) => b.percent);
  assert.deepEqual(even, [38, 12, 50]);
  // option 0 gets 50; the other 50 points split 10:60 = 7.14 and 42.86, largest remainders first: 7 and 43
  const split = writeMisuse(tape, "/script/0", 0, 50).script[0].branch.map((b) => b.percent);
  assert.equal(split.reduce((a, b) => a + b, 0), 100);
  assert.equal(split[0], 50);
  assert.deepEqual(split.slice(1), [7, 43]);
});

test("workbench: a pointer that does not resolve, a step with no branch, or a bad option fails", () => {
  const tape = { script: [{ say: "x" }, { branch: [{ percent: 60, then: [] }, { percent: 40, then: [] }] }] };
  assert.throws(() => writeMisuse(tape, "/script/9", 1, 25), /not in the tape/);
  assert.throws(() => writeMisuse(tape, "/script/0", 1, 25), /not a branch step/);
  assert.throws(() => writeMisuse(tape, "/script/1", 5, 25), /option 5/);
  assert.throws(() => writeMisuse(tape, "script/1", 1, 25), /bad pointer/);
  assert.equal(resolvePointer({ "a/b": { "c~d": 3 } }, "/a~1b/c~0d"), 3, "~1 is / and ~0 is ~ (RFC 6901)");
});

const facts = {
  "models.sonnet-5-5-price": { value: { input_usd_per_mtok: 2, output_usd_per_mtok: 10, cache_hit_usd_per_mtok: 0.1 } },
  "models.haiku-5-5-price-up-to-100k": { value: { input_usd_per_mtok: 0.1, output_usd_per_mtok: 0.5, cache_hit_usd_per_mtok: 0.01, max_prompt_tokens: 100000 } },
  "models.haiku-5-5-price-over-100k": { value: { input_usd_per_mtok: 0.5, output_usd_per_mtok: 2.5, cache_hit_usd_per_mtok: 0.05, over_prompt_tokens: 100000 } },
  "models.cache-read-multiplier": { value: null },
};

test("costcalc: flat and tiered models are offered as families; labels come from the fact ids", () => {
  const families = familiesOf(facts);
  assert.deepEqual(families.map((f) => f.family), ["sonnet-5-5", "haiku-5-5"]);
  assert.equal(familyOf("models.haiku-5-5-price-up-to-100k"), "haiku-5-5");
  assert.equal(familyLabel("haiku-5-5"), "Haiku 5.5");
  assert.equal(familyLabel("sonnet-5-5"), "Sonnet 5.5");
});

test("costcalc: the tier follows the input tokens per call, at the threshold and above it", () => {
  const haiku = familiesOf(facts).find((f) => f.family === "haiku-5-5");
  assert.equal(tierFor(haiku, 100000).id, "models.haiku-5-5-price-up-to-100k", "up to and including the threshold");
  assert.equal(tierFor(haiku, 100001).id, "models.haiku-5-5-price-over-100k", "over the threshold");
  const sonnet = familiesOf(facts).find((f) => f.family === "sonnet-5-5");
  assert.equal(tierFor(sonnet, 500000).id, "models.sonnet-5-5-price");
});

test("costcalc: the price line names the tier's range and its prices, from the fact", () => {
  const haiku = familiesOf(facts).find((f) => f.family === "haiku-5-5");
  assert.equal(priceText(haiku, haiku.tiers[0]), "Haiku 5.5, prompts up to 100,000 tokens: $0.1 in, $0.5 out per million tokens, $0.01 cache hit.");
  assert.equal(priceText(haiku, haiku.tiers[1]), "Haiku 5.5, prompts over 100,000 tokens: $0.5 in, $2.5 out per million tokens, $0.05 cache hit.");
});

test("costcalc: the sonnet case by hand, in nano-units (1 USD = 1e9)", () => {
  // inputs: 4000 tokens at 60 % cache (0.6 * 0.1 + 0.4 * 2 = 0.86 USD per MTok) = 3,440,000 nano
  // output: 600 tokens at medium effort (x2) and $10 per MTok = 12,000,000 nano; per call 15,440,000 nano
  // per task: 6 turns = 92,640,000 nano; per completed task at 80 % success = 115,800,000 nano
  const c = costs(facts["models.sonnet-5-5-price"].value, { turns: 6, input: 4000, output: 600, cache: 60, effort: "medium", success: 80 }, { low: 1, medium: 2, high: 4 });
  assert.equal(c.perCall, 15440000);
  assert.equal(c.perTask, 92640000);
  assert.equal(c.perCompleted, 115800000);
});

test("costcalc: the haiku up-to-100k tier by hand: 784,000 nano per call", () => {
  // inputs: 4000 at 60 % cache (0.6 * 0.01 + 0.4 * 0.1 = 0.046 USD per MTok) = 184,000 nano
  // output: 600 at medium (x2) and $0.5 per MTok = 600,000 nano; per call 784,000 nano
  const c = costs(facts["models.haiku-5-5-price-up-to-100k"].value, { turns: 6, input: 4000, output: 600, cache: 60, effort: "medium", success: 80 }, { low: 1, medium: 2, high: 4 });
  assert.equal(c.perCall, 784000);
  assert.equal(c.perCompleted, 5880000);
});
