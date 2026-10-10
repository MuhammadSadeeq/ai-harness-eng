// ENGINE amendment A9 (docs/ENGINE.md): tool design, tools on demand, tamperable tests and cost attribution.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tapeWith, boardWith, runWith, ofKind, FACTS } from "./helpers.mjs";
import { runTrial, loadTape, tokens, decidePermission } from "../index.js";

const DONE = { say: "done", stop: "end_turn" };
const CUSTOM = (name, description, extra = {}) => ({
  name,
  description,
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  default: { output: `${name} ran`, ok: true },
  ...extra,
});
const requests = (r) => r.wire.filter((w) => "tools" in w);
const namesOf = (req) => req.tools.map((t) => t.name);
const replyTexts = (events) => ofKind(events, "model_reply").map((e) => e.text);

// ---------- A9.1 tool_overrides

test("A9.1 an override replaces the description and keeps the name", () => {
  const r = runWith({ tools: ["write_file"], script: [DONE] }, { tool_overrides: { write_file: { description: "Writes a whole file." } } });
  const [req] = requests(r);
  assert.deepEqual(namesOf(req), ["write_file"]);
  assert.equal(req.tools[0].description, "Writes a whole file.");
});

test("A9.1 an override of input_schema is what validate_inputs checks", () => {
  const lookup = CUSTOM("lookup", "Look up an order.", {
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
  });
  const script = [{ say: "look", tools: [["lookup", { id: "A1" }]] }, DONE];
  const schema = {
    type: "object",
    properties: { id: { type: "string" }, code: { type: "integer" } },
    required: ["id", "code"],
    additionalProperties: false,
  };
  const refused = runWith({ tools: [], custom_tools: [lookup], script }, { validate_inputs: {}, tool_overrides: { lookup: { input_schema: schema } } });
  const [check] = ofKind(refused.events, "input_check");
  assert.equal(check.valid, false);
  assert.equal(check.reason, "missing required field: code");
  assert.equal(ofKind(refused.events, "tool_call").length, 0, "a refused input never runs the tool");
  const accepted = runWith({ tools: [], custom_tools: [lookup], script }, { validate_inputs: {} });
  assert.equal(ofKind(accepted.events, "input_check")[0].valid, true);
  assert.equal(ofKind(accepted.events, "tool_call")[0].ok, true);
});

test("A9.1 sent_lacks reads the overridden description, so a tape can see the fix", () => {
  const script = [
    { when: [{ if: "sent_lacks:order code", then: [{ say: "no code field" }] }, { else: [{ say: "code field" }] }] },
    DONE,
  ];
  const tape = { tools: [], custom_tools: [CUSTOM("lookup", "Look up an order.")], script };
  assert.equal(replyTexts(runWith(tape, {}).events)[0], "no code field");
  const fixed = runWith(tape, { tool_overrides: { lookup: { description: "Look up an order by its order code." } } });
  assert.equal(replyTexts(fixed.events)[0], "code field");
});

test("A9.1 a board with an empty tool_overrides sends the same requests as one without", () => {
  const tape = { tools: ["read_file"], script: [{ say: "read", tools: [["read_file", { path: "a.txt" }]] }, DONE] };
  const plain = runWith(tape, {});
  const empty = runWith(tape, { tool_overrides: {} });
  assert.deepEqual(empty.wire, plain.wire);
  assert.deepEqual(empty.events, plain.events);
});

test("A9.1 the loader refuses an override of a tool the tape does not have, and bad override fields", () => {
  assert.throws(() => runWith({ tools: ["read_file"] }, { tool_overrides: { nope: { description: "x" } } }), /unknown tool "nope"/);
  assert.throws(() => runWith({ tools: ["read_file"] }, { tool_overrides: { write_file: { description: "x" } } }), /unknown tool "write_file"/);
  assert.throws(() => boardWith({ tool_overrides: { read_file: { name: "other" } } }), /unknown field "name"/);
  assert.throws(() => boardWith({ tool_overrides: { read_file: { description: 3 } } }), /description must be a string/);
  assert.throws(() => boardWith({ tool_overrides: { read_file: { input_schema: [] } } }), /input_schema must be an object/);
  assert.throws(() => boardWith({ tool_overrides: { read_file: "text" } }), /an override is an object/);
});

