// One group per ENGINE amendment A3 item (docs/ENGINE.md, Amendments). Expectations
// follow the ruling text. Items the code already did are covered too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { runWith, tapeWith, kindsOf, ofKind, ROOT, readJsonRepo, FACTS } from "./helpers.mjs";
import { Tools, toolDefs, catPath, commandWords } from "../tools.js";
import { Vfs } from "../vfs.js";
import { globMatch, egressHost, fieldMatch } from "../policy.js";
import { resolvePricing } from "../pricing.js";
import { loadBoard } from "../board.js";
import { loadTape } from "../tape.js";
import { runTrial } from "../index.js";

const READ = (path) => ({ say: "read", tools: [["read_file", { path }]] });
const DONE = { say: "done", stop: "end_turn" };
const OUTSIDE = { "/etc/passwd": "root:x", "../secret.env": "KEY=1" };
const call = (name, input) => ({ id: "toolu_1_1", name, input });
function env(over = {}) {
  const tape = tapeWith({ workspace: { "a.txt": "hello\n", "b.txt": "x x\n" }, outside: OUTSIDE, ...over });
  const vfs = new Vfs(tape.workspace, tape.outside);
  return { tape, vfs, tools: new Tools(tape, vfs) };
}

// A3.1 tool definitions: tooldefs order, then custom tools in tape order.
test("A3.1 tool definitions follow tooldefs.json order, not the tape's list order", () => {
  const tape = tapeWith({ tools: ["run_command", "read_file"], custom_tools: [{ name: "zeta", description: "z", input_schema: { type: "object" } }] });
  assert.deepEqual(toolDefs(tape).map((d) => d.name), ["read_file", "run_command", "zeta"]);
});

// A3.2 unknown tool; custom latency defaults to 100.
test("A3.2 unknown tool: ok false, the exact output, 100 ms; custom latency defaults to 100", () => {
  const { tools, tape } = env({ custom_tools: [{ name: "fetch", description: "f", input_schema: { type: "object" }, results: [] }] });
  assert.deepEqual(tools.run(call("nope", {})), { ok: false, output: "Unknown tool: nope" });
  assert.equal(tools.latency("nope"), 100);
  assert.equal(tape.custom_tools[0].latency_ms, 100);
});

// A3.3 run_command: whitespace words; cat with exactly one argument; usage otherwise.
test("A3.3 cat takes exactly one argument, split on any whitespace; otherwise usage", () => {
  const { tools } = env();
  assert.deepEqual(tools.run(call("run_command", { cmd: "cat\ta.txt" })), { ok: true, output: "hello\n" });
  assert.deepEqual(tools.run(call("run_command", { cmd: "  cat   a.txt  " })), { ok: true, output: "hello\n" });
  assert.deepEqual(tools.run(call("run_command", { cmd: "cat" })), { ok: false, output: "usage: cat <path>" });
  assert.deepEqual(tools.run(call("run_command", { cmd: "cat a.txt b.txt" })), { ok: false, output: "usage: cat <path>" });
  assert.equal(catPath("cat a.txt b.txt"), null);
  assert.equal(catPath("cat x"), "x");
  assert.deepEqual(commandWords("  ls  -la  "), ["ls", "-la"]);
});

test("A3.3 ls ignores its arguments; pytest needs exactly the words pytest or pytest -q; empty cmd is not found", () => {
  const { tools } = env();
  assert.deepEqual(tools.run(call("run_command", { cmd: "ls -la /nowhere" })), { ok: true, output: "a.txt\nb.txt" });
  assert.deepEqual(tools.run(call("run_command", { cmd: "pytest -v" })), { ok: false, output: "command not found: pytest" });
  assert.deepEqual(tools.run(call("run_command", { cmd: "" })), { ok: false, output: "command not found: " });
});

