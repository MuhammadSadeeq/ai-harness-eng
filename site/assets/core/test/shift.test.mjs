import { test } from "node:test";
import assert from "node:assert/strict";
import {
  seedOf, dayNumber, dayOf, entriesOn, incidentHunted, unhuntedIncidents, drillDone, pickShift, shiftLeft, cardsLine,
} from "../shell/shift.js";

const at = (day, hour = 12) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00`).toISOString();

const INCIDENTS = [
  { module: "A1", tape: "a1-good", family: "false-done", title: "What a model does" },
  { module: "B2", tape: "b2-spiral", family: "almost-done-spiral", title: "The agent loop" },
  { module: "C6", tape: "c6-outage", family: "retry-storm", title: "Errors" },
];
const SAY = ["A1", "B2", "C6"];
const MEMORY = [
  { id: "A5-validate", module: "A5", title: "Check the input" },
  { id: "B2-loop", module: "B2", title: "Write the agent loop" },
];

test("the seed is stable for the same text and differs between days", () => {
  assert.equal(seedOf("2026-10-11"), seedOf("2026-10-11"));
  assert.notEqual(seedOf("2026-10-11"), seedOf("2026-10-12"));
});

test("consecutive days are one apart", () => {
  assert.equal(dayNumber("2026-10-12") - dayNumber("2026-10-11"), 1);
  assert.equal(dayNumber("2026-03-01") - dayNumber("2026-02-28"), 1);
});

test("an evidence entry belongs to the local day it was recorded on", () => {
  assert.equal(dayOf({ at: at("2026-10-11") }), "2026-10-11");
  assert.equal(dayOf({}), "");
  assert.equal(dayOf({ at: "not a date" }), "");
});

test("entriesOn keeps only the entries of that day", () => {
  const evidence = [{ kind: "say", at: at("2026-10-10") }, { kind: "say", at: at("2026-10-11") }, { kind: "say" }];
  assert.deepEqual(entriesOn(evidence, "2026-10-11"), [evidence[1]]);
  assert.deepEqual(entriesOn(undefined, "2026-10-11"), []);
});

test("an incident is hunted when its tape has an incident entry", () => {
  const evidence = [{ kind: "incident", detail: { tape: "a1-good" } }];
  assert.equal(incidentHunted(evidence, "a1-good"), true);
  assert.equal(incidentHunted(evidence, "b2-spiral"), false);
  assert.deepEqual(unhuntedIncidents(INCIDENTS, evidence).map((x) => x.tape), ["b2-spiral", "c6-outage"]);
});

test("a say drill is done after any self-graded prompt, a kata drill after its tests pass", () => {
  assert.equal(drillDone([{ kind: "say" }], { kind: "say" }), true);
  assert.equal(drillDone([], { kind: "say" }), false);
  const kata = { kind: "kata", id: "B2-loop", module: "B2", title: "t" };
  assert.equal(drillDone([{ kind: "kata", detail: { id: "B2-loop", passed: false } }], kata), false);
  assert.equal(drillDone([{ kind: "kata", detail: { id: "B2-loop", passed: true } }], kata), true);
  assert.equal(drillDone([{ kind: "kata", detail: { id: "A5-validate", passed: true } }], kata), false);
});

test("the shift comes from done modules when there are any", () => {
  const shift = pickShift({ incidents: INCIDENTS, memory: MEMORY, doneModules: ["C6"], day: "2026-10-11" });
  assert.equal(shift.scope, "done");
  assert.equal(shift.incident.module, "C6");
});

test("with no module done, the shift comes from the whole course", () => {
  const shift = pickShift({ incidents: INCIDENTS, memory: MEMORY, doneModules: [], day: "2026-10-11" });
  assert.equal(shift.scope, "course");
  assert.ok(INCIDENTS.includes(shift.incident));
});

test("the same day picks the same shift, and no incidents means no incident", () => {
  const one = pickShift({ incidents: INCIDENTS, memory: MEMORY, doneModules: [], day: "2026-10-11" });
  const two = pickShift({ incidents: INCIDENTS, memory: MEMORY, doneModules: [], day: "2026-10-11" });
  assert.deepEqual(one, two);
  assert.equal(pickShift({ incidents: [], memory: [], day: "2026-10-11" }).incident, null);
});

test("drills alternate by day: odd days give a memory kata, even days a say prompt", () => {
  const odd = pickShift({ incidents: INCIDENTS, memory: MEMORY, sayModules: SAY, day: "2026-10-11" });
  const even = pickShift({ incidents: INCIDENTS, memory: MEMORY, sayModules: SAY, day: "2026-10-12" });
  assert.equal(odd.drill.kind, "kata");
  assert.ok(MEMORY.some((kata) => kata.id === odd.drill.id));
  assert.equal(even.drill.kind, "say");
  assert.ok(SAY.includes(even.drill.module));
});

test("with no memory kata, every day is a say drill from one module", () => {
  const drill = pickShift({ incidents: INCIDENTS, memory: [], sayModules: SAY, day: "2026-10-11" }).drill;
  assert.equal(drill.kind, "say");
  assert.ok(SAY.includes(drill.module));
});

test("the say drill names a module that has prompts, and none when no module has any", () => {
  assert.equal(pickShift({ incidents: INCIDENTS, memory: [], sayModules: [], day: "2026-10-11" }).drill.module, "");
});

test("shiftLeft lists what is not done yet, and nothing when both parts are done", () => {
  const shift = pickShift({ incidents: INCIDENTS, memory: [], day: "2026-10-11" });
  assert.deepEqual(shiftLeft(shift, []), ["incident", "drill"]);
  const done = [{ kind: "incident", detail: { tape: shift.incident.tape } }, { kind: "say" }];
  assert.deepEqual(shiftLeft(shift, done), []);
});

test("the cards line says what is due, or starts a session of new cards when nothing is", () => {
  assert.equal(cardsLine({ due: 1, started: 1, boardSize: 419 }), "1 card due today.");
  assert.equal(cardsLine({ due: 3, started: 9, boardSize: 419 }), "3 cards due today.");
  assert.equal(cardsLine({ due: 0, started: 0, boardSize: 419 }), "Nothing is due yet. Start your board with 20 new cards.");
  assert.equal(cardsLine({ due: 0, started: 405, boardSize: 419 }), "Nothing is due yet. Start your board with 14 new cards.");
  assert.equal(cardsLine({ due: 0, started: 419, boardSize: 419 }), "Nothing is due yet, and every card on the board has been started.");
});
