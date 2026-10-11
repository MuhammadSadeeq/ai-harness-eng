// ENGINE amendment A18 (docs/ENGINE.md): a branch's location is the JSON pointer of its branch step in the tape it came
// from: /script/<i>, /sessions/<k>/script/<i> (k from 0), /agents/<name>/script/<i>, /models/<id>/script/<i>.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJsonRepo, runWith, FACTS, BASE_TAPE, tapeWith, boardWith } from "./helpers.mjs";
import { loadTape, loadBoard, runTrial } from "../index.js";

const DONE = { say: "Done.", stop: "end_turn" };
// A tape with sessions and no script of its own (A14.2: a tape has a script or sessions, not both).
const { script: _tapeScript, ...BARE } = BASE_TAPE;
const sessionsRun = (sessions) => runTrial(loadTape(structuredClone({ ...BARE, sessions })), boardWith({}), 1, { facts: FACTS });
const choose = (options) => ({ branch: options.map((say, i) => ({ percent: i === options.length - 1 ? 100 : 0, then: [{ say, stop: "end_turn" }] })) });

const run = (tape, board, seed) => runTrial(loadTape(tape), loadBoard(board), seed, { facts: FACTS });

test("A18: a branch on the tape's own script is /script/<i>", () => {
  const r = runWith({ script: [{ say: "a", tools: [["read_file", { path: "a.txt" }]] }, choose(["no", "yes"])] });
  assert.deepEqual(r.branches, [["/script/1", 1]]);
});

test("A18: a branch in a session's script is /sessions/<k>/script/<i>, k counted from 0", () => {
  const r = sessionsRun([
    { script: [{ say: "one", tools: [["read_file", { path: "a.txt" }]] }, DONE] },
    { script: [{ say: "two", tools: [["read_file", { path: "a.txt" }]] }, choose(["no", "yes"])] },
  ]);
  assert.deepEqual(r.branches, [["/sessions/1/script/1", 1]]);
});

test("A18: a branch nested in a repeat in a session extends the session's pointer", () => {
  // The options call a tool, so the turn goes on and the repeat runs both passes (a stop would end the session).
  const read = [["read_file", { path: "a.txt" }]];
  const pick = { branch: [{ percent: 0, then: [{ say: "no", tools: read }] }, { percent: 100, then: [{ say: "yes", tools: read }] }] };
  const r = sessionsRun([
    { script: [DONE] },
    { script: [{ repeat: { times: 2, steps: [{ say: "loop", tools: read }, pick] } }, DONE] },
  ]);
  assert.deepEqual(r.branches, [
    ["/sessions/1/script/0/repeat/steps/1", 1],
    ["/sessions/1/script/0/repeat/steps/1", 1],
  ]);
});

test("A18: the engine fixture eng-branches records its session and its sub-agent by pointer, on both boards", () => {
  const tape = readJsonRepo("scenarios/engine/eng-branches.json");
  const isolated = readJsonRepo("scenarios/engine/boards/eng-branches-isolated.json");
  const forked = readJsonRepo("scenarios/engine/boards/eng-branches-forked.json");
  assert.deepEqual(run(tape, isolated, 20261010).branches, [["/sessions/0/script/0", 1], ["/agents/checker/script/0", 1]]);
  assert.deepEqual(run(tape, forked, 20261010).branches, [["/sessions/0/script/0", 1], ["/agents/checker/script/0", 1]]);
});

test("A18: a branch in a model profile's script is /models/<id>/script/<i>", () => {
  const tape = readJsonRepo("scenarios/engine/eng-branches-models.json");
  const modelB = readJsonRepo("scenarios/engine/boards/eng-branches-model-b.json");
  assert.deepEqual(run(tape, modelB, 20261010).branches, [["/models/model-b/script/0", 1]]);
});

test("A18: a sub-agent's branch is /agents/<name>/script/<i>, with the tape's own script still at /script", () => {
  const over = {
    agents: { checker: { script: [choose(["no", "yes"]), DONE] } },
    script: [{ say: "go", tools: [["run_agent", { agent: "checker", brief: "check" }]] }, DONE],
  };
  const board = boardWith({ subagents: { context: "isolated", max: 2, max_turns: 3 } });
  const r = runTrial(tapeWith(over), board, 1, { facts: FACTS });
  assert.deepEqual(r.branches, [["/agents/checker/script/0", 1]]);
  assert.ok(BASE_TAPE.script.length > 0, "the base tape is not changed");
});

// A17.3: a model profile with a script on a tape with sessions is refused by the loader.
test("A17.3: a model profile's script on a tape with sessions is a loader error", () => {
  const { script: _tapeScript, ...BARE } = BASE_TAPE;
  const sessions = [{ script: [DONE] }, { script: [DONE] }];
  const models = { "model-b": { pricing: BASE_TAPE.pricing, script: [DONE] } };
  assert.throws(() => loadTape(structuredClone({ ...BARE, sessions, models })), /a model profile's script cannot replace sessions \(A17\.3\)/);
});

test("A17.3: a profile without a script loads on a tape with sessions, and a profile script loads without them", () => {
  const { script: _tapeScript, ...BARE } = BASE_TAPE;
  const sessions = [{ script: [DONE] }, { script: [DONE] }];
  assert.doesNotThrow(() => loadTape(structuredClone({ ...BARE, sessions, models: { "model-b": { pricing: BASE_TAPE.pricing } } })));
  assert.doesNotThrow(() => loadTape(structuredClone({ ...BASE_TAPE, models: { "model-b": { pricing: BASE_TAPE.pricing, script: [DONE] } } })));
});
