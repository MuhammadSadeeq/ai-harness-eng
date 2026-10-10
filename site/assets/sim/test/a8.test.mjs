// ENGINE amendment A8 (docs/ENGINE.md, Amendments): rulings from building A6 and A7 in both runtimes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { tapeWith, boardWith, runWith, ofKind, FACTS } from "./helpers.mjs";
import { runTrial } from "../index.js";

const ROOT = new URL("../../../../", import.meta.url);
const READ = (path = "a.txt") => ({ say: "read", tools: [["read_file", { path }]] });
const DONE = { say: "done", stop: "end_turn" };
const WS = { "a.txt": "hello\n", "b.txt": "world\n" };
const NOTES = [{ id: "n1", kind: "goal", turn: 0, text: "Fix a.txt." }];
const modelReplies = (events) => ofKind(events, "model_reply");
const CACHE_OVER = { pricing: { input_milli_per_mtok: 2000, output_milli_per_mtok: 10000, cache_write_milli_per_mtok: 2500, cache_read_milli_per_mtok: 200 }, cache_rules: { min_tokens: 1, ttl_ms: 60000 } };

// ---------- ruling 1: compaction is inert with history resend off

test("A8.1 with history resend off, compaction never runs, whatever its threshold", () => {
  const script = [READ(), READ(), READ(), READ(), DONE];
  const tape = { workspace: WS, window: 8000, notes: NOTES, script };
  const off = runWith(tape, { compaction: { threshold_percent: 1, keep: ["goal"] }, history: { resend: false } });
  assert.equal(ofKind(off.events, "compaction").length, 0, "the sent request is the task alone: compaction does not run");
  assert.ok(ofKind(off.events, "context_check").every((e) => e.action !== "compacted"));
  const on = runWith(tape, { compaction: { threshold_percent: 1, keep: ["goal"] } });
  assert.ok(ofKind(on.events, "compaction").length > 0, "with resend on the same module does run");
});

test("A8.1 with history resend true (the same as absent), compaction still runs", () => {
  const script = [READ(), READ(), READ(), DONE];
  const { events } = runWith({ workspace: WS, window: 8000, notes: NOTES, script }, { compaction: { threshold_percent: 1, keep: ["goal"] }, history: { resend: true } });
  assert.ok(ofKind(events, "compaction").length > 0);
});

// ---------- ruling 2: below min_tokens the cache event is all uncached

test("A8.2 below min_tokens: read 0, write 0, uncached = the prompt, matched none, hit 0", () => {
  const tape = { ...CACHE_OVER, cache_rules: { min_tokens: 100000, ttl_ms: 60000 }, workspace: WS, script: [READ(), DONE] };
  const { events, wire } = runWith(tape, { cache: {} });
  const caches = ofKind(events, "cache");
  assert.equal(caches.length, 2, "one cache event per call");
  for (const c of caches) {
    assert.equal(c.read, 0);
    assert.equal(c.write, 0);
    assert.equal(c.matched, "none");
    assert.equal(c.hit_percent, 0);
  }
  const prompts = ofKind(events, "prompt_built");
  assert.equal(caches[0].uncached, prompts[0].tokens, "uncached is the whole prompt");
  assert.equal(modelReplies(events)[0].usage.input_tokens, prompts[0].tokens);
  assert.equal(modelReplies(events)[0].usage.cache_creation_input_tokens, 0);
  assert.equal(wire.length, 4, "the run still makes its two calls");
});

test("A8.2 below min_tokens the map is not touched: a later long-enough prompt finds nothing cached", () => {
  // Call 1 is short (min_tokens above it), so nothing is stored; call 2 is still short. Nothing is read.
  const tape = { ...CACHE_OVER, cache_rules: { min_tokens: 100000, ttl_ms: 60000 }, workspace: WS, script: [READ(), READ(), DONE] };
  const caches = ofKind(runWith(tape, { cache: {} }).events, "cache");
  assert.ok(caches.every((c) => c.read === 0 && c.matched === "none"));
});

// ---------- ruling 3: partial thinking tables and an optional default

