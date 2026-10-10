// ENGINE amendment A14 and its rulings in A15 (docs/ENGINE.md): sub-agents, sessions, crash and resume,
// ledgers and retries, model profiles. The engine fixtures in scenarios/engine/ run here as well.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJsonRepo, runWith, ofKind, FACTS } from "./helpers.mjs";
import { loadTape, loadBoard, runTrial } from "../index.js";
import { countLines } from "../tools.js";
import { tokens } from "../tokens.js";

// The request payloads of a run: the wire entries that carry messages (responses do not).
const requests = (r) => r.wire.filter((w) => w.messages !== undefined);

const engine = (tape, board) => runTrial(
  loadTape(readJsonRepo(`scenarios/engine/${tape}.json`)),
  loadBoard(readJsonRepo(`scenarios/engine/boards/${board}.json`)),
  20261010,
  { facts: FACTS },
);

test("A14: the engine fixtures end as their checks say", () => {
  const cases = [
    ["eng-subagents", "eng-subagents-isolated", "done", true],
    ["eng-subagents", "eng-subagents-forked", "done", true],
    ["eng-subagents", "eng-subagents-max", "done", true],
    ["eng-sessions", "eng-sessions-plain", "done", true],
    ["eng-sessions", "eng-sessions-progress", "done", true],
    ["eng-crash", "eng-crash-plain", "done", false],
    ["eng-crash", "eng-crash-durable", "done", true],
    ["eng-idempotency", "eng-idem-retry", "done", false],
    ["eng-idempotency", "eng-idem-both", "done", true],
    ["eng-models", "eng-models-reject", "error", false],
    ["eng-models", "eng-models-dropped", "done", true],
    ["eng-models", "eng-models-b", "done", true],
  ];
  for (const [tape, board, status, passed] of cases) {
    const r = engine(tape, board);
    assert.equal(r.result.status, status, `${tape} ${board} status`);
    assert.equal(r.result.passed, passed, `${tape} ${board} passed`);
  }
});

test("A14.1: a sub-agent's events carry its name and count its own turns; run_end counts the parent's turns", () => {
  const r = engine("eng-subagents", "eng-subagents-isolated");
  const reader = r.events.filter((e) => e.agent === "reader#1");
  assert.ok(reader.length > 0, "reader#1 emits events");
  assert.equal(Math.min(...reader.map((e) => e.turn)), 1, "its first turn is 1");
  const start = ofKind(r.events, "subagent_start")[0];
  assert.equal(start.agent, "main", "subagent_start carries main");
  assert.equal(start.name, "reader");
  assert.equal(start.k, 1);
  const end = ofKind(r.events, "subagent_end")[0];
  assert.equal(end.agent, "main", "subagent_end carries main");
  assert.equal(end.status, "done");
  assert.equal(end.output, "The note says: Buy milk.");
  assert.equal(r.result.turns, 5, "the parent's turns only");
});

test("A14.1: an unknown agent and the sub-agent limit are refused, and the limit is counted on starts", () => {
  const r = engine("eng-subagents", "eng-subagents-max");
  const outs = ofKind(r.events, "tool_call").filter((e) => e.tool === "run_agent").map((e) => e.output);
  assert.deepEqual(outs, ["The note says: Buy milk.", "Sub-agent limit reached (1)", "Unknown agent: ghost"]);
});

test("A15.3: a forked sub-agent starts from the parent's sent messages with the brief in the last user message", () => {
  const forked = engine("eng-subagents", "eng-subagents-forked");
  const first = requests(forked).find((w) => w.messages[0].content.length === 2);
  assert.ok(first, "a request whose first user message holds the task and the brief");
  assert.equal(first.messages.length, 1, "one user message, never two in a row");
  assert.equal(first.messages[0].content[1].text, "Read notes/a.txt and return the note.");
  const isolated = engine("eng-subagents", "eng-subagents-isolated");
  assert.ok(requests(isolated).some((w) => w.messages.length === 1 && w.messages[0].content.length === 1 &&
    w.messages[0].content[0].text === "Read notes/a.txt and return the note."), "isolated starts from the brief alone");
});

