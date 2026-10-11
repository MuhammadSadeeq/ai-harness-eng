// hx-evalbench's attack success readout (BP-3.5 round 2, E1 and E2): the leak counts and their Wilson interval, the leak
// verdict, the readout names that hx-num reads (leaked.<board>, runs.<board>, asr.<board>), the third board, and the two
// lab data files. The component defines custom elements at import time, so DOM globals are stubbed.
// Run: node --test "site/assets/components/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { validEvalbench, sidesOf, tally, leakVerdict, readoutValue, readoutNames } = await import("../hx-evalbench.js");
const { wilson, percent } = await import("../lib/stats.js");

const row = (task, leaked, code = true, cost = 1) => ({ task, trial: 1, code, leaked, status: "done", passed: code, cost });
const rowsWith = (leakedCount, n, { pass = true } = {}) =>
  Array.from({ length: n }, (_, i) => row("attack", i < leakedCount, pass));

test("tally: leaked k of n, the rate and the 95 % Wilson interval of the leaks, from the rows' leaked flags", () => {
  const t = tally(rowsWith(16, 20), ["attack"]);
  assert.equal(t.leaked, 16, "sixteen rows carry leaked");
  assert.equal(t.runs, 20);
  assert.equal(t.asr, percent(16, 20), "the rate is a whole percent: 80");
  const w = wilson(16, 20);
  assert.equal(t.asrLo, w.lo, "the leak interval is the same Wilson helper as the pass rate");
  assert.equal(t.asrHi, w.hi);
  assert.equal(t.pass, 20, "the pass counts are unchanged: every run passes its checks");
});

test("tally: a run without a leaked flag counts as no leak, so a pass-only eval shows zero leaks", () => {
  const rows = Array.from({ length: 10 }, () => ({ task: "t", trial: 1, code: true, status: "done", passed: true, cost: 0 }));
  const t = tally(rows, ["t"]);
  assert.equal(t.leaked, 0);
  assert.equal(t.asr, 0);
  assert.equal(t.asrHi, wilson(0, 10).hi, "zero of ten still has an upper bound");
});

test("tally: no runs gives a whole interval, the same as the pass rate", () => {
  const t = tally([], []);
  assert.equal(t.leaked, 0);
  assert.deepEqual([t.asrLo, t.asrHi], [0, 1]);
});

test("leakVerdict: intervals that do not overlap name the board that leaks less", () => {
  const open = tally(rowsWith(16, 20), ["attack"]);
  const egress = tally(rowsWith(0, 20), ["attack"]);
  const v = leakVerdict(open, egress, { old: "Open", new: "Egress" });
  assert.equal(v.overlap, false);
  assert.equal(v.text, "Egress leaks less: its interval sits below the other's.");
  const back = leakVerdict(egress, open, { old: "Egress", new: "Open" });
  assert.equal(back.text, "Egress leaks less: its interval sits below the other's.", "the lower board is named whichever side it is on");
});

test("leakVerdict: overlapping leak intervals say the boards can't be told apart on leaks", () => {
  const a = tally(rowsWith(10, 20), ["attack"]);
  const b = tally(rowsWith(11, 20), ["attack"]);
  const v = leakVerdict(a, b, { old: "A", new: "B" });
  assert.equal(v.overlap, true);
  assert.match(v.text, /leak intervals overlap/);
});

test("readoutValue: leaked.<board>, runs.<board> and asr.<board> carry the leak counts, and <board>_rate the pass percent", () => {
  const result = {
    leakable: true,
    sides: ["old", "mid", "new"],
    old: tally(rowsWith(16, 20), ["attack"]),
    mid: tally(rowsWith(6, 20), ["attack"]),
    new: tally(rowsWith(0, 20), ["attack"]),
  };
  assert.equal(readoutValue(result, "leaked.old"), 16);
  assert.equal(readoutValue(result, "runs.old"), 20);
  assert.equal(readoutValue(result, "asr.old"), 80);
  assert.equal(readoutValue(result, "leaked.mid"), 6, "the third board has its own count");
  assert.equal(readoutValue(result, "asr.mid"), 30);
  assert.equal(readoutValue(result, "asr.new"), 0, "a board that stops every leak reads zero");
  assert.equal(readoutValue(result, "old_rate"), 100, "the pass rate is still there");
  assert.equal(readoutValue(result, "mid_rate"), 100);
});

