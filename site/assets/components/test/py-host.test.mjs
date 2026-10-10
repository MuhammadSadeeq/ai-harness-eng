// Tests for lib/py-host.js with a fake worker. A load has no time cap: it is slow after 20 s, and it fails only on a
// real error (worker error, message error, init error). Try again restarts the load. The run limit still restarts
// the worker. Stale messages from a terminated worker are ignored.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPythonHost, CRASH_MESSAGE, SLOW_AFTER_MS, RUN_LIMIT_MS } from "../lib/py-host.js";

class FakeWorker {
  constructor() {
    this.sent = [];
    this.terminated = false;
    this.onmessage = null;
    this.onerror = null;
    this.onmessageerror = null;
  }
  postMessage(message) {
    this.sent.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data) {
    this.onmessage?.({ data });
  }
  fail() {
    this.onerror?.({ preventDefault() {} });
  }
  messageError() {
    this.onmessageerror?.({});
  }
}

function make({ slowAfterMs = 1000, runLimitMs = 1000 } = {}) {
  const workers = [];
  const host = createPythonHost({
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    initMessage: { type: "init" },
    slowAfterMs,
    runLimitMs,
  });
  return { host, workers };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("the defaults: slow after 20 s, a run limit of 10 s, and no load cap", () => {
  assert.equal(SLOW_AFTER_MS, 20000);
  assert.equal(RUN_LIMIT_MS, 10000);
});

test("ready resolves whenReady and a run returns its result", async () => {
  const { host, workers } = make();
  host.start();
  assert.equal(host.state, "loading");
  workers[0].reply({ type: "ready" });
  assert.equal(host.state, "ready");
  assert.equal(await host.whenReady(), true);
  const job = host.run("x = 1", "t");
  assert.deepEqual(workers[0].sent.at(-1), { type: "run", id: 1, code: "x = 1", tests: "t" });
  workers[0].reply({ type: "result", id: 1, result: { tests: [] } });
  assert.deepEqual(await job, { result: { tests: [] } });
});

test("a worker error while loading fails the host and ends the worker", async () => {
  const { host, workers } = make();
  host.start();
  workers[0].fail();
  assert.equal(host.state, "failed");
  assert.equal(workers[0].terminated, true);
  assert.equal(await host.whenReady(), false);
  assert.deepEqual(await host.run("x", "t"), { error: CRASH_MESSAGE });
});

test("a message error fails the host", () => {
  const { host, workers } = make();
  host.start();
  workers[0].messageError();
  assert.equal(host.state, "failed");
  assert.equal(workers[0].terminated, true);
});

test("an init error message fails the host", () => {
  const { host, workers } = make();
  host.start();
  workers[0].reply({ type: "error", message: "wasm instantiate failed" });
  assert.equal(host.state, "failed");
  assert.equal(workers[0].terminated, true);
});

test("a slow load is reported as slow and is not failed", async () => {
  const { host, workers } = make({ slowAfterMs: 20 });
  const seen = [];
  host.subscribe((snap) => seen.push(snap));
  host.start();
  await wait(60);
  assert.equal(host.state, "loading", "time alone never fails a load");
  assert.equal(host.slow, true);
  assert.equal(workers[0].terminated, false, "a slow worker keeps loading");
  workers[0].reply({ type: "ready" });
  assert.equal(host.state, "ready");
  assert.equal(host.slow, false);
  assert.ok(seen.some((snap) => snap.state === "loading" && snap.slow), "subscribers hear the slow flag");
});

test("Try again while loading replaces the worker; the old one is terminated", () => {
  const { host, workers } = make();
  host.start();
  host.restart();
  assert.equal(workers.length, 2);
  assert.equal(workers[0].terminated, true);
  assert.equal(host.state, "loading");
  workers[0].reply({ type: "ready" });
  assert.equal(host.state, "loading", "a message from the replaced worker is ignored");
  workers[1].reply({ type: "ready" });
  assert.equal(host.state, "ready");
});

test("Try again after a failed load starts the load again and can succeed", async () => {
  const { host, workers } = make();
  host.start();
  workers[0].fail();
  assert.equal(host.state, "failed");
  host.restart();
  assert.equal(host.state, "loading");
  assert.equal(workers.length, 2);
  workers[1].reply({ type: "ready" });
  assert.equal(await host.whenReady(), true);
});

test("a run past the run limit resolves timedOut, restarts the worker, and then runs the queue", async () => {
  const { host, workers } = make({ runLimitMs: 20 });
  host.start();
  workers[0].reply({ type: "ready" });
  const first = host.run("while True: pass", "t");
  const second = host.run("x = 2", "t");
  assert.deepEqual(await first, { timedOut: true });
  assert.equal(workers[0].terminated, true);
  assert.equal(workers.length, 2, "a new worker is started");
  assert.equal(host.state, "loading");
  workers[0].reply({ type: "result", id: 1, result: { tests: [] } });
  assert.equal(host.state, "loading", "a message from the terminated worker is ignored");
  workers[1].reply({ type: "ready" });
  assert.deepEqual(workers[1].sent.at(-1), { type: "run", id: 2, code: "x = 2", tests: "t" });
  workers[1].reply({ type: "result", id: 2, result: { tests: [] } });
  assert.deepEqual(await second, { result: { tests: [] } });
});

test("a run on a failed host resolves at once with the crash message until Try again", async () => {
  const { host, workers } = make();
  host.start();
  workers[0].fail();
  assert.deepEqual(await host.run("x", "t"), { error: CRASH_MESSAGE });
  assert.equal(workers.length, 1, "a failed host does not start another worker by itself");
});

test("subscribers hear every state change, and the unsubscribe stops them", () => {
  const { host, workers } = make();
  const seen = [];
  const off = host.subscribe((snap) => seen.push(snap.state));
  host.start();
  workers[0].reply({ type: "ready" });
  off();
  workers[0].fail();
  assert.deepEqual(seen, ["idle", "loading", "ready"]);
});
