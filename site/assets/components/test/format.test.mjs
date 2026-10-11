// Director-owned: the shared wording in lib/format.js (DECISIONS D-045).
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCost, formatInt, formatMs, plural, isPass, statusWords, pricingIsUsd } from "../lib/format.js";

test("costs round half up to four decimals", () => {
  assert.equal(formatCost(398846000), "≈ $0.3988");
  assert.equal(formatCost(9466000), "≈ $0.0095");
  assert.equal(formatCost(50000), "≈ $0.0001");
  assert.equal(formatCost(49999), "≈ $0.0000");
  assert.equal(formatCost(26438000, { usd: false }), "≈ 0.0264 units");
});

test("numbers, times and plurals", () => {
  assert.equal(formatInt(10991), "10,991");
  assert.equal(formatMs(800), "800 ms");
  assert.equal(formatMs(2000), "2 s");
  assert.equal(formatMs(1200), "1.2 s");
  assert.equal(plural(1, "run"), "1 run");
  assert.equal(plural(13, "run"), "13 runs");
});

test("a pass is a true done", () => {
  assert.equal(isPass("done", true), true);
  assert.equal(isPass("done", false), false);
  assert.equal(isPass("max_turns", true), false);
  assert.equal(isPass("unverified", false), false);
});

test("status words", () => {
  assert.equal(statusWords("done", true), "done, checks pass");
  assert.equal(statusWords("done", false), "false done, checks fail");
  assert.equal(statusWords("max_turns", true), "stopped by the turn limit");
  assert.equal(statusWords("circuit_open", false), "stopped by the breaker");
  assert.equal(statusWords("max_time", false), "stopped by the time limit");
});

test("pricing from a fact means USD", () => {
  assert.equal(pricingIsUsd({ pricing: { fact: "models.sonnet-5-5-price" } }), true);
  assert.equal(pricingIsUsd({ pricing: { input_milli_per_mtok: 3000, output_milli_per_mtok: 15000 } }), false);
});
