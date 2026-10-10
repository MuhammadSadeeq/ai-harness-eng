// ENGINE amendment A6 (docs/ENGINE.md, Amendments; DECISIONS D-051): the two prompt-aware
// conditions, tape notes, compaction, the system clock, the prompt cache, and the order in a turn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tapeWith, boardWith, runWith, kindsOf, ofKind, FACTS } from "./helpers.mjs";
import { compactionSummary, cacheAccount, runTrial, loadTape } from "../index.js";
import { resolvePricing } from "../pricing.js";

const READ = (path = "a.txt") => ({ say: "read", tools: [["read_file", { path }]] });
const DONE = { say: "done", stop: "end_turn" };
const CACHE_PRICES = {
  input_milli_per_mtok: 2000,
  output_milli_per_mtok: 10000,
  cache_write_milli_per_mtok: 2500,
  cache_read_milli_per_mtok: 200,
};
const CACHE_OVER = { pricing: CACHE_PRICES, cache_rules: { min_tokens: 1, ttl_ms: 60000 } };
const NOTES = [
  { id: "n1", kind: "goal", turn: 0, text: "Fix a.txt." },
  { id: "n2", kind: "progress", turn: 0, text: "Read it once." },
  { id: "n3", kind: "decision", turn: 1, text: "Keep the file." },
  { id: "n4", kind: "constraint", turn: 2, text: "No edits." },
];
const modelReplies = (events) => ofKind(events, "model_reply");
const promptsBuilt = (events) => ofKind(events, "prompt_built");

// ---------- A6.1: the two prompt-aware conditions

test("A6.1 context_gte:<n> is 100 * tokens(request) >= n * window", () => {
  const script = (cond) => [{ when: [{ if: cond, then: [{ say: "big", stop: "end_turn" }] }, { else: [{ say: "small", stop: "end_turn" }] }] }];
  // The first request is 376 tokens: 100 * 376 >= 50 * 700 holds; with a window of 100000 it does not.
  assert.equal(modelReplies(runWith({ window: 700, script: script("context_gte:50") }).events)[0].text, "big");
  assert.equal(modelReplies(runWith({ window: 100000, script: script("context_gte:50") }).events)[0].text, "small");
});

test("A6.1 sent_lacks:<text> looks at string values of the request, not keys", () => {
  const one = (cond) => [{ when: [{ if: cond, then: [{ say: "lacks", stop: "end_turn" }] }, { else: [{ say: "has", stop: "end_turn" }] }] }];
  const text = (cond) => modelReplies(runWith({ script: one(cond) }).events)[0].text;
  assert.equal(text("sent_lacks:zebra"), "lacks", "no string holds zebra");
  assert.equal(text("sent_lacks:calc"), "has", "the tool description example calc.py is a value");
  assert.equal(text("sent_lacks:do it"), "has", "the task is a message value");
  assert.equal(text("sent_lacks:read_file"), "has", "tool names are values in the tool definitions");
  assert.equal(text("sent_lacks:properties"), "lacks", "a key (properties) is not a value");
  assert.equal(text("sent_lacks:sys"), "has", "the system prompt is in the request");
});

test("A6.1 sent_lacks reads the text after the first colon, colons and spaces included", () => {
  const tape = tapeWith({ task: "note: a:b here", script: [{ when: [{ if: "sent_lacks:a:b here", then: [DONE] }, { else: [{ say: "found", stop: "end_turn" }] }] }] });
  assert.equal(tape.script[0].when[0].if, "sent_lacks:a:b here");
  const { events } = runWith({ task: "note: a:b here", script: [{ when: [{ if: "sent_lacks:a:b here", then: [{ say: "lacks", stop: "end_turn" }] }, { else: [{ say: "found", stop: "end_turn" }] }] }] });
  assert.equal(modelReplies(events)[0].text, "found");
});