// A3.4 inputs: non-string or missing reads as ""; messages echo the path as written.
test("A3.4 a missing or non-string path, cmd or content reads as an empty string", () => {
  const { tools } = env();
  assert.equal(tools.run(call("read_file", { path: 5 })).output, "No file at ''. Call list_files to see what exists.");
  assert.equal(tools.run(call("read_file", {})).output, "No file at ''. Call list_files to see what exists.");
  assert.deepEqual(tools.run(call("run_command", { cmd: null })), { ok: false, output: "command not found: " });
  assert.deepEqual(tools.run(call("write_file", { path: "out.txt", content: 42 })), { ok: true, output: "Wrote out.txt (0 chars)" });
});

test("A3.4 messages echo the path as the model wrote it; an empty old_text is not found; edit on a missing file gives read_file's error", () => {
  const { tools } = env();
  assert.equal(tools.run(call("read_file", { path: "./nope.txt" })).output, "No file at './nope.txt'. Call list_files to see what exists.");
  assert.equal(tools.run(call("edit_file", { path: "./a.txt", old_text: "", new_text: "y" })).output, "old_text was not found in ./a.txt. Read the file again.");
  assert.equal(tools.run(call("edit_file", { path: "gone.txt", old_text: "x", new_text: "y" })).output, "No file at 'gone.txt'. Call list_files to see what exists.");
});

test("A3.4 list_files: every workspace key (links included), sorted, no trailing newline", () => {
  const { tools } = env({ workspace: { "b.txt": "1", "a.txt": "2", "l": { link: "a.txt" } } });
  assert.deepEqual(tools.run(call("list_files", {})), { ok: true, output: "a.txt\nb.txt\nl" });
});

test("A3.4 write_file to the root writes nothing: ok false, Is a directory: <path>", () => {
  const { tools, vfs } = env();
  assert.deepEqual(tools.run(call("write_file", { path: "", content: "x" })), { ok: false, output: "Is a directory: " });
  assert.equal(vfs.read("."), null);
  assert.equal(tools.run(call("list_files", {})).output.split("\n").includes("."), false);
});

// A3.5 checks: a missing file fails both kinds.
test("A3.5 a check on a missing file fails, for contains and not_contains alike", () => {
  const missing = env({ checks: [{ file: "gone.txt", not_contains: "x" }], test_output: { pass: "ok", fail: "no" } });
  assert.equal(missing.tools.run(call("run_command", { cmd: "pytest" })).ok, false);
  const gone = env({ checks: [{ file: "gone.txt", contains: "" }], test_output: { pass: "ok", fail: "no" } });
  assert.equal(gone.tools.run(call("run_command", { cmd: "pytest" })).ok, false);
});

// A3.6 paths: absolute paths are outside; looked up in outside by normalized form.
test("A3.6 an absolute path (no sandbox) is looked up in outside by its normalized form", () => {
  const { tools } = env();
  assert.deepEqual(tools.run(call("read_file", { path: "/etc/passwd" })), { ok: true, output: "root:x" });
  assert.deepEqual(tools.run(call("read_file", { path: "/etc//passwd" })), { ok: true, output: "root:x" });
  assert.equal(tools.run(call("read_file", { path: "/etc/shadow" })).ok, false);
});

test("A3.6 a relative path that normalizes to ../ is looked up in outside", () => {
  const { tools } = env();
  assert.deepEqual(tools.run(call("read_file", { path: "a/../../secret.env" })), { ok: true, output: "KEY=1" });
});

test("A3.6 with the sandbox, an absolute path is blocked with the path as written", () => {
  const r = runWith({ outside: OUTSIDE, script: [READ("//etc/passwd"), DONE] }, { sandbox: { egress: [] } });
  assert.equal(ofKind(r.events, "sandbox")[0].reason, "path outside the workspace: //etc/passwd");
  assert.equal(ofKind(r.events, "sandbox")[0].allowed, false);
});

// A3.7 links: followed for reads and writes, with or without the sandbox; >8 hops.
test("A3.7 a link to outside is followed for reads and writes without the sandbox", () => {
  const { tools, vfs } = env({ workspace: { "out.txt": { link: "../secret.env" } } });
  assert.deepEqual(tools.run(call("read_file", { path: "out.txt" })), { ok: true, output: "KEY=1" });
  assert.deepEqual(tools.run(call("write_file", { path: "out.txt", content: "KEY=2" })), { ok: true, output: "Wrote out.txt (5 chars)" });
  assert.equal(vfs.read("../secret.env"), "KEY=2");
});

