// Pure logic of hx-design: the word and minute checks, the timer readout, the result wording, prompt navigation, the
// draft shape, the course's wires, and the demo content. hx-design.js defines a custom element at import time, so DOM
// globals are stubbed here. Run: node --test "site/assets/components/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const {
  WIRE_IDS, wordCount, checkDesign, clockText, timeIsUp, resultLine, lastLine, stepIndex, blankDraft, validDraft,
  pointCount, creditOf, checkboxKeys,
} = await import("../hx-design.js");

const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
const part = (n = 50) => ({ answer: words(n), points: ["First point.", "Second point."] });
const good = {
  id: "t1", objectives: ["I5.o3"], title: "A title", prompt: "Design it.", minutes: 25,
  clarify: ["One?", "Two?", "Three?"],
  wires: Object.fromEntries(WIRE_IDS.map((id) => [id, part()])),
  risks: part(), cost: part(), rollout: part(),
};
const withWires = (wires) => ({ ...good, wires: { ...good.wires, ...wires } });

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const demo = readJson("../../../labs/data/design-demo.json");
const courseCore = readJson("../../../data/course-core.json");

test("word count: splits on any whitespace and ignores empty text", () => {
  assert.equal(wordCount("  one two\nthree\t"), 3);
  assert.equal(wordCount(""), 0);
  assert.equal(wordCount(undefined), 0);
});

test("timer: m:ss, and time is up once the prompt's minutes have passed", () => {
  assert.equal(clockText(0), "0:00");
  assert.equal(clockText(65), "1:05");
  assert.equal(clockText(600), "10:00");
  assert.equal(clockText(-3), "0:00");
  assert.equal(timeIsUp(1499, 25), false);
  assert.equal(timeIsUp(1500, 25), true);
});

test("result wording: the self-grade line and the last-time line", () => {
  assert.equal(resultLine(2, 7), "You covered 2 of 7.");
  assert.equal(lastLine({ ticked: 3, total: 7 }), "Last time: 3 of 7");
});

test("prompt navigation stays inside the prompts", () => {
  assert.equal(stepIndex(0, -1, 2), 0, "Previous at the first prompt stays");
  assert.equal(stepIndex(0, 1, 2), 1);
  assert.equal(stepIndex(1, 1, 2), 1, "Next at the last prompt stays");
});

test("checkDesign: accepts a good prompt", () => {
  checkDesign(good);
  checkDesign({ ...good, objectives: [] });
  checkDesign({ ...good, clarify: ["a", "b", "c", "d", "e", "f"], minutes: 10 });
});

test("checkDesign: names the first problem", () => {
  assert.throws(() => checkDesign({ title: "no id" }), /no id/);
  assert.throws(() => checkDesign({ ...good, objectives: "I5.o3" }), /objectives list/);
  assert.throws(() => checkDesign({ ...good, title: undefined }), /title and a prompt/);
  assert.throws(() => checkDesign({ ...good, minutes: 5 }), /minutes from 10 to 45/);
  assert.throws(() => checkDesign({ ...good, minutes: 46 }), /minutes from 10 to 45/);
  assert.throws(() => checkDesign({ ...good, clarify: ["a", "b"] }), /3 to 6 clarifying questions/);
  assert.throws(() => checkDesign({ ...good, clarify: ["a", "b", "c", " "] }), /clarifying questions/);
  assert.throws(() => checkDesign({ ...good, wires: undefined }), /wires object/);
});

test("checkDesign: the eight wires are all there and no other", () => {
  const { loop, ...withoutLoop } = good.wires;
  assert.throws(() => checkDesign({ ...good, wires: withoutLoop }), /no answer for wire loop/);
  assert.throws(() => checkDesign(withWires({ nope: part() })), /not one of the eight: nope/);
});

test("checkDesign: an answer is 40 to 90 words, with 2 to 4 points", () => {
  assert.throws(() => checkDesign(withWires({ control: part(39) })), /wire control needs an answer of 40 to 90 words \(it has 39\)/);
  assert.throws(() => checkDesign(withWires({ control: part(91) })), /40 to 90 words/);
  checkDesign(withWires({ control: part(40), context: part(90) }));
  assert.throws(() => checkDesign({ ...good, risks: { answer: words(50), points: ["one"] } }), /risks needs 2 to 4 points/);
  assert.throws(() => checkDesign({ ...good, cost: { answer: words(50), points: ["a", "b", "c", "d", "e"] } }), /cost needs 2 to 4 points/);
  assert.throws(() => checkDesign({ ...good, rollout: { answer: words(50), points: ["a", " "] } }), /rollout needs 2 to 4 points/);
  assert.throws(() => checkDesign({ ...good, risks: undefined }), /risks needs an answer/);
});

test("blank draft: every wire off with an empty note, and empty text fields", () => {
  const draft = blankDraft();
  assert.deepEqual(Object.keys(draft.wires), [...WIRE_IDS]);
  assert.ok(Object.values(draft.wires).every((w) => w.on === false && w.note === ""));
  assert.equal(draft.clarify, "");
  assert.equal(draft.risks, "");
});

