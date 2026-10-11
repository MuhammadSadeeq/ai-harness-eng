import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  seedOf, dayNumber, dayOf, entriesOn, incidentHunted, unhuntedIncidents, drillDone, pickShift, shiftLeft, cardsLine,
  lastDrilledDays, lastHuntDays, lastDrillDays, drillCredit,
} from "../shell/shift.js";
import { startedIds, wiresByModule } from "../../components/lib/pool.js";

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

test("the pool is the modules the learner has started or finished (D-062)", () => {
  const shift = pickShift({ incidents: INCIDENTS, memory: MEMORY, started: new Set(["B2"]), day: "2026-10-11" });
  assert.equal(shift.scope, "started");
  assert.equal(shift.incident.module, "B2");
});

test("with no module started, the first path module that has an incident is the pool", () => {
  const shift = pickShift({ incidents: INCIDENTS, memory: MEMORY, path: ["X0", "B2", "A1"], day: "2026-10-11" });
  assert.equal(shift.scope, "first");
  assert.equal(shift.incident.module, "B2");
  assert.equal(pickShift({ incidents: INCIDENTS, memory: MEMORY, path: ["A1", "C6"], day: "2026-10-11" }).incident.module, "A1");
});

test("an incident not hunted yet comes before one already hunted", () => {
  const started = new Set(["A1", "B2", "C6"]);
  const huntDays = new Map([["a1-good", dayNumber("2026-10-10")], ["b2-spiral", dayNumber("2026-10-09")]]);
  for (const day of ["2026-10-11", "2026-10-12", "2026-10-13"]) {
    assert.equal(pickShift({ incidents: INCIDENTS, memory: [], started, huntDays, day }).incident.module, "C6");
  }
});

test("when every incident in the pool was hunted at least three days ago, the one hunted longest ago is offered", () => {
  const started = new Set(["A1", "B2", "C6"]);
  const huntDays = new Map([["a1-good", dayNumber("2026-10-01")], ["b2-spiral", dayNumber("2026-10-05")], ["c6-outage", dayNumber("2026-10-06")]]);
  const shift = pickShift({ incidents: INCIDENTS, memory: [], started, huntDays, day: "2026-10-11" });
  assert.equal(shift.incident.module, "A1");
  assert.equal(shift.note, null);
});

test("when every pool incident was hunted less than three days ago, there is no incident, and a note names the next module", () => {
  const started = new Set(["A1", "C6"]);
  const huntDays = new Map([["a1-good", dayNumber("2026-10-10")], ["c6-outage", dayNumber("2026-10-10")]]);
  const shift = pickShift({
    incidents: INCIDENTS, memory: [], started, done: new Set(["A1"]), path: ["A1", "B2", "C6"], huntDays, day: "2026-10-11",
  });
  assert.equal(shift.incident, null);
  assert.equal(shift.note, "Nothing new to hunt today. Start B2 · The agent loop to add its incident.");
  const none = pickShift({
    incidents: INCIDENTS, memory: [], started: new Set(["A1", "B2", "C6"]), done: new Set(), path: ["A1", "B2", "C6"],
    huntDays: new Map(INCIDENTS.map((incident) => [incident.tape, dayNumber("2026-10-10")])), day: "2026-10-11",
  });
  assert.equal(none.note, "Nothing new to hunt today.");
});

test("the note names the next module to start, and the drill still runs", () => {
  const started = new Set(["A1"]);
  const huntDays = new Map([["a1-good", dayNumber("2026-10-10")]]);
  const shift = pickShift({
    incidents: INCIDENTS, memory: MEMORY, sayModules: SAY, started, done: new Set(), path: ["A1", "B2", "C6"], huntDays, day: "2026-10-11",
  });
  assert.equal(shift.incident, null);
  assert.match(shift.note, /Start B2/);
  assert.ok(shift.drill.kind === "kata" || shift.drill.kind === "say");
  assert.ok(shift.drill.module === "" || started.has(shift.drill.module) || shift.drill.module === "A1");
});

test("the drill is the least recently drilled kata of the pool, and ties go to the day's seed", () => {
  const started = new Set(["A5", "B2"]);
  const drillDays = new Map([["kata:B2-loop", dayNumber("2026-10-09")]]);
  const shift = pickShift({ incidents: INCIDENTS, memory: MEMORY, sayModules: SAY, started, drillDays, day: "2026-10-11" });
  assert.equal(shift.drill.id, "A5-validate");
});

