import { test } from "node:test";
import assert from "node:assert/strict";
import { runWith, ofKind } from "./helpers.mjs";
import { createPrng } from "../prng.js";

const ERR = (type, extra = {}) => ({ error: type, ...extra });
const OK = { say: "ok", stop: "end_turn" };
const READ = { say: "read", tools: [["read_file", { path: "a.txt" }]] };
const DONE = { say: "done", stop: "end_turn" };
const retry = (over = {}) => ({ max_attempts: 5, base_ms: 100, cap_ms: 250, jitter: "none", ...over });

test("backoff without jitter doubles from base_ms up to cap_ms; each wait advances the clock", () => {
  const r = runWith({ script: [ERR("overloaded"), ERR("overloaded"), ERR("overloaded"), OK] }, { retry: retry() });
  assert.deepEqual(ofKind(r.events, "retry_wait").map((e) => e.wait_ms), [100, 200, 250]);
  assert.deepEqual(ofKind(r.events, "model_call").map((e) => e.t), [0, 400, 900, 1450]);
  assert.deepEqual(ofKind(r.events, "model_call").map((e) => e.attempt), [1, 2, 3, 4]);
  const rc = ofKind(r.events, "recovery_check")[0];
  assert.deepEqual({ attempts: rc.attempts, breaker: rc.breaker }, { attempts: 4, breaker: "none" });
  assert.equal(r.result.status, "done");
});

test("retry_after_ms raises the wait when it is longer than the backoff", () => {
  const r = runWith({ script: [ERR("rate_limit", { retry_after_ms: 500 }), OK] }, { retry: retry() });
  assert.equal(ofKind(r.events, "retry_wait")[0].wait_ms, 500);
  assert.equal(ofKind(r.events, "model_error")[0].retry_after_ms, 500);
});

test("retry_after_ms does not shorten the backoff", () => {
  const r = runWith({ script: [ERR("rate_limit", { retry_after_ms: 10 }), OK] }, { retry: retry() });
  assert.equal(ofKind(r.events, "retry_wait")[0].wait_ms, 100);
});

test("backoff with full jitter draws below(base + 1) from the trial's PRNG", () => {
  const seed = 1;
  const expected = createPrng(seed).below(101);
  const r = runWith({ script: [ERR("overloaded"), OK] }, { retry: retry({ jitter: "full" }) }, seed);
  assert.equal(ofKind(r.events, "retry_wait")[0].wait_ms, expected);
});

test("invalid_request is permanent and never retried", () => {
  const r = runWith({ script: [ERR("invalid_request"), OK] }, { retry: retry() });
  assert.equal(ofKind(r.events, "retry_wait").length, 0);
  assert.equal(r.result.status, "error");
  assert.equal(r.result.turns, 1);
});

test("max_attempts caps the attempts: the last failing attempt ends the run error", () => {
  const r = runWith({ script: [ERR("api_error"), ERR("api_error"), OK] }, { retry: retry({ max_attempts: 2 }) });
  assert.equal(ofKind(r.events, "model_error").length, 2);
  assert.equal(ofKind(r.events, "retry_wait").length, 1);
  assert.equal(r.result.status, "error");
});

test("breaker opens after threshold consecutive failed calls and ends circuit_open", () => {
  const r = runWith({ script: [ERR("overloaded"), ERR("overloaded"), ERR("overloaded"), OK] }, { retry: retry(), breaker: { threshold: 2 } });
  assert.equal(ofKind(r.events, "model_error").length, 2);
  assert.equal(ofKind(r.events, "retry_wait").length, 1);
  const b = ofKind(r.events, "breaker")[0];
  assert.deepEqual({ state: b.state, failures: b.failures }, { state: "open", failures: 2 });
  assert.equal(r.result.status, "circuit_open");
  assert.equal(r.result.turns, 1);
});

test("the breaker counter resets on success, so isolated failures never open it", () => {
  const r = runWith(
    { script: [ERR("overloaded"), READ, ERR("overloaded"), DONE] },
    { retry: retry(), breaker: { threshold: 2 } },
  );
  assert.equal(ofKind(r.events, "breaker").length, 0);
  assert.equal(r.result.status, "done");
  assert.ok(ofKind(r.events, "recovery_check").every((e) => e.breaker === "closed"));
});

test("without retry, a single failed call ends error; with threshold 1 the breaker ends circuit_open first", () => {
  const plain = runWith({ script: [ERR("overloaded"), OK] });
  assert.equal(plain.result.status, "error");
  const tripped = runWith({ script: [ERR("overloaded"), OK] }, { breaker: { threshold: 1 } });
  assert.equal(tripped.result.status, "circuit_open");
  assert.equal(ofKind(tripped.events, "retry_wait").length, 0);
});
