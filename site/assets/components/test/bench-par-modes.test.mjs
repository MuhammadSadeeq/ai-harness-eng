// BP-7.2 bench fixes: the most-passes par mode (A2), the marks for every status the engine can end with (A1), and the
// par readout's unit (A3). Imports hx-bench.js and lib/stats.js with the same customElements stubs as the other bench tests.
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const {
  markOf, MARK_KEY, unitWords, KNOB_LABELS, KNOB_UNITS, GOAL_LINE, PAR_LINE, SHADE_LINE,
} = await import("../hx-bench.js");
const { sweepPar, sweepMostPasses } = await import("../lib/stats.js");

// S0's sweep, as the bench measures it (the same seeds for every value): 0 retries passes 13 of 20, 1 to 4 pass 20.
const S0_ROWS = [
  { value: 0, passed: 13, worst_cost: 3858000 },
  { value: 1, passed: 20, worst_cost: 9296000 },
  { value: 2, passed: 20, worst_cost: 9296000 },
  { value: 3, passed: 20, worst_cost: 9296000 },
  { value: 4, passed: 20, worst_cost: 9296000 },
];

test("most-passes (A2): S0's sweep gives par 1, the cheapest value that passes the most runs", () => {
  const sweep = sweepMostPasses(S0_ROWS);
  assert.deepEqual(sweep.rows.map((r) => r.feasible), [false, true, true, true, true], "the 13-pass value is not feasible");
  assert.deepEqual(sweep.par, { value: 1, passed: 20, worst_cost: 9296000 }, "1 and 2 tie on worst cost: the smallest value");
});

test("most-passes: the cheaper of the top values wins, not the smaller one", () => {
  const rows = [
    { value: 1, passed: 19, worst_cost: 500 },
    { value: 2, passed: 20, worst_cost: 900 },
    { value: 3, passed: 20, worst_cost: 700 },
  ];
  assert.equal(sweepMostPasses(rows).par.value, 3, "value 3 passes as many as value 2 and costs less");
  assert.equal(sweepMostPasses([]).par, null, "no rows, no par");
});

test("cheapest-worst-case (unchanged) keeps S0's sweep at par 0, where the new board does what the old one does", () => {
  const sweep = sweepPar(S0_ROWS, 13);
  assert.equal(sweep.par.value, 0);
  assert.deepEqual(sweep.rows.map((r) => r.feasible), [true, true, true, true, true]);
});

const ENGINE_STATUSES = [
  "done", "unverified", "max_turns", "budget", "loop", "circuit_open", "interrupted", "refused", "max_tokens_reply",
  "error", "max_time",
];

test("A1: every status the engine can end with has a mark, and each mark has its key line", () => {
  const keyed = new Set(MARK_KEY.map(([mark]) => mark));
  for (const status of ENGINE_STATUSES) {
    const mark = markOf({ status, passed: false });
    assert.ok(keyed.has(mark), `${status} has the mark ${mark}, which has a key line`);
  }
});

test("A1: only the interrupted status gets the pause mark ('interrupted')", () => {
  for (const status of ENGINE_STATUSES) {
    const mark = markOf({ status, passed: false });
    if (status === "interrupted") assert.equal(mark, "pause");
    else assert.notEqual(mark, "pause", `${status} must not be keyed as interrupted`);
  }
});

test("A1: an unverified run has its own mark and its own key line", () => {
  assert.equal(markOf({ status: "unverified", passed: false }), "shield-fail");
  const line = MARK_KEY.find(([mark]) => mark === "shield-fail");
  assert.equal(line[1], "unverified: the checks still fail");
});

test("A1: the other statuses keep their words: a declined run, a cut-off reply, the guards, the error, the pass and the false done", () => {
  assert.equal(markOf({ status: "refused", passed: false }), "permission-deny");
  assert.equal(markOf({ status: "max_tokens_reply", passed: false }), "noentry", "a cut-off reply is stopped by a limit");
  for (const status of ["max_turns", "budget", "loop", "circuit_open", "max_time"]) {
    assert.equal(markOf({ status, passed: false }), "noentry", status);
  }
  assert.equal(markOf({ status: "error", passed: false }), "cross");
  assert.equal(markOf({ status: "done", passed: true }), "check");
  assert.equal(markOf({ status: "done", passed: false }), "bang");
});

test("the key has one line per mark and the glyph names are unique", () => {
  const marks = MARK_KEY.map(([mark]) => mark);
  assert.equal(new Set(marks).size, marks.length);
});

test("A2: each par mode says what it does (the goal line and the par line)", () => {
  assert.equal(PAR_LINE["cheapest-worst-case"], "Par: the cheapest worst case that passes at least as many runs as the old board.");
  assert.equal(PAR_LINE["most-passes"], "Par: the cheapest setting that passes the most runs.");
  assert.notEqual(GOAL_LINE["cheapest-worst-case"], GOAL_LINE["most-passes"]);
  assert.match(SHADE_LINE["most-passes"], /pass fewer runs than the best/);
  assert.match(SHADE_LINE["cheapest-worst-case"], /lose a passing run/);
});

test("A3: the par readout uses the knob's own unit: retries for verify retries, turns for a turn limit", () => {
  assert.equal(unitWords(KNOB_UNITS["verify_gate.max_feedback"], 0), "0 retries");
  assert.equal(unitWords(KNOB_UNITS["verify_gate.max_feedback"], 1), "1 retry");
  assert.equal(unitWords(KNOB_UNITS["turn_limit.max_turns"], 6), "6 turns");
  assert.equal(unitWords(KNOB_UNITS["turn_limit.max_turns"], 1), "1 turn");
});

test("A3: every knob the bench can read has a unit as well as a label", () => {
  for (const name of Object.keys(KNOB_LABELS)) {
    assert.ok(Array.isArray(KNOB_UNITS[name]), `${name} has a unit`);
    assert.equal(KNOB_UNITS[name].length, 2, `${name} has a singular and a plural`);
  }
});
