// hx-placement's pure logic (BP-3.1b §1): the tally, the suggested start and the modules a learner may skip.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tally, suggestStart, skippable } from "../lib/placement.js";

const questions = [
  { id: "s1", part: "S", options: [{ text: "a" }, { text: "b", right: true }] },
  { id: "a1", part: "A", options: [{ text: "a", right: true }, { text: "b" }] },
  { id: "a2", part: "A", options: [{ text: "a" }, { text: "b", right: true }] },
];
const content = {
  questions,
  rules: [{ part: "S", skip_if_right: 1, of: 1, start: "S0" }, { part: "A", skip_if_right: 2, of: 2, start: "A1" }],
  start: "T1",
};
const course = {
  path: ["S0", "A1", "A2", "T1"],
  modules: [{ id: "S0", part: "S" }, { id: "A1", part: "A" }, { id: "A2", part: "A" }, { id: "T1", part: "T" }],
};

test("tally counts right answers per part; I don't know and no answer count as not right", () => {
  const rows = tally(questions, { s1: 1, a1: "dk", a2: 1 });
  assert.deepEqual(rows, [{ part: "S", right: 1, of: 1 }, { part: "A", right: 1, of: 2 }]);
  assert.deepEqual(tally(questions, {}), [{ part: "S", right: 0, of: 1 }, { part: "A", right: 0, of: 2 }]);
});

test("the first rule whose part is not passed decides the start", () => {
  const results = tally(questions, { s1: 0, a1: 0, a2: 1 });
  assert.equal(suggestStart(content, results), "S0", "part S failed, so S0 decides");
  const passedS = tally(questions, { s1: 1, a1: 0, a2: 0 });
  assert.equal(suggestStart(content, passedS), "A1", "S passed; part A has 0 of 2, so A1 decides");
});

test("every rule passed: the last rule's start; no rules: the content's start", () => {
  const allRight = tally(questions, { s1: 1, a1: 0, a2: 1 });
  assert.equal(suggestStart(content, allRight), "A1");
  assert.equal(suggestStart({ ...content, rules: [] }, allRight), "T1");
});

test("the skippable modules are the ones before the start in parts a rule passed", () => {
  const passedS = tally(questions, { s1: 1, a1: 0, a2: 0 });
  assert.deepEqual(skippable(course, content, passedS, "A1"), ["S0"], "S passed, and S0 comes before A1");
  const failedS = tally(questions, { s1: 0, a1: 0, a2: 0 });
  assert.deepEqual(skippable(course, content, failedS, "A1"), [], "S not passed: nothing to skip");
  assert.deepEqual(skippable(course, content, passedS, "Q9"), [], "a start not on the path skips nothing");
});
