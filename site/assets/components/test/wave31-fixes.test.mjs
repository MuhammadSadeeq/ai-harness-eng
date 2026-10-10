// Wave 3.1 fixes (coordinator rulings on the S0, A3, B2, H1 and H2 pages): the forgetful lab reads its own
// suggestions, the bench says what history does, the wire's window copy reads right for any size, and each Break
// figure keeps its caption after the component upgrades (the caption sits outside the component).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { suggestionsOf, standIn, requestOf } = await import("../hx-forgetful.js");
const { historyWords } = await import("../lib/board-tags.js");

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const ROOT = "../../../../";

// ---------- hx-forgetful: the module's own suggestions

test("suggestionsOf: the demo pair when the file has none; a copy of the file's two texts when it has them", () => {
  assert.deepEqual(suggestionsOf({ rules: [] }), ["My name is Sam.", "What is my name?"]);
  const own = ["Tell it a name.", "Ask for the name."];
  const got = suggestionsOf({ rules: [], suggestions: own });
  assert.deepEqual(got, own);
  assert.notEqual(got, own, "a copy, not the file's array");
});

test("suggestionsOf refuses anything but exactly two non-empty texts", () => {
  for (const bad of ["one", ["only one"], ["a", "b", "c"], ["a", ""], ["a", "   "], ["a", 3], {}]) {
    assert.throws(() => suggestionsOf({ rules: [], suggestions: bad }), /suggestions must be two texts/, JSON.stringify(bad));
  }
});

test("the A3 lab file: its rules answer its own suggestions, with the history on and off", () => {
  const data = JSON.parse(read(`${ROOT}content/A3/labs/forgetful.json`));
  assert.deepEqual(suggestionsOf(data), ["My name is Sam.", "What is my name?"]);
  const history = [
    { role: "user", text: "My name is Sam." },
    { role: "assistant", text: "Got it. Your name is Sam." },
    { role: "user", text: "What is my name?" },
  ];
  assert.equal(standIn(requestOf(history, true), data.rules), "Your name is Sam.");
  assert.equal(standIn(requestOf(history, false), data.rules), "I don't know your name.");
});

test("the A3 page reads its own lab data, copied by gen_data from content/A3/labs", () => {
  const page = read(`${ROOT}site/modules/the-stateless-model.html`);
  assert.ok(page.includes('src="../data/labs/A3/forgetful.json"'), "the page points at the module's own file");
  assert.ok(!page.includes("forgetful-demo.json"), "no demo file on the page");
});

// ---------- the bench's module list: history resent or not resent

test("historyWords: resent when the request holds the earlier messages (true or absent), not resent when false", () => {
  assert.equal(historyWords({ resend: true }), "history resent");
  assert.equal(historyWords({ resend: false }), "history not resent");
  assert.equal(historyWords({}), "history resent");
  assert.equal(historyWords(undefined), "history resent");
});

test("hx-bench lists history through historyWords, not as an empty board", () => {
  const src = read(`${ROOT}site/assets/components/hx-bench.js`);
  assert.ok(src.includes('if (module === "history") {'), "history has its own branch in modulesText");
  assert.ok(src.includes("parts.push(historyWords(params));"), "the branch says what history does");
});

// ---------- the wire's window copy

test("hx-wire reads the window as 'of the N-token window' for any size", () => {
  const src = read(`${ROOT}site/assets/components/hx-wire.js`);
  assert.ok(src.includes("tokens of the ${formatInt(this.tape.window)}-token window."), "the window copy");
  assert.ok(!src.includes("tokens of a $"), "no 'of a' before a number");
});

// ---------- Break figures keep their captions after upgrade

const BREAK_PAGES = [
  "site/modules/same-model-different-harness.html",
  "site/modules/the-stateless-model.html",
  "site/modules/the-agent-loop.html",
  "site/modules/rein-1-talk-to-a-model.html",
  "site/modules/rein-2-one-tool-and-the-loop.html",
];

for (const rel of BREAK_PAGES) {
  test(`${rel.split("/").pop()}: the Break component sits inside its figure, the caption outside it`, () => {
    const page = read(`${ROOT}${rel}`);
    const comps = [...page.matchAll(/<(hx-(?:incident|replay))[^>]*>([\s\S]*?)<\/\1>/g)];
    const breakComp = comps.find((m) => /\bdata-objective="[^"]*"|\blocked\b/.test(m[0]) && /predict|locked/.test(m[0]));
    assert.ok(breakComp, "a locked incident or replay");
    assert.ok(!breakComp[2].includes("<figcaption"), "no caption inside the component's fallback");
    const before = page.slice(0, breakComp.index);
    assert.ok(/<figure>\s*$/.test(before), "the component opens the figure");
    const after = page.slice(breakComp.index + breakComp[0].length);
    assert.ok(/^\s*<figcaption>FIG [^<]+<\/figcaption>\s*<\/figure>/.test(after), "the FIG caption follows, then the figure closes");
  });
}
