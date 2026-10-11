// hx-bench cost_per_pass: the total cost of a board's trials over the runs that pass (as the F4 kata divides it),
// and which boards are priced from the facts. Imports hx-bench.js with the same customElements stubs as the other bench tests.
import { test } from "node:test";
import assert from "node:assert/strict";
globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { costPerPass, pricedOn } = await import("../hx-bench.js");

const trial = (status, passed, cost) => ({ status, passed, cost });

test("cost per pass divides the total cost of every trial by the runs that pass", () => {
  const trials = [trial("done", true, 100), trial("done", false, 50), trial("done", true, 250)];
  assert.equal(costPerPass(trials), 200, "400 over two passes");
});

test("a failed run's cost is paid and spread over the passes", () => {
  const trials = [trial("done", true, 10), trial("done", false, 11), trial("done", false, 0)];
  assert.equal(costPerPass(trials), 21, "the 11 of the failed run is in the total");
});

test("cost per pass is floored, as the kata's integer division is", () => {
  const trials = [trial("done", true, 10), trial("done", true, 11), trial("done", false, 0)];
  assert.equal(costPerPass(trials), 10, "21 over two passes is 10.5, floored");
});

test("no pass gives null, not a cost", () => {
  assert.equal(costPerPass([trial("done", false, 50), trial("done", false, 60)]), null);
  assert.equal(costPerPass([]), null);
});

test("a run passes only when it is done and passed, as isPass says", () => {
  assert.equal(costPerPass([trial("max_turns", true, 40)]), null, "a turn-limit stop is not a pass");
  assert.equal(costPerPass([trial("done", true, 40)]), 40);
});

test("a board is priced when its model profile takes its prices from a fact", () => {
  const tape = {
    models: {
      capable: { pricing: { fact: "models.sonnet-5-5-price" } },
      cheap: { pricing: { input_milli_per_mtok: 1000, output_milli_per_mtok: 5000 } },
    },
  };
  assert.equal(pricedOn(tape, { modules: { model: { id: "capable" } } }), true);
  assert.equal(pricedOn(tape, { modules: { model: { id: "cheap" } } }), false, "inline prices are illustrative");
});

test("a board with no model module uses the tape's own pricing", () => {
  assert.equal(pricedOn({ pricing: { fact: "models.sonnet-5-5-price" } }, { modules: {} }), true);
  assert.equal(pricedOn({ pricing: { input_milli_per_mtok: 2000, output_milli_per_mtok: 10000 } }, { modules: {} }), false);
});