test("A8.3 a partial thinking table: a level it leaves out adds 0", () => {
  const tape = { workspace: WS, script: [READ(), DONE], effort: { thinking_tokens: { low: 100 } } };
  assert.equal(modelReplies(runWith(tape, { effort: { level: "xhigh" } }).events)[0].usage.output_tokens_details.thinking_tokens, 0);
  assert.equal(modelReplies(runWith(tape, { effort: { level: "low" } }).events)[0].usage.output_tokens_details.thinking_tokens, 100);
});

test("A8.3 the default is optional: without it the level in force is high", () => {
  const tape = { workspace: WS, script: [READ(), DONE], effort: { thinking_tokens: { high: 700, low: 5 } } };
  assert.equal(modelReplies(runWith(tape, {}).events)[0].usage.output_tokens_details.thinking_tokens, 700);
});

test("A8.3 an effort block with neither default nor table is valid and adds nothing", () => {
  const tape = { workspace: WS, script: [READ(), DONE], effort: {} };
  assert.equal(modelReplies(runWith(tape, {}).events)[0].usage.output_tokens_details.thinking_tokens, 0);
});

// ---------- ruling 4: the wire response usage equals model_reply.usage

test("A8.4 the wire response usage equals model_reply.usage, with effort", () => {
  const { events, wire } = runWith({ workspace: WS, script: [READ(), DONE], effort: { default: "high", thinking_tokens: { high: 500 } } }, {});
  for (let k = 0; k < modelReplies(events).length; k += 1) {
    assert.deepEqual(wire[2 * k + 1].usage, modelReplies(events)[k].usage);
  }
  assert.deepEqual(wire[1].usage.output_tokens_details, { thinking_tokens: 500 });
});

test("A8.4 the wire response usage equals model_reply.usage, with cache", () => {
  const { events, wire } = runWith({ ...CACHE_OVER, workspace: WS, script: [READ(), DONE] }, { cache: {} });
  for (let k = 0; k < modelReplies(events).length; k += 1) {
    assert.deepEqual(wire[2 * k + 1].usage, modelReplies(events)[k].usage);
  }
});

test("A8.4 without an effort block the wire usage has no output_tokens_details", () => {
  const { wire } = runWith({ workspace: WS, script: [READ(), DONE] }, {});
  assert.equal("output_tokens_details" in wire[1].usage, false);
});

// ---------- ruling 5: a cache board on a tape without its rules or prices is refused at run start

test("A8.5 a cache board without cache_rules is refused before any event", () => {
  assert.throws(() => runWith({ workspace: WS, script: [DONE] }, { cache: {} }), /cache needs cache_rules and cache prices/);
});

test("A8.5 a cache board without cache prices is refused before any event", () => {
  assert.throws(
    () => runWith({ workspace: WS, script: [DONE], cache_rules: { min_tokens: 1, ttl_ms: 1 } }, { cache: {} }),
    /cache needs cache_rules and cache prices/,
  );
});

const CLI = fileURLToPath(new URL("tools/sim_cli.mjs", ROOT));
const FACTS_PATH = fileURLToPath(new URL("site/data/facts.json", ROOT));
const FIX = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

test("A8.5 the CLI exits 2 with no stdout for a cache board on a tape without its rules", () => {
  const r = spawnSync(process.execPath, [CLI, "run", "--tape", FIX("a7-validate.json"), "--board", FIX("a8-cache-no-rules.board.json"), "--seed", "1", "--facts", FACTS_PATH], { encoding: "utf8" });
  assert.equal(r.status, 2, r.stderr);
  assert.equal(r.stdout, "", "no event is printed");
  assert.match(r.stderr, /cache needs cache_rules and cache prices/);
});

test("A8.5 the CLI exits 2 with no stdout for a cache board on a tape without the rules, with --wire too", () => {
  const r = spawnSync(process.execPath, [CLI, "run", "--tape", FIX("a7-validate.json"), "--board", FIX("a8-cache-no-rules.board.json"), "--seed", "1", "--wire", "--facts", FACTS_PATH], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, "");
});

test("A8.5 the same tape without the cache module runs (the refusal is for the module only)", () => {
  const { result } = runTrial(JSON.parse(readFileSync(FIX("a7-validate.json"), "utf8")), JSON.parse(readFileSync(FIX("a7-validate-off.board.json"), "utf8")), 1, { facts: FACTS });
  assert.equal(result.status, "done");
});
