// Pure logic of BP-3.3 round 1: the stack's checks and counts (hx-stack), and the outage model (hx-outage): ENGINE
// §7.3 backoff, the provider's slots, the breaker and the recovery rule. Small cases are worked out by hand in the comments.
// The lab modules define custom elements at import time, so DOM globals are stubbed.
// Run: node --test "site/assets/components/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { validStack, rightCount, stackTokens, layerTokens } = await import("../hx-stack.js");
const { validOutage, validPolicy, samePolicy, clonePolicy, recoveredAt, simulate } = await import("../hx-outage.js");
const { backoffWait: backoff } = await import("../../sim/backoff.js");
const { createPrng } = await import("../../sim/prng.js");
const { tokens } = await import("../../sim/tokens.js");

const json = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const stackDemo = () => json("../../../labs/data/stack-demo.json");
const outageDemo = () => json("../../../labs/data/outage-demo.json");

const layers = [
  { id: "a", label: "A", source: "operator", text: "first layer" },
  { id: "b", label: "B", source: "user", text: "second layer, longer" },
];
const conflicts = [
  { id: "c1", question: "Q1?", says: [{ layer: "a", text: "x" }, { layer: "b", text: "y" }], winner: "a", why: "because" },
  { id: "c2", question: "Q2?", says: [{ layer: "a", text: "x" }, { layer: "b", text: "y" }], winner: "b", why: "because" },
];

test("stack: the demo file has the blueprint's shape and validates", () => {
  const src = validStack(stackDemo());
  assert.equal(src.layers.length, 4);
  assert.equal(src.conflicts.length, 3);
  for (const conflict of src.conflicts) assert.ok(conflict.says.some((says) => says.layer === conflict.winner));
});

test("stack: a conflict whose winner is not one of its layers is refused", () => {
  const bad = { layers, conflicts: [{ ...conflicts[0], winner: "tool" }] };
  assert.throws(() => validStack(bad), /winner is not one of its layers/);
});

test("stack: an unknown source or a repeated layer id is refused", () => {
  assert.throws(() => validStack({ layers: [{ id: "a", label: "A", source: "oracle", text: "t" }], conflicts }), /unknown source/);
  assert.throws(() => validStack({ layers: [layers[0], layers[0]], conflicts }), /repeated layer id/);
});

test("stack: right counts the conflicts whose pick is the winner; a missing pick is not right", () => {
  assert.equal(rightCount(conflicts, {}), 0);
  assert.equal(rightCount(conflicts, { c1: "a" }), 1);
  assert.equal(rightCount(conflicts, { c1: "b", c2: "b" }), 1);
  assert.equal(rightCount(conflicts, { c1: "a", c2: "b" }), 2);
});

test("stack: a layer's tokens are the simulator's estimate of its text; the total is their sum", () => {
  assert.equal(layerTokens(layers[0]), tokens("first layer"));
  assert.equal(stackTokens(layers), tokens("first layer") + tokens("second layer, longer"));
  assert.ok(stackTokens(layers) > 0);
});

test("outage: the demo file validates and its default policy is the full-jitter preset", () => {
  const src = validOutage(outageDemo());
  assert.equal(src.provider.clients, 50);
  assert.equal(src.presets.length, 4);
  assert.equal(src.policy.jitter, "full");
  assert.ok(samePolicy(src.policy, src.presets[2].policy), "the default is the full-jitter preset");
});

test("outage: policy knobs are checked against their ranges", () => {
  const ok = { max_attempts: 5, base_ms: 200, cap_ms: 5000, jitter: "full", breaker: null };
  assert.equal(validPolicy(ok), ok);
  assert.throws(() => validPolicy({ ...ok, max_attempts: 11 }), /max_attempts/);
  assert.throws(() => validPolicy({ ...ok, cap_ms: 50 }), /cap_ms/);
  assert.throws(() => validPolicy({ ...ok, jitter: "half" }), /jitter/);
  assert.throws(() => validPolicy({ ...ok, breaker: { threshold: 1, cooldown_ms: 2000 } }), /threshold/);
  assert.throws(() => validPolicy({ ...ok, breaker: { threshold: 3, cooldown_ms: 500 } }), /cooldown/);
});

test("outage: samePolicy compares the knobs and the breaker, and a clone is equal but separate", () => {
  const a = { max_attempts: 3, base_ms: 100, cap_ms: 1000, jitter: "none", breaker: { threshold: 2, cooldown_ms: 1000 } };
  const copy = clonePolicy(a);
  assert.ok(samePolicy(a, copy));
  assert.notEqual(copy.breaker, a.breaker);
  assert.equal(samePolicy(a, { ...a, breaker: null }), false);
  assert.equal(samePolicy(a, { ...a, jitter: "full" }), false);
});