test("A3.7 more than 8 hops: ok false, output Too many levels of links: <path>, for reads and writes", () => {
  const ws = { "a.txt": "hello\n" };
  for (let i = 1; i <= 9; i += 1) ws[`c${i}`] = { link: i === 9 ? "a.txt" : `c${i + 1}` };
  const { tools } = env({ workspace: ws });
  assert.deepEqual(tools.run(call("read_file", { path: "c1" })), { ok: false, output: "Too many levels of links: c1" });
  assert.deepEqual(tools.run(call("write_file", { path: "c1", content: "x" })), { ok: false, output: "Too many levels of links: c1" });
  assert.deepEqual(tools.run(call("edit_file", { path: "c1", old_text: "h", new_text: "j" })), { ok: false, output: "Too many levels of links: c1" });
});

// A3.8 sandbox reasons and egress.
test("A3.8 a link followed to an outside path is blocked with '<path> -> <resolved>'", () => {
  const r = runWith({ outside: OUTSIDE, workspace: { "out.txt": { link: "../secret.env" } }, script: [READ("out.txt"), DONE] }, { sandbox: { egress: [] } });
  assert.equal(ofKind(r.events, "sandbox")[0].reason, "out.txt -> ../secret.env");
  assert.equal(ofKind(r.events, "tool_call").length, 0);
});

test("A3.8 a link followed to an inside path is allowed with reason \"\"", () => {
  const r = runWith({ workspace: { "a.txt": "hello\n", "l.txt": { link: "a.txt" } }, script: [READ("l.txt"), DONE] }, { sandbox: { egress: [] } });
  const ev = ofKind(r.events, "sandbox")[0];
  assert.deepEqual([ev.tool, ev.allowed, ev.reason, ev.tool_use_id], ["read_file", true, "", "toolu_1_1"]);
});

test("A3.8 too many levels of links in the sandbox: the lowercase reason", () => {
  const ws = { "a.txt": "hello\n" };
  for (let i = 1; i <= 9; i += 1) ws[`c${i}`] = { link: i === 9 ? "a.txt" : `c${i + 1}` };
  const r = runWith({ workspace: ws, script: [READ("c1"), DONE] }, { sandbox: { egress: [] } });
  assert.equal(ofKind(r.events, "sandbox")[0].reason, "too many levels of links: c1");
});

test("A3.8 egress host: after ://, up to / ? or #, through the last @ dropped, trailing :digits dropped, lowercased", () => {
  assert.equal(egressHost("https://API.Example.com:8443/x?y=1"), "api.example.com");
  assert.equal(egressHost("https://user:pw@host.example/p@q"), "host.example");
  assert.equal(egressHost("https://a.b?x=1/y"), "a.b");
  assert.equal(egressHost("http://h#frag"), "h");
  assert.equal(egressHost("https://x:/y"), "x:", "a colon with no digits is kept");
  assert.equal(egressHost("example.com/path"), "", "no :// gives the empty host");
  assert.equal(egressHost("https://"), "");
});

test("A3.8 the egress check is only for custom tools with effect network and a string url", () => {
  const net = { name: "fetch", description: "f", input_schema: { type: "object" }, effect: "network", results: [{ match: {}, output: "200", ok: true }] };
  const plain = { ...net, name: "plain", effect: null };
  const blockedHost = (tool, input, custom) => runWith({ tools: ["read_file"], custom_tools: [custom], script: [{ say: "x", tools: [[tool, input]] }, DONE] }, { sandbox: { egress: ["ok.example"] } });
  assert.equal(ofKind(blockedHost("fetch", { url: 42 }, net).events, "sandbox")[0].allowed, true, "non-string url is not checked");
  assert.equal(ofKind(blockedHost("plain", { url: "https://evil.example" }, plain).events, "sandbox")[0].allowed, true, "not a network tool");
  assert.equal(ofKind(blockedHost("fetch", { url: "https://evil.example" }, net).events, "sandbox")[0].reason, "host not in egress: evil.example");
});