// ---------- A9.2 tool_search

test("A9.2 the request is the always tools, the loaded tools in A3.1 order, then tool_search", () => {
  const tape = {
    tools: ["read_file", "write_file"],
    custom_tools: [CUSTOM("lint_file", "Lint a Python file."), CUSTOM("count_lines", "Count the lines in a file.")],
    script: [
      { say: "search", tools: [["tool_search", { query: "lint python" }]] },
      { say: "use", tools: [["lint_file", {}]] },
      DONE,
    ],
  };
  const r = runWith(tape, { tool_search: { always: ["read_file"] } });
  const reqs = requests(r);
  assert.equal(reqs.length, 3);
  assert.deepEqual(namesOf(reqs[0]), ["read_file", "tool_search"]);
  assert.deepEqual(namesOf(reqs[1]), ["read_file", "lint_file", "tool_search"]);
  assert.deepEqual(namesOf(reqs[2]), ["read_file", "lint_file", "tool_search"]);
  assert.deepEqual(reqs[0].tools.find((t) => t.name === "tool_search"), {
    name: "tool_search",
    description: "Find tools by keyword and load their definitions for the next request.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Words that describe the tool you need" } },
      required: ["query"],
      additionalProperties: false,
    },
  });
  assert.equal(ofKind(r.events, "tool_call")[0].output, "Loaded: lint_file");
  assert.equal(ofKind(r.events, "tool_call")[0].ok, true);
});

test("A9.2 loaded tools are sent in A3.1 order, not in the order they were loaded", () => {
  const tape = {
    tools: ["read_file"],
    custom_tools: [CUSTOM("one", "lint one"), CUSTOM("two", "lint two")],
    script: [
      { say: "two", tools: [["tool_search", { query: "two" }]] },
      { say: "one", tools: [["tool_search", { query: "lint" }]] },
      DONE,
    ],
  };
  const r = runWith(tape, { tool_search: { always: [] } });
  const reqs = requests(r);
  assert.deepEqual(namesOf(reqs[1]), ["two", "tool_search"]);
  assert.deepEqual(namesOf(reqs[2]), ["one", "two", "tool_search"]);
  assert.deepEqual(ofKind(r.events, "tool_call").map((e) => e.output), ["Loaded: two", "Loaded: one"]);
});

test("A9.2 matching: lowercased, every word anywhere in name + description, the name counts", () => {
  const tape = {
    tools: [],
    custom_tools: [CUSTOM("lint_file", "Lint a PYTHON file."), CUSTOM("count_lines", "Count rows.")],
    script: [
      { say: "a", tools: [["tool_search", { query: "LINT python" }]] },
      { say: "b", tools: [["tool_search", { query: "lint rust" }]] },
      { say: "c", tools: [["tool_search", { query: "count_lines" }]] },
      DONE,
    ],
  };
  const r = runWith(tape, { tool_search: { always: [] } });
  assert.deepEqual(ofKind(r.events, "tool_call").map((e) => e.output), [
    "Loaded: lint_file",
    "No tool matched: lint rust",
    "Loaded: count_lines",
  ]);
});

