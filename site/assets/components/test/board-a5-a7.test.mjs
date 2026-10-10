// The board map for the ENGINE A5–A7 modules (BP-3.1b §2): each module's wire, its label, which tags are bugs on
// purpose, the narrow codes, and the rule that `history` with resend true draws nothing (ENGINE A5.5c, A8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIO_WIRE, SCENARIO_CODE, SCENARIO_NAME, scenarioBoard, tagIsBug, tagLabel } from "../lib/board-tags.js";

const NEW_MODULES = [
  "history", "first_block_only", "compaction", "cache", "system_clock", "validate_inputs", "split_results", "effort",
];

const board = {
  modules: {
    history: { resend: false },
    first_block_only: {},
    compaction: { threshold_percent: 80, keep: ["goal"] },
    cache: {},
    system_clock: {},
    validate_inputs: {},
    split_results: {},
    effort: { level: "high" },
  },
};

test("each ENGINE A5–A7 module sits on the wire its amendment gives", () => {
  assert.deepEqual(
    Object.fromEntries(NEW_MODULES.map((name) => [name, SCENARIO_WIRE[name]])),
    {
      history: "loop", first_block_only: "loop", compaction: "context", cache: "context",
      system_clock: "context", validate_inputs: "tools", split_results: "tools", effort: "control",
    },
  );
});

test("the labels are the ones the amendments give, on their wires, in board order", () => {
  const { byWire, count } = scenarioBoard(board);
  assert.equal(count, 8);
  assert.deepEqual(byWire.loop.map((t) => t.label), ["history not resent", "reads the first block only"]);
  assert.deepEqual(byWire.context.map((t) => t.label), ["compaction", "cache-friendly prefix", "time at the top of the prompt"]);
  assert.deepEqual(byWire.tools.map((t) => t.label), ["schema checks", "results split across messages"]);
  assert.deepEqual(byWire.control.map((t) => t.label), ["effort high"]);
});

test("the four harness bugs are flagged; the features are not", () => {
  const bugs = Object.values(scenarioBoard(board).byWire).flat().filter((t) => t.bug).map((t) => t.id).sort();
  assert.deepEqual(bugs, ["first_block_only", "history", "split_results", "system_clock"]);
  assert.equal(tagIsBug("history", { resend: true }), false, "history with resend true is not a bug (it draws nothing)");
  assert.equal(tagIsBug("compaction", { threshold_percent: 80, keep: [] }), false);
  assert.equal(tagIsBug("effort", { level: "low" }), false);
});

test("history with resend true or absent draws nothing, but still counts as a module on the board", () => {
  assert.equal(tagLabel("history", { resend: true }), null);
  const trueBoard = scenarioBoard({ modules: { history: { resend: true } } });
  assert.deepEqual(trueBoard.byWire, {});
  assert.equal(trueBoard.count, 1);
});

test("every new module has a narrow code and a name, and the codes do not collide", () => {
  const codes = Object.values(SCENARIO_CODE);
  assert.equal(new Set(codes).size, codes.length, "codes are unique");
  for (const name of NEW_MODULES) {
    assert.match(SCENARIO_CODE[name], /^[A-Z]{2}$/, `${name} has a two-letter code`);
    assert.ok(SCENARIO_NAME[name], `${name} has a name`);
  }
});

test("an unknown board module still fails loudly", () => {
  assert.throws(() => scenarioBoard({ modules: { made_up: {} } }), /unknown board module: made_up/);
  assert.throws(() => tagLabel("made_up", {}), /unknown board module: made_up/);
});
