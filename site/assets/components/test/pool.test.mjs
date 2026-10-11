// Pure tests for lib/pool.js (D-062): the started modules, the pool and its fallback, the round-robin order of fresh
// cards and new prompts by wire (seeded per day), and the board's and the bank's pool orders.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startedIds, poolOf, orderFresh, wiresByModule, boardFreshOrder, promptFreshOrder } from "../lib/pool.js";

test("the started modules are the ones with status started or done", () => {
  const modules = { A1: { status: "started" }, B2: { status: "done" }, C6: { status: "todo" } };
  assert.deepEqual([...startedIds(modules)].sort(), ["A1", "B2"]);
  assert.deepEqual([...startedIds(undefined)], []);
});

test("the pool is the started modules, and with none the first path module that has an incident", () => {
  assert.deepEqual([...poolOf(new Set(["B2"]), ["A1", "B2"], ["A1", "B2"])], ["B2"]);
  assert.deepEqual([...poolOf(new Set(), ["X0", "B2", "A1"], ["A1", "B2"])], ["B2"]);
  assert.deepEqual([...poolOf(new Set(), ["A1"], ["C6"])], ["C6"]);
  assert.deepEqual([...poolOf(new Set(), [], [])], []);
});

test("orderFresh alternates the wires: no wire is drawn twice before every wire has been drawn once", () => {
  const wireOf = (id) => id[0];
  const ids = ["a1", "a2", "a3", "a4", "b1", "b2", "c1"];
  const order = orderFresh(ids, { wireOf, day: "2026-10-11" });
  assert.equal(order.length, ids.length);
  assert.deepEqual([...order].sort(), [...ids].sort());
  const firstThree = order.slice(0, 3).map(wireOf);
  assert.equal(new Set(firstThree).size, 3, `first three wires: ${firstThree}`);
});

test("orderFresh is seeded: the same day gives the same order, another day may differ", () => {
  const wireOf = (id) => id[0];
  const ids = ["a1", "a2", "b1", "b2", "c1", "c2"];
  assert.deepEqual(orderFresh(ids, { wireOf, day: "2026-10-11" }), orderFresh(ids, { wireOf, day: "2026-10-11" }));
  const days = ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"].map((day) => orderFresh(ids, { wireOf, day }).join(","));
  assert.ok(new Set(days).size > 1, "the order should change from day to day");
});

test("boardFreshOrder takes new cards only from the pool's modules", () => {
  const course = {
    path: ["S0", "A1", "B2"],
    modules: [{ id: "S0", wires: ["verify"] }, { id: "A1", wires: ["loop"] }, { id: "B2", wires: ["context"] }],
  };
  const cards = [
    { id: "s0-1", module: "S0" }, { id: "a1-1", module: "A1" }, { id: "b2-1", module: "B2" }, { id: "a1-2", module: "A1" },
  ];
  const order = boardFreshOrder({ cards, course, incidentModules: ["S0", "A1", "B2"], modules: { A1: { status: "started" } } }, "2026-10-11");
  assert.deepEqual([...order].sort(), ["a1-1", "a1-2"]);
});

test("promptFreshOrder takes new prompts only from the pool, and falls back to the first path module with an incident", () => {
  const path = ["S0", "A1"];
  const prompts = [
    { id: "p1", module: "S0", wire: "verify" }, { id: "p2", module: "A1", wire: "loop" }, { id: "p3", module: "A1", wire: "verify" },
  ];
  assert.deepEqual([...promptFreshOrder(prompts, { path, incidentModules: ["S0", "A1"], modules: {} }, "2026-10-11")].sort(), ["p1"]);
  assert.deepEqual([...promptFreshOrder(prompts, { path, incidentModules: ["S0", "A1"], modules: { A1: { status: "done" } } }, "2026-10-11")].sort(), ["p2", "p3"]);
});

test("wiresByModule maps each module to its wires", () => {
  assert.deepEqual(wiresByModule({ modules: [{ id: "A1", wires: ["loop", "tools"] }] }).get("A1"), ["loop", "tools"]);
});