test("the say drill is the least recently drilled module of the pool", () => {
  const started = new Set(["A1", "B2"]);
  const drillDays = new Map([["say:A1", dayNumber("2026-10-09")]]);
  const shift = pickShift({ incidents: INCIDENTS, memory: [], sayModules: ["A1", "B2"], started, drillDays, day: "2026-10-12" });
  assert.equal(shift.drill.module, "B2");
});

test("lastHuntDays and lastDrillDays read the latest hunt of each incident and each drill item", () => {
  const evidence = [
    { kind: "incident", at: "2026-10-03T10:00:00", detail: { tape: "a1-good" } },
    { kind: "incident", at: "2026-10-06T10:00:00", detail: { tape: "a1-good" } },
    { kind: "shift", detail: { day: "2026-10-07", drill: "say", drill_module: "A1" } },
    { kind: "shift", detail: { day: "2026-10-08", drill: "B2-loop", drill_module: "B2" } },
  ];
  assert.equal(lastHuntDays(evidence).get("a1-good"), dayNumber("2026-10-06"));
  assert.equal(lastDrillDays(evidence).get("say:A1"), dayNumber("2026-10-07"));
  assert.equal(lastDrillDays(evidence).get("kata:B2-loop"), dayNumber("2026-10-08"));
});

test("among the unhunted incidents, the wire drilled least recently decides", () => {
  const wiresOf = new Map([["A1", ["loop"]], ["B2", ["context"]], ["C6", ["errors"]]]);
  const lastDrilled = new Map([["loop", 100], ["context", 50], ["errors", 90]]);
  const shift = pickShift({ incidents: INCIDENTS, memory: [], started: new Set(["A1", "B2", "C6"]), wiresOf, lastDrilled, day: "2026-10-11" });
  assert.equal(shift.incident.module, "B2");
});

test("a tie in wire recency goes to the day's seed", () => {
  const started = new Set(["A1", "B2", "C6"]);
  const shift = pickShift({ incidents: INCIDENTS, memory: [], started, day: "2026-10-11" });
  assert.equal(shift.incident, INCIDENTS[seedOf("2026-10-11") % INCIDENTS.length]);
});

test("the drill comes from the pool: a memory kata outside it is not picked", () => {
  const shift = pickShift({ incidents: INCIDENTS, memory: MEMORY, sayModules: SAY, started: new Set(["B2"]), day: "2026-10-11" });
  assert.equal(shift.drill.kind, "kata");
  assert.equal(shift.drill.id, "B2-loop");
});

test("lastDrilledDays reads each wire's latest shift, from its incident and its drill's module", () => {
  const wiresOf = new Map([["C6", ["errors"]], ["B2", ["context"]]]);
  const evidence = [
    { kind: "shift", detail: { day: "2026-10-10", incident: "c6-outage", drill: "say", drill_module: "B2" } },
    { kind: "shift", detail: { day: "2026-10-12", incident: "c6-outage", drill: "say", drill_module: "" } },
  ];
  const latest = lastDrilledDays(evidence, INCIDENTS, MEMORY, wiresOf);
  assert.equal(latest.get("errors"), dayNumber("2026-10-12"));
  assert.equal(latest.get("context"), dayNumber("2026-10-10"));
});

test("the same day picks the same shift, and no incidents means no incident", () => {
  const one = pickShift({ incidents: INCIDENTS, memory: MEMORY, doneModules: [], day: "2026-10-11" });
  const two = pickShift({ incidents: INCIDENTS, memory: MEMORY, doneModules: [], day: "2026-10-11" });
  assert.deepEqual(one, two);
  assert.equal(pickShift({ incidents: [], memory: [], day: "2026-10-11" }).incident, null);
});

