// Pure tests for hx-cards' content rules (AUTHORING §10) against the demo cards and course.json:
// every card is well formed, the six types are all present, the answers the components judge are
// the ones the card names, and the order-turn and name-family choices start unsolved.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CARD_TYPES, cardProblem, jsonRows, pointerGet, seedOf, shuffleAway, familyChoices,
} from "../lib/leitner.js";

const load = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));
const cards = load("../../../labs/data/cards-demo.json");
const course = load("../../../../course.json");
const wireIds = [...course.wires].sort((a, b) => a.n - b.n).map((wire) => wire.id);
const familyIds = course.failure_families.map((family) => family.id);

test("the demo set has one card of each of the six types", () => {
  assert.deepEqual(cards.map((card) => card.type).sort(), [...CARD_TYPES].sort());
});

test("every demo card is well formed, with unique ids", () => {
  const ids = new Set();
  for (const card of cards) {
    assert.equal(cardProblem(card, wireIds, familyIds), null, `${card.id}`);
    assert.equal(ids.has(card.id), false, `duplicate id ${card.id}`);
    ids.add(card.id);
  }
});

test("the demo copy has no exclamation marks (course voice, AUTHORING §10 and DESIGN §11)", () => {
  for (const card of cards) {
    const text = [card.front, card.back, ...(card.trace ?? []), ...(card.items ?? [])].join(" ");
    assert.equal(text.includes("!"), false, `${card.id} has an exclamation mark`);
  }
});

test("which-wire and name-family name a real wire and family", () => {
  const which = cards.find((card) => card.type === "which-wire");
  assert.equal(which.wire, "context", "the context flood is a context wire problem");
  const family = cards.find((card) => card.type === "name-family");
  assert.equal(family.family, "approval-fatigue");
  const choices = familyChoices(family.family, familyIds, family.id);
  assert.equal(choices.length, 3);
  assert.ok(choices.includes(family.family));
});

test("the spot-bug card points at a row the component can mark", () => {
  const spot = cards.find((card) => card.type === "spot-bug-json");
  const rows = jsonRows(spot.json);
  assert.ok(rows.some((row) => row.pointer === spot.bug_path), "no row carries bug_path");
  assert.equal(typeof pointerGet(spot.json, spot.bug_path), "string");
  assert.equal(rows.map((row) => row.text).join("\n"), JSON.stringify(spot.json, null, 2));
});

test("the order-turn card starts out of order and its correct order is the items", () => {
  const order = cards.find((card) => card.type === "order-turn");
  const start = shuffleAway(order.items, seedOf(order.id));
  assert.notDeepEqual(start, order.items);
  assert.deepEqual([...start].sort(), [...order.items].sort());
  assert.deepEqual(shuffleAway(order.items, seedOf(order.id)), start, "the start order is deterministic");
});
