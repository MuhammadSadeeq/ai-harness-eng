// Pure logic of the BP-3.1 labs: the sampler's softmax and picks, the tokenizer's split and estimate, the forgetful
// stand-in, the dice formulas and the seeded roll. The lab modules define custom elements at import time, so the DOM
// globals they need are stubbed here. Run: node --test "site/assets/components/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { probabilities, pick, topIndex } = await import("../hx-sampler.js");
const { approximateSplit, estimate, shareText } = await import("../hx-tokenizer.js");
const { standIn, requestOf } = await import("../hx-forgetful.js");
const { formulas, roll } = await import("../hx-dice.js");
const { createPrng } = await import("../../sim/prng.js");
const { tokens } = await import("../../sim/index.js");

const cands = [{ text: "Sydney", logit: 2.6 }, { text: "Canberra", logit: 2.1 }, { text: "Melbourne", logit: 1.0 }, { text: "Perth", logit: 0.2 }];
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("sampler: softmax(logit / T) at T 1.0 sums to 1 and orders by logit", () => {
  const p = probabilities(cands, 10);
  near(p.reduce((a, b) => a + b, 0), 1);
  assert.deepEqual(p.map((x) => x > 0), [true, true, true, true]);
  assert.ok(p[0] > p[1] && p[1] > p[2] && p[2] > p[3]);
  // e^2.6 / (e^2.6 + e^2.1 + e^1.0 + e^0.2) = 13.4637 / 25.5657 = 0.5266
  near(Math.round(p[0] * 1000) / 1000, 0.527);
});

test("sampler: at temperature 0 the top candidate is the whole distribution", () => {
  assert.deepEqual(probabilities(cands, 0), [1, 0, 0, 0]);
  assert.equal(topIndex(cands), 0);
});

test("sampler: a draw picks by cumulative probability; the same seed repeats", () => {
  const p = probabilities(cands, 10);
  assert.equal(pick(p, 0), 0);
  assert.equal(pick(p, 0.9999), 3);
  const a = createPrng(7);
  const b = createPrng(7);
  const first = Array.from({ length: 20 }, () => pick(p, a.next() / 4294967296));
  const second = Array.from({ length: 20 }, () => pick(p, b.next() / 4294967296));
  assert.deepEqual(first, second);
});

test("tokenizer: long words are cut into 4-character pieces; punctuation is its own piece", () => {
  assert.deepEqual(approximateSplit("tokenizers, ok"), ["toke", "nize", "rs", ",", " ok"]);
  assert.deepEqual(approximateSplit(""), []);
});

test("tokenizer: the window share is 'less than 1%' above 0 and under 1, else the integer percent", () => {
  assert.equal(shareText(16, 8000), "less than 1%");
  assert.equal(shareText(0, 8000), "0%", "an empty text has no share to call less than 1%");
  assert.equal(shareText(80, 8000), "1%");
  assert.equal(shareText(4000, 8000), "50%");
});

test("tokenizer: the estimate is the simulator's tokens() rule on the text", () => {
  assert.equal(estimate("abcd"), tokens("abcd"));
  assert.equal(estimate("abcd"), 1, '"abcd" is 6 characters in JSON: floor(6 / 4)');
  assert.ok(estimate("x".repeat(400)) > estimate("x".repeat(40)));
});

const rules = [
  { match: "my name is ([A-Za-z]+)", remembers: "name", reply: "Got it. Your name is $1." },
  { match: "what is my name", reply: "Your name is $name." },
];

test("forgetful: with the history resent the stand-in knows the name; without it, it does not", () => {
  const history = [
    { role: "user", text: "My name is Sam." },
    { role: "assistant", text: "Got it. Your name is Sam." },
    { role: "user", text: "What is my name?" },
  ];
  assert.equal(standIn(requestOf(history, true), rules), "Your name is Sam.");
  assert.equal(standIn(requestOf(history, false), rules), "I don't know your name.");
  assert.equal(requestOf(history, false).length, 1, "only the new message is sent");
});

test("forgetful: a message with no rule gets the demo's fallback reply", () => {
  assert.equal(standIn([{ role: "user", text: "Hello" }], rules), "I don't have a rule for that in this demo.");
});

test("dice: pass@k = 1 - (1 - p)^k and pass^k = p^k", () => {
  const f = formulas(90, 3);
  near(f.atLeastOne, 1 - 0.1 ** 3);
  near(f.all, 0.9 ** 3);
  assert.equal(Math.round(f.atLeastOne * 100), 100, "0.1^3 is tiny: at least one try works almost always");
  assert.equal(Math.round(f.all * 100), 73);
});

test("dice: a seeded roll repeats exactly and has tasks rows of k tries", () => {
  const a = roll(createPrng(3), 90, 3, 20);
  const b = roll(createPrng(3), 90, 3, 20);
  assert.equal(a.length, 20);
  assert.ok(a.every((row) => row.length === 3));
  assert.deepEqual(a, b);
});