test("A15.10: with tool_search and sub-agents the request's tools end with tool_search, then run_agent", () => {
  const r = runWith(
    { script: [{ say: "Done.", stop: "end_turn" }] },
    { tool_search: { always: [] }, subagents: { context: "isolated", max: 1, max_turns: 2 } },
  );
  const names = r.wire[0].tools.map((d) => d.name);
  assert.deepEqual(names.slice(-2), ["tool_search", "run_agent"]);
});

test("A14.2 and A15.5: sessions start with session_start; the progress layer appears from session 2 on", () => {
  const r = engine("eng-sessions", "eng-sessions-progress");
  assert.deepEqual(ofKind(r.events, "session_start").map((e) => e.session), [1, 2, 3]);
  let session = 0;
  for (const e of r.events) {
    if (e.kind === "session_start") session = e.session;
    if (e.kind === "prompt_built") {
      assert.equal(e.layers.includes("progress"), session >= 2, `session ${session} progress layer`);
    }
  }
});

test("A14.3 and A15.6: without a durable session a crash restarts the run; with one it resumes at n + 1", () => {
  const plain = engine("eng-crash", "eng-crash-plain");
  const durable = engine("eng-crash", "eng-crash-durable");
  assert.equal(ofKind(plain.events, "crash")[0].turn, 2);
  assert.equal(ofKind(durable.events, "crash")[0].turn, 2);
  assert.equal(ofKind(durable.events, "resume")[0].from_turn, 3);
  const charges = (r) => ofKind(r.events, "tool_call").filter((e) => e.tool === "charge").length;
  assert.equal(charges(plain), 2, "the restart charges again");
  assert.equal(charges(durable), 1, "the durable run charges once");
});

test("A15.7 and A15.8: a retry with a key returns the first application's output, ok, and does not apply again", () => {
  const retry = engine("eng-idempotency", "eng-idem-retry");
  const both = engine("eng-idempotency", "eng-idem-both");
  const pays = (r) => ofKind(r.events, "tool_call").filter((e) => e.tool === "pay");
  assert.equal(pays(retry).length, 2, "without keys the retry applies again");
  assert.equal(pays(both).length, 2);
  assert.equal(pays(both)[0].ok, false, "the lost reply");
  assert.equal(pays(both)[1].ok, true, "the retry with the key");
  assert.equal(pays(both)[1].output, "Paid.", "the first application's own output");
  assert.equal(pays(both)[1].attempt, 2);
  assert.equal(pays(both)[0].attempt, 1);
});

test("A14.4: attempt is on tool_call only when tool_retry is plugged; the lines check counts newline-ended lines", () => {
  const plain = engine("eng-subagents", "eng-subagents-isolated");
  assert.ok(ofKind(plain.events, "tool_call").every((e) => e.attempt === undefined));
  assert.equal(countLines(""), 0);
  assert.equal(countLines("a\n"), 1);
  assert.equal(countLines("a\nb"), 2);
  assert.equal(countLines("a\n\n"), 2);
});

test("A14.5 and A15.9: a rejected request param fails the call; capability_check drops it and reports it once", () => {
  const rejected = engine("eng-models", "eng-models-reject");
  const error = ofKind(rejected.events, "model_error")[0];
  assert.equal(error.type, "invalid_request");
  assert.equal(error.message, "temperature: this parameter is not supported on model-a");
  const dropped = engine("eng-models", "eng-models-dropped");
  const caps = ofKind(dropped.events, "capability");
  assert.equal(caps.length, 1);
  assert.deepEqual(caps[0].dropped, ["temperature"]);
  assert.equal(ofKind(dropped.events, "model_error").length, 0);
  assert.ok(requests(dropped).every((w) => !("temperature" in w)), "the dropped param is never sent");
  const other = engine("eng-models", "eng-models-b");
  assert.equal(requests(other)[0].model, "model-b", "the profile sets the request's model");
  assert.equal(ofKind(other.events, "run_start")[0].model_id, "model-b");
});