test("A6.1 the condition's argument is validated: context_gte needs a canonical non-negative integer", () => {
  const when = (cond) => ({ when: [{ if: cond, then: [DONE] }, { else: [DONE] }] });
  assert.doesNotThrow(() => tapeWith({ script: [when("context_gte:0"), DONE] }));
  assert.throws(() => tapeWith({ script: [when("context_gte:-1"), DONE] }), /unknown condition/);
  assert.throws(() => tapeWith({ script: [when("context_gte:x"), DONE] }), /unknown condition/);
  assert.throws(() => tapeWith({ script: [when("context_gte:01"), DONE] }), /unknown condition/);
});

test("A6 ruling (4): sent_lacks with empty text is refused", () => {
  const when = (cond) => ({ when: [{ if: cond, then: [DONE] }, { else: [DONE] }] });
  assert.doesNotThrow(() => tapeWith({ script: [when("sent_lacks:x"), DONE] }));
  assert.throws(() => tapeWith({ script: [when("sent_lacks:"), DONE] }), /unknown condition/);
});

// ---------- A6.2: tape notes

test("A6.2 notes load; a duplicate id, an unknown kind or a negative turn is refused", () => {
  assert.deepEqual(tapeWith({ notes: NOTES }).notes, NOTES);
  assert.deepEqual(tapeWith().notes, [], "absent notes default to []");
  assert.throws(() => tapeWith({ notes: [NOTES[0], { ...NOTES[1], id: "n1" }] }), /duplicate note id "n1"/);
  assert.throws(() => tapeWith({ notes: [{ ...NOTES[0], kind: "idea" }] }), /kind must be one of/);
  assert.throws(() => tapeWith({ notes: [{ ...NOTES[0], turn: -1 }] }), /turn/);
});

// ---------- A6.3: compaction (the summary is the exported function)

test("A6.3 compactionSummary keeps the known notes of the kinds kept, in tape order, and says what was dropped", () => {
  const s = compactionSummary(NOTES, ["goal", "decision"], 2);
  assert.deepEqual(s.kept, ["n1", "n3"], "known (turn < 2) and kind in keep");
  assert.deepEqual(s.dropped, ["n2"], "known and not kept; n4 is not yet known");
  assert.equal(s.text, "Summary of the work so far:\n- goal: Fix a.txt.\n- decision: Keep the file.");
});

test("A6.3 compactionSummary with nothing kept says so", () => {
  const s = compactionSummary(NOTES, [], 3);
  assert.equal(s.text, "Summary of the work so far:\n- (nothing kept)");
  assert.deepEqual(s.kept, []);
});

const COMPACT = { threshold_percent: 1, keep: ["goal", "decision"] };
const WINDOW = 8000; // the default test window is 100000, which 1 percent never reaches

test("A6.3 the compactor keeps the last reply and the user message after it, and the harness history continues from there", () => {
  const script = [READ(), READ(), READ(), DONE];
  const { events, wire } = runWith({ window: WINDOW, script, notes: NOTES }, { compaction: COMPACT });
  const first = ofKind(events, "compaction")[0];
  assert.equal(first.turn, 3, "the first compaction is before the third call, once the history has 5 messages");
  assert.equal(first.dropped_messages, 3);
  assert.deepEqual(first.kept_notes, ["n1", "n3"]);
  assert.equal(wire[4].messages.length, 3, "the third request carries the summary and the last two messages");
  assert.equal(wire[4].messages[0].content[0].text, "Summary of the work so far:\n- goal: Fix a.txt.\n- decision: Keep the file.");
  assert.ok(first.tokens_before > first.tokens_after, "the compacted request is smaller");
});

