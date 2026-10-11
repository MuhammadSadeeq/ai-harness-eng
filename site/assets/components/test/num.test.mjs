// Pure logic of hx-num: stepping on the target's grid and clamped to its range, and reading formats.
// hx-num.js defines a custom element at import time, so the DOM globals it needs are stubbed here.
// Run: node --test "site/assets/components/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { nextValue, moneyText, HxNum } = await import("../hx-num.js");
const { formatValue } = await import("../lib/stats.js");
const { formatCost } = await import("../lib/format.js");

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

// format="money" is the bench's money(): the same formatCost call with usd set from the board's priced flag.
test("money format: dollars on a priced board, units otherwise, an em dash for no value", () => {
  assert.equal(moneyText(1908000, true), "≈ $0.0019");
  assert.equal(moneyText(1908000, true), formatCost(1908000, { usd: true }), "the bench's money() wording");
  assert.equal(moneyText(1908000, false), formatCost(1908000, { usd: false }));
  assert.equal(moneyText(null, true), "—", "no completed run gives no value");
  assert.equal(moneyText(undefined, false), "—");
});

test("money format reads whether its target's board is priced, by the name of the value", () => {
  const text = (format, priced, value) => HxNum.prototype.formatText.call(
    { format, name: "cost_per_pass.old", target: { hxPriced: (name) => priced && name === "cost_per_pass.old" } },
    value,
  );
  assert.equal(text("money", true, 1908000), "≈ $0.0019");
  assert.equal(text("money", false, 1908000), "≈ 0.0019 units");
  assert.equal(text("money", true, null), "—");
  assert.equal(text("int", true, 1908000), "1,908,000", "other formats ignore the priced flag");
});

// A target that defines after hx-num (lazy loading, COMPONENTS §10): hx-num waits for its definition and its ready
// promise, reads the value, and re-reads on every hx-change from the target, since a derived value (pass@k depends
// on p and k) can change when a different setting changes.
test("hx-num waits for a target that defines after it, then re-reads on any change of the target", async () => {
  const saved = { document: globalThis.document, whenDefined: globalThis.customElements.whenDefined };
  let resolveDefined;
  const defined = new Promise((resolve) => { resolveDefined = resolve; });
  let resolveReady;
  const listeners = [];
  // Before it defines, the target has no value methods and no ready promise, as an element that has not upgraded.
  const target = {
    localName: "hx-fake",
    addEventListener: (type, fn) => listeners.push([type, fn]),
    removeEventListener() {},
  };
  // Defining the element: its methods and its pending ready promise appear, then the definition resolves.
  const define = () => {
    target.hxRange = () => null;
    target.hxValue = (name) => ({ pass_at_k: 99, p: 80 })[name] ?? null;
    target.ready = new Promise((resolve) => { resolveReady = resolve; });
    resolveDefined();
  };
  globalThis.document = { getElementById: (id) => (id === "t" ? target : null) };
  globalThis.customElements.whenDefined = (tag) => (tag === "hx-fake" ? defined : Promise.reject(new Error(`unexpected ${tag}`)));
  try {
    const { HxNum } = await import("../hx-num.js");
    const num = new HxNum();
    const attrs = { for: "t", name: "pass_at_k" };
    num.getAttribute = (key) => attrs[key] ?? null;
    num.hasAttribute = () => false;
    let renders = 0;
    num.render = () => { renders += 1; };
    let settled = false;
    const setup = num.setup().then(() => { settled = true; });
    define();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(settled, false, "hx-num waits for the target's ready promise");
    resolveReady(true);
    await setup;
    assert.equal(num.target, target, "hx-num is bound to the target once it is ready");
    const onChange = listeners.find(([type]) => type === "hx-change")[1];
    onChange({ detail: { name: "p" } });
    assert.equal(renders, 1, "a change to a different setting re-reads a derived value");
    onChange({ detail: { name: "pass_at_k" } });
    assert.equal(renders, 2, "a change to the value itself re-reads it too");
  } finally {
    globalThis.document = saved.document;
    globalThis.customElements.whenDefined = saved.whenDefined;
  }
});