test("backoff (ENGINE §7.3, no jitter): base is min(cap, base * 2^(attempt-1))", () => {
  const p = { base_ms: 100, cap_ms: 1000, jitter: "none" };
  assert.equal(backoff(1, p, null, 0), 100);
  assert.equal(backoff(2, p, null, 0), 200);
  assert.equal(backoff(3, p, null, 0), 400);
  assert.equal(backoff(6, p, null, 0), 1000, "3200 is capped at 1000");
});

test("backoff (full jitter): one draw below base + 1", () => {
  const p = { base_ms: 100, cap_ms: 1000, jitter: "full" };
  const prng = createPrng(7);
  const before = prng.draws;
  const wait = backoff(3, p, prng, 0);
  assert.equal(prng.draws, before + 1, "one draw");
  assert.ok(wait >= 0 && wait <= 400, `0 to 400 ms, got ${wait}`);
});

test("backoff (full jitter, base 0): still draws once and waits 0", () => {
  const prng = createPrng(3);
  assert.equal(backoff(1, { base_ms: 0, cap_ms: 100, jitter: "full" }, prng, 0), 0);
  assert.equal(prng.draws, 1);
});

test("recovery: the first slot after the outage from which 10 slots in a row have under 10% failures", () => {
  const sent = new Array(20).fill(10);
  const failedAt = new Array(20).fill(0);
  assert.equal(recoveredAt(sent, failedAt, 1000, 100), 1000);
  assert.equal(recoveredAt(sent, new Array(20).fill(5), 1000, 100), null, "half fail everywhere");
  const late = new Array(20).fill(0);
  for (let i = 10; i < 15; i += 1) late[i] = 2;
  assert.equal(recoveredAt(sent, late, 1000, 100), null, "a bad slot in the window blocks recovery");
});

test("simulate: one client, no outage, think 500 ms: sends at 0, 500, 1000, 1500", () => {
  const provider = { clients: 1, think_ms: 500, slot_ms: 100, capacity: 1, outage_from_ms: 0, outage_to_ms: 0, duration_ms: 2000, error_ms: 0 };
  const r = simulate(provider, { max_attempts: 5, base_ms: 0, cap_ms: 100, jitter: "none", breaker: null }, 1);
  assert.equal(r.requests, 4);
  assert.equal(r.failed, 0);
  assert.equal(r.recovered_ms, 0);
});

test("simulate: one client through an outage [0, 1000) with 3 attempts: 7 requests, 1 task given up, recovered at 1000 ms", () => {
  // Sends: 0 (fail), 100 (fail), 300 (fail, given up), 800 (fail), 900 (fail), 1100 (served), 1600 (served).
  const provider = { clients: 1, think_ms: 500, slot_ms: 100, capacity: 1, outage_from_ms: 0, outage_to_ms: 1000, duration_ms: 2000, error_ms: 0 };
  const r = simulate(provider, { max_attempts: 3, base_ms: 100, cap_ms: 1000, jitter: "none", breaker: null }, 1);
  assert.equal(r.requests, 7);
  assert.equal(r.failed, 1);
  assert.equal(r.recovered_ms, 1000);
  assert.equal(r.peak, 1);
});

test("simulate: a breaker (threshold 2, cooldown 1000 ms) cuts the sends during a long outage to 6", () => {
  // Sends: 0, 100, then the breaker holds the client until 1100, 2100, 3100, 4100. Without it: one every 100 ms.
  const provider = { clients: 1, think_ms: 500, slot_ms: 100, capacity: 1, outage_from_ms: 0, outage_to_ms: 10000, duration_ms: 5000, error_ms: 0 };
  const policy = { max_attempts: 10, base_ms: 100, cap_ms: 100, jitter: "none", breaker: { threshold: 2, cooldown_ms: 1000 } };
  const withBreaker = simulate(provider, policy, 1);
  const without = simulate(provider, { ...policy, breaker: null }, 1);
  assert.equal(withBreaker.requests, 6);
  assert.equal(withBreaker.failed, 0);
  // Without it: 10 attempts per task, then 500 ms of think time: sends in 0-900, 1400-2300, 2800-3700, 4200-4900 = 38.
  assert.equal(without.requests, 38);
});

test("simulate: the same seed gives the same run; another seed draws other jitter", () => {
  const provider = validOutage(outageDemo()).provider;
  const policy = validOutage(outageDemo()).policy;
  const a = simulate(provider, policy, 4);
  const b = simulate(provider, policy, 4);
  assert.deepEqual(a, b);
  const c = simulate(provider, policy, 5);
  assert.notEqual(JSON.stringify(a.sent), JSON.stringify(c.sent));
});