test("A6.3 prompt_built equals the compaction's tokens_after, and the context check says compacted that turn", () => {
  const { events } = runWith({ window: WINDOW, script: [READ(), READ(), READ(), DONE], notes: NOTES }, { compaction: COMPACT });
  const c = ofKind(events, "compaction")[0];
  const built = promptsBuilt(events).find((e) => e.turn === c.turn);
  assert.equal(built.tokens, c.tokens_after);
  const check = ofKind(events, "context_check").find((e) => e.turn === c.turn);
  assert.equal(check.action, "compacted");
  assert.equal(ofKind(events, "context_check")[0].action, "none", "no compaction on turn 1");
});

test("A6.3 no compaction below the threshold, or before the history has 5 messages", () => {
  const { events } = runWith({ window: WINDOW, script: [READ(), READ(), READ(), DONE], notes: NOTES }, { compaction: { threshold_percent: 100, keep: ["goal"] } });
  assert.equal(ofKind(events, "compaction").length, 0);
  const short = runWith({ window: WINDOW, script: [READ(), DONE], notes: NOTES }, { compaction: COMPACT });
  assert.equal(ofKind(short.events, "compaction").length, 0, "two messages are never compacted");
});

test("A6.3 the compactor runs after the guards and turn += 1, before the control wire", () => {
  const { events } = runWith({ window: WINDOW, script: [READ(), READ(), READ(), DONE], notes: NOTES }, { compaction: COMPACT });
  const kinds = kindsOf(events);
  const at = kinds.indexOf("compaction");
  assert.equal(kinds[at + 1], "prompt_built", "the control wire follows the compaction");
  assert.equal(events[at].turn, events[at + 1].turn, "same turn");
});

test("A6.3 the compaction event sits on the context wire", () => {
  const { events } = runWith({ window: WINDOW, script: [READ(), READ(), READ(), DONE], notes: NOTES }, { compaction: COMPACT });
  assert.equal(ofKind(events, "compaction")[0].wire, "context");
});

// ---------- A6.4: the system clock

test("A6.4 system_clock: the layers start with clock, and the system prompt carries the time at the top", () => {
  const { events, wire } = runWith({ script: [READ(), DONE] }, { system_clock: {} });
  const built = promptsBuilt(events);
  assert.equal(built[0].layers[0], "clock");
  assert.equal(wire[0].system, `Current time: t=${built[0].t} ms\n\nsys`);
  assert.equal(wire[2].system, `Current time: t=${built[1].t} ms\n\nsys`, "every request has its own time");
  assert.notEqual(wire[0].system, wire[2].system);
});

test("A6.4 without the clock the system prompt is the tape's", () => {
  const { wire, events } = runWith({ script: [READ(), DONE] }, {});
  assert.equal(wire[0].system, "sys");
  assert.equal(promptsBuilt(events)[0].layers[0], "system");
});

// ---------- A6.5: the prompt cache

test("A6.5 cache needs cache_rules and cache prices on the tape", () => {
  assert.throws(() => runWith({ script: [DONE] }, { cache: {} }), /cache needs cache_rules and cache prices/);
  assert.throws(() => runWith({ script: [DONE], pricing: CACHE_PRICES }, { cache: {} }), /cache needs cache_rules/);
  assert.throws(() => runWith({ script: [DONE], cache_rules: { min_tokens: 1, ttl_ms: 1 } }, { cache: {} }), /cache needs cache_rules/);
});

test("A6.5 cache prices: inline integers, or the fact's value keys in milli-units", () => {
  assert.deepEqual(resolvePricing({ input_milli_per_mtok: 1, output_milli_per_mtok: 2, cache_write_milli_per_mtok: 3, cache_read_milli_per_mtok: 4 }, {}),
    { input_milli: 1, output_milli: 2, cache_write_milli: 3, cache_read_milli: 4 });
  const facts = { f: { value: { input_usd_per_mtok: 2, output_usd_per_mtok: 10, cache_write_usd_per_mtok: 2.5, cache_hit_usd_per_mtok: 0.2 } } };
  assert.deepEqual(resolvePricing({ fact: "f" }, facts), { input_milli: 2000, output_milli: 10000, cache_write_milli: 2500, cache_read_milli: 200 });
  assert.throws(() => resolvePricing({ input_milli_per_mtok: 1, output_milli_per_mtok: 2, cache_write_milli_per_mtok: 2.5 }, {}), /must be an integer/);
});