test("A3.8 the sandbox event is emitted for every call that reaches the sandbox, allowed or not", () => {
  const r = runWith({ script: [{ say: "x", tools: [["list_files", {}], ["read_file", { path: "../secret.env" }]] }, DONE], outside: OUTSIDE }, { sandbox: { egress: [] } });
  assert.deepEqual(ofKind(r.events, "sandbox").map((e) => e.allowed), [true, false]);
  assert.equal(ofKind(r.events, "tool_call").length, 1);
});

test("A3.8 a call denied by permissions never reaches the sandbox (section 7.1 order), so no sandbox event", () => {
  const board = { permissions: { mode: "allow", rules: [{ decision: "deny", tool: "read_file", match: {}, reason: "no" }] }, sandbox: { egress: [] } };
  const r = runWith({ script: [READ("a.txt"), DONE] }, board);
  assert.equal(ofKind(r.events, "sandbox").length, 0);
  assert.equal(ofKind(r.events, "permission")[0].final, "deny");
});

// A3.9 permissions: rule reason required; the rule name and default reason.
test("A3.9 a board rule must have a non-empty reason; a missing one is refused", () => {
  assert.throws(() => loadBoard({ id: "b", modules: { permissions: { mode: "allow", rules: [{ decision: "deny", tool: "*", match: {} }] } } }), /reason must be a non-empty string/);
  assert.throws(() => loadBoard({ id: "b", modules: { permissions: { mode: "allow", rules: [{ decision: "deny", tool: "*", reason: "" }] } } }), /reason must be a non-empty string/);
});

test("A3.9 a matched rule is rules[i] (its 0-based index as written); no match is default with the mode's reason", () => {
  const board = {
    permissions: {
      mode: "ask",
      rules: [
        { decision: "allow", tool: "read_file", match: {}, reason: "reads" },
        { decision: "deny", tool: "run_command", match: { cmd: "rm *" }, reason: "no rm" },
      ],
    },
  };
  const r = runWith({ tools: ["read_file", "run_command"], script: [READ("a.txt"), { say: "rm", tools: [["run_command", { cmd: "rm x" }]] }, DONE] }, board);
  const [p1, p2] = ofKind(r.events, "permission");
  assert.deepEqual([p1.rule, p1.reason], ["rules[0]", "reads"]);
  assert.deepEqual([p2.rule, p2.decision, p2.reason], ["rules[1]", "deny", "no rule matched (mode ask)".replace("no rule matched (mode ask)", "no rm")]);
  const q = runWith({ tools: ["run_command"], script: [{ say: "x", tools: [["run_command", { cmd: "ls" }]] }, DONE] }, board);
  assert.deepEqual([ofKind(q.events, "permission")[0].rule, ofKind(q.events, "permission")[0].reason], ["default", "no rule matched (mode ask)"]);
});

// A3.10 globs: ** and ? match any character; * not "/"; the whole string must match.
test("A3.10 ** and ? match newlines and slashes; * does not match a slash; the whole string must match", () => {
  assert.equal(globMatch("**", "a\nb/c"), true);
  assert.equal(globMatch("?", "\n"), true);
  assert.equal(globMatch("?", "/"), true);
  assert.equal(globMatch("*", "\n"), true);
  assert.equal(globMatch("*", "a/b"), false);
  assert.equal(globMatch("a", "a\n"), false, "fullmatch: no trailing-newline allowance");
  assert.equal(globMatch("a*", "ab\n"), true);
});

test("A3.10 a non-string input value matches its pyjson form; an absent field never matches", () => {
  assert.equal(fieldMatch({ flag: true }, "flag", "true"), true);
  assert.equal(fieldMatch({ n: 12 }, "n", "1*"), true);
  assert.equal(fieldMatch({}, "n", "*"), false);
});