test("A9.2 a search loads at most five tools; a query whose matches are all loaded says Already loaded", () => {
  const customs = Array.from({ length: 7 }, (_, i) => CUSTOM(`t${i + 1}`, "tool"));
  const tape = {
    tools: [],
    custom_tools: customs,
    script: [
      { say: "1", tools: [["tool_search", { query: "tool" }]] },
      { say: "2", tools: [["tool_search", { query: "tool" }]] },
      { say: "3", tools: [["tool_search", { query: "tool" }]] },
      DONE,
    ],
  };
  const r = runWith(tape, { tool_search: { always: [] } });
  const calls = ofKind(r.events, "tool_call");
  assert.equal(calls[0].output, "Loaded: t1, t2, t3, t4, t5");
  assert.equal(calls[1].output, "Loaded: t6, t7");
  assert.equal(calls[2].output, "Already loaded: t1, t2, t3, t4, t5, t6, t7");
  assert.equal(calls[2].ok, true);
  assert.equal(namesOf(requests(r).at(-1)).length, 8, "seven loaded tools and tool_search");
});

test("A9.2 a search with no hit is not ok and leaves the request as it was", () => {
  const tape = {
    tools: ["read_file"],
    custom_tools: [CUSTOM("lint_file", "Lint a Python file.")],
    script: [{ say: "bake", tools: [["tool_search", { query: "bake cake" }]] }, DONE],
  };
  const r = runWith(tape, { tool_search: { always: ["read_file"] } });
  const [call] = ofKind(r.events, "tool_call");
  assert.equal(call.output, "No tool matched: bake cake");
  assert.equal(call.ok, false);
  assert.deepEqual(namesOf(requests(r)[1]), ["read_file", "tool_search"]);
});

test("A9.2 a tool already sent is not loaded again; a query that only matches sent tools says Already loaded", () => {
  const tape = {
    tools: [],
    custom_tools: [CUSTOM("lint_file", "Lint a Python file.")],
    script: [
      { say: "a", tools: [["tool_search", { query: "lint" }]] },
      { say: "b", tools: [["tool_search", { query: "lint" }]] },
      DONE,
    ],
  };
  const r = runWith(tape, { tool_search: { always: [] } });
  const calls = ofKind(r.events, "tool_call");
  assert.deepEqual(calls.map((e) => e.output), ["Loaded: lint_file", "Already loaded: lint_file"]);
  assert.deepEqual(calls.map((e) => e.ok), [true, true]);
});

test("A10.5 a whitespace-only query has no words: it loads nothing, is not ok, and echoes the query", () => {
  const customs = Array.from({ length: 6 }, (_, i) => CUSTOM(`t${i + 1}`, "tool"));
  const tape = {
    tools: [],
    custom_tools: customs,
    script: [{ say: "blank", tools: [["tool_search", { query: "   " }]] }, DONE],
  };
  const r = runWith(tape, { tool_search: { always: [] } });
  const [call] = ofKind(r.events, "tool_call");
  assert.equal(call.output, `No tool matched: ${"   "}`);
  assert.equal(call.ok, false);
  assert.deepEqual(namesOf(requests(r)[1]), ["tool_search"], "nothing was loaded");
});

test("A9.2 tool_search takes 100 ms; another tool keeps its own latency", () => {
  const tape = {
    tools: ["read_file"],
    custom_tools: [CUSTOM("slow", "Slow tool.", { latency_ms: 500 })],
    script: [
      { say: "s", tools: [["tool_search", { query: "slow" }]] },
      { say: "r", tools: [["slow", {}]] },
      DONE,
    ],
  };
  const r = runWith(tape, { tool_search: { always: ["read_file"] } });
  const calls = ofKind(r.events, "tool_call");
  const perms = ofKind(r.events, "permission");
  assert.equal(calls[0].t - perms[0].t, 100);
  assert.equal(calls[1].t - perms[1].t, 500);
});

test("A9.2 a call to a tool that exists but was not loaded still runs; its definition was not sent", () => {
  const tape = {
    tools: [],
    custom_tools: [CUSTOM("lint_file", "Lint a Python file.")],
    script: [{ say: "run", tools: [["lint_file", {}]] }, DONE],
  };
  const r = runWith(tape, { tool_search: { always: [] } });
  const [call] = ofKind(r.events, "tool_call");
  assert.equal(call.ok, true);
  assert.equal(call.output, "lint_file ran");
  assert.deepEqual(requests(r).map((q) => namesOf(q)), [["tool_search"], ["tool_search"]]);
});

