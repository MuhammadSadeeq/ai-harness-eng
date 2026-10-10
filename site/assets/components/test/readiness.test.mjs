// Pure logic of hx-readiness and hx-filter: the level rules (BP-5.2 §2), the summary, the brag sheet's figures, the filter's
// matching, and the real course's built modules. hx-filter.js and hx-readiness.js define custom elements at import time, so
// DOM globals are stubbed here. Run: node --test "site/assets/components/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const {
  LEVEL_WORDS, explainedModules, lastAt, readiness, summarize, wireReadiness, bragData,
} = await import("../lib/readiness.js");
const { matches, shownText, wiresIn } = await import("../hx-filter.js");

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));

// A small course: Loop has two built modules (B2 and B3) and one planned on Loop too; Control has one unbuilt module.
const course = {
  wires: [
    { id: "control", name: "Control plane", short: "Control", glyph: "layers" },
    { id: "loop", name: "Loop & state", short: "Loop", glyph: "cycle" },
  ],
  modules: [
    { id: "B2", title: "The agent loop", wires: ["loop"], objectives: [{ id: "B2.o1" }, { id: "B2.o2" }] },
    { id: "B3", title: "Turn limits", wires: ["loop"], objectives: [{ id: "B3.o1" }] },
    { id: "X1", title: "Planned control", wires: ["control"], objectives: [{ id: "X1.o1" }] },
  ],
};
const core = { modules: [{ id: "B2", built: true }, { id: "B3", built: true }, { id: "X1", built: false }] };

const check = (module, objectives) => ({ kind: "check", module, objectives, detail: {}, at: "2026-10-01T10:00:00.000Z" });
const kata = (module, passed, objectives) => ({ kind: "kata", module, objectives, detail: { passed }, at: "2026-10-02T10:00:00.000Z" });
const bench = (module, objectives) => ({ kind: "bench", module, objectives, detail: { old_passed: 2, new_passed: 3, old: { n: 20, passed: 2 }, new: { n: 20, passed: 3 } }, at: "2026-10-03T10:00:00.000Z" });
const design = (module, objectives, ticked = 20, total = 37) => ({ kind: "design", module, objectives, detail: { item: "ci-fixer", ticked, total }, at: "2026-10-04T10:00:00.000Z" });
const explainedB2B3 = [check("B2", ["B2.o1", "B2.o2"]), check("B3", ["B3.o1"])];
const loopLevel = (evidence) => readiness(course, core, evidence).wires.find((w) => w.id === "loop");

test("level 0: no evidence, and each built module still to explain is named in the next step", () => {
  const model = readiness(course, core, []);
  assert.equal(model.wires[1].level, 0);
  assert.equal(model.wires[1].word, LEVEL_WORDS[0]);
  assert.deepEqual(model.wires[1].lines, [
    "L1: 0 of 2 modules explained",
    "L2: 0 kata or step passed",
    "L3: 0 experiments or design drills",
  ]);
  assert.equal(model.wires[1].next, "Explain every Loop module.");
  assert.equal(model.wires[0].next, "No built module teaches Control yet.", "a wire with no built module says so");
});

test("L1 needs every built module explained: one of two is not enough", () => {
  const partial = loopLevel([check("B2", ["B2.o1", "B2.o2"])]);
  assert.equal(partial.level, 0);
  assert.equal(partial.lines[0], "L1: 1 of 2 modules explained");
  const all = loopLevel(explainedB2B3);
  assert.equal(all.level, 1);
  assert.equal(all.word, "can explain");
  assert.equal(all.next, "Pass one kata or step on a Loop module.");
});

