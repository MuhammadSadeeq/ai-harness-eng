// Pure logic of hx-num: stepping on the target's grid and clamped to its range, and reading formats.
// hx-num.js defines a custom element at import time, so the DOM globals it needs are stubbed here.
// Run: node --test "site/assets/components/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { nextValue } = await import("../hx-num.js");
const { formatValue } = await import("../lib/stats.js");

const knob = { min: 4, max: 30, step: 1 };

test("nextValue: one step up and down, clamped to the range", () => {
  assert.equal(nextValue(12, knob, 1), 13);
  assert.equal(nextValue(12, knob, -1), 11);
  assert.equal(nextValue(30, knob, 1), 30, "the top stays at the top");
  assert.equal(nextValue(4, knob, -1), 4, "the bottom stays at the bottom");
  assert.equal(nextValue(12, knob, 10), 22, "PageUp moves ten steps");
  assert.equal(nextValue(12, knob, -10), 4, "PageDown is clamped at the minimum");
});

test("nextValue: steps land on the grid min + k * step", () => {
  const coarse = { min: 4, max: 30, step: 5 };
  assert.equal(nextValue(14, coarse, 1), 19);
  assert.equal(nextValue(14, coarse, -1), 9);
  assert.equal(nextValue(29, coarse, 1), 30, "the last step is the maximum");
});

test("nextValue: a drag of 24 px is three steps of 8 px", () => {
  assert.equal(nextValue(10, knob, Math.round(24 / 8)), 13);
  assert.equal(nextValue(10, knob, Math.round(-16 / 8)), 8, "a drag of −16 px is two steps back");
});

test("reading formats: int, usd, percent", () => {
  assert.equal(formatValue(60000, "int"), "60,000");
  assert.equal(formatValue(26438000, "usd"), "$0.0264");
  assert.equal(formatValue(13, "percent"), "13%");
  assert.equal(formatValue(null, "int"), "—", "no value yet is an em dash");
});
