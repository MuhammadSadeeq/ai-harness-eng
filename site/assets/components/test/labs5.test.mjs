// Pure logic of BP-3.4 labs (wave 3.4): the scheduler's conflicts and plan time (hx-scheduler), and the bug-catch grid's
// scoring, budget and uncaught bugs (hx-bugcatch). The components define custom elements at import time, so DOM globals
// are stubbed. Run: node --test "site/assets/components/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { validSchedule, conflictsOf, planTimes } = await import("../hx-scheduler.js");
const { validBugcatch, scorePredictions, uncaughtBy, spentOf } = await import("../hx-bugcatch.js");

const json = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const schedulerDemo = () => json("../../../labs/data/scheduler-demo.json");
const bugcatchDemo = () => json("../../../labs/data/bugcatch-demo.json");

const calls = schedulerDemo().calls;
const everyOwnRound = Object.fromEntries(calls.map((c, i) => [c.id, i + 1]));

test("scheduler: the demo validates, and every call in its own round is a safe plan that saves nothing", () => {
  validSchedule(schedulerDemo());
  assert.equal(conflictsOf(calls, everyOwnRound).length, 0);
  const t = planTimes(calls, everyOwnRound);
  assert.equal(t.saved, 0);
  assert.equal(t.plan, t.serial);
});

test("scheduler: a write conflicts with a read in the same round, and both calls are named in the pair", () => {
  // edit_file writes calc.py; read_file reads it: together they conflict, with the reason in words.
  const assign = { ...everyOwnRound, "read-calc": 1, "edit-calc": 1 };
  const found = conflictsOf(calls, assign);
  assert.equal(found.length, 1);
  assert.deepEqual([found[0].a, found[0].b], ["read-calc", "edit-calc"]);
  assert.match(found[0].reasons[0], /edit_file writes calc\.py while read_file reads it/);
});

test("scheduler: two reads never conflict; two writes to one file do", () => {
  const assign = Object.fromEntries(calls.map((c) => [c.id, 1]));
  const pairs = conflictsOf(calls, assign).map((p) => `${p.a}+${p.b}`);
  assert.ok(!pairs.includes("read-readme+list-files"), "two reads");
  const twoWrites = [
    { id: "a", tool: "edit_file", label: "A", reads: [], writes: ["x.py"], ms: 1 },
    { id: "b", tool: "write_file", label: "B", reads: [], writes: ["x.py"], ms: 1 },
  ];
  const found = conflictsOf(twoWrites, { a: 1, b: 1 });
  assert.equal(found.length, 1);
  assert.match(found[0].reasons[0], /both write x\.py/);
});

test("scheduler: a plan's time is each round's longest call, rounds in order; one at a time is the sum", () => {
  // Round 1: read calc (300), list (100), README (200), docs (900) -> 900. Round 2: edit (500). Round 3: tests (2000), notes (400) -> 2000.
  const assign = { "read-calc": 1, "list-files": 1, "read-readme": 1, "fetch-docs": 1, "edit-calc": 2, pytest: 3, "write-notes": 3 };
  const t = planTimes(calls, assign);
  assert.equal(t.plan, 900 + 500 + 2000);
  assert.equal(t.serial, 300 + 500 + 2000 + 100 + 200 + 400 + 900);
  assert.equal(t.saved, t.serial - t.plan);
  assert.equal(t.rounds, 3);
});

test("scheduler: the demo's plan with the read in the same round as the edit is not safe", () => {
  const assign = { ...everyOwnRound, "read-calc": 1, "edit-calc": 1 };
  assert.ok(conflictsOf(calls, assign).length > 0);
});

test("bug catch: the demo validates; a bad check kind or an unknown bug in catches is refused", () => {
  validBugcatch(bugcatchDemo());
  const src = bugcatchDemo();
  assert.throws(() => validBugcatch({ ...src, checks: [{ ...src.checks[0], kind: "oracle" }, ...src.checks.slice(1)] }), /guide or a sensor/);
  assert.throws(() => validBugcatch({ ...src, catches: { nope: ["unit"] } }), /unknown bug/);
});

test("bug catch: predictions score cell by cell against the real catches", () => {
  const src = bugcatchDemo();
  const none = scorePredictions(src.bugs, src.checks, src.catches, {});
  assert.equal(none.total, src.bugs.length * src.checks.length);
  // Predict exactly the real catches: every cell is right.
  const exact = {};
  for (const [bug, ids] of Object.entries(src.catches)) exact[bug] = Object.fromEntries(ids.map((id) => [id, true]));
  assert.equal(scorePredictions(src.bugs, src.checks, src.catches, exact).right, none.total);
  // Predict nothing: right only where the truth is "misses".
  const truths = src.bugs.length * src.checks.length - Object.values(src.catches).reduce((n, ids) => n + ids.length, 0);
  assert.equal(none.right, truths);
});

test("bug catch: a bug is caught when a chosen check is in its catches; spending adds the costs", () => {
  const src = bugcatchDemo();
  assert.deepEqual(uncaughtBy(src.bugs, src.catches, []).map((b) => b.id), src.bugs.map((b) => b.id));
  assert.equal(uncaughtBy(src.bugs, src.catches, ["unit"]).map((b) => b.id).includes("says-done"), false);
  assert.equal(uncaughtBy(src.bugs, src.catches, ["unit", "types"]).map((b) => b.id).join(","), "test-edited,special-case");
  assert.equal(spentOf(src.checks, ["unit", "types", "pristine"]), 2 + 2 + 3);
});

test("bug catch: the self-report catches nothing, on purpose", () => {
  const src = bugcatchDemo();
  const caughtBySelfReport = Object.values(src.catches).filter((ids) => ids.includes("self-report"));
  assert.equal(caughtBySelfReport.length, 0);
});