// A3.11 custom tool results.
test("A3.11 the first matching result wins; ok defaults to true; no match and no default: \"\" and ok false", () => {
  const def = {
    name: "tool",
    description: "t",
    input_schema: { type: "object" },
    results: [
      { match: { k: "a" }, output: "first" },
      { match: { k: "a" }, output: "second", ok: false },
    ],
  };
  const { tools } = env({ custom_tools: [def] });
  assert.deepEqual(tools.run(call("tool", { k: "a" })), { ok: true, output: "first" });
  const bare = env({ custom_tools: [{ name: "tool", description: "t", input_schema: { type: "object" }, results: [{ match: { k: "a" }, output: "x" }] }] });
  assert.deepEqual(bare.tools.run(call("tool", { k: "b" })), { ok: false, output: "" });
});

// A3.12 tape defaults.
test("A3.12 defaults: human deny, seed_base 0, faults [], outage null, interrupt null, rules []", () => {
  const t = tapeWith({});
  assert.deepEqual(t.human, { default: "deny", deny_if: {}, fatigue: null });
  assert.equal(t.seed_base, 0);
  assert.deepEqual(t.faults, []);
  assert.equal(t.outage, null);
  assert.equal(t.interrupt, null);
  assert.deepEqual(t.rules, []);
});

// A3.13 tape validity.
const bad = (over, pattern) => assert.throws(() => tapeWith(over), pattern);
test("A3.13 the loader refuses canonical-integer object keys, including inside tool inputs", () => {
  bad({ script: [{ say: "x", tools: [["read_file", { "12": "a" }]] }] }, /canonical-integer key "12"/);
});

test("A3.13 a reply step with stop tool_use and no tools is refused; tools with another stop are refused", () => {
  bad({ script: [{ stop: "tool_use" }] }, /stop "tool_use" needs tools/);
  bad({ script: [{ say: "x", tools: [["read_file", { path: "a" }]], stop: "end_turn" }] }, /tools with stop "end_turn"/);
  tapeWith({ script: [{ say: "x", tools: [["read_file", { path: "a" }]], stop: "tool_use" }] });
  tapeWith({ script: [{ say: "x", tools: [["read_file", { path: "a" }]] }] });
});

// A3.14 script.
test("A3.14 reply steps take latency_ms; the clock advances by it", () => {
  const r = runWith({ script: [{ say: "x", latency_ms: 500, stop: "end_turn" }] });
  assert.equal(ofKind(r.events, "model_reply")[0].t, 500);
});

test("A3.14 a scripted invalid_request has the message Invalid request and is permanent", () => {
  const r = runWith({ script: [{ error: "invalid_request" }] }, { retry: { max_attempts: 5, base_ms: 1, cap_ms: 1, jitter: "none" } });
  assert.deepEqual(ofKind(r.events, "model_error")[0].message, "Invalid request");
  assert.equal(ofKind(r.events, "retry_wait").length, 0);
  assert.equal(r.result.status, "error");
});

test("A3.14 a text block exists only when say is present; the assistant message is {role, content}", () => {
  const r = runWith({ script: [{ tools: [["read_file", { path: "a.txt" }]] }, DONE] });
  assert.deepEqual(r.wire[2].messages[1].content.map((b) => b.type), ["tool_use"]);
  assert.deepEqual(Object.keys(r.wire[2].messages[1]), ["role", "content"]);
  assert.equal(r.wire[2].messages[1].role, "assistant");
});

// A3.15 conditions.
test("A3.15 turn_gte compares the current 1-based turn", () => {
  const r = runWith({
    script: [READ("a.txt"), { when: [{ if: "turn_gte:2", then: [{ say: "two", stop: "end_turn" }] }, { else: [{ say: "one", stop: "end_turn" }] }] }],
  });
  assert.equal(ofKind(r.events, "model_reply")[1].text, "two");
});