test("A6.5 the first call writes the whole prompt; the usage carries the cache fields; tokens_in counts the whole prompt", () => {
  const { events, wire, result } = runWith({ ...CACHE_OVER, script: [READ(), DONE] }, { cache: {} });
  const first = modelReplies(events)[0];
  const built = promptsBuilt(events);
  assert.deepEqual(first.usage, {
    input_tokens: 0,
    cache_creation_input_tokens: built[0].tokens,
    cache_read_input_tokens: 0,
    output_tokens: first.usage.output_tokens,
  });
  assert.deepEqual(wire[1].usage, first.usage, "the wire response has the same usage");
  assert.equal(result.tokens.input, built[0].tokens + built[1].tokens, "budgets count the whole prompt");
});

test("A6.5 cost splits the prompt into uncached, write and read at their prices", () => {
  const { events } = runWith({ ...CACHE_OVER, script: [DONE] }, { cache: {} });
  const r = modelReplies(events)[0];
  assert.equal(r.cost, 0 + r.usage.cache_creation_input_tokens * 2500 + 0 + r.usage.output_tokens * 10000);
});

test("A6.5 the cache event: read, write, uncached, matched and hit_percent; it sits on the context wire, before model_reply", () => {
  const { events } = runWith({ ...CACHE_OVER, script: [READ(), DONE] }, { cache: {} });
  const c = ofKind(events, "cache")[0];
  assert.equal(c.matched, "none");
  assert.equal(c.hit_percent, 0);
  assert.equal(c.wire, "context");
  const kinds = kindsOf(events);
  assert.ok(kinds.indexOf("cache") < kinds.indexOf("model_reply"), "cache before model_reply");
  assert.ok(kinds.indexOf("recovery_check") < kinds.indexOf("cache"), "after recovery_check");
});

test("A6.5 the wire request marks the breakpoint in the wire payload only", () => {
  const { wire } = runWith({ ...CACHE_OVER, script: [READ(), DONE] }, { cache: {} });
  const last = wire[0].messages[0].content;
  assert.deepEqual(last[last.length - 1].cache_control, { type: "ephemeral" });
  const second = wire[2].messages;
  assert.equal(second[0].content[0].cache_control, undefined, "only the last message's last block carries it");
  assert.deepEqual(second[second.length - 1].content.at(-1).cache_control, { type: "ephemeral" });
});

test("A6.5 without the cache module there are no cache events, no cache_control and the usage is as before", () => {
  const { events, wire } = runWith({ script: [READ(), DONE] }, {});
  assert.equal(ofKind(events, "cache").length, 0);
  assert.equal(JSON.stringify(wire).includes("cache_control"), false);
  assert.deepEqual(modelReplies(events)[0].usage, { input_tokens: promptsBuilt(events)[0].tokens, output_tokens: modelReplies(events)[0].usage.output_tokens });
});

test("A6.5 without the clock the second call matches the first call's prefix; with the clock it misses", () => {
  const script = [READ(), DONE];
  const plain = ofKind(runWith({ ...CACHE_OVER, script }, { cache: {} }).events, "cache")[1];
  assert.equal(plain.matched, "messages[0]", "the task message is the prefix written by the first call");
  assert.ok(plain.read > 0);
  const clock = ofKind(runWith({ ...CACHE_OVER, script }, { cache: {}, system_clock: {} }).events, "cache")[1];
  assert.equal(clock.matched, "none", "the time changes the system prompt, so no prefix from before is the same");
  assert.equal(clock.read, 0);
});