test("A9.2 tool_search checks its own schema when validate_inputs is plugged", () => {
  const tape = { tools: [], custom_tools: [CUSTOM("lint_file", "Lint.")], script: [{ say: "s", tools: [["tool_search", {}]] }, DONE] };
  const r = runWith(tape, { tool_search: { always: [] }, validate_inputs: {} });
  const [check] = ofKind(r.events, "input_check");
  assert.equal(check.tool, "tool_search");
  assert.equal(check.valid, false);
  assert.equal(check.reason, "missing required field: query");
  assert.equal(ofKind(r.events, "tool_call").length, 0);
});

test("A9.2 tools_gte counts tool_search itself; tool_loaded sees what the request holds", () => {
  const tape = {
    tools: ["read_file"],
    custom_tools: [CUSTOM("lint_file", "Lint a Python file.")],
    script: [
      { when: [{ if: "tools_gte:2", then: [{ say: "two", tools: [["tool_search", { query: "lint" }]] }] }, { else: [{ say: "fewer" }] }] },
      { when: [{ if: "tools_gte:3", then: [{ say: "three", tools: [["lint_file", {}]] }] }, { else: [{ say: "under three" }] }] },
      { when: [{ if: "tool_loaded:lint_file", then: [{ say: "loaded" }] }, { else: [{ say: "not loaded" }] }] },
    ],
  };
  const r = runWith(tape, { tool_search: { always: ["read_file"] } });
  assert.deepEqual(replyTexts(r.events), ["two", "three", "loaded"]);
});

test("A9.2 without the module every tool is sent, so tools_gte and tool_loaded see all of them", () => {
  const tape = {
    tools: ["read_file"],
    custom_tools: [CUSTOM("lint_file", "Lint a Python file.")],
    script: [
      { when: [{ if: "tools_gte:2", then: [{ say: "two", tools: [["lint_file", {}]] }] }, { else: [{ say: "fewer" }] }] },
      { when: [{ if: "tool_loaded:lint_file", then: [{ say: "loaded" }] }, { else: [{ say: "not loaded" }] }] },
    ],
  };
  assert.deepEqual(replyTexts(runWith(tape, {}).events), ["two", "loaded"]);
});

test("A9.2 loader: always names tools the tape has, once each, as a list", () => {
  assert.throws(() => boardWith({ tool_search: { always: "read_file" } }), /always must be a list of tool names/);
  assert.throws(() => boardWith({ tool_search: { always: ["read_file", "read_file"] } }), /must not repeat a tool/);
  assert.throws(() => boardWith({ tool_search: { bogus: 1 } }), /unknown field "bogus"/);
  assert.throws(() => runWith({ tools: ["read_file"] }, { tool_search: { always: ["nope"] } }), /always names unknown tool "nope"/);
  assert.throws(
    () => runWith({ tools: [], custom_tools: [CUSTOM("tool_search", "Mine.")] }, { tool_search: { always: [] } }),
    /tool_search is the harness's own tool name/,
  );
});

test("A9.2 loader: tools_gte and tool_loaded are conditions; a bad count is refused", () => {
  const ok = { ...structuredClone({ id: "t", schema: 1, task: "x", model_id: "m", pricing: { fact: "x" } }) };
  const steps = (cond) => [{ when: [{ if: cond, then: [{ say: "a" }] }, { else: [{ say: "b" }] }] }];
  for (const cond of ["tools_gte:0", "tools_gte:12", "tool_loaded:lint_file"]) {
    assert.doesNotThrow(() => loadTape({ ...ok, system: "s", window: 1, test_output: { pass: "p", fail: "f" }, script: steps(cond) }));
  }
  for (const cond of ["tools_gte:-1", "tools_gte:x", "tool_loaded:"]) {
    assert.throws(() => loadTape({ ...ok, system: "s", window: 1, test_output: { pass: "p", fail: "f" }, script: steps(cond) }), /unknown condition/);
  }
});