test("simulate: the totals agree with the per-slot arrays", () => {
  const provider = validOutage(outageDemo()).provider;
  const r = simulate(provider, validOutage(outageDemo()).presets[0].policy, 2);
  const sent = r.sent.reduce((n, v) => n + v, 0);
  const failedSlots = r.failedAt.reduce((n, v) => n + v, 0);
  assert.equal(sent, r.requests);
  assert.ok(failedSlots <= r.requests);
  assert.equal(r.sent.length, 200);
  assert.equal(r.peak, Math.max(...r.sent));
});

test("simulate: a failure is answered after error_ms, and the retry waits from the answer", () => {
  // One client, outage until 10 s, two attempts per task, no backoff, error 300 ms:
  // 0 (fail, answered 300) -> 300 (fail, answered 600, given up) -> next task 1100 -> 1100 (fail, answered 1400)
  // -> 1400 (fail, given up, answered 1700) -> next task 2200, after the run. Requests 4, tasks failed 2, slowest 600 ms.
  const provider = { clients: 1, think_ms: 500, slot_ms: 100, capacity: 1, outage_from_ms: 0, outage_to_ms: 10000, duration_ms: 2000, error_ms: 300 };
  const r = simulate(provider, { max_attempts: 2, base_ms: 0, cap_ms: 100, jitter: "none", breaker: null }, 1);
  assert.equal(r.requests, 4);
  assert.equal(r.failed, 2);
  assert.equal(r.slowest_ms, 600);
  assert.equal(r.slowest_open, false);
});

test("simulate: an outage with 300 ms failures and 3 attempts: 4 requests, 1 task given up, slowest 1200 ms", () => {
  // 0 (fail, answered 300) -> 400 (fail, answered 700) -> 900 (fail, given up, answered 1200) -> next task 1700,
  // served at 1700 (answered at once). Requests 4, tasks failed 1, slowest 1200 ms (from 0 to 1200).
  const provider = { clients: 1, think_ms: 500, slot_ms: 100, capacity: 1, outage_from_ms: 0, outage_to_ms: 1000, duration_ms: 2000, error_ms: 300 };
  const r = simulate(provider, { max_attempts: 3, base_ms: 100, cap_ms: 1000, jitter: "none", breaker: null }, 1);
  assert.equal(r.requests, 4);
  assert.equal(r.failed, 1);
  assert.equal(r.slowest_ms, 1200);
  assert.equal(r.recovered_ms, 1000);
});

test("simulate: a task still open at the end counts until the end, marked as a lower bound (the breaker's cost)", () => {
  // A breaker (threshold 2, cooldown 1 s) and a 300 ms error keep the one client waiting: sends at 0, 400, 1700, 3000,
  // 4300; its task is still open at 5 s, so the slowest task is at least 5 s.
  const provider = { clients: 1, think_ms: 500, slot_ms: 100, capacity: 1, outage_from_ms: 0, outage_to_ms: 10000, duration_ms: 5000, error_ms: 300 };
  const policy = { max_attempts: 10, base_ms: 100, cap_ms: 100, jitter: "none", breaker: { threshold: 2, cooldown_ms: 1000 } };
  const r = simulate(provider, policy, 1);
  assert.equal(r.requests, 5);
  assert.equal(r.failed, 0);
  assert.equal(r.slowest_ms, 5000);
  assert.equal(r.slowest_open, true);
});

test("simulate: with no failures the slowest task is 0 ms and is not open", () => {
  const provider = { clients: 1, think_ms: 500, slot_ms: 100, capacity: 1, outage_from_ms: 0, outage_to_ms: 0, duration_ms: 2000, error_ms: 300 };
  const r = simulate(provider, { max_attempts: 5, base_ms: 0, cap_ms: 100, jitter: "none", breaker: null }, 1);
  assert.equal(r.slowest_ms, 0);
  assert.equal(r.slowest_open, false);
});

test("outage demo: the provider's error latency and capacity are the ruled defaults (capacity 12 = 1.2 x 10 per slot)", () => {
  const { provider } = validOutage(outageDemo());
  assert.equal(provider.error_ms, 300);
  assert.equal(provider.capacity, 12);
  // Steady load: 50 clients, one request every 500 ms each, so 10 per 100 ms slot.
  assert.equal(provider.clients * provider.slot_ms / provider.think_ms, 10);
});

test("open arrivals: one task per slot against capacity 1 is served every time", () => {
  // Tasks arrive at 0, 100, ..., 900 ms and each slot holds one: 10 requests, none failed, slowest 0 ms.
  const provider = { clients: 1, think_ms: 500, slot_ms: 100, capacity: 1, outage_from_ms: 0, outage_to_ms: 0, duration_ms: 1000, error_ms: 300, arrivals_per_slot: 1 };
  const r = simulate(provider, { max_attempts: 5, base_ms: 0, cap_ms: 100, jitter: "none", breaker: null }, 1);
  assert.equal(r.requests, 10);
  assert.equal(r.failed, 0);
  assert.equal(r.slowest_ms, 0);
});