test("A6.5 cacheAccount: too short means nothing is read, written or stored", () => {
  const map = new Map();
  const r = cacheAccount(map, [{ key: "a", tokens: 5 }], 5, 0, { min_tokens: 10, ttl_ms: 100 });
  assert.deepEqual(r, { read: 0, write: 0, uncached: 5, matchedIndex: 0 });
  assert.equal(map.size, 0);
});

test("A6.5 cacheAccount: a first call writes the whole request under its key", () => {
  const map = new Map();
  const prefixes = [{ key: "p1", tokens: 10 }, { key: "p2", tokens: 20 }];
  assert.deepEqual(cacheAccount(map, prefixes, 20, 0, { min_tokens: 1, ttl_ms: 1000 }), { read: 0, write: 20, uncached: 0, matchedIndex: 0 });
  assert.deepEqual([...map.entries()], [["p2", 0]], "only the breakpoint key is stored");
});

test("A6.5 cacheAccount: the largest matching k is read, and the read refreshes that key", () => {
  const map = new Map([["p1", 0], ["p2", 0]]);
  const prefixes = [{ key: "p1", tokens: 10 }, { key: "p2", tokens: 20 }];
  assert.deepEqual(cacheAccount(map, prefixes, 20, 100, { min_tokens: 1, ttl_ms: 1000 }), { read: 20, write: 0, uncached: 0, matchedIndex: 2 });
  assert.equal(map.get("p2"), 100);
});

test("A6.5 cacheAccount: a key older than ttl_ms does not match; the next shorter prefix does", () => {
  const map = new Map([["p1", 0], ["p2", 0]]);
  const prefixes = [{ key: "p1", tokens: 10 }, { key: "p2", tokens: 20 }];
  assert.deepEqual(cacheAccount(map, prefixes, 20, 1000, { min_tokens: 1, ttl_ms: 1000 }), { read: 0, write: 20, uncached: 0, matchedIndex: 0 });
  const partial = new Map([["p1", 0]]);
  assert.deepEqual(cacheAccount(partial, prefixes, 20, 10, { min_tokens: 1, ttl_ms: 1000 }), { read: 10, write: 10, uncached: 0, matchedIndex: 1 });
  assert.deepEqual([...partial.entries()].sort(), [["p1", 10], ["p2", 10]]);
});

// ---------- A6.6: the order within a turn, with every module plugged

test("A6.6 order within a turn: compaction, control wire, context check, call, cache, model_reply", () => {
  const { events } = runWith({ ...CACHE_OVER, window: WINDOW, script: [READ(), READ(), READ(), DONE], notes: NOTES },
    { compaction: COMPACT, system_clock: {}, cache: {} });
  const turn3 = events.filter((e) => e.turn === 3).map((e) => e.kind);
  const expected = ["compaction", "prompt_built", "context_check", "model_call", "recovery_check", "cache", "model_reply"];
  assert.deepEqual(turn3.slice(0, expected.length), expected);
});

// ---------- the fixture: one tape, two boards

const FIX = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const fixtureTape = () => JSON.parse(readFileSync(FIX("a6-compact-cache.json"), "utf8"));
const fixtureBoard = (name) => JSON.parse(readFileSync(FIX(name), "utf8"));

test("the fixture tape runs with compaction and cache, on a board with the system clock and one without", () => {
  const withClock = runTrial(fixtureTape(), fixtureBoard("a6-cache-clock.board.json"), 1, { facts: FACTS });
  const noClock = runTrial(fixtureTape(), fixtureBoard("a6-cache.board.json"), 1, { facts: FACTS });
  assert.equal(withClock.result.status, "done");
  assert.equal(noClock.result.status, "done");
  assert.ok(ofKind(withClock.events, "compaction").length > 0);
  assert.ok(ofKind(noClock.events, "cache").some((e) => e.matched === "messages[0]"), "without the clock the prefix hits");
  assert.ok(ofKind(withClock.events, "cache").every((e) => e.read === 0), "with the clock nothing is read");
});