// ---------- A9.3 tape tests and pristine markers

const SUITE_WS = { "calc.py": "def add(a, b):\n    return a - b\n", "tests/active.txt": "add\n" };
const SUITE = {
  workspace: SUITE_WS,
  checks: [{ file: "calc.py", contains: "a + b" }],
  tests: [{ id: "t-add", marker: { file: "tests/active.txt", contains: "add" }, check: { file: "calc.py", contains: "a + b" } }],
  test_output: { pass: "1 passed", fail: "1 failed: t-add" },
};
const CLEAR_MARKER = { say: "clear", tools: [["write_file", { path: "tests/active.txt", content: "" }]] };
const FIX = { say: "fix", tools: [["edit_file", { path: "calc.py", old_text: "a - b", new_text: "a + b" }]] };

test("A9.3 loader: tests is absent (null) or a list of distinct, well-formed tests", () => {
  assert.equal(tapeWith({}).tests, null);
  assert.deepEqual(tapeWith({ tests: [] }).tests, []);
  const good = SUITE.tests[0];
  const bad = (over, re) => assert.throws(() => tapeWith({ ...SUITE, tests: [{ ...good, ...over }] }), re);
  bad({ check: { file: "calc.py", contains: "a", not_contains: "b" } }, /exactly one of "contains" or "not_contains"/);
  bad({ check: { file: "calc.py" } }, /exactly one of "contains" or "not_contains"/);
  bad({ marker: { file: "tests/active.txt" } }, /contains must be a string/);
  bad({ extra: 1 }, /unknown field "extra"/);
  assert.throws(() => tapeWith({ ...SUITE, tests: [good, good] }), /duplicate test id "t-add"/);
  assert.throws(() => tapeWith({ ...SUITE, tests: "t-add" }), /tests must be a list/);
});

test("A9.3 run_command pytest runs the suite: a failing active test fails it, a fixed file passes it", () => {
  const pytest = { say: "run", tools: [["run_command", { cmd: "pytest -q" }]] };
  const r = runWith({ ...SUITE, script: [pytest, FIX, pytest, DONE] }, {});
  assert.deepEqual(ofKind(r.events, "tool_call").map((e) => [e.output, e.ok]), [
    ["1 failed: t-add", false],
    ["Edited calc.py (1 change)", true],
    ["1 passed", true],
  ]);
});

test("A9.3 deleting the marker switches the test off: the live gate passes while the work is wrong", () => {
  const r = runWith({ ...SUITE, script: [CLEAR_MARKER, { say: "pytest", tools: [["run_command", { cmd: "pytest -q" }]] }, DONE] }, { verify_gate: { max_feedback: 0 } });
  const [verify] = ofKind(r.events, "verify");
  assert.equal(verify.check, "tests");
  assert.equal(verify.passed, true);
  assert.equal(verify.output, "1 passed");
  assert.equal(r.result.status, "done");
  assert.equal(r.result.passed, false, "ground truth is still the tape's checks");
});

test("A9.3 pristine_tests reads the markers from the original workspace, so the cleared marker still counts", () => {
  const r = runWith({ ...SUITE, script: [CLEAR_MARKER, DONE] }, { verify_gate: { max_feedback: 0, pristine_tests: true } });
  const [verify] = ofKind(r.events, "verify");
  assert.equal(verify.check, "tests (pristine)");
  assert.equal(verify.passed, false);
  assert.equal(verify.output, "1 failed: t-add");
  assert.equal(r.result.status, "unverified");
});

test("A9.3 pristine checks read the live files: a real fix passes the pristine gate", () => {
  const r = runWith({ ...SUITE, script: [CLEAR_MARKER, FIX, DONE] }, { verify_gate: { max_feedback: 0, pristine_tests: true } });
  const [verify] = ofKind(r.events, "verify");
  assert.equal(verify.check, "tests (pristine)");
  assert.equal(verify.passed, true);
  assert.equal(r.result.status, "done");
  assert.equal(r.result.passed, true);
});

