// lib/credit.js (D-061): what a finished hunt, card session and replay credits. A wrong hunt credits nothing, a right
// one credits the element's objectives; cards credit only the objective of a card answered right; a replay credits nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { incidentCredit, cardCredit, replayCredit } from "../lib/credit.js";

const incident = { family: "retry-storm", wire: "errors", correct_fix: "jitter" };
const right = { family: "retry-storm", wire: "errors", fix: "jitter" };

test("a hunt with the right family, wire and fix credits the element's objectives", () => {
  assert.deepEqual(incidentCredit(["A4.o3"], incident, right), ["A4.o3"]);
});

test("a wrong family, a wrong wire or a wrong fix each credit nothing", () => {
  assert.deepEqual(incidentCredit(["A4.o3"], incident, { ...right, family: "shift-amnesia" }), []);
  assert.deepEqual(incidentCredit(["A4.o3"], incident, { ...right, wire: "tools" }), []);
  assert.deepEqual(incidentCredit(["A4.o3"], incident, { ...right, fix: "retry-forever" }), []);
  assert.deepEqual(incidentCredit(["A4.o3"], incident, { family: "x", wire: "y", fix: "z" }), []);
});

test("a credited hunt returns a copy, so the element's own list is never changed", () => {
  const own = ["A4.o3"];
  const credited = incidentCredit(own, incident, right);
  credited.push("Z9.o9");
  assert.deepEqual(own, ["A4.o3"]);
});

const cards = new Map([
  ["H0-k1", { id: "H0-k1", objective: "H0.o1" }],
  ["H0-k2", { id: "H0-k2", objective: "H0.o3" }],
  ["H0-k3", { id: "H0-k3", objective: "H0.o3" }],
  ["H0-k4", { id: "H0-k4" }],
]);

test("cards credit the objective of each card answered right, once each", () => {
  assert.deepEqual(cardCredit(["H0-k1", "H0-k2", "H0-k3"], cards), ["H0.o1", "H0.o3"]);
  assert.deepEqual(cardCredit(["H0-k2", "H0-k2"], cards), ["H0.o3"]);
});

test("a card answered Again is not in the right list, so it credits nothing", () => {
  assert.deepEqual(cardCredit([], cards), []);
  assert.deepEqual(cardCredit(["H0-k1"], cards), ["H0.o1"], "only the card answered right");
});

test("a card with no objective credits nothing, and an unknown card id credits nothing", () => {
  assert.deepEqual(cardCredit(["H0-k4", "nope"], cards), []);
});

test("the compiled H0 cards carry the objective the review credits", () => {
  const data = JSON.parse(readFileSync(fileURLToPath(new URL("../../../data/cards/H0.json", import.meta.url)), "utf8"));
  const byId = new Map(data.map((card) => [card.id, card]));
  assert.equal(byId.get("H0-k1").objective, "H0.o1");
  assert.deepEqual(cardCredit(["H0-k1"], byId), ["H0.o1"]);
});

test("a replay credits nothing, whatever its result", () => {
  assert.deepEqual(replayCredit(), []);
});

// The components pass these rules into their evidence calls (a guard against an evidence call that credits by default).
const source = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

test("hx-incident credits through incidentCredit, and hx-cards and hx-replay through their rules", () => {
  assert.match(source("../hx-incident.js"), /this\.evidence\("incident",[\s\S]*?\}, incidentCredit\(declared, inc, picks\)\);/);
  assert.match(source("../hx-cards.js"), /this\.evidence\("cards",[^\n]*cardCredit\(this\.rightIds, this\.cards\)\);/);
  assert.match(source("../hx-replay.js"), /this\.evidence\("replay",[^\n]*replayCredit\(\)\);/);
});
