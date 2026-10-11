// The readiness adjustment (BP-5.4 §5, I2.o2): a learner lowers a wire's level below its evidence, never raises it,
// with one line of reason; the brag sheet prints the evidence level and the adjustment side by side.
// Run: node --test "site/assets/components/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";

const { adjustment, bragData, REASON_MAX, shownLevel } = await import("../lib/readiness.js");

const wire = { id: "loop", short: "Loop", level: 3 };

test("adjustment: a level at or below the evidence, with one line of reason, is kept (reason trimmed)", () => {
  assert.deepEqual(adjustment(3, 1, "  The exits are not clear to me yet  "), { level: 1, reason: "The exits are not clear to me yet" });
  assert.deepEqual(adjustment(3, 3, "Same as the evidence"), { level: 3, reason: "Same as the evidence" });
  assert.deepEqual(adjustment(0, 0, "Nothing yet"), { level: 0, reason: "Nothing yet" });
});

test("adjustment: a level above the evidence is refused, and says the range", () => {
  assert.throws(() => adjustment(2, 3, "Higher"), /only be lowered: choose L0 to L2/);
  assert.throws(() => adjustment(2, -1, "Negative"), /only be lowered/);
  assert.throws(() => adjustment(2, 1.5, "Fraction"), /only be lowered/);
});

test("adjustment: the reason is required, one line, and at most 140 characters", () => {
  assert.throws(() => adjustment(3, 1, "   "), /one line of reason/);
  assert.throws(() => adjustment(3, 1, undefined), /one line of reason/);
  assert.throws(() => adjustment(3, 1, "two\nlines"), /one line of reason/);
  assert.throws(() => adjustment(3, 1, "x".repeat(REASON_MAX + 1)), /up to 140 characters/);
  assert.equal(adjustment(3, 1, "x".repeat(REASON_MAX)).reason.length, REASON_MAX);
});

test("shownLevel: a valid lower level is shown and marked adjusted; no adjustment shows the evidence", () => {
  assert.deepEqual(shownLevel(wire, { loop: { level: 1, reason: "Unsure of the exits" } }),
    { level: 1, adjusted: true, reason: "Unsure of the exits" });
  assert.deepEqual(shownLevel(wire, {}), { level: 3, adjusted: false, reason: "" });
  assert.deepEqual(shownLevel(wire, undefined), { level: 3, adjusted: false, reason: "" });
});

test("shownLevel: a stored level above the evidence, or without a reason, is ignored: adjustments never raise", () => {
  assert.equal(shownLevel(wire, { loop: { level: 5, reason: "Raised" } }).level, 3);
  assert.equal(shownLevel(wire, { loop: { level: 3, reason: "Same" } }).adjusted, false, "the same level is not an adjustment");
  assert.equal(shownLevel(wire, { loop: { level: 1, reason: "" } }).level, 3, "no reason, no adjustment");
  assert.equal(shownLevel(wire, { loop: { level: 1, reason: "two\nlines" } }).level, 3, "a multi-line reason is ignored");
});

test("bragData: each wire carries its evidence level, its shown level and its reason, side by side", () => {
  const course = { modules: [] };
  const model = {
    explained: new Set(),
    wires: [
      { id: "loop", short: "Loop", level: 3, word: "can defend with data" },
      { id: "tools", short: "Tools", level: 1, word: "can explain" },
    ],
  };
  const sheet = bragData(course, model, [], "", "2026-10-11", { loop: { level: 1, reason: "Unsure of the exits" } });
  assert.deepEqual(sheet.levels[0], {
    short: "Loop", evidence: 3, level: 1, word: "can explain", adjusted: true, reason: "Unsure of the exits",
  });
  assert.deepEqual(sheet.levels[1], {
    short: "Tools", evidence: 1, level: 1, word: "can explain", adjusted: false, reason: "",
  });
});

test("bragData: with no adjustments the sheet shows the evidence, unchanged from before", () => {
  const model = { explained: new Set(), wires: [{ id: "loop", short: "Loop", level: 2, word: "have built" }] };
  const sheet = bragData({ modules: [] }, model, [], "", "2026-10-11");
  assert.equal(sheet.levels[0].level, 2);
  assert.equal(sheet.levels[0].adjusted, false);
});