test("A9.3 a marker the model creates is not in the original workspace, so under pristine it switches nothing on", () => {
  const workspace = { "calc.py": "def add(a, b):\n    return a - b\n" };
  const tape = {
    ...SUITE,
    workspace,
    script: [{ say: "mark", tools: [["write_file", { path: "tests/active.txt", content: "add\n" }]] }, DONE],
  };
  const r = runWith(tape, { verify_gate: { max_feedback: 0, pristine_tests: true } });
  assert.equal(ofKind(r.events, "verify")[0].passed, true, "the test is not active in the original workspace");
});

test("A9.3 pristine_tests does nothing without a tape suite: the gate keeps the checks and the plain label", () => {
  const tape = { workspace: { "calc.py": "x = 1\n" }, checks: [{ file: "calc.py", contains: "a + b" }], script: [DONE] };
  const r = runWith(tape, { verify_gate: { max_feedback: 0, pristine_tests: true } });
  const [verify] = ofKind(r.events, "verify");
  assert.equal(verify.check, "tests");
  assert.equal(verify.passed, false);
  assert.equal(r.result.status, "unverified");
});

test("A9.3 loader: pristine_tests is true or false", () => {
  assert.throws(() => boardWith({ verify_gate: { max_feedback: 1, pristine_tests: "yes" } }), /pristine_tests must be true or false/);
  assert.equal(boardWith({ verify_gate: { max_feedback: 1, pristine_tests: true } }).modules.verify_gate.pristine_tests, true);
  assert.equal(boardWith({ verify_gate: { max_feedback: 1 } }).modules.verify_gate.pristine_tests, false);
});

// ---------- A9.4 cost_attribution

const PRICED = { pricing: { input_milli_per_mtok: 1000, output_milli_per_mtok: 2000 } };
const CACHED = {
  pricing: { input_milli_per_mtok: 1000, output_milli_per_mtok: 2000, cache_write_milli_per_mtok: 1250, cache_read_milli_per_mtok: 100 },
  cache_rules: { min_tokens: 1, ttl_ms: 60000 },
};
const TWO_CALLS = {
  workspace: { "a.txt": "hello\n" },
  script: [{ say: "1", tools: [["read_file", { path: "a.txt" }]] }, { say: "2", tools: [["read_file", { path: "a.txt" }]] }, DONE],
};

test("A9.4 a cost event follows each model_reply at once, and the call costs add up to the run cost", () => {
  const r = runWith({ ...PRICED, ...TWO_CALLS }, { cost_attribution: {} });
  const kinds = r.events.map((e) => e.kind);
  const replies = kinds.flatMap((k, i) => (k === "model_reply" ? [i] : []));
  assert.equal(replies.length, 3);
  for (const i of replies) assert.equal(r.events[i + 1].kind, "cost");
  const costs = ofKind(r.events, "cost");
  assert.equal(costs.length, 3);
  assert.equal(costs.reduce((s, e) => s + e.call_cost, 0), ofKind(r.events, "run_end")[0].cost);
  assert.equal(ofKind(r.events, "run_end")[0].cost, ofKind(r.events, "model_reply").at(-1).cost);
  for (const e of costs) {
    assert.equal(e.call_cost, e.input_cost + e.output_cost + e.cache_cost);
    assert.equal(e.cache_cost, 0, "no cache module: no cache part");
    assert.equal(e.wire, "observe");
  }
});

