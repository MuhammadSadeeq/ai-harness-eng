// Tests for lib/py-host.js with a fake worker: every way a Python load or run can fail ends settled (the
// director's walk-through, Pass B): worker error, message error, init error, the load timeout, and the run
// timeout with a restart. Stale messages from a terminated worker are ignored.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPythonHost, CRASH_MESSAGE, LOAD_LIMIT_MS, RUN_LIMIT_MS } from "../lib/py-host.js";

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

function make({ loadLimitMs = 1000, runLimitMs = 1000 } = {}) {
  const workers = [];
  const host = createPythonHost({
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    initMessage: { type: "init" },
    loadLimitMs,
    runLimitMs,
  });
  return { host, workers };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("the default limits are 45 s to load and 10 s to run", () => {
  assert.equal(LOAD_LIMIT_MS, 45000);
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

test("a message error fails the host", async () => {
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

test("a worker that never becomes ready fails at the load limit", async () => {
  const { host, workers } = make({ loadLimitMs: 20 });
  host.start();
  await wait(60);
  assert.equal(host.state, "failed");
  assert.equal(workers[0].terminated, true);
});

test("becoming ready clears the load limit", async () => {
  const { host, workers } = make({ loadLimitMs: 20 });
  host.start();
  workers[0].reply({ type: "ready" });
  await wait(60);
  assert.equal(host.state, "ready");
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

test("a run after the host has failed resolves at once with the crash message", async () => {
  const { host, workers } = make();
  host.start();
  workers[0].fail();
  assert.deepEqual(await host.run("x", "t"), { error: CRASH_MESSAGE });
  assert.equal(workers.length, 1, "a failed host does not start another worker");
});

test("subscribers hear every state change, and the unsubscribe stops them", () => {
  const { host, workers } = make();
  const seen = [];
  const off = host.subscribe((state) => seen.push(state));
  host.start();
  workers[0].reply({ type: "ready" });
  off();
  workers[0].fail();
  assert.deepEqual(seen, ["idle", "loading", "ready"]);
});
