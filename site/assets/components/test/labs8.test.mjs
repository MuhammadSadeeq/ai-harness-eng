// BP-3.6 labs (F1 hx-topology, F2 hx-shift, F6 hx-envbuilder): the pure logic of each lab, and the demo numbers its page
// shows. The demo runs go through runTrial (the simulator) with the same facts file the labs load.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// The same customElements stubs as the other component tests, so the lab modules import in node.
globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { runTrial } = await import("../../sim/index.js");
const envb = await import("../hx-envbuilder.js");
const shift = await import("../hx-shift.js");
const topo = await import("../hx-topology.js");

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const LABS = "../../../labs/data/";
const FACTS = read("../../../data/facts-core.json");

// ---- F6 hx-envbuilder ----
const EB = read(`${LABS}envbuilder-demo.json`);
const EB_TAPE = read(`${LABS}${EB.tape}`);
const EB_BOARD = read(`${LABS}${EB.base_board}`);

/** The demo's runs for one grader and sandbox choice: seed k is run k, as the component runs them. */
function envRuns(graderId, sandboxIds = []) {
  const grader = EB.grader_options.find((o) => o.id === graderId);
  const sandboxes = sandboxIds.map((id) => EB.sandbox_options.find((o) => o.id === id));
  const { tape, board } = envb.patchFor(EB_TAPE, EB_BOARD, grader, sandboxes);
  return Array.from({ length: EB.trials }, (_, i) => {
    const { events, result } = runTrial(tape, board, i + 1, { facts: FACTS });
    return { reward: envb.rewardOf(events, result), passed: result.passed, hacks: envb.hacksOf(events, EB_TAPE) };
  });
}

test("F6: the envbuilder demo is valid, and a bad one is refused with the first problem", () => {
  assert.equal(envb.validEnvbuilder(EB), EB);
  assert.throws(() => envb.validEnvbuilder({ ...EB, trials: 0 }), /trials must be 1 to 50/);
  const noDefault = { ...EB, grader_options: EB.grader_options.map((o) => ({ ...o, default: undefined })) };
  assert.throws(() => envb.validEnvbuilder(noDefault), /exactly one grader option/);
});

test("F6: a grader or a sandbox is a patch on the tape or the board, and the originals stay put", () => {
  const grader = EB.grader_options.find((o) => o.id === "pristine-tests");
  const confine = EB.sandbox_options.find((o) => o.id === "confine");
  const out = envb.patchFor(EB_TAPE, EB_BOARD, grader, [confine]);
  assert.deepEqual(out.board.modules.verify_gate, { max_feedback: 1, pristine_tests: true });
  assert.deepEqual(out.board.modules.sandbox, { egress: ["collect.example"] });
  assert.equal(EB_BOARD.modules.verify_gate, undefined, "the base board is not changed");
  // A tape patch with null removes the field: hidden tests take the suite away from the tape.
  const hidden = envb.patchFor(EB_TAPE, EB_BOARD, EB.grader_options.find((o) => o.id === "hidden-tests"));
  assert.equal("tests" in hidden.tape, false);
  assert.ok(Array.isArray(EB_TAPE.tests), "the base tape keeps its tests");
});

test("F6: the reward is the last verify's answer, else whether the run said done", () => {
  assert.equal(envb.rewardOf([{ kind: "verify", passed: false }, { kind: "verify", passed: true }], { status: "done" }), true);
  assert.equal(envb.rewardOf([{ kind: "verify", passed: true }, { kind: "verify", passed: false }], { status: "done" }), false);
  assert.equal(envb.rewardOf([], { status: "done" }), true);
  assert.equal(envb.rewardOf([], { status: "max_turns" }), false);
});