test("A9.4 with the cache, input_cost is the uncached part and cache_cost is the write and read parts", () => {
  const r = runWith({ ...CACHED, ...TWO_CALLS }, { cache: {}, cost_attribution: {} });
  let lastCache = null;
  const seen = [];
  for (const e of r.events) {
    if (e.kind === "cache") lastCache = e;
    if (e.kind === "cost") {
      assert.equal(e.input_cost, lastCache.uncached * 1000);
      assert.equal(e.cache_cost, lastCache.write * 1250 + lastCache.read * 100);
      seen.push(e);
    }
  }
  assert.equal(seen.length, 3);
  assert.equal(seen.reduce((s, e) => s + e.call_cost, 0), ofKind(r.events, "run_end")[0].cost);
});

test("A9.4 top_part is the largest part by tokens: tools when the definitions are big", () => {
  const big = CUSTOM("big", "word ".repeat(400));
  const r = runWith({ ...PRICED, tools: [], custom_tools: [big], workspace: {}, script: [DONE] }, { cost_attribution: {} });
  const [req] = requests(r);
  const [cost] = ofKind(r.events, "cost");
  assert.equal(cost.top_part, "tools");
  assert.equal(cost.top_tokens, tokens(req.tools));
});

test("A9.4 top_part names a message by its index when the task is the biggest part", () => {
  const task = "word ".repeat(300);
  const r = runWith({ ...PRICED, task, tools: [], script: [DONE] }, { cost_attribution: {} });
  const [req] = requests(r);
  const [cost] = ofKind(r.events, "cost");
  assert.equal(cost.top_part, "messages[0]");
  assert.equal(cost.top_tokens, tokens(req.messages[0]));
});

test("A9.4 a tie goes to the earliest part: system ties messages[0], system wins", () => {
  const first = runWith({ ...PRICED, tools: [], workspace: {}, script: [DONE] }, { cost_attribution: {} });
  const taskTokens = tokens(requests(first)[0].messages[0]);
  // A system string of 4n-2 characters is tokens(pyjson(s)) = n: exactly the task message's tokens.
  const system = "s".repeat(4 * taskTokens - 2);
  const r = runWith({ ...PRICED, system, tools: [], workspace: {}, script: [DONE] }, { cost_attribution: {} });
  const [cost] = ofKind(r.events, "cost");
  assert.equal(tokens(system), taskTokens, "the tie is real");
  assert.equal(cost.top_part, "system");
  assert.equal(cost.top_tokens, taskTokens);
});

test("A9.4 the cost event is absent without the module", () => {
  assert.equal(ofKind(runWith({ ...PRICED, ...TWO_CALLS }, {}).events, "cost").length, 0);
});

// ---------- A9.5 decidePermission

test("A9.5 decidePermission is exported; without a policy every call is allowed", () => {
  assert.equal(typeof decidePermission, "function");
  assert.deepEqual(decidePermission({ name: "x", input: {} }, undefined), {
    decision: "allow",
    rule: "none",
    reason: "no permission policy",
  });
});

test("A9.5 decidePermission gives the 7.5 decision with the rule and the reason", () => {
  const { modules } = boardWith({
    permissions: { mode: "ask", rules: [{ decision: "deny", tool: "run_command", match: { cmd: "rm *" }, reason: "no rm" }] },
  });
  assert.deepEqual(decidePermission({ name: "run_command", input: { cmd: "rm -rf x" } }, modules.permissions), {
    decision: "deny",
    rule: "rules[0]",
    reason: "no rm",
  });
  assert.deepEqual(decidePermission({ name: "run_command", input: { cmd: "ls" } }, modules.permissions), {
    decision: "ask",
    rule: "default",
    reason: "no rule matched (mode ask)",
  });
});