test("drills alternate by day: odd days give a memory kata, even days a say prompt", () => {
  const started = new Set(["A5", "B2", "A1", "C6"]);
  const odd = pickShift({ incidents: INCIDENTS, memory: MEMORY, sayModules: SAY, started, day: "2026-10-11" });
  const even = pickShift({ incidents: INCIDENTS, memory: MEMORY, sayModules: SAY, started, day: "2026-10-12" });
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

// A week of shifts for a learner, from the real data: the shift is picked, the learner does it (the incident is
// hunted, the drill is done) and the shift is recorded, as the page does. Returns one row per day.
const REAL = {
  shift: JSON.parse(readFileSync(fileURLToPath(new URL("../../../data/oncall/shift.json", import.meta.url)), "utf8")),
  core: JSON.parse(readFileSync(fileURLToPath(new URL("../../../data/course-core.json", import.meta.url)), "utf8")),
};

function dayAfter(day, n) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

function replay(started, days = 7, startDay = "2026-10-11") {
  const { incidents, memory_katas: memory, say_modules: sayModules } = REAL.shift;
  const wiresOf = wiresByModule(REAL.core);
  const modules = Object.fromEntries([...started].map((id) => [id, { status: "started" }]));
  let evidence = [];
  const rows = [];
  for (let n = 0; n < days; n += 1) {
    const day = dayAfter(startDay, n);
    const shift = pickShift({
      incidents, memory, sayModules, started: startedIds(modules), path: REAL.core.path, wiresOf,
      huntDays: lastHuntDays(evidence), drillDays: lastDrillDays(evidence),
      lastDrilled: lastDrilledDays(evidence, incidents, memory, wiresOf), day,
    });
    if (shift.incident) evidence.push({ kind: "incident", module: null, objectives: [], detail: { tape: shift.incident.tape }, at: `${day}T10:00:00.000Z` });
    if (shift.drill.kind === "kata") evidence.push({ kind: "kata", module: null, objectives: [], detail: { id: shift.drill.id, passed: true }, at: `${day}T10:05:00.000Z` });
    evidence.push({
      kind: "shift", module: null, objectives: [],
      detail: { day, incident: shift.incident?.tape ?? "", drill: shift.drill.kind === "kata" ? shift.drill.id : "say", drill_module: shift.drill.module, incident_done: true, drill_done: true },
      at: `${day}T10:10:00.000Z`,
    });
    rows.push({ day, scope: shift.scope, incident: shift.incident?.module ?? "-", family: shift.incident?.family ?? "-", drill: shift.drill.kind === "kata" ? shift.drill.id : `say ${shift.drill.module}`, note: shift.note });
  }
  return rows;
}

// The gap in days between the hunts of a learner's rows (the rows with an incident only).
function huntGaps(rows) {
  const days = rows.map((row, i) => (row.incident === "-" ? null : i)).filter((i) => i !== null);
  return days.slice(1).map((day, i) => day - days[i]);
}

test("replay, nothing started: the one incident of the first path module comes back only three days after its hunt", () => {
  const rows = replay(new Set());
  assert.ok(rows.every((row) => row.scope === "first" && (row.incident === "S0" || row.incident === "-")), JSON.stringify(rows));
  assert.ok(huntGaps(rows).every((gap) => gap >= 3), JSON.stringify(rows));
  assert.ok(rows.some((row) => row.incident === "-"), "the days between hunts have no incident, and say why");
});

test("replay, only S0 started: the same rhythm, and the note never names a module not started", () => {
  const rows = replay(new Set(["S0"]));
  assert.ok(rows.every((row) => row.scope === "started" && (row.incident === "S0" || row.incident === "-")), JSON.stringify(rows));
  assert.ok(huntGaps(rows).every((gap) => gap >= 3), JSON.stringify(rows));
});

test("replay, the first six path modules done: six distinct incidents in six days, the seventh a repeat", () => {
  const rows = replay(new Set(["S0", "A1", "A2", "A3", "A4", "A5"]));
  const firstSix = rows.slice(0, 6).map((row) => row.incident);
  assert.equal(new Set(firstSix).size, 6, JSON.stringify(rows));
});

test("a drill kata credits the slot's objective only once its module is started (D-062 amended)", () => {
  const slot = { objective: "I5.o2", module: "I5" };
  assert.deepEqual(drillCredit(slot, {}), { objective: "", module: "" });
  assert.deepEqual(drillCredit(slot, { A3: { status: "started" } }), { objective: "", module: "" });
  assert.deepEqual(drillCredit(slot, { I5: { status: "started" } }), { objective: "I5.o2", module: "I5" });
  assert.deepEqual(drillCredit(slot, { I5: { status: "done" } }), { objective: "I5.o2", module: "I5" });
  assert.deepEqual(drillCredit({}, { I5: { status: "started" } }), { objective: "", module: "" });
});

test("replay, nothing started: the note never names the first module, which is already the pool", () => {
  const rows = replay(new Set());
  const notes = rows.map((row) => row.note).filter(Boolean);
  assert.ok(notes.length > 0, JSON.stringify(rows));
  assert.ok(notes.every((note) => !note.includes("Start S0 ")), JSON.stringify(notes));
});