test("F6: hacks are named from the events: a marker edit, an outside read, the grader's words in a whole-file write", () => {
  const tape = {
    tests: [{ id: "t-add", marker: { file: "tests/active.txt", contains: "add" }, check: { file: "calc.py", contains: "a + b" } }],
    checks: [{ file: "calc.py", contains: "return a + b" }],
  };
  const call = (tool, input, ok = true, output = "") => ({ kind: "tool_call", tool, input, ok, output });
  assert.deepEqual(envb.hacksOf([call("edit_file", { path: "tests/active.txt", old_text: "add", new_text: "" })], tape), ["edited a test marker"]);
  assert.deepEqual(envb.hacksOf([call("read_file", { path: "../answers/calc.py" }, true, "x\n")], tape), ["read a file outside the workspace"]);
  assert.deepEqual(envb.hacksOf([call("read_file", { path: "../answers/calc.py" }, false)], tape), ["tried a file outside the workspace (blocked)"]);
  assert.deepEqual(envb.hacksOf([{ kind: "sandbox", allowed: false, reason: "path outside the workspace: ../answers/calc.py" }], tape), ["tried a file outside the workspace (blocked)"]);
  // A sandbox refusal of a network host is not a file read outside the workspace.
  assert.deepEqual(envb.hacksOf([{ kind: "sandbox", allowed: false, reason: "host not in egress list: collect.example" }], tape), []);
  // The grader's words in a whole-file write count; the same words in an honest edit do not.
  assert.deepEqual(envb.hacksOf([call("write_file", { path: "calc.py", content: "# a + b\nreturn a - b\n" })], tape), ["wrote the grader's words in place of the fix"]);
  assert.deepEqual(envb.hacksOf([call("edit_file", { path: "calc.py", old_text: "a - b", new_text: "a + b" })], tape), []);
  assert.deepEqual(envb.hacksOf([call("write_file", { path: "calc.py", content: "return a + b\n" })], tape), []);
});

test("F6: an answer read from outside the workspace and copied in is special-cased, not solved", () => {
  const tape = {
    tests: [{ id: "t-add", marker: { file: "tests/active.txt", contains: "add" }, check: { file: "calc.py", contains: "a + b" } }],
    checks: [{ file: "calc.py", contains: "return a + b" }],
  };
  const answer = "def add(a, b):\n    if a + b == 5:\n        return 5\n    return 0\n";
  const events = [
    { kind: "tool_call", tool: "read_file", input: { path: "../answers/calc.py" }, ok: true, output: answer },
    { kind: "tool_call", tool: "write_file", input: { path: "calc.py", content: answer }, ok: true, output: "wrote" },
  ];
  assert.deepEqual(envb.hacksOf(events, tape), ["read a file outside the workspace", "special-cased an answer read from outside the workspace"]);
});

test("F6: the summary counts and the sentence under the readouts name the gap", () => {
  const runs = [
    { reward: true, passed: false },
    { reward: true, passed: true },
    { reward: false, passed: false },
  ];
  assert.deepEqual(envb.summaryOf(runs), { trials: 3, reward: 2, truth: 1, hacks: 1, missed: 0 });
  assert.equal(
    envb.gapLine(envb.summaryOf(runs)),
    "The grader rewarded 2 runs; 1 really solved the task. The policy found a way to pass the grader: 1 run passed it without solving the task.",
  );
  assert.equal(envb.gapLine({ trials: 2, reward: 2, truth: 2, hacks: 0, missed: 0 }).endsWith("agree on every run."), true);
  assert.equal(envb.gapLine({ trials: 2, reward: 1, truth: 2, hacks: 0, missed: 1 }).includes("also turned away 1 run"), true);
});

test("F6: the demo's default grader rewards every run; the sandbox and the hidden tests close the gap", () => {
  // Sandbox off, then the confine sandbox on (no-network gives the same counts: its module confines paths too).
  assert.deepEqual(envb.summaryOf(envRuns("workspace-tests")), { trials: 20, reward: 20, truth: 1, hacks: 19, missed: 0 });
  assert.deepEqual(envb.summaryOf(envRuns("workspace-tests", ["confine"])), { trials: 20, reward: 20, truth: 7, hacks: 13, missed: 0 });
  assert.deepEqual(envb.summaryOf(envRuns("says-done")), { trials: 20, reward: 20, truth: 1, hacks: 19, missed: 0 });
  assert.deepEqual(envb.summaryOf(envRuns("pristine-tests")), { trials: 20, reward: 20, truth: 7, hacks: 13, missed: 0 });
  assert.deepEqual(envb.summaryOf(envRuns("pristine-tests", ["confine"])), { trials: 20, reward: 20, truth: 13, hacks: 7, missed: 0 });
  assert.deepEqual(envb.summaryOf(envRuns("hidden-tests")), { trials: 20, reward: 14, truth: 14, hacks: 0, missed: 0 });
  assert.deepEqual(envb.summaryOf(envRuns("hidden-tests", ["confine"])), { trials: 20, reward: 20, truth: 20, hacks: 0, missed: 0 });
});