test("A16.3: a sub-agent's tool ids and response ids carry its tag; the parent's do not", () => {
  const r = engine("eng-subagents", "eng-subagents-isolated");
  const reader = r.events.find((e) => e.kind === "model_reply" && e.agent === "reader#1");
  assert.equal(reader.tool_uses[0].id, "toolu_a1_1_1");
  const parent = r.events.find((e) => e.kind === "model_reply" && e.agent === "main");
  assert.equal(parent.tool_uses[0].id, "toolu_1_1");
  const responses = r.wire.filter((w) => w.type === "message").map((w) => w.id);
  assert.ok(responses.includes("msg_a1_1"), "the sub-agent's first response");
  assert.ok(responses.includes("msg_1"), "the parent's first response");
});

test("A16.2: request params are on the wire only; the prompt is counted from system, tools and messages", () => {
  const r = engine("eng-models", "eng-models-b");
  const req = requests(r)[0];
  assert.equal(req.temperature, 1, "the param is on the wire");
  const counted = tokens({ system: req.system, tools: req.tools, messages: req.messages });
  assert.equal(ofKind(r.events, "prompt_built")[0].tokens, counted);
});

const SUB_READ = [{ say: "Reading.", tools: [["read_file", { path: "a.txt" }]] }, { say: "Done.", stop: "end_turn" }];
const ASK = (agent) => [
  { say: "Asking.", tools: [["run_agent", { agent, brief: "Read a.txt." }]] },
  { say: "Done.", stop: "end_turn" },
];

test("A16.1: tool_pins applies inside a sub-agent, so a rejected tool stays unknown there", () => {
  const POISONED = {
    name: "notes_read_v2",
    description: "Reads a note.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    latency_ms: 100,
    server: "notes",
    version: "1.3.0",
    default: { output: "ok", ok: true },
  };
  const r = runWith(
    {
      custom_tools: [POISONED],
      agents: { poisoned: { script: [{ say: "Calling.", tools: [["notes_read_v2", {}]] }, { say: "Done.", stop: "end_turn" }] } },
      script: ASK("poisoned"),
    },
    { tool_pins: { pins: { notes: "1.2.0" } }, subagents: { context: "isolated", max: 1, max_turns: 2 } },
  );
  const inner = ofKind(r.events, "tool_call").find((e) => e.agent === "poisoned#1");
  assert.equal(inner.output, "Unknown tool: notes_read_v2");
  assert.equal(inner.ok, false);
});

test("A16.1: the model profile, request params and capability_check apply inside a sub-agent", () => {
  const models = { "model-a": { pricing: { input_milli_per_mtok: 1000, output_milli_per_mtok: 2000 }, rejects: ["temperature"] } };
  const over = { models, model_id: "model-a", agents: { reader: { script: SUB_READ } }, script: ASK("reader") };
  const modules = { model: { id: "model-a" }, request_params: { temperature: 1 }, capability_check: {}, subagents: { context: "isolated", max: 1, max_turns: 2 } };
  const ok = runWith(over, modules);
  assert.equal(ofKind(ok.events, "capability").length, 1, "capability is emitted once, by the parent");
  assert.equal(ofKind(ok.events, "subagent_end")[0].status, "done");
  assert.ok(requests(ok).every((w) => w.model === "model-a" && !("temperature" in w)), "the sub-agent sends the profile's model, without the dropped param");
  // Without capability_check the rejected param fails the parent's first call, so no sub-agent starts.
  const refused = runWith(over, { model: { id: "model-a" }, request_params: { temperature: 1 }, subagents: { context: "isolated", max: 1, max_turns: 2 } });
  assert.equal(refused.result.status, "error");
  assert.equal(ofKind(refused.events, "subagent_start").length, 0);
  assert.equal(ofKind(refused.events, "model_error")[0].message, "temperature: this parameter is not supported on model-a");
});
