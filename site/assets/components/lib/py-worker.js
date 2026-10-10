// The Pyodide worker for hx-kata (DECISIONS D-015, D-016). It loads Pyodide from the base URL it is
// given, writes the learner's code and the tests into /work, runs the stdlib runner hxtest on them
// and posts back the per-test result. Runs are sequential: the main thread queues them.
// In:  {type: "init", base, hxtest}  and  {type: "run", id, code, tests}
// Out: {type: "ready"} | {type: "error", message} | {type: "result", id, result} | {type: "run-error", id, message}
let pyodide = null;

async function init({ base, hxtest }) {
  const { loadPyodide } = await import(new URL("pyodide.mjs", base).href);
  pyodide = await loadPyodide({ indexURL: base, stdout: () => {}, stderr: () => {} });
  const response = await fetch(hxtest);
  if (!response.ok) throw new Error(`HTTP ${response.status} for hxtest.py`);
  pyodide.FS.mkdirTree("/hx");
  pyodide.FS.mkdirTree("/work");
  pyodide.FS.writeFile("/hx/hxtest.py", await response.text());
  pyodide.runPython("import sys\nsys.path.insert(0, '/hx')");
  self.postMessage({ type: "ready" });
}

function run({ id, code, tests }) {
  try {
    pyodide.FS.writeFile("/work/kata.py", code);
    pyodide.FS.writeFile("/work/test_kata.py", tests);
    const text = pyodide.runPython(
      "import json, hxtest\njson.dumps(hxtest.run('/work/test_kata.py'))",
    );
    self.postMessage({ type: "result", id, result: JSON.parse(text) });
  } catch (error) {
    self.postMessage({ type: "run-error", id, message: String(error?.message ?? error).slice(0, 300) });
  }
}

// A failure outside init's own catch (a script error, an unhandled rejection) is also reported as an
// error message, so the page never waits on a worker that has already failed (lib/py-host.js).
self.addEventListener("error", (event) => {
  self.postMessage({ type: "error", message: String(event.message || "worker error").slice(0, 300) });
});
self.addEventListener("unhandledrejection", (event) => {
  self.postMessage({ type: "error", message: String(event.reason?.message ?? event.reason).slice(0, 300) });
});

self.onmessage = (event) => {
  const message = event.data;
  if (message?.type === "init") {
    init(message).catch((error) => {
      self.postMessage({ type: "error", message: String(error?.message ?? error).slice(0, 300) });
    });
  } else if (message?.type === "run") {
    run(message);
  }
};
