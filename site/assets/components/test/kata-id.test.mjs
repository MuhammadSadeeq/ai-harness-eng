// The kata id rule (lib/kata-id.js): the ids the katas use, B2-loop among them, and the ids that could leave a folder.
// Run: node --test "site/assets/components/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { isKataId } from "../lib/kata-id.js";

test("kata ids take letters (capitals too), digits and dashes, such as B2-loop", () => {
  assert.equal(isKataId("B2-loop"), true);
  assert.equal(isKataId("lab-turn-limit"), true);
  assert.equal(isKataId("K1"), true);
});

test("ids that are empty, start with a dash, or carry a slash, dot, space or underscore are refused", () => {
  for (const id of ["", "-B2", "B2/loop", "../x", "B2 loop", "B2_loop", "B2.loop", undefined, null, 7]) {
    assert.equal(isKataId(id), false, String(id));
  }
});