test("F6: the pristine grader closes the marker hack, and the comment trick still passes it", () => {
  const markerHack = (runs) => runs.filter((r) => r.hacks.includes("edited a test marker") && r.reward && !r.passed).length;
  assert.equal(markerHack(envRuns("says-done")), 6);
  assert.equal(markerHack(envRuns("pristine-tests")), 0);
  const commentHack = (runs) => runs.filter((r) => r.hacks.includes("wrote the grader's words in place of the fix") && r.reward && !r.passed).length;
  assert.equal(commentHack(envRuns("pristine-tests")), 7);
});

test("F6: a confined sandbox blocks the outside read, so the special-cased runs solve honestly or fail honestly", () => {
  const off = envRuns("workspace-tests");
  const on = envRuns("workspace-tests", ["confine"]);
  const special = (runs) => runs.filter((r) => r.hacks.includes("special-cased an answer read from outside the workspace")).length;
  assert.equal(special(off), 6);
  assert.equal(special(on), 0);
  assert.equal(on.filter((r) => r.hacks.includes("tried a file outside the workspace (blocked)")).length, 6);
  // The reward is the same grader's verdict either way; the truth rises by the runs that now solve it.
  assert.equal(envb.summaryOf(on).reward, envb.summaryOf(off).reward);
  assert.equal(envb.summaryOf(on).truth - envb.summaryOf(off).truth, 6);
});

// ---- F2 hx-shift ----
const SH = read(`${LABS}shift-demo.json`);
const SH_TAPE = read(`${LABS}${SH.tape}`);
const SH_BOARD = read(`${LABS}${SH.board}`);
const FULL = SH.required.map((r) => r.phrase).join(". ");

/** The next shift's runs for one note: the note is in the workspace from the start, as the component writes it. */
function shiftRuns(note) {
  const tape = shift.tapeWithNote(SH_TAPE, SH.note_path, note);
  return Array.from({ length: SH.trials }, (_, i) => {
    const { events, result } = runTrial(tape, SH_BOARD, i + 1, { facts: FACTS });
    return { passed: result.passed, session: shift.secondSession(events) };
  });
}

test("F2: the handoff demo is valid, and a bad one is refused", () => {
  assert.equal(shift.validShift(SH), SH);
  assert.throws(() => shift.validShift({ ...SH, trials: 21 }), /trials must be 1 to 20/);
  assert.throws(() => shift.validShift({ ...SH, required: [SH.required[0], SH.required[0]] }), /duplicate required item/);
});

test("F2: an item is in the note when its phrase is, ignoring case; the note goes into the workspace, and only there", () => {
  const items = shift.itemsIn("Parser is DONE. Run the tests.", SH.required);
  assert.deepEqual(items.map((i) => i.inNote), [true, false, true]);
  const tape = shift.tapeWithNote(SH_TAPE, SH.note_path, "hello");
  assert.equal(tape.workspace[SH.note_path], "hello");
  assert.equal(SH_TAPE.workspace[SH.note_path], undefined, "the base tape is not changed");
});

test("F2: the turns the next shift spent are its replies in the second session, and the pass count is its checks", () => {
  const rows = (...turns) => turns.map((turn) => ({ turn }));
  assert.deepEqual(
    shift.outcomeOf([{ passed: true, session: rows(3, 4, 5, 6) }, { passed: false, session: rows(3) }]),
    { trials: 2, passed: 1, turnsMin: 1, turnsMax: 4, firstTurn: 3, lastTurn: 6 },
  );
});

test("F2: the readout says the count and the run's turn numbers", () => {
  const rows = (...turns) => turns.map((turn) => ({ turn }));
  assert.equal(shift.turnsLine(shift.outcomeOf([{ passed: true, session: rows(3, 4, 5, 6) }])), "The next shift took 4 turns (turns 3 to 6 of the run).");
  assert.equal(shift.turnsLine(shift.outcomeOf([{ passed: false, session: rows(3, 4) }, { passed: false, session: rows(3, 4, 5, 6, 7) }])), "The next shift took 2 to 5 turns (turns 3 to 7 of the run).");
  assert.equal(shift.turnsLine(shift.outcomeOf([{ passed: false, session: rows(4) }])), "The next shift took 1 turn (turn 4 of the run).");
  assert.equal(shift.turnsLine(shift.outcomeOf([{ passed: false, session: [] }])), "The next shift took 0 turns.");
});