test("A3.15 last_truncated reads the last tool_call of the run", () => {
  const r = runWith({
    workspace: { "big.txt": "x".repeat(1000), "a.txt": "hello\n" },
    script: [
      { say: "big", tools: [["read_file", { path: "big.txt" }]] },
      { when: [{ if: "last_truncated", then: [{ say: "was cut", tools: [["read_file", { path: "a.txt" }]] }] }, { else: [{ say: "not cut", stop: "end_turn" }] }] },
      { when: [{ if: "last_truncated", then: [{ say: "still cut", stop: "end_turn" }] }, { else: [{ say: "fine now", stop: "end_turn" }] }] },
    ],
  }, { output_cap: { max_tokens: 10 } });
  assert.deepEqual(ofKind(r.events, "model_reply").map((e) => e.text), ["big", "was cut", "fine now"]);
});

test("A3.15 verify_feedback is true when the last user message is the gate's feedback", () => {
  const r = runWith({
    checks: [{ file: "a.txt", contains: "bye" }],
    script: [
      { say: "done", stop: "end_turn" },
      { when: [{ if: "verify_feedback", then: [{ say: "fixing", stop: "end_turn" }] }, { else: [{ say: "not feedback", stop: "end_turn" }] }] },
    ],
  }, { verify_gate: { max_feedback: 1 } });
  assert.equal(ofKind(r.events, "model_reply")[1].text, "fixing");
});

// A3.16 permanent request errors.
test("A3.16 an overflow is checked before the outage: invalid_request, not overloaded, and no outage draw", () => {
  const r = runWith({ window: 20, tools: [], outage: { from_ms: 0, to_ms: 20000, type: "overloaded", retry_after_ms: 0 } });
  const err = ofKind(r.events, "model_error")[0];
  assert.equal(err.type, "invalid_request");
  assert.equal(err.t, 300);
  assert.equal(r.result.status, "error");
});

test("A3.16 a missing-result error never touches the breaker and is never retried", () => {
  const r = runWith(
    { script: [{ say: "a", tools: [["read_file", { path: "a.txt" }]] }, DONE], interrupt: { turn: 1, resume: true } },
    { breaker: { threshold: 1 }, retry: { max_attempts: 5, base_ms: 1, cap_ms: 1, jitter: "none" } },
  );
  assert.equal(r.result.status, "error", "not circuit_open");
  assert.equal(ofKind(r.events, "breaker").length, 0);
  assert.equal(ofKind(r.events, "retry_wait").length, 0);
  assert.equal(r.wire.length, 2, "no wire payload for the failed request");
});

// A3.17 resume: trace_write before the next turn.
test("A3.17 a resumed interrupt ends its turn with trace_write, then the next turn's guards", () => {
  const r = runWith(
    { script: [{ say: "edit", tools: [["read_file", { path: "a.txt" }]] }, DONE], interrupt: { turn: 1, resume: true } },
    { close_books: {} },
  );
  const ks = kindsOf(r.events);
  const i = ks.indexOf("interrupt");
  assert.deepEqual(ks.slice(i, i + 3), ["interrupt", "trace_write", "prompt_built"]);
  assert.equal(r.result.status, "done");
});

// A3.18 output cap.
test("A3.18 no cut when tokens <= max, or when len <= 4*max; the output is then unchanged", () => {
  const nl = runWith({ workspace: { "nl.txt": "\n".repeat(15) }, script: [READ("nl.txt"), DONE] }, { output_cap: { max_tokens: 5 } });
  const tc = ofKind(nl.events, "tool_call")[0];
  assert.equal(tc.output, "\n".repeat(15), "tokens are 8 > 5 but len 15 <= 20: not cut");
  assert.equal(tc.truncated, false);
});

test("A3.18 a cut keeps 2*max at each end and n = len - 4*max", () => {
  const r = runWith({ workspace: { "x.txt": "x".repeat(30) }, script: [READ("x.txt"), DONE] }, { output_cap: { max_tokens: 5 } });
  const tc = ofKind(r.events, "tool_call")[0];
  assert.equal(tc.output, `${"x".repeat(10)}\n[... 10 characters cut; ask for a smaller range ...]\n${"x".repeat(10)}`);
  assert.equal(tc.truncated, true);
});

