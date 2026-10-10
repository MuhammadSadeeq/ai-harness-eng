// Pure logic of hx-say: the timer readout, the result wording, prompt navigation, the prompt check, and the
// demo content's shape. hx-say.js defines a custom element at import time, so DOM globals are stubbed here.
// Run: node --test "site/assets/components/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { timerView, resultLine, lastLine, stepIndex, checkSay } = await import("../hx-say.js");

const good = {
  id: "t1", objectives: ["B2.o3"], prompt: "Say it.", model_answer: "A model answer.",
  rubric: ["one", "two", "three", "four"],
};

test("timer: counts up in seconds; amber from 60 s; the plenty line from 90 s", () => {
  assert.deepEqual(timerView(0), { text: "0 s", amber: false, plenty: false });
  assert.equal(timerView(59).amber, false);
  assert.equal(timerView(60).amber, true);
  assert.equal(timerView(89).plenty, false);
  assert.deepEqual(timerView(90), { text: "90 s", amber: true, plenty: true });
});

test("result wording: the self-grade line and the last-time line", () => {
  assert.equal(resultLine(2, 4), "You covered 2 of 4. Try it again tomorrow.");
  assert.equal(lastLine({ ticked: 3, total: 4 }), "Last time: 3 of 4");
});

test("prompt navigation stays inside the prompts", () => {
  assert.equal(stepIndex(0, -1, 2), 0, "Previous at the first prompt stays");
  assert.equal(stepIndex(0, 1, 2), 1);
  assert.equal(stepIndex(1, 1, 2), 1, "Next at the last prompt stays");
});

test("checkSay: accepts a good prompt and names the first problem in a bad one", () => {
  checkSay(good);
  checkSay({ ...good, objectives: [] });
  assert.throws(() => checkSay({ ...good, objectives: "B2.o3" }), /objectives list/);
  assert.throws(() => checkSay({ ...good, rubric: ["a", "b", "c"] }), /4 to 6 rubric lines/);
  assert.throws(() => checkSay({ ...good, rubric: ["a", "b", "c", 4] }), /rubric lines/);
  assert.throws(() => checkSay({ ...good, model_answer: undefined }), /model answer/);
  assert.throws(() => checkSay({ prompt: "no id" }), /no id/);
});

test("demo content: two prompts with neutral ids and no objectives, four rubric lines, model answers of about 120 words", () => {
  const demo = JSON.parse(readFileSync(new URL("../../../labs/data/say-demo.json", import.meta.url), "utf8"));
  assert.equal(demo.length, 2);
  for (const item of demo) {
    checkSay(item);
    assert.equal(item.rubric.length, 4);
    const words = item.model_answer.trim().split(/\s+/).length;
    assert.ok(words >= 100 && words <= 140, `${item.id} has ${words} words`);
  }
  assert.deepEqual(demo.map((item) => item.id), ["lab-s1", "lab-s2"]);
  assert.deepEqual(demo.map((item) => item.objectives), [[], []], "demo items count toward no objective");
});