test("A9.5 the harness's permission events are what decidePermission gives for the same calls", () => {
  const permissions = {
    mode: "ask",
    rules: [
      { decision: "allow", tool: "read_file", match: {}, reason: "reads are fine" },
      { decision: "deny", tool: "run_command", match: { cmd: "rm *" }, reason: "no rm" },
    ],
  };
  const tape = {
    ...TWO_CALLS,
    script: [
      { say: "r", tools: [["read_file", { path: "a.txt" }], ["run_command", { cmd: "rm x" }]] },
      { say: "l", tools: [["run_command", { cmd: "ls" }]] },
      DONE,
    ],
  };
  const r = runWith(tape, { permissions });
  const inputs = new Map(ofKind(r.events, "model_reply").flatMap((e) => e.tool_uses.map((u) => [u.id, u.input])));
  const { modules } = boardWith({ permissions });
  const perms = ofKind(r.events, "permission");
  assert.equal(perms.length, 3);
  for (const p of perms) {
    const want = decidePermission({ name: p.tool, input: inputs.get(p.tool_use_id) }, modules.permissions);
    assert.deepEqual({ decision: p.decision, rule: p.rule, reason: p.reason }, want);
  }
});

// ---------- A10.5 tool_search: no words loads nothing; matches already loaded say so

test("A10.5 an empty query finds nothing, even when every tool is already loaded", () => {
  const tape = {
    tools: [],
    custom_tools: [CUSTOM("t1", "tool"), CUSTOM("t2", "tool")],
    script: [
      { say: "all", tools: [["tool_search", { query: "tool" }]] },
      { say: "blank", tools: [["tool_search", { query: "" }]] },
      DONE,
    ],
  };
  const r = runWith(tape, { tool_search: { always: [] } });
  const calls = ofKind(r.events, "tool_call");
  assert.deepEqual(calls.map((e) => e.output), ["Loaded: t1, t2", "No tool matched: "]);
  assert.deepEqual(calls.map((e) => e.ok), [true, false]);
});

test("A10.5 a query that matches only tools already sent says Already loaded, is ok, and loads nothing", () => {
  const tape = {
    tools: ["read_file"],
    custom_tools: [CUSTOM("lint_file", "Lint a Python file.")],
    script: [{ say: "read", tools: [["tool_search", { query: "read" }]] }, DONE],
  };
  const r = runWith(tape, { tool_search: { always: ["read_file"] } });
  const [call] = ofKind(r.events, "tool_call");
  assert.equal(call.output, "Already loaded: read_file");
  assert.equal(call.ok, true);
  assert.deepEqual(namesOf(requests(r)[1]), ["read_file", "tool_search"]);
});

test("A10.5 Already loaded lists every matching tool in A3.1 order", () => {
  const tape = {
    tools: [],
    custom_tools: [CUSTOM("a", "lint a"), CUSTOM("b", "lint b")],
    script: [
      { say: "first", tools: [["tool_search", { query: "lint" }]] },
      { say: "again", tools: [["tool_search", { query: "lint" }]] },
      DONE,
    ],
  };
  const r = runWith(tape, { tool_search: { always: [] } });
  assert.deepEqual(ofKind(r.events, "tool_call").map((e) => e.output), ["Loaded: a, b", "Already loaded: a, b"]);
});

test("A10.5 when some matches are loaded and some are not, only the unloaded ones load", () => {
  const tape = {
    tools: [],
    custom_tools: [CUSTOM("a", "lint a"), CUSTOM("b", "lint b")],
    script: [
      { say: "a", tools: [["tool_search", { query: "a" }]] },
      { say: "lint", tools: [["tool_search", { query: "lint" }]] },
      DONE,
    ],
  };
  const r = runWith(tape, { tool_search: { always: [] } });
  assert.deepEqual(ofKind(r.events, "tool_call").map((e) => e.output), ["Loaded: a", "Loaded: b"]);
});

test("A10.5 a non-string query reads as the empty query: no words, nothing loaded", () => {
  const tape = {
    tools: [],
    custom_tools: [CUSTOM("lint_file", "Lint.")],
    script: [{ say: "bad", tools: [["tool_search", { query: 5 }]] }, DONE],
  };
  const r = runWith(tape, { tool_search: { always: [] } });
  const [call] = ofKind(r.events, "tool_call");
  assert.equal(call.output, "No tool matched: ");
  assert.equal(call.ok, false);
});
