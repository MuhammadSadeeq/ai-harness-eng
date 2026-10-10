// The Python host for hx-kata (DECISIONS D-015, D-016): one worker per page, runs one at a time, and every
// way a load or a run can go wrong ends in a settled state. States: idle, loading, ready, failed.
//   - Load: the worker must report ready within loadLimitMs (45 s), or it fails. A worker error, a message
//     error, or an init error message also fails it. A failed host stays failed (reload to retry).
//   - Run: a run that takes more than runLimitMs (10 s) resolves {timedOut: true}; the worker is terminated
//     and started again, and queued runs wait for it.
// The worker comes from createWorker(), so Node can test every state with a fake worker (test/py-host.test.mjs).
export const LOAD_LIMIT_MS = 45000;
export const RUN_LIMIT_MS = 10000;
export const CRASH_MESSAGE = "Python could not run this code.";

export function createPythonHost({
  createWorker,
  initMessage,
  loadLimitMs = LOAD_LIMIT_MS,
  runLimitMs = RUN_LIMIT_MS,
}) {
  const host = { state: "idle", worker: null, waiters: [], listeners: new Set(), queue: [], current: null, seq: 0, loadTimer: 0 };

  function setState(state) {
    host.state = state;
    for (const listener of host.listeners) listener(state);
  }

  function settle(state) {
    clearTimeout(host.loadTimer);
    host.loadTimer = 0;
    setState(state);
    const waiters = host.waiters;
    host.waiters = [];
    for (const wake of waiters) wake(state === "ready");
    if (state === "ready") {
      pump();
      return;
    }
    if (host.current) {
      clearTimeout(host.current.timer);
      host.current.resolve({ error: CRASH_MESSAGE });
      host.current = null;
    }
    for (const job of host.queue.splice(0)) job.resolve({ error: CRASH_MESSAGE });
  }

  /** Ends a worker that failed, then fails the host. Messages from an ended worker are ignored. */
  function fail(worker) {
    if (host.worker !== worker) return;
    host.worker = null;
    worker.terminate();
    settle("failed");
  }

  function launch() {
    const worker = createWorker();
    host.worker = worker;
    setState("loading");
    worker.onmessage = (event) => onMessage(worker, event.data);
    worker.onerror = (event) => {
      event?.preventDefault?.();
      fail(worker);
    };
    worker.onmessageerror = () => fail(worker);
    host.loadTimer = setTimeout(() => {
      if (host.worker === worker && host.state === "loading") fail(worker);
    }, loadLimitMs);
    worker.postMessage(initMessage);
  }

  function onMessage(worker, message) {
    if (worker !== host.worker) return;
    if (message?.type === "ready") {
      settle("ready");
      return;
    }
    if (message?.type === "error") {
      fail(worker);
      return;
    }
    const job = host.current;
    if (!job || job.id !== message?.id) return;
    clearTimeout(job.timer);
    host.current = null;
    job.resolve(message.type === "result" ? { result: message.result } : { error: message.message ?? CRASH_MESSAGE });
    pump();
  }

  function pump() {
    if (host.current || host.state !== "ready" || host.queue.length === 0) return;
    const job = host.queue.shift();
    host.current = job;
    const worker = host.worker;
    job.timer = setTimeout(() => {
      if (host.current !== job) return;
      host.current = null;
      job.resolve({ timedOut: true });
      host.worker = null;
      worker.terminate();
      launch();
    }, runLimitMs);
    worker.postMessage({ type: "run", id: job.id, code: job.code, tests: job.tests });
  }

  return {
    get state() {
      return host.state;
    },
    /** Starts the worker once. Later calls do nothing: a failed host stays failed. */
    start() {
      if (host.state === "idle") launch();
    },
    /** Resolves true when ready, false when failed. */
    whenReady() {
      if (host.state === "ready") return Promise.resolve(true);
      if (host.state === "failed") return Promise.resolve(false);
      return new Promise((resolve) => host.waiters.push(resolve));
    },
    /** Queues one run. Resolves {result} | {error} | {timedOut: true}. */
    run(code, tests) {
      return new Promise((resolve) => {
        if (host.state === "failed") {
          resolve({ error: CRASH_MESSAGE });
          return;
        }
        host.queue.push({ id: ++host.seq, code, tests, resolve, timer: 0 });
        if (host.state === "idle") launch();
        pump();
      });
    },
    /** Calls back with the state now and on every change. Returns the unsubscribe. */
    subscribe(listener) {
      host.listeners.add(listener);
      listener(host.state);
      return () => host.listeners.delete(listener);
    },
  };
}