test("validDraft: keeps a saved draft of the right shape and ignores anything else", () => {
  assert.equal(validDraft(null), null);
  assert.equal(validDraft({ clarify: "", risks: "", cost: "", rollout: "" }), null, "no wires object");
  assert.equal(validDraft({ clarify: 3, risks: "", cost: "", rollout: "", wires: {} }), null, "a non-text field");
  const kept = validDraft({
    clarify: "Which repos?", risks: "A test edited to pass.", cost: "", rollout: "Read-only first.",
    wires: { control: { on: true, note: "Holds the rules." }, loop: { on: "yes", note: 4 } },
  });
  assert.equal(kept.clarify, "Which repos?");
  assert.equal(kept.risks, "A test edited to pass.");
  assert.deepEqual(kept.wires.control, { on: true, note: "Holds the rules." });
  assert.deepEqual(kept.wires.loop, { on: false, note: "" }, "a bad toggle or note falls back");
  assert.deepEqual(kept.wires.tools, { on: false, note: "" }, "a missing wire is blank");
});

test("course wires: the eight ids, in course order, each with a short name and a question", () => {
  assert.deepEqual(courseCore.wires.map((w) => w.id), [...WIRE_IDS]);
  for (const wire of courseCore.wires) {
    assert.equal(typeof wire.short, "string");
    assert.equal(typeof wire.question, "string");
  }
});

test("demo content: one prompt with the course's eight wires, and every part within its limits", () => {
  assert.equal(demo.prompts.length, 1);
  const [item] = demo.prompts;
  checkDesign(item);
  assert.equal(item.id, "ci-fixer");
  assert.deepEqual(item.objectives, ["I5.o3"]);
  assert.deepEqual(Object.keys(item.wires), [...WIRE_IDS]);
  const parts = [...Object.values(item.wires), item.risks, item.cost, item.rollout];
  for (const p of parts) {
    const n = wordCount(p.answer);
    assert.ok(n >= 40 && n <= 90, `a part has ${n} words`);
    assert.ok(p.points.length >= 2 && p.points.length <= 4);
  }
  assert.ok(item.clarify.length >= 3 && item.clarify.length <= 6);
});

test("credit: the objectives count only at half the points or more, on both sides of the line", () => {
  const objectives = ["I5.o3"];
  assert.deepEqual(creditOf(15, 31, objectives), [], "15 of 31 is under half");
  assert.deepEqual(creditOf(16, 31, objectives), objectives, "16 of 31 is over half");
  assert.deepEqual(creditOf(14, 30, objectives), [], "14 of 30 is under half");
  assert.deepEqual(creditOf(15, 30, objectives), objectives, "15 of 30 is exactly half");
  assert.deepEqual(creditOf(0, 31, objectives), []);
  assert.deepEqual(creditOf(31, 31, objectives), objectives);
});

test("result line: names the objective only while the learner is under half", () => {
  assert.equal(resultLine(5, 31, "I5.o3"), "You covered 5 of 31. Cover half the points to count this answer.");
  assert.equal(resultLine(16, 31, "I5.o3"), "You covered 16 of 31.");
  assert.equal(resultLine(5, 31), "You covered 5 of 31.", "no objective, no nudge");
});

test("points: every point of every part counts, so the total does not depend on the toggles", () => {
  assert.equal(pointCount(good), 25, "3 questions, 8 wires of 2 points, and 3 parts of 2 points");
  assert.equal(pointCount(demo.prompts[0]), 37, "4 questions, 8 wires of 3 points, and 3 parts of 3 points");
});

test("a left-out wire renders no checkbox: only the live points have boxes, and the total is the same either way", () => {
  const draftWith = (on) => ({ ...blankDraft(), wires: Object.fromEntries(WIRE_IDS.map((w) => [w, { on: on.includes(w), note: "" }])) });
  const none = checkboxKeys(good, draftWith([]));
  assert.equal(none.length, 9, "3 questions and 6 part points, no wire on");
  assert.ok(none.every((key) => !key.startsWith("wire-")), "no wire key while every wire is left out");
  const control = checkboxKeys(good, draftWith(["control"]));
  assert.equal(control.length, 11, "control's 2 points come back as boxes");
  assert.ok(control.includes("wire-control-0") && !control.includes("wire-context-0"));
  const all = checkboxKeys(good, draftWith(WIRE_IDS));
  assert.equal(all.length, pointCount(good), "all on: every point has a box");
  assert.equal(pointCount(good), 25, "the total is 25 whatever the wires");
  assert.equal(pointCount(good) - none.length, 16, "with every wire left out, 16 points are marked not covered");
  const [demoItem] = demo.prompts;
  assert.equal(pointCount(demoItem) - checkboxKeys(demoItem, draftWith([])).length, 24, "the demo marks 24 points as not covered with no wire on");
});
