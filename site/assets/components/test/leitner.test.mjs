// Pure tests for lib/leitner.js: the Leitner schedule (D-026), local dates, the session queue, the
// summary sentence, the ENGINE §3 PRNG against the shared fixture, and the JSON rows of spot-bug cards.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  INTERVALS, MAX_BOX, SESSION_LIMIT, localToday, addDays, newCard, grade, sessionQueue, nextDueText,
  sessionSummary, seedOf, mulberry32, shuffle, shuffleAway, familyChoices, pointerTokens, pointerGet,
  jsonRows, cardProblem, stored,
} from "../lib/leitner.js";

const load = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));

test("intervals are the D-026 boxes: 0, 1, 3, 7, 16, 35 days", () => {
  assert.deepEqual([...INTERVALS], [0, 1, 3, 7, 16, 35]);
  assert.equal(MAX_BOX, 6);
  assert.equal(SESSION_LIMIT, 20);
});

test("a new card is in box 1 and due today", () => {
  assert.deepEqual(newCard("2026-10-10"), { box: 1, due: "2026-10-10", seen: 0, last: null });
});

test("a right answer moves up one box and is due after that box's interval", () => {
  const today = "2026-10-10";
  let card = newCard(today);
  card = grade(card, true, today);
  assert.deepEqual(card, { box: 2, due: "2026-10-11", seen: 1, last: today });
  card = grade(card, true, today);
  assert.deepEqual(card, { box: 3, due: "2026-10-13", seen: 2, last: today });
  card = grade(card, true, today);
  assert.equal(card.box, 4);
  assert.equal(card.due, "2026-10-17");
});

test("box 6 is the top: a right answer keeps it there, due 35 days later", () => {
  let card = { box: 5, due: "2026-10-10", seen: 4, last: "2026-09-01" };
  card = grade(card, true, "2026-10-10");
  assert.equal(card.box, 6);
  assert.equal(card.due, "2026-11-14");
  card = grade(card, true, "2026-10-10");
  assert.equal(card.box, 6, "the top box does not go past 6");
  assert.equal(card.due, "2026-11-14");
});

test("a miss returns the card to box 1, due today, and counts the review", () => {
  const card = grade({ box: 5, due: "2026-10-01", seen: 9, last: "2026-09-20" }, false, "2026-10-10");
  assert.deepEqual(card, { box: 1, due: "2026-10-10", seen: 10, last: "2026-10-10" });
});

test("dates add across month, year and leap-day boundaries", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2028-02-29", 1), "2028-03-01");
  assert.equal(addDays("2026-10-10", 0), "2026-10-10");
  assert.throws(() => addDays("10/10/2026", 1), /bad date/);
});

