// Pure statistics for hx-bench (lib/stats.js). Run: node --test "site/assets/components/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, wilson, percent, histogram, sweepPar, formatValue, TURN_EDGES } from "../lib/stats.js";
import { formatCost, formatInt, plural, isPass } from "../lib/format.js";

const close = (actual, expected, tol = 0.0002) => assert.ok(Math.abs(actual - expected) <= tol, `${actual} vs ${expected}`);

test("isPass (D-045): only a true done counts", () => {
  assert.equal(isPass("done", true), true);
  assert.equal(isPass("done", false), false, "a false done is not a pass");
  assert.equal(isPass("max_turns", true), false, "a guard stop with the checks right is not a pass");
});

test("summarize: passes are true dones, worst case, floored mean cost", () => {
  const trials = [
    { status: "done", passed: true, turns: 6, cost: 9466000, ms: 2100 },
    { status: "max_turns", passed: true, turns: 4, cost: 5836000, ms: 1500 },
    { status: "interrupted", passed: false, turns: 60, cost: 398846000, ms: 9001 },
  ];
  assert.deepEqual(summarize(trials), {
    n: 3, passed: 1, worst_turns: 60, worst_cost: 398846000,
    mean_cost: Math.floor((9466000 + 5836000 + 398846000) / 3),
    worst_ms: 9001, mean_ms: Math.floor((2100 + 1500 + 9001) / 3),
  });
  assert.deepEqual(summarize([]), { n: 0, passed: 0, worst_turns: 0, worst_cost: 0, mean_cost: 0, worst_ms: 0, mean_ms: 0 });
});

test("summarize (B-17): worst_ms is the longest run's clock; a trial without ms counts as 0", () => {
  assert.equal(summarize([{ status: "done", passed: true, turns: 1, cost: 1, ms: 700 }, { status: "done", passed: true, turns: 1, cost: 1, ms: 1200 }]).worst_ms, 1200);
  const partial = summarize([{ status: "done", passed: true, turns: 1, cost: 1, ms: 400 }, { status: "done", passed: true, turns: 1, cost: 1 }]);
  assert.equal(partial.mean_ms, 200);
  assert.equal(Number.isNaN(partial.mean_ms), false);
});

test("wilson: 13 of 20 matches the hand calculation (centre 0.6258, half-width 0.1930)", () => {
  // p = 0.65, z = 1.959964, n = 20: denominator 1.192073, centre 0.746036 / 1.192073 = 0.625831,
  // half-width 0.230053 / 1.192073 = 0.193000, so the interval is 0.432831 to 0.818831 by hand;
  // the exact value is 0.432854 to 0.818808. The test tolerance covers the difference.
  const w = wilson(13, 20);
  close(w.lo, 0.4329, 0.0002);
  close(w.hi, 0.8188, 0.0002);
});

test("wilson: the edges 0 of 20 and 20 of 20", () => {
  // 0 of 20: upper bound is z^2 / (n + z^2) = 3.841459 / 23.841459 = 0.1611.
  const none = wilson(0, 20);
  assert.equal(none.lo, 0);
  close(none.hi, 0.1611, 0.0002);
  // 20 of 20: the mirror image, lower bound 1 - 0.1611 = 0.8389.
  const all = wilson(20, 20);
  close(all.lo, 0.8389, 0.0002);
  assert.equal(all.hi, 1);
});

test("wilson: the ranges of 13 of 20 and 7 of 20 overlap (noise sentence)", () => {
  const a = wilson(13, 20);
  const b = wilson(7, 20);
  assert.ok(b.hi > a.lo, "7 of 20 reaches above the lower end of 13 of 20");
});

test("percent rounds half up", () => {
  assert.equal(percent(13, 20), 65);
  assert.equal(percent(1, 3), 33);
  assert.equal(percent(2, 3), 67);
  assert.equal(percent(0, 0), 0);
});

test("histogram: bins of 5 turns, the last bin includes 60", () => {
  const counts = histogram([6, 6, 6, 12, 60, 60, 0, 4.999], TURN_EDGES);
  assert.equal(counts.length, 12);
  assert.equal(counts[0], 2, "0 and 4.999 fall in 0-5");
  assert.equal(counts[1], 3, "6, 6, 6 fall in 5-10");
  assert.equal(counts[2], 1, "12 falls in 10-15");
  assert.equal(counts[11], 2, "both 60s fall in the last bin");
  assert.equal(counts.reduce((a, b) => a + b, 0), 8);
});

test("sweepPar: feasible means at least the old passes; par is the cheapest feasible worst case", () => {
  const rows = [
    { value: 4, passed: 13, worst_cost: 5836000 },
    { value: 5, passed: 13, worst_cost: 7698000 },
    { value: 3, passed: 12, worst_cost: 1000 },
    { value: 6, passed: 14, worst_cost: 9866000 },
  ];
  const sweep = sweepPar(rows, 13);
  assert.deepEqual(sweep.rows.map((r) => r.feasible), [false, true, true, true]);
  assert.deepEqual(sweep.par, { value: 4, passed: 13, worst_cost: 5836000 });
});

test("sweepPar: a tie goes to the smallest value; no feasible value gives null", () => {
  const tied = sweepPar([{ value: 9, passed: 5, worst_cost: 10 }, { value: 7, passed: 5, worst_cost: 10 }], 5);
  assert.equal(tied.par.value, 7);
  const none = sweepPar([{ value: 4, passed: 1, worst_cost: 10 }], 5);
  assert.equal(none.par, null);
});

test("shared wording (format.js): costs round half up, counts get thousands separators and plurals", () => {
  assert.equal(formatInt(60000), "60,000");
  assert.equal(formatCost(26438000), "≈ $0.0264");
  assert.equal(formatCost(9466000), "≈ $0.0095", "rounded half up, not truncated");
  assert.equal(formatCost(398846000), "≈ $0.3988");
  assert.equal(formatCost(26438000, { usd: false }), "≈ 0.0264 units");
  assert.equal(plural(1, "run"), "1 run");
  assert.equal(plural(13, "run"), "13 runs");
});

test("formatValue: int, usd (no mark), percent, and an em dash for no value yet", () => {
  assert.equal(formatValue(60000, "int"), "60,000");
  assert.equal(formatValue(26438000, "usd"), "$0.0264");
  assert.equal(formatValue(65, "percent"), "65%");
  assert.equal(formatValue(null, "int"), "—");
  assert.equal(formatValue(7, undefined), "7");
});
