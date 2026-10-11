// lib/step-logic.js (BP-4.0 §2-3): the command a learner types for a run, the answers shown beside a run, and whether a
// step's files call subprocess (so the page shows the stand-in note once).
import { test } from "node:test";
import assert from "node:assert/strict";
import { commandOf, answersText, usesSubprocess } from "../lib/step-logic.js";

test("the command is python rein.py with the arguments, quoted when they have spaces", () => {
  assert.equal(commandOf(["Say hello", "--fake", "scenarios/01_hello.json"]), 'python rein.py "Say hello" --fake scenarios/01_hello.json');
  assert.equal(commandOf(["python test_calc.py"]), 'python rein.py "python test_calc.py"');
  assert.equal(commandOf(["ls"]), "python rein.py ls");
});

test("the answers beside a run read as the book's prompts: answers: n, several in order", () => {
  assert.equal(answersText(["n"]), "answers: n");
  assert.equal(answersText(["y", "n"]), "answers: y, n");
  assert.equal(answersText([]), "");
  assert.equal(answersText(undefined), "");
});

test("a step whose files call subprocess uses the stand-in; one that does not, does not", () => {
  assert.equal(usesSubprocess(["import subprocess\nsubprocess.run(...)"]), true);
  assert.equal(usesSubprocess(["print('plain')"], ), false);
  assert.equal(usesSubprocess(["print('plain')", "subprocess.run"]), true, "any file of the step counts");
  assert.equal(usesSubprocess([]), false);
});