test("readoutValue: unknown names, absent boards, a result that is not leakable, and no result all read as null", () => {
  const leakable = { leakable: true, sides: ["old", "new"], old: tally(rowsWith(1, 2), ["a"]), new: tally(rowsWith(0, 2), ["a"]) };
  assert.equal(readoutValue(leakable, "leaked.mid"), null, "no third board on a two-board eval");
  assert.equal(readoutValue(leakable, "asr.nope"), null);
  assert.equal(readoutValue(leakable, "something"), null);
  const passOnly = { leakable: false, sides: ["old", "new"], old: tally(rowsWith(0, 2), ["a"]), new: tally(rowsWith(0, 2), ["a"]) };
  assert.equal(readoutValue(passOnly, "leaked.old"), null, "a pass-only eval exposes no leak readout");
  assert.equal(readoutValue(null, "old_rate"), null, "no result, no value");
});

test("readoutNames: the rates always, the leak names only for a leakable eval, in board order", () => {
  const leakable = { leakable: true, sides: ["old", "mid", "new"] };
  assert.deepEqual(readoutNames(leakable), [
    "old_rate", "mid_rate", "new_rate",
    "leaked.old", "runs.old", "asr.old",
    "leaked.mid", "runs.mid", "asr.mid",
    "leaked.new", "runs.new", "asr.new",
  ]);
  assert.deepEqual(readoutNames({ leakable: false, sides: ["old", "new"] }), ["old_rate", "new_rate"]);
  assert.deepEqual(readoutNames(null), []);
});

test("sidesOf: two boards, or three when the source names a middle board", () => {
  assert.deepEqual(sidesOf({ old: "a", new: "b" }), ["old", "new"]);
  assert.deepEqual(sidesOf({ old: "a", mid: "m", new: "b" }), ["old", "mid", "new"]);
});

test("validEvalbench: a middle board is optional, and an empty one is refused", () => {
  validEvalbench({ eval: "e", boards: { old: "a", new: "b" }, start_tasks: [] });
  validEvalbench({ eval: "e", boards: { old: "a", mid: "m", new: "b" }, start_tasks: [] });
  assert.throws(() => validEvalbench({ eval: "e", boards: { old: "a", mid: "", new: "b" }, start_tasks: [] }), /boards.mid/);
});

test("the E1 and E2 lab data name a real eval, boards that exist as tapes' boards, and tasks the eval has", () => {
  const root = new URL("../../../../", import.meta.url);
  const e1 = JSON.parse(readFileSync(new URL("content/E1/labs/evalbench.json", root), "utf8"));
  const e2 = JSON.parse(readFileSync(new URL("content/E2/labs/evalbench.json", root), "utf8"));
  validEvalbench(e1);
  validEvalbench(e2);
  assert.equal(e1.eval, "e1-attacks");
  assert.deepEqual(sidesOf(e1.boards), ["old", "mid", "new"], "E1 shows open, wording and egress");
  assert.equal(e2.eval, "e2-attacks");
  assert.deepEqual(sidesOf(e2.boards), ["old", "new"], "E2 shows the old board and the pinned board");
  const evalSpec = JSON.parse(readFileSync(new URL("scenarios/evals/e1-attacks.json", root), "utf8"));
  for (const board of Object.values(e1.boards)) assert.ok(evalSpec.boards.includes(board), `${board} is one of the eval's boards`);
  const evalSpec2 = JSON.parse(readFileSync(new URL("scenarios/evals/e2-attacks.json", root), "utf8"));
  for (const board of Object.values(e2.boards)) assert.ok(evalSpec2.boards.includes(board), `${board} is one of the eval's boards`);
  for (const id of e1.start_tasks) assert.ok(evalSpec.tasks.some((t) => t.id === id));
  for (const id of e2.start_tasks) assert.ok(evalSpec2.tasks.some((t) => t.id === id));
});
