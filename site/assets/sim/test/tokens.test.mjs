import { test } from "node:test";
import assert from "node:assert/strict";
import { tokens } from "../tokens.js";

// Expected values are len(json.dumps(x)) // 4 in Python (checked against it).
test("tokens is floor(len(pyjson(x)) / 4) on fixed strings and values", () => {
  assert.equal(tokens(""), 0);
  assert.equal(tokens("abcdef"), 2);
  assert.equal(tokens({ a: 1 }), 2);
  assert.equal(tokens([]), 0);
  assert.equal(tokens("x".repeat(20)), 5);
  assert.equal(tokens("\n"), 1);
  assert.equal(tokens({ text: 'a"b' }), 4);
  assert.equal(tokens([1, 2]), 1);
  assert.equal(tokens(12), 0);
  assert.equal(tokens({ system: "s", tools: [], messages: [] }), 11);
});