test("today is the local calendar date, not the UTC date", () => {
  // Built from local parts, so the expected date does not depend on the machine's time zone.
  assert.equal(localToday(new Date(2026, 0, 5, 0, 30)), "2026-01-05");
  assert.equal(localToday(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
});

test("stored() reads own keys only, so card ids that look like object members are new", () => {
  assert.equal(stored({}, "constructor"), null);
  assert.equal(stored({ a: { box: 2 } }, "a").box, 2);
  assert.equal(stored({ a: 3 }, "a"), null);
  assert.equal(stored(undefined, "a"), null);
});

test("the queue is the due cards by due date, then the new cards, at most 20", () => {
  const ids = ["n1", "d2", "d1", "f1", "later"];
  const cards = {
    d1: { box: 2, due: "2026-10-09", seen: 1, last: "2026-10-08" },
    d2: { box: 1, due: "2026-10-10", seen: 1, last: "2026-10-09" },
    later: { box: 3, due: "2026-10-13", seen: 2, last: "2026-10-10" },
  };
  assert.deepEqual(sessionQueue(cards, ids, "2026-10-10"), ["d1", "d2", "n1", "f1"]);
  const many = Array.from({ length: 25 }, (_, i) => `c${String(i).padStart(2, "0")}`);
  assert.equal(sessionQueue({}, many, "2026-10-10").length, 20);
});

test("nextDueText names tomorrow, a later date, or today, with the card count", () => {
  const today = "2026-10-10";
  const tomorrow = Object.fromEntries(["a", "b", "c", "d"].map((id) => [id, { due: "2026-10-11" }]));
  assert.equal(nextDueText(tomorrow, Object.keys(tomorrow), today), "Next due: tomorrow (4 cards).");
  const later = { a: { due: "2026-10-17" }, b: { due: "2026-10-13" }, c: { due: "2026-10-13" } };
  assert.equal(nextDueText(later, Object.keys(later), today), "Next due: 2026-10-13 (2 cards).");
  const single = { a: { due: "2026-10-11" } };
  assert.equal(nextDueText(single, ["a"], today), "Next due: tomorrow (1 card).");
  const none = { a: { due: today } };
  assert.equal(nextDueText(none, ["a"], today), "Next due: today (1 card).");
});

test("the summary sentence matches the director's wording", () => {
  const today = "2026-10-10";
  const cards = Object.fromEntries(["a", "b", "c", "d"].map((id) => [id, { due: "2026-10-11" }]));
  const text = sessionSummary({ reviewed: 12, right: 9, again: 3 }, cards, Object.keys(cards), today);
  assert.equal(text, "12 reviewed: 9 right, 3 again. Next due: tomorrow (4 cards).");
});

test("seedOf sums the character codes of the id", () => {
  assert.equal(seedOf("ab"), 97 + 98);
  assert.equal(seedOf(""), 0);
});

test("mulberry32 matches the shared ENGINE §3 fixture for the first outputs of each seed", () => {
  const fixture = load("../../../../scenarios/fixtures/prng.json");
  for (const [key, values] of Object.entries(fixture.seeds)) {
    const seed = Number(key.replace("seed_", ""));
    const next = mulberry32(seed);
    const produced = values.map(() => next());
    assert.deepEqual(produced, values, `${key} diverges from the fixture`);
  }
});

test("shuffle is a deterministic permutation and never touches its input", () => {
  const items = ["one", "two", "three", "four", "five"];
  const first = shuffle(items, seedOf("B2-c3"));
  assert.deepEqual(shuffle(items, seedOf("B2-c3")), first);
  assert.deepEqual([...first].sort(), [...items].sort());
  assert.deepEqual(items, ["one", "two", "three", "four", "five"]);
});

test("shuffleAway never returns the input order for two or more items", () => {
  const items = ["a", "b", "c"];
  for (let seed = 0; seed < 50; seed += 1) {
    assert.notDeepEqual(shuffleAway(items, seed), items, `seed ${seed} is already in order`);
  }
  assert.deepEqual(shuffleAway(["solo"], 0), ["solo"]);
});

test("familyChoices picks the right family and two others, deterministically", () => {
  const families = ["false-done", "context-flood", "orphaned-tool-call", "approval-fatigue", "retry-storm"];
  const choices = familyChoices("context-flood", families, "C2-c1");
  assert.equal(choices.length, 3);
  assert.equal(new Set(choices).size, 3);
  assert.ok(choices.includes("context-flood"));
  assert.ok(choices.every((family) => families.includes(family)));
  assert.deepEqual(familyChoices("context-flood", families, "C2-c1"), choices);
});

test("JSON pointers decode ~0 and ~1 and resolve nested values", () => {
  assert.deepEqual(pointerTokens(""), []);
  assert.deepEqual(pointerTokens("/a~1b/c~0d/0"), ["a/b", "c~d", "0"]);
  assert.throws(() => pointerTokens("a/b"), /bad JSON pointer/);
  const doc = { "a/b": { "c~d": [{ id: "x" }] } };
  assert.equal(pointerGet(doc, "/a~1b/c~0d/0/id"), "x");
  assert.equal(pointerGet(doc, "/missing"), undefined);
});

test("jsonRows joins to exactly JSON.stringify(value, null, 2) and each key row carries its pointer", () => {
  const doc = {
    name: "run",
    turns: [{ id: "t1", tool: "read", input: {} }, { id: "t2", tool: "write", input: { path: "a/b" } }],
    empty: [],
    ok: true,
  };
  const rows = jsonRows(doc);
  assert.equal(rows.map((row) => row.text).join("\n"), JSON.stringify(doc, null, 2));
  const idRow = rows.find((row) => row.text.includes('"id": "t2"'));
  assert.equal(idRow.pointer, "/turns/1/id");
  const pathRow = rows.find((row) => row.text.includes('"path"'));
  assert.equal(pathRow.pointer, "/turns/1/input/path");
  assert.ok(rows.some((row) => row.pointer === null && row.text.trim() === "],"), "closing rows carry no pointer");
});

test("cardProblem reports the first problem in AUTHORING §10 shape, or null", () => {
  const wires = ["control", "loop"];
  const families = ["false-done", "context-flood", "orphaned-tool-call"];
  const base = { id: "T-1", type: "term", front: "What is a turn?", back: "One model call." };
  assert.equal(cardProblem(base, wires, families), null);
  assert.match(cardProblem({ ...base, type: "quiz" }, wires, families), /unknown type/);
  assert.match(cardProblem({ ...base, back: " " }, wires, families), /no back/);
  assert.match(cardProblem({ ...base, type: "which-wire", wire: "tools" }, wires, families), /not a course wire/);
  assert.match(cardProblem({ ...base, type: "spot-bug-json", json: { a: 1 }, bug_path: "/b" }, wires, families), /not in json/);
  assert.equal(cardProblem({ ...base, type: "spot-bug-json", json: { a: 1 }, bug_path: "/a" }, wires, families), null);
  assert.match(cardProblem({ ...base, type: "order-turn", items: ["a", "a", "b"] }, wires, families), /different strings/);
  assert.match(cardProblem({ ...base, type: "name-family", trace: ["1", "2"], family: "false-done" }, wires, families), /5 to 10/);
  assert.match(cardProblem({ ...base, type: "name-family", trace: ["1", "2", "3", "4", "5"], family: "nope" }, wires, families), /not a course family/);
});

test("sessionQueue takes the new cards in the given fresh order, and a stored card is never new (D-062)", () => {
  const ids = ["a1", "b1", "c1"];
  const cards = { b1: { ...newCard("2026-10-10"), due: "2026-10-20" } };
  // Without an order, the new cards come in set order (a1, c1: b1 is stored and not new).
  assert.deepEqual(sessionQueue(cards, ids, "2026-10-11"), ["a1", "c1"]);
  // With an order, the new cards come in that order; a stored card in the order is still not new.
  assert.deepEqual(sessionQueue(cards, ids, "2026-10-11", SESSION_LIMIT, ["c1", "b1", "a1"]), ["c1", "a1"]);
  // A due card still comes first, in its own order.
  const due = { a1: { ...newCard("2026-10-01"), due: "2026-10-01" } };
  assert.deepEqual(sessionQueue(due, ids, "2026-10-11", SESSION_LIMIT, ["c1"]), ["a1", "c1"]);
});