test("L2 needs a passing kata or step with credit on a module of the wire", () => {
  assert.equal(loopLevel([...explainedB2B3, kata("B2", true, [])]).level, 1, "an uncredited pass does not count");
  assert.equal(loopLevel([...explainedB2B3, kata("B2", false, ["B2.o1"])]).level, 1, "a fail does not count");
  const passed = loopLevel([...explainedB2B3, kata("B2", true, ["B2.o1"])]);
  assert.equal(passed.level, 2);
  assert.equal(passed.lines[1], "L2: 1 kata or step passed");
  assert.equal(loopLevel([...explainedB2B3, { kind: "step", module: "B3", objectives: ["B3.o1"], detail: { step: "s1", match: true }, at: "" }]).level, 2);
  assert.equal(loopLevel([...explainedB2B3, { kind: "step", module: "B3", objectives: ["B3.o1"], detail: { match: false }, at: "" }]).level, 1, "a step that did not match is not a pass");
});

test("a kata on a module off the wire does not count for this wire", () => {
  const offWire = loopLevel([...explainedB2B3, kata("X1", true, ["X1.o1"])]);
  assert.equal(offWire.level, 1);
});

test("L3 needs a credited bench or par on the wire, or a credited design drill from any module", () => {
  const l2 = [...explainedB2B3, kata("B2", true, ["B2.o1"])];
  assert.equal(loopLevel([...l2, bench("B2", [])]).level, 2, "an uncredited bench does not count");
  assert.equal(loopLevel([...l2, bench("B2", ["B2.o1"])]).level, 3);
  assert.equal(loopLevel([...l2, { kind: "par", module: "B3", objectives: ["B3.o1"], detail: {}, at: "" }]).level, 3);
  assert.equal(loopLevel([...l2, design("X1", ["X1.o1"])]).level, 3, "a design drill counts for every wire");
  assert.equal(loopLevel([...l2, design("B2", [])]).level, 2, "an uncredited design drill does not count");
  const l3 = loopLevel([...l2, bench("B2", ["B2.o1"])]);
  assert.equal(l3.lines[2], "L3: 1 experiments or design drills");
});

test("the summary names the strongest wire and the next step on the weakest; nothing explained reads differently", () => {
  const model = readiness(course, core, [...explainedB2B3, kata("B2", true, ["B2.o1"])]);
  assert.equal(model.summary, "Strongest: Loop (L2). Next step: No built module teaches Control yet.");
  assert.equal(readiness(course, core, []).summary, "Nothing explained yet. Next step: No built module teaches Control yet.");
});

test("summarize: ties go to the first wire in turn order; a course at L3 everywhere says so", () => {
  const wires = [
    { short: "Control", level: 1, next: "a" },
    { short: "Loop", level: 1, next: "b" },
  ];
  assert.equal(summarize(wires), "Strongest: Control (L1). Next step: a");
  assert.equal(summarize([{ short: "Control", level: 3, next: "x" }, { short: "Loop", level: 3, next: "y" }]), "Every wire is at L3.");
});

test("explained: a module with no objectives is never explained; an entry credits only the module it names", () => {
  const noObjectives = { modules: [{ id: "Z9", objectives: [] }] };
  assert.equal(explainedModules(noObjectives, [check("Z9", ["Z9.o1"])]).has("Z9"), false);
  const explained = explainedModules(course, [check("B2", ["B2.o1", "B2.o2"])]);
  assert.ok(explained.has("B2"));
  assert.equal(explained.has("B3"), false);
});

test("lastAt returns the latest timestamp of a module's entries, or an empty string", () => {
  const evidence = [check("B2", []), { ...check("B2", []), at: "2026-12-01T00:00:00.000Z" }, check("B3", [])];
  assert.equal(lastAt(evidence, "B2"), "2026-12-01T00:00:00.000Z");
  assert.equal(lastAt(evidence, "X1"), "");
});

test("wireReadiness: the evidence behind a level is listed, with its module and date", () => {
  const explained = explainedModules(course, explainedB2B3);
  const built = new Set(["B2", "B3"]);
  const wire = wireReadiness(course, built, [...explainedB2B3, kata("B2", true, ["B2.o1"])], explained, course.wires[1]);
  assert.deepEqual(wire.entries.explained.map((e) => e.module), ["B2", "B3"]);
  assert.equal(wire.entries.passing.length, 1);
  assert.equal(wire.entries.passing[0].kind, "kata");
  assert.equal(wire.entries.passing[0].at, "2026-10-02T10:00:00.000Z");
});