test("open arrivals: two tasks per slot against capacity 1 with one attempt each: 20 requests, 10 tasks failed", () => {
  // Tasks arrive at 0, 50, 100, ...: in every slot the first is served and the second fails and gives up at once.
  const provider = { clients: 2, think_ms: 500, slot_ms: 100, capacity: 1, outage_from_ms: 0, outage_to_ms: 0, duration_ms: 1000, error_ms: 300, arrivals_per_slot: 2 };
  const r = simulate(provider, { max_attempts: 1, base_ms: 0, cap_ms: 100, jitter: "none", breaker: null }, 1);
  assert.equal(r.requests, 20);
  assert.equal(r.failed, 10);
});

test("closed loop, all start together: every client's first request lands in the first slot", () => {
  const together = { clients: 3, think_ms: 500, slot_ms: 100, capacity: 3, outage_from_ms: 0, outage_to_ms: 0, duration_ms: 1000, error_ms: 300, start: "together" };
  const spread = { ...together, start: "spread" };
  const policy = { max_attempts: 5, base_ms: 0, cap_ms: 100, jitter: "none", breaker: null };
  assert.equal(simulate(together, policy, 1).sent[0], 3);
  assert.equal(simulate(spread, policy, 1).sent[0], 1, "spread starts at 0, 166 and 333 ms");
});

test("breaker in open arrivals: holding a client's attempts cuts the requests sent during the outage", () => {
  const provider = { clients: 1, think_ms: 500, slot_ms: 100, capacity: 1, outage_from_ms: 0, outage_to_ms: 10000, duration_ms: 5000, error_ms: 300, arrivals_per_slot: 1 };
  const policy = { max_attempts: 10, base_ms: 100, cap_ms: 100, jitter: "none", breaker: null };
  const open = simulate(provider, policy, 1);
  const held = simulate(provider, { ...policy, breaker: { threshold: 2, cooldown_ms: 1000 } }, 1);
  assert.ok(held.requests < open.requests, `${held.requests} < ${open.requests}`);
  assert.equal(held.slowest_open, true, "a task waits behind the breaker at the end");
});

test("provider options are checked: start and arrivals_per_slot", () => {
  const base = validOutage(outageDemo()).provider;
  assert.throws(() => validOutage({ ...outageDemo(), provider: { ...base, start: "later" } }), /start/);
  assert.throws(() => validOutage({ ...outageDemo(), provider: { ...base, arrivals_per_slot: 101 } }), /arrivals_per_slot/);
  assert.throws(() => validOutage({ ...outageDemo(), models: [{ provider: {} }] }), /label/);
});

test("outage demo: three load models and four presets; backoff without jitter has the same base, cap and attempts as full jitter", () => {
  const src = validOutage(outageDemo());
  assert.equal(src.models.length, 1, "the demo lists the together model only");
  assert.equal(src.presets.length, 4);
  const [noJitter, fullJitter] = [src.presets[1].policy, src.presets[2].policy];
  assert.equal(noJitter.jitter, "none");
  assert.equal(fullJitter.jitter, "full");
  assert.equal(noJitter.max_attempts, fullJitter.max_attempts);
  assert.equal(noJitter.base_ms, fullJitter.base_ms);
  assert.equal(noJitter.cap_ms, fullJitter.cap_ms);
});

test("load models: the spread and open-arrival models stay available in the code and validate", () => {
  const base = validOutage(outageDemo());
  const variants = [
    { label: "spread", provider: { start: "spread", arrivals_per_slot: 0 } },
    { label: "open", provider: { start: "spread", arrivals_per_slot: 10, capacity: 11 } },
  ];
  const src = validOutage({ ...base, models: variants });
  assert.equal(src.models.length, 2);
  const open = simulate({ ...base.provider, ...variants[1].provider }, base.policy, 1);
  assert.ok(open.requests > 0);
});

test("the last failure is the arrival time of the last failed request", () => {
  // One client, outage [0, 1000), one attempt per task: the request at 0 fails (answered 300), the next task starts
  // at 300 + 500 = 800 and fails too (inside the outage); the task after it, at 1600, is past the run. Last failure: 800.
  const provider = { clients: 1, think_ms: 500, slot_ms: 100, capacity: 1, outage_from_ms: 0, outage_to_ms: 1000, duration_ms: 1500, error_ms: 300 };
  const r = simulate(provider, { max_attempts: 1, base_ms: 0, cap_ms: 100, jitter: "none", breaker: null }, 1);
  assert.equal(r.last_failure_ms, 800);
  const none = simulate({ ...provider, outage_from_ms: 0, outage_to_ms: 0 }, { max_attempts: 1, base_ms: 0, cap_ms: 100, jitter: "none", breaker: null }, 1);
  assert.equal(none.last_failure_ms, null);
});

