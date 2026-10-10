// Shell helper tests: progress marks from the store and the course, the Continue target, the shift copy,
// the oldest verified fact, the fact chip label, the loader's registry filter, the due count and terms.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  moduleStatus, partMarks, continueTarget, shiftFor, dueCards, oldestFactDate,
  formatDay, factChipLabel, filterRegistry, termEntry, splitLoads,
} from "../shell/pure.js";

const course = JSON.parse(readFileSync(new URL("../../../data/course.json", import.meta.url), "utf8"));

test("moduleStatus reads the store's modules record and defaults to todo", () => {
  const doc = { modules: { "S0": { status: "done" }, "A1": { status: "started" }, "A2": { status: "other" } } };
  assert.equal(moduleStatus(doc, "S0"), "done");
  assert.equal(moduleStatus(doc, "A1"), "started");
  assert.equal(moduleStatus(doc, "A2"), "todo");
  assert.equal(moduleStatus({}, "A9"), "todo");
});

test("partMarks: an empty store marks every part ahead, with the real module counts", () => {
  const marks = partMarks(course, { modules: {} });
  assert.equal(marks.length, course.parts.length);
  assert.ok(marks.every((m) => m.state === "ahead" && m.done === 0));
  const b = marks.find((m) => m.id === "B");
  assert.equal(b.total, course.modules.filter((m) => m.part === "B").length);
});

test("partMarks: done when every module is done, in progress when some are started", () => {
  const modules = {};
  for (const m of course.modules.filter((x) => x.part === "S")) modules[m.id] = { status: "done" };
  const a1 = course.modules.find((m) => m.part === "A");
  modules[a1.id] = { status: "started" };
  const marks = partMarks(course, { modules });
  assert.equal(marks.find((m) => m.id === "S").state, "done");
  assert.equal(marks.find((m) => m.id === "A").state, "in_progress");
  assert.equal(marks.find((m) => m.id === "C").state, "ahead");
});

test("continueTarget: the first unfinished path module, with its page address", () => {
  const first = continueTarget(course, { modules: {} });
  assert.equal(first.id, course.path[0]);
  assert.equal(first.href, `modules/${course.modules.find((m) => m.id === first.id).slug}.html`);
  const doneAll = { modules: Object.fromEntries(course.path.map((id) => [id, { status: "done" }])) };
  assert.equal(continueTarget(course, doneAll), null);
});

test("continueTarget skips finished modules in path order", () => {
  const doc = { modules: { [course.path[0]]: { status: "done" }, [course.path[1]]: { status: "done" } } };
  assert.equal(continueTarget(course, doc).id, course.path[2]);
});

test("shiftFor: the current module's failure family, from course.json", () => {
  const shift = shiftFor(course, "B2");
  assert.equal(shift.module, "B2");
  assert.equal(shift.name, "The “almost done” spiral");
  assert.equal(shiftFor(course, "NOPE"), null);
});

test("dueCards counts cards due on or before today and ignores malformed cards", () => {
  const doc = { cards: { a: { due: "2026-10-09" }, b: { due: "2026-10-10" }, c: { due: "2026-10-11" }, d: null, e: { due: 7 } } };
  assert.equal(dueCards(doc, "2026-10-10"), 2);
  assert.equal(dueCards({}, "2026-10-10"), 0);
});

test("oldestFactDate: the oldest verified date, ignoring unverified facts", () => {
  const facts = {
    a: { status: "verified", verified_on: "2026-10-10" },
    b: { status: "verified", verified_on: "2026-09-02" },
    c: { status: "stale", verified_on: "2025-01-01" },
    d: { status: "verified" },
  };
  assert.equal(oldestFactDate(facts), "2026-09-02");
  assert.equal(oldestFactDate({ x: { status: "stale", verified_on: "2025-01-01" } }), null);
});

test("the real facts registry has an oldest verified date", () => {
  const facts = JSON.parse(readFileSync(new URL("../../../data/facts.json", import.meta.url), "utf8"));
  assert.match(oldestFactDate(facts), /^\d{4}-\d{2}-\d{2}$/);
});

test("date labels: the footer's full day and the fact chip's month and year", () => {
  assert.equal(formatDay("2026-10-10"), "10 Oct 2026");
  assert.equal(factChipLabel("2026-10-10"), "verified Oct 2026");
});

test("filterRegistry keeps only registered tags present on the page, in page order", () => {
  const registry = { "hx-clock": "../components/hx-clock.js", "hx-replay": "../components/hx-replay.js" };
  const present = ["hx-replay", "hx-unknown", "hx-clock", "hx-clock"];
  assert.deepEqual(filterRegistry(registry, present), [
    { tag: "hx-replay", url: "../components/hx-replay.js" },
    { tag: "hx-clock", url: "../components/hx-clock.js" },
    { tag: "hx-clock", url: "../components/hx-clock.js" },
  ]);
  assert.deepEqual(filterRegistry({}, ["hx-clock"]), [], "an empty registry loads nothing");
});

test("splitLoads: a tag loads at once when an element starts within 1.5 viewport heights, the rest wait", () => {
  const items = [
    { tag: "hx-clock", top: 120 }, { tag: "hx-replay", top: 1300 }, { tag: "hx-replay", top: 4000 },
    { tag: "hx-wire", top: 2000 }, { tag: "hx-clock", top: 3000 },
  ];
  assert.deepEqual(splitLoads(items, 900), { eager: ["hx-clock", "hx-replay"], lazy: ["hx-wire"] });
  assert.deepEqual(splitLoads([{ tag: "hx-kata", top: 1349 }], 900), { eager: ["hx-kata"], lazy: [] });
  assert.deepEqual(splitLoads([{ tag: "hx-kata", top: 1350 }], 900), { eager: [], lazy: ["hx-kata"] });
  assert.deepEqual(splitLoads([], 900), { eager: [], lazy: [] });
});

test("termEntry: graceful when the terms list is empty or missing", () => {
  assert.equal(termEntry([], "stop-reason"), null);
  assert.equal(termEntry(undefined, "stop-reason"), null);
  assert.equal(termEntry([{ id: "stop-reason", definition: "x" }], "stop-reason").definition, "x");
});

test("termEntry: reads terms.json as gen_data writes it, an object keyed by id", () => {
  const terms = { "agent-loop": { id: "agent-loop", term: "agent loop", definition: "The code that calls the model again." } };
  assert.equal(termEntry(terms, "agent-loop").term, "agent loop");
  assert.equal(termEntry(terms, "missing"), null);
  assert.equal(termEntry(terms, "toString"), null);
  assert.equal(termEntry(null, "agent-loop"), null);
});