test("the brag sheet's figures: levels, explained modules, katas and steps, bench and design results, and the date", () => {
  const evidence = [...explainedB2B3, kata("B2", true, ["B2.o1"]), kata("B2", false, []), { kind: "step", module: "B3", objectives: [], detail: { match: true } },
    bench("B2", ["B2.o1"]), design("B2", ["B2.o1"], 21, 37)];
  const model = readiness(course, core, evidence);
  const sheet = bragData(course, model, evidence, "A. Learner", "2026-10-10");
  assert.equal(sheet.name, "A. Learner");
  assert.equal(sheet.date, "10 Oct 2026");
  assert.deepEqual(sheet.explained, [{ id: "B2", title: "The agent loop" }, { id: "B3", title: "Turn limits" }]);
  assert.equal(sheet.katasPassed, 1, "a passing kata counts whether or not it has credit; a fail does not");
  assert.equal(sheet.stepsPassed, 1);
  assert.deepEqual(sheet.benches, [{ module: "B2", before: { passed: 2, n: 20 }, after: { passed: 3, n: 20 } }]);
  assert.deepEqual(sheet.designs, [{ item: "ci-fixer", ticked: 21, total: 37 }]);
  assert.deepEqual(sheet.levels.map((l) => l.level), [0, 3]);
});

test("the real course: no evidence leaves every wire at level 0, and the built modules are counted from course-core", () => {
  const realCourse = readJson("../../../data/course.json");
  const realCore = readJson("../../../data/course-core.json");
  const model = readiness(realCourse, realCore, []);
  assert.equal(model.wires.length, 8);
  assert.ok(model.wires.every((wire) => wire.level === 0));
  assert.equal(model.summary, "Nothing explained yet. Next step: Explain every Control module.");
  const loop = model.wires.find((wire) => wire.id === "loop");
  assert.match(loop.lines[0], /^L1: 0 of \d+ modules explained$/);
  const builtOnLoop = realCourse.modules.filter((mod) => (mod.wires ?? []).includes("loop") && realCore.modules.find((m) => m.id === mod.id)?.built).length;
  assert.ok(builtOnLoop >= 1, "the agent loop module is built, so Loop has a built module to explain");
  assert.equal(loop.lines[0], `L1: 0 of ${builtOnLoop} modules explained`);
});

test("matches: the text holds the query in any case, and the wire narrows it; an empty query and wire show everything", () => {
  assert.equal(matches("Structured outputs", "tools", "STRUCT", ""), true);
  assert.equal(matches("Structured outputs", "tools", "", ""), true);
  assert.equal(matches("Structured outputs", "tools", "", "loop"), false, "the wire narrows");
  assert.equal(matches("Structured outputs", "tools", "missing", "tools"), false);
  assert.equal(matches("no wire here", "", "", ""), true);
});

test("shownText: the count the page says, singular and plural", () => {
  assert.equal(shownText(91), "91 terms shown");
  assert.equal(shownText(1), "1 term shown");
  assert.equal(shownText(0), "0 terms shown");
});

test("wiresIn: each wire once, named, in name order; an item with no wire is skipped", () => {
  const items = [
    { dataset: { wire: "tools", wireName: "Tools" } },
    { dataset: { wire: "control", wireName: "Control" } },
    { dataset: { wire: "tools", wireName: "Tools" } },
    { dataset: {} },
  ];
  assert.deepEqual(wiresIn(items), [["control", "Control"], ["tools", "Tools"]]);
});

test("the next step says an before a wire name with a vowel sound", async () => {
  const { nextStep } = await import("../lib/readiness.js");
  assert.match(nextStep("Observability", 1, 1), /on an Observability module/);
  assert.match(nextStep("Errors", 2, 1), /^Run an Errors bench/);
  assert.match(nextStep("Loop", 1, 1), /on a Loop module/);
});
