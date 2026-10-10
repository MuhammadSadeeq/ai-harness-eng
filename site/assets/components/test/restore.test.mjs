// B2 round 2: the restore checks (lib/restore.js) and the Wire view's tool_use ids (lib/wire-hits.js).
// Run: node --test "site/assets/components/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { validAnswer, validHunt } from "../lib/restore.js";
import { toolUseHits } from "../lib/wire-hits.js";

test("a saved answer is used only when it names an option and carries a boolean reveal", () => {
  assert.deepEqual(validAnswer({ choice: 1, revealed: true }, 3), { choice: 1, revealed: true });
  assert.equal(validAnswer({ choice: 3, revealed: true }, 3), null, "option out of range");
  assert.equal(validAnswer({ choice: -1, revealed: false }, 3), null);
  assert.equal(validAnswer({ choice: 0.5, revealed: false }, 3), null);
  assert.equal(validAnswer({ choice: 0, revealed: "yes" }, 3), null);
  assert.equal(validAnswer(null, 3), null);
  assert.equal(validAnswer("x", 3), null);
});

const INC = { first_bad_seq: 29, accept_seqs: [31], correct_fix: 0 };
const FAMILIES = ["almost-done-spiral", "false-done"];
const WIRES = ["loop", "verify"];
const hunt = (over = {}) => ({ found: 29, wrong_taps: 2, seconds: 14, family_pick: "almost-done-spiral", wire_pick: "loop", fix_pick: 0, ...over });

test("a saved hunt is used when its found seq is the bad event or an accepted one", () => {
  assert.deepEqual(validHunt(hunt(), INC, FAMILIES, WIRES, 3), {
    found: 29, wrongTaps: 2, seconds: 14, familyPick: "almost-done-spiral", wirePick: "loop", fixPick: 0, fixOk: true,
  });
  assert.equal(validHunt(hunt({ found: 31 }), INC, FAMILIES, WIRES, 3).found, 31, "an accepted seq is fine");
  assert.equal(validHunt(hunt({ found: 30 }), INC, FAMILIES, WIRES, 3), null, "a seq that was not accepted");
});

test("a saved hunt names only known families and wires, and a fix in range", () => {
  assert.equal(validHunt(hunt({ family_pick: "nope" }), INC, FAMILIES, WIRES, 3), null);
  assert.equal(validHunt(hunt({ wire_pick: "nope" }), INC, FAMILIES, WIRES, 3), null);
  assert.equal(validHunt(hunt({ fix_pick: 3 }), INC, FAMILIES, WIRES, 3), null);
  assert.equal(validHunt(hunt({ wrong_taps: -1 }), INC, FAMILIES, WIRES, 3), null);
  assert.equal(validHunt(hunt({ seconds: 1.5 }), INC, FAMILIES, WIRES, 3), null);
  assert.equal(validHunt(null, INC, FAMILIES, WIRES, 3), null);
});

test("fix_ok is derived from the tape's correct fix, not stored", () => {
  assert.equal(validHunt(hunt({ fix_pick: 1 }), INC, FAMILIES, WIRES, 3).fixOk, false);
});

const REQUEST = JSON.stringify({
  messages: [
    { role: "assistant", content: [{ type: "tool_use", id: "toolu_2_1", name: "read_file", input: {} }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_2_1", content: "x" }] },
  ],
}, null, 2);
const RESPONSE = JSON.stringify({ content: [{ type: "tool_use", id: "toolu_3_1", name: "run_command", input: {} }] }, null, 2);

test("toolUseHits: a result points at its call in the request, and a response call stands alone", () => {
  const hits = toolUseHits(REQUEST, RESPONSE);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].kind, "answers");
  assert.equal(hits[0].id, "toolu_2_1");
  assert.ok(hits[0].callLine >= 0 && hits[0].callLine < hits[0].line, "the call comes before its result");
  assert.deepEqual(hits[1], { kind: "calls", id: "toolu_3_1", line: hits[1].line, callLine: -1 });
});

test("toolUseHits: no ids gives no hits; a result whose call is not in the request has callLine -1", () => {
  assert.deepEqual(toolUseHits("{}", "{}"), []);
  const orphan = JSON.stringify({ messages: [{ role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_9_9", content: "x" }] }] }, null, 2);
  assert.equal(toolUseHits(orphan, "{}")[0].callLine, -1);
});