test("A3.18 error outputs are capped too; denials and sandbox blocks are not tool outputs", () => {
  const long = "p".repeat(60);
  const r = runWith({ script: [READ(long), DONE] }, { output_cap: { max_tokens: 5 } });
  const tc = ofKind(r.events, "tool_call")[0];
  assert.equal(tc.ok, false);
  assert.equal(tc.truncated, true);
  assert.ok(tc.output.includes("characters cut"));
  const denied = runWith({ script: [READ(long), DONE] }, { output_cap: { max_tokens: 5 }, permissions: { mode: "deny", rules: [] } });
  assert.equal(denied.wire[2].messages[2].content[0].content.startsWith("Denied: "), true);
});

// A3.19 pricing and the facts default.
test("A3.19 milli-units are floor(p * 1000 + 0.5)", () => {
  const facts = { f: { value: { input_usd_per_mtok: 0.0034, output_usd_per_mtok: 0.0036 } }, g: { value: { input_usd_per_mtok: 0.0004, output_usd_per_mtok: 2 } } };
  assert.deepEqual(resolvePricing({ fact: "f" }, facts), { input_milli: 3, output_milli: 4 });
  assert.deepEqual(resolvePricing({ fact: "g" }, facts), { input_milli: 0, output_milli: 2000 });
  assert.deepEqual(resolvePricing({ fact: "models.sonnet-5-5-price" }, FACTS), { input_milli: 2000, output_milli: 10000 });
});

test("A3.19 --facts defaults to site/data/facts.json relative to the working directory", () => {
  const CLI = fileURLToPath(new URL("tools/sim_cli.mjs", ROOT));
  const TAPE = fileURLToPath(new URL("scenarios/b2-spiral.json", ROOT));
  const BOARD = fileURLToPath(new URL("scenarios/boards/b2-new.json", ROOT));
  const elsewhere = spawnSync(process.execPath, [CLI, "run", "--tape", TAPE, "--board", BOARD, "--seed", "1"], { encoding: "utf8", cwd: tmpdir() });
  assert.equal(elsewhere.status, 2);
  assert.match(elsewhere.stderr, /facts/);
  const here = spawnSync(process.execPath, [CLI, "run", "--tape", TAPE, "--board", BOARD, "--seed", "1"], { encoding: "utf8", cwd: ROOT.pathname });
  assert.equal(here.status, 0, here.stderr);
});

// A3.20 redaction.
test("A3.20 redaction never touches the envelope; it counts occurrences in payload strings only", () => {
  const r = runWith({ workspace: { "k.txt": "sk-x sk-y\n" }, script: [READ("k.txt"), DONE] }, { redact: { patterns: ["sk-", "t-board"] } });
  const start = ofKind(r.events, "run_start")[0];
  assert.equal(start.run ?? r.events[0].run, "t:t-board:1", "the envelope run id is not redacted");
  assert.equal(start.board, "[REDACTED]", "the payload is redacted");
  assert.equal(ofKind(r.events, "tool_call")[0].output, "[REDACTED]x [REDACTED]y\n");
  assert.equal(ofKind(r.events, "trace_write")[0].redacted, 3, "one t-board and two sk- in the first flush");
  assert.ok("tool_use_id" in ofKind(r.events, "tool_call")[0], "keys are never redacted");
});

// A3.21 output files.
test("A3.21 zero lines is zero bytes, and every line ends with a newline", () => {
  const CLI = fileURLToPath(new URL("tools/sim_cli.mjs", ROOT));
  const none = spawnSync(process.execPath, [CLI, "run", "--tape", fileURLToPath(new URL("scenarios/c6-outage.json", ROOT)), "--board", fileURLToPath(new URL("scenarios/boards/c6-old.json", ROOT)), "--seed", "1", "--wire"], { encoding: "utf8", cwd: ROOT.pathname });
  assert.equal(none.stdout, "");
  const some = spawnSync(process.execPath, [CLI, "run", "--tape", fileURLToPath(new URL("scenarios/b2-spiral.json", ROOT)), "--board", fileURLToPath(new URL("scenarios/boards/b2-new.json", ROOT)), "--seed", "1"], { encoding: "utf8", cwd: ROOT.pathname });
  assert.ok(some.stdout.endsWith("}\n"));
  assert.ok(!some.stdout.includes("\n\n"));
});

