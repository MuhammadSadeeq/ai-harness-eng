// hx-replay's trace helpers (BP-4.0 §4, the fixes after the 1280 review): the cost tile's words, the all-zero rule, the
// model a trace makes (no tape, no run_end: no turn total), the cost arrays, and the Wire toggle's dimmed style.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { costLabel, allCostsZero, modelOfTrace, readoutArrays } = await import("../hx-replay.js");

const row = (kind, extra = {}) => ({ v: 1, run: "t:t:1", seq: 0, t: 0, turn: 0, agent: "main", kind, wire: "loop", ...extra });

test("the cost tile reads relative units as a tape run does, and says 0 when every cost is 0", () => {
  assert.equal(costLabel(0, { usd: false }), "≈ 0.0000 units");
  assert.equal(costLabel(1e9, { usd: false }), "≈ 1.0000 units");
  assert.equal(costLabel(1e9, { usd: true }), "≈ $1.0000");
  assert.equal(costLabel(0, { usd: false, allZero: true }), "0", "all zero: 0, not four decimals");
  assert.equal(costLabel(1e9, { usd: false, allZero: true }), "0", "the all-zero rule covers the whole trace");
});

test("a trace is all zero when its model replies and its end record no cost above 0", () => {
  assert.equal(allCostsZero([row("run_start")]), true, "no costs at all counts as zero");
  assert.equal(allCostsZero([row("model_reply", { cost: 0 }), row("run_end", { cost: 0 })]), true);
  assert.equal(allCostsZero([row("model_reply", { cost: 0 }), row("run_end", { cost: 5 })]), false);
  assert.equal(allCostsZero([row("tool_call", { cost: 9 }), row("model_reply", { cost: 0 })]), true, "only replies and the end count");
});

test("a trace without a run_end has no result, so the deck shows no turn total", () => {
  const model = modelOfTrace([row("run_start"), row("model_reply", { cost: 0, turn: 1 })]);
  assert.equal(model.result, null);
  assert.equal(model.tapeId, null, "no tape");
  assert.equal(model.allZero, true);
  assert.equal(model.events.length, 2);
});

test("a trace's run_end gives its result: status, passed, turns and cost", () => {
  const model = modelOfTrace([row("run_start"), row("run_end", { status: "done", passed: true, turns: 3, cost: 7 })]);
  assert.deepEqual(model.result, { status: "done", passed: true, turns: 3, cost: 7 });
  assert.equal(model.allZero, false, "a nonzero run_end cost is not all zero");
});

test("the cost array keeps the last cost a model reply gave; a reply with no cost keeps the one before", () => {
  const { cost } = readoutArrays([
    row("run_start"),
    row("model_reply", { cost: 4 }),
    row("tool_call"),
    row("model_reply"),
    row("run_end"),
  ]);
  assert.deepEqual(cost, [0, 4, 4, 4, 4]);
});

test("the Wire view's disabled choice is dimmed and not a pressed choice", () => {
  const css = readFileSync(new URL("../hx-replay.css", import.meta.url), "utf8");
  assert.match(css, /\.replay \.view-seg button:disabled \{[^}]*opacity:\s*0\.45/);
  assert.match(css, /\.replay \.view-seg button:disabled \{[^}]*cursor:\s*not-allowed/);
});
