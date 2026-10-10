// B-17: the bench's run-time readout in words (hx-bench.js timeWords, from lib/format.js formatMs).
import { test } from "node:test";
import assert from "node:assert/strict";
// The same customElements stubs as the other bench tests, so hx-bench.js imports in node.
globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { timeWords } = await import("../hx-bench.js");

test("B-17: the run time reads as words: worst and mean, in ms or s", () => {
  // The unit is joined to its number by a non-breaking space (see withUnit in hx-bench.js).
  assert.equal(timeWords({ worst_ms: 1200, mean_ms: 800 }), "worst 1.2\u00a0s, mean 800\u00a0ms");
  assert.equal(timeWords({ worst_ms: 2000, mean_ms: 3000 }), "worst 2\u00a0s, mean 3\u00a0s");
  assert.equal(timeWords({ worst_ms: 0, mean_ms: 0 }), "worst 0\u00a0ms, mean 0\u00a0ms");
});
