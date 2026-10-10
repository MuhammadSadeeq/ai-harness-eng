// Pure logic of hx-check: the item check, and the fact field on an option (its why carries a fact chip).
// hx-check.js defines a custom element at import time, so the DOM globals it needs are stubbed here.
// Run: node --test "site/assets/components/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { validItem, whyParts } = await import("../hx-check.js");

const item = {
  id: "c1", question: "Which?", answer: 0, mode: "check",
  options: [{ text: "a", why: "Right." }, { text: "b", why: "Tempting." }],
};

test("an option's fact is an optional id", () => {
  validItem(item, "check");
  validItem({ ...item, options: [{ text: "a", why: "Right.", fact: "models.sonnet-5-5-price" }, item.options[1]] }, "check");
  assert.throws(() => validItem({ ...item, options: [{ text: "a", why: "Right.", fact: 7 }, item.options[1]] }, "check"), /fact that is not an id/);
});

test("validItem keeps the AUTHORING §10 checks: 2 to 5 options, a valid answer, an outcome for predictions", () => {
  assert.throws(() => validItem({ ...item, options: [item.options[0]] }, "check"), /2 to 5 options/);
  assert.throws(() => validItem({ ...item, answer: 2 }, "check"), /valid answer index/);
  assert.throws(() => validItem({ ...item, options: [{ text: "a" }, item.options[1]] }, "check"), /text or why/);
  assert.throws(() => validItem(item, "predict"), /needs an outcome/);
});

test("whyParts: an option with a fact carries the id; one without carries null", () => {
  assert.deepEqual(whyParts({ text: "a", why: "Right.", fact: "models.sonnet-5-5-price" }), { text: "Right.", fact: "models.sonnet-5-5-price" });
  assert.deepEqual(whyParts({ text: "b", why: "Tempting." }), { text: "Tempting.", fact: null });
});
