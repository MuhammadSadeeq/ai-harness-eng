import { test } from "node:test";
import assert from "node:assert/strict";
import { runWith, ofKind } from "./helpers.mjs";

const READ = (path) => ({ say: "read", tools: [["read_file", { path }]] });
const DONE = { say: "done", stop: "end_turn" };
const SANDBOX = { sandbox: { egress: [] } };
const OUTSIDE = { "../secret.env": "KEY=1" };
const toolResultOf = (wire, n) => wire[n].messages[2].content[0];

test("traversal is blocked by the sandbox, with the path as the model wrote it", () => {
  const r = runWith({ outside: OUTSIDE, script: [READ("../secret.env"), DONE] }, SANDBOX);
  const s = ofKind(r.events, "sandbox")[0];
  assert.deepEqual({ tool: s.tool, allowed: s.allowed, reason: s.reason }, {
    tool: "read_file", allowed: false, reason: "path outside the workspace: ../secret.env",
  });
  assert.equal(ofKind(r.events, "tool_call").length, 0);
  assert.deepEqual(toolResultOf(r.wire, 2), {
    type: "tool_result",
    tool_use_id: "toolu_1_1",
    content: "Blocked by the sandbox: path outside the workspace: ../secret.env",
    is_error: true,
  });
});

test("without the sandbox the same traversal reads outside, and no sandbox event is written", () => {
  const r = runWith({ outside: OUTSIDE, script: [READ("../secret.env"), DONE] });
  assert.equal(ofKind(r.events, "sandbox").length, 0);
  assert.equal(ofKind(r.events, "tool_call")[0].output, "KEY=1");
});

test("normalization happens before the check: a/../../x is outside", () => {
  const r = runWith({ outside: OUTSIDE, script: [READ("a/../../secret.env"), DONE] }, SANDBOX);
  assert.equal(ofKind(r.events, "sandbox")[0].allowed, false);
});

test("a link inside the workspace is allowed; a link to outside is blocked by its path", () => {
  const inside = runWith({ workspace: { "a.txt": "hello\n", "l.txt": { link: "a.txt" } }, script: [READ("l.txt"), DONE] }, SANDBOX);
  assert.equal(ofKind(inside.events, "sandbox")[0].allowed, true);
  assert.equal(ofKind(inside.events, "tool_call")[0].output, "hello\n");
  const out = runWith({ outside: OUTSIDE, workspace: { "out.txt": { link: "../secret.env" } }, script: [READ("out.txt"), DONE] }, SANDBOX);
  assert.equal(ofKind(out.events, "sandbox")[0].reason, "path outside the workspace: out.txt -> ../secret.env");
});

test("a chain of nine links is blocked as too many links", () => {
  const ws = { "a.txt": "hello\n" };
  for (let i = 1; i <= 9; i += 1) ws[`c${i}`] = { link: i === 9 ? "a.txt" : `c${i + 1}` };
  const r = runWith({ workspace: ws, script: [READ("c1"), DONE] }, SANDBOX);
  assert.equal(ofKind(r.events, "sandbox")[0].reason, "too many levels of links: c1");
});

test("cat in run_command is path-checked; list_files is not", () => {
  const cat = runWith({ outside: OUTSIDE, script: [{ say: "x", tools: [["run_command", { cmd: "cat ../secret.env" }]] }, DONE] }, SANDBOX);
  assert.equal(ofKind(cat.events, "sandbox")[0].allowed, false);
  const ls = runWith({ script: [{ say: "x", tools: [["list_files", {}]] }, DONE] }, SANDBOX);
  assert.equal(ofKind(ls.events, "sandbox")[0].allowed, true);
});

const FETCH = {
  name: "fetch",
  description: "Fetch a URL",
  input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  effect: "network",
  results: [{ match: {}, output: "200 OK", ok: true }],
};
const FETCH_TOOLS = { tools: ["read_file"], custom_tools: [FETCH] };

test("egress: a network tool runs only if its host is in the egress list (port and query ignored)", () => {
  const blocked = runWith({ ...FETCH_TOOLS, script: [{ say: "x", tools: [["fetch", { url: "https://evil.example/x" }]] }, DONE] }, { sandbox: { egress: ["api.example.com"] } });
  assert.equal(ofKind(blocked.events, "sandbox")[0].reason, "host not in egress: evil.example");
  assert.equal(ofKind(blocked.events, "tool_call").length, 0);
  const allowed = runWith({ ...FETCH_TOOLS, script: [{ say: "x", tools: [["fetch", { url: "https://api.example.com:443/v1?q=1" }]] }, DONE] }, { sandbox: { egress: ["api.example.com"] } });
  assert.equal(ofKind(allowed.events, "sandbox")[0].allowed, true);
  assert.equal(ofKind(allowed.events, "tool_call")[0].output, "200 OK");
});

test("without the sandbox, network tools always run", () => {
  const r = runWith({ ...FETCH_TOOLS, script: [{ say: "x", tools: [["fetch", { url: "https://evil.example/x" }]] }, DONE] });
  assert.equal(ofKind(r.events, "tool_call")[0].output, "200 OK");
});