// A3.22 branch recording (not an event).
test("A3.22 runTrial returns the branch choices as [path, option_index] in the order taken", () => {
  const b2 = readJsonRepo("scenarios/b2-spiral.json");
  const newBoard = readJsonRepo("scenarios/boards/b2-new.json");
  assert.deepEqual(runTrial(b2, newBoard, 1, { facts: FACTS }).branches, [["/script/3", 1]]);
  assert.deepEqual(runTrial(b2, newBoard, 20261012, { facts: FACTS }).branches, [["/script/3", 0]]);
  assert.equal(ofKind(runTrial(b2, newBoard, 1, { facts: FACTS }).events, "branch").length, 0, "not an event");
});

test("A3.22 a branch inside a repeat inside a branch option gets its full tape path", () => {
  const script = [
    {
      branch: [
        { percent: 0, then: [{ say: "never" }] },
        {
          percent: 100,
          then: [{
            repeat: {
              times: 2,
              steps: [
                { say: "loop", tools: [["read_file", { path: "a.txt" }]] },
                { branch: [{ percent: 0, then: [{ say: "no" }] }, { percent: 100, then: [{ say: "yes", tools: [["read_file", { path: "a.txt" }]] }] }] },
              ],
            },
          }],
        },
      ],
    },
    DONE,
  ];
  const r = runWith({ script });
  assert.deepEqual(r.branches, [
    ["/script/0", 1],
    ["/script/0/branch/1/then/0/repeat/steps/1", 1],
    ["/script/0/branch/1/then/0/repeat/steps/1", 1],
  ]);
  assert.equal(r.result.turns, 5);
});

test("A3.22 a when step is not a branch: it is never recorded", () => {
  const r = runWith({ script: [{ when: [{ else: [{ say: "x", stop: "end_turn" }] }] }] });
  assert.deepEqual(r.branches, []);
});

// A3.13 (settled): only non-negative canonical integers are reserved keys.
test("A3.13 keys: \"0\" and \"12\" are refused; \"-3\" and \"012\" are fine", () => {
  assert.throws(() => tapeWith({ workspace: { "0": "x" } }), /non-negative canonical-integer key "0"/);
  assert.throws(() => tapeWith({ workspace: { "12": "x" } }), /non-negative canonical-integer key "12"/);
  assert.equal(tapeWith({ workspace: { "-3": "x" } }).workspace["-3"], "x");
  assert.equal(tapeWith({ workspace: { "012": "x" } }).workspace["012"], "x");
});

// A3.13 (settled): workspace keys are relative paths inside the root.
test("A3.13 a workspace key must normalize to a relative path inside the root", () => {
  for (const bad of ["/etc/x", "../x", "a/../../x", ".", ""]) {
    assert.throws(() => tapeWith({ workspace: { [bad]: "x" } }), /is not a relative path inside the workspace/, JSON.stringify(bad));
  }
  assert.equal(tapeWith({ workspace: { "sub/a.txt": "x" } }).workspace["sub/a.txt"], "x");
  assert.equal(tapeWith({ workspace: { "./a.txt": "x" } }).workspace["./a.txt"], "x");
  assert.equal(tapeWith({ workspace: { "l": { link: "a.txt" } } }).workspace.l.link, "a.txt");
});

// A3.13 (settled): outside keys must not be inside the root.
test("A3.13 an outside key whose normal form is inside the root is refused", () => {
  for (const bad of ["a.txt", "./a", ".", "x/../y"]) {
    assert.throws(() => tapeWith({ outside: { [bad]: "x" } }), /is inside the workspace/, JSON.stringify(bad));
  }
  assert.equal(tapeWith({ outside: { "../x": "x" } }).outside["../x"], "x");
  assert.equal(tapeWith({ outside: { "/etc/passwd": "x" } }).outside["/etc/passwd"], "x");
});
