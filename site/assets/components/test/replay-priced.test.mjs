// hx-replay's cost tile is dollars when the board's model profile prices from the facts (F4's f4-new picks
// claude-sonnet-5-5, a fact price, while the tape's own pricing is illustrative inline numbers). The replay
// asks hx-bench's pricedOn, the same rule the bench and the eval bench use.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { pricedOn } = await import("../hx-bench.js");

const load = (path) => JSON.parse(readFileSync(new URL(`../../../data/scenarios/${path}`, import.meta.url), "utf8"));

test("F4 on f4-new is priced from its profile's fact, so its replay shows dollars", () => {
  const tape = load("f4-cheap-model-trap.json");
  const board = load("boards/f4-new.json");
  assert.equal(tape.pricing.fact, undefined, "the tape's own pricing is inline (illustrative)");
  assert.equal(pricedOn(tape, board), true);
});

test("the replay asks the board's profile, not the tape's top-level pricing", () => {
  const tape = load("f4-cheap-model-trap.json");
  assert.equal(pricedOn(tape, { modules: { model: { id: "claude-opus-5-5" } } }), true);
  assert.equal(pricedOn(tape, { modules: {} }), false, "no profile selected: the tape's inline prices, not dollars");
});