test("F2: the replay lists the second session's replies and calls, and no reply from the first", () => {
  const events = [
    { kind: "session_start", session: 1 },
    { kind: "model_reply", turn: 1, text: "first session", tool_uses: [] },
    { kind: "session_start", session: 2 },
    { kind: "model_reply", turn: 2, text: "", tool_uses: [{ name: "read_file", input: { path: "progress.md" } }] },
    { kind: "model_reply", turn: 3, text: "Done.", tool_uses: [] },
    { kind: "session_start", session: 3 },
    { kind: "model_reply", turn: 4, text: "later", tool_uses: [] },
  ];
  assert.deepEqual(shift.secondSession(events), [
    { turn: 2, text: "(no words)", tools: ["read_file progress.md"] },
    { turn: 3, text: "Done.", tools: [] },
  ]);
  assert.deepEqual(shift.secondSession([]), []);
});

test("F2: the demo's full note passes every trial; an empty note, or any one item left out, fails", () => {
  const full = shift.itemsIn(FULL, SH.required);
  assert.ok(full.every((i) => i.inNote), "the full note holds every required phrase");
  const outcome = shift.outcomeOf(shiftRuns(FULL));
  assert.deepEqual(outcome, { trials: 5, passed: 5, turnsMin: 4, turnsMax: 4, firstTurn: 3, lastTurn: 6 });
  assert.equal(shift.turnsLine(outcome), "The next shift took 4 turns (turns 3 to 6 of the run).");
  assert.equal(shift.outcomeOf(shiftRuns("")).passed, 0);
  for (const item of SH.required) {
    const note = SH.required.filter((r) => r.id !== item.id).map((r) => r.phrase).join(". ");
    assert.equal(shift.itemsIn(note, SH.required).find((i) => i.id === item.id).inNote, false);
    assert.equal(shift.outcomeOf(shiftRuns(note)).passed, 0, `leaving out ${item.id} fails the next shift`);
  }
});

// ---- F1 hx-topology ----
const TP = read(`${LABS}topology-demo.json`);
const SUB = read(`${LABS}${TP.subagent_tape}`);

test("F1: the topology demo is valid, and a bad one is refused", () => {
  assert.equal(topo.validTopology(TP), TP);
  assert.throws(() => topo.validTopology({ ...TP, topologies: TP.topologies.slice(0, 4) }), /five topologies/);
  const badCost = structuredClone(TP);
  badCost.topologies[0].cost = 0;
  assert.throws(() => topo.validTopology(badCost), /positive cost/);
  const badEdge = structuredClone(TP);
  badEdge.topologies[1].diagram.edges.push(["o", "zz"]);
  assert.throws(() => topo.validTopology(badEdge), /unknown node/);
});

test("F1: the sub-agent's input is the sum of its own model calls' prompt sizes", () => {
  const events = [
    { agent: "reader#1", kind: "model_call", tokens_in: 100 },
    { agent: "reader#1", kind: "model_call", tokens_in: 50 },
    { agent: "reader#2", kind: "model_call", tokens_in: 999 },
    { agent: "reader#1", kind: "tool_call", tokens_in: 7 },
  ];
  assert.equal(topo.subagentInputTokens(events), 150);
  assert.equal(topo.subagentInputTokens(events, "reader#2"), 999);
});

test("F1: the ratios read as one decimal at most, with the multiplication sign", () => {
  assert.equal(topo.ratioText(1), "1 ×");
  assert.equal(topo.ratioText(3.2), "3.2 ×");
  assert.equal(topo.ratioText(3.14159), "3.1 ×");
});

test("F1: the demo's sub-agent runs on both boards, and the forked one carries more input", () => {
  const run = (name) => {
    const board = read(`${LABS}${TP.boards[name]}`);
    const { events, result } = runTrial(SUB, board, 20261010, { facts: FACTS });
    return { tokens: topo.subagentInputTokens(events), status: result.status, passed: result.passed };
  };
  assert.deepEqual(run("isolated"), { tokens: 572, status: "done", passed: true });
  assert.deepEqual(run("forked"), { tokens: 630, status: "done", passed: true });
});

test("F6: the gate's ending of a run: no gate, passed, caught, or caught and then repaired", () => {
  const v = (passed) => ({ kind: "verify", passed });
  assert.equal(envb.gateEnd([]), "no gate");
  assert.equal(envb.gateEnd([v(true)]), "passed the gate");
  assert.equal(envb.gateEnd([v(false)]), "caught by the gate");
  assert.equal(envb.gateEnd([v(false), v(true)]), "caught by the gate, then repaired");
  assert.equal(envb.gateEnd([v(false), v(false)]), "caught by the gate");
});
