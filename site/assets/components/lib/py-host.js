// The Python host for hx-kata and hx-step (DECISIONS D-015, D-016): one worker per page, runs one at a time,
// and every real error ends in a settled state. States: idle, loading, ready, failed.
//   - Load has no time cap. After slowAfterMs (20 s) the host reports `slow`: the page says it is still loading
//     and offers Try again. A load fails only on a real error: a worker error, a message error, or an init error.
//   - restart() starts the worker again (Try again): a loading or failed load is replaced, and a run waiting for
//     it runs once it is ready.
//   - Run: a run that takes more than runLimitMs (10 s) resolves {timedOut: true}; the worker is terminated and
//     started again, and the queued runs wait for it.
// The worker comes from createWorker(), so Node can test every state with a fake worker (test/py-host.test.mjs).
export const SLOW_AFTER_MS = 20000;
export const RUN_LIMIT_MS = 10000;
export const CRASH_MESSAGE = "Python could not run this code.";

export function createPythonHost({
  createWorker,
  initMessage,
  slowAfterMs = SLOW_AFTER_MS,
  runLimitMs = RUN_LIMIT_MS,
}) {
  const host = {
    state: "idle", slow: false, worker: null, waiters: [], listeners: new Set(),
    queue: [], current: null, seq: 0, slowTimer: 0,
  };

  function snapshot() {
    return { state: host.state, slow: host.slow };
  }

  function notify() {
    for (const listener of host.listeners) listener(snapshot());
  }

  function setState(state) {
    host.state = state;
    notify();
  }

  function clearSlowTimer() {
    clearTimeout(host.slowTimer);
    host.slowTimer = 0;
  }

  function settle(state) {
    clearSlowTimer();
    host.slow = false;
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
    host.slow = false;
    setState("loading");
    worker.onmessage = (event) => onMessage(worker, event.data);
    worker.onerror = (event) => {
      event?.preventDefault?.();
      fail(worker);
    };
    worker.onmessageerror = () => fail(worker);
    clearSlowTimer();
    host.slowTimer = setTimeout(() => {
      if (host.worker === worker && host.state === "loading") {
        host.slow = true;
        notify();
      }
    }, slowAfterMs);
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
    const ok = message.type === "result" || message.type === "exec-result";
    job.resolve(ok ? { result: message.result } : { error: message.message ?? CRASH_MESSAGE });
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
    worker.postMessage({ ...job.message, id: job.id });
  }

  function submit(message) {
    return new Promise((resolve) => {
      if (host.state === "failed") {
        resolve({ error: CRASH_MESSAGE });
        return;
      }
      host.queue.push({ id: ++host.seq, message, resolve, timer: 0 });
      if (host.state === "idle") launch();
      pump();
    });
  }

  return {
    get state() {
      return host.state;
    },
    get slow() {
      return host.slow;
    },
    /** Starts the worker once. A failed host stays failed until restart(). */
    start() {
      if (host.state === "idle") launch();
    },
    /** Try again: replaces the worker, whether the load is still going or has failed. */
    restart() {
      if (host.state === "ready") return;
      const old = host.worker;
      host.worker = null;
      old?.terminate();
      launch();
    },
    /** Resolves true when ready, false when failed. */
    whenReady() {
      if (host.state === "ready") return Promise.resolve(true);
      if (host.state === "failed") return Promise.resolve(false);
      return new Promise((resolve) => host.waiters.push(resolve));
    },
    /** Queues one kata run (kata.py and the tests). Resolves {result} | {error} | {timedOut: true}. */
    run(code, tests) {
      return submit({ type: "run", code, tests });
    },
    /** Queues one step run: the files in a fresh folder, the setup scripts, then rein.py with argv. */
    exec(files, setup, argv) {
      return submit({ type: "exec", files, setup, argv });
    },
    /** Calls back with {state, slow} now and on every change. Returns the unsubscribe. */
    subscribe(listener) {
      host.listeners.add(listener);
      listener(snapshot());
      return () => host.listeners.delete(listener);
    },
  };
}

let shared = null;

/** The one Python of the page, shared by hx-kata and hx-step. Its worker starts on first use. */
export function sharedPython() {
  if (!shared) {
    const workerUrl = new URL("./py-worker.js", import.meta.url).href;
    const pyodideBase = new URL("../../../vendor/pyodide/", import.meta.url).href;
    const hxtestUrl = new URL("../../py/hxtest.py", import.meta.url).href;
    const swUrl = new URL("../../../sw.js", import.meta.url).href;
    let registered = false;
    shared = createPythonHost({
      createWorker: () => {
        if (!registered) {
          registered = true;
          navigator.serviceWorker?.register(swUrl, { scope: "/" })?.catch(() => {});
        }
        return new Worker(workerUrl, { type: "module" });
      },
      initMessage: { type: "init", base: pyodideBase, hxtest: hxtestUrl },
    });
  }
  return shared;
}
