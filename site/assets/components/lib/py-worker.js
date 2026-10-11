// The Pyodide worker for hx-kata and hx-step (DECISIONS D-015, D-016, D-056). It loads Pyodide from the base URL it is
// given, then runs one job at a time:
//   run:  writes the learner's kata.py and the tests into /work and runs the stdlib runner hxtest on them;
//   exec: runs one Rein step the way tools/check_steps.py runs it: files in a fresh folder, the setup scripts
//         (their output is not the step's), then rein.py with sys.argv set and its standard input set, stdout
//         captured. Its subprocess.run is the browser stand-in (site/assets/py/hxshell.py), installed first.
// In:  {type: "init", base, hxtest, hxshell}, then {type: "run", id, code, tests}
//      or {type: "exec", id, files, setup, argv, stdin} (stdin: the lines the learner types, in order)
// Out: {type: "ready"} | {type: "error", message} | {type: "result", id, result}
//      | {type: "exec-result", id, result: {stdout, error, refused, files, truncated}} | {type: "run-error", id, message}
let pyodide = null;
let execReady = false;

// The same runner as tools/check_steps.py (RUNNER): keep the two in step.
const RUNNER = `
import contextlib, io, json, os, runpy, sys
import hxshell

FILE_CAP = 200 * 1024

def collect(root):
    files = {}
    total = 0
    truncated = False
    for folder, _dirs, names in os.walk(root):
        for name in sorted(names):
            path = os.path.join(folder, name)
            try:
                with open(path, encoding="utf-8") as handle:
                    text = handle.read()
            except (OSError, UnicodeDecodeError):
                continue
            size = len(text.encode("utf-8"))
            if total + size > FILE_CAP:
                truncated = True
                continue
            total += size
            files[os.path.relpath(path, root)] = text
    return files, truncated

def run_job(job):
    hxshell.install()
    hxshell.clear_refused()
    os.makedirs("/work", exist_ok=True)
    root = "/work/" + job["name"]
    os.makedirs(root, exist_ok=True)
    os.chdir(root)
    for path, text in job["files"].items():
        folder = os.path.dirname(path)
        if folder:
            os.makedirs(folder, exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(text)
    out = io.StringIO()
    error = ""
    saved_stdin = sys.stdin
    try:
        for name in job["setup"]:
            # the setup scripts run in their own process under CPython: their output is not the
            # step's
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    with contextlib.redirect_stderr(io.StringIO()):
                        sys.stdin = io.StringIO("")
                    sys.argv = [name + ".py"]
                    runpy.run_path(name + ".py", run_name="__main__")
            except BaseException as exc:
                refused = hxshell.refused_commands()
                return json.dumps({
                    "stdout": "", "error": type(exc).__name__, "refused": refused,
                    "files": {}, "truncated": False,
                })
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            sys.stdin = io.StringIO(job.get("stdin", ""))
            try:
                sys.argv = ["rein.py"] + job["argv"]
                runpy.run_path("rein.py", run_name="__main__")
            except SystemExit as exc:
                if exc.code not in (None, 0):
                    error = "SystemExit"
            except BaseException as exc:
                error = type(exc).__name__
    finally:
        sys.stdin = saved_stdin
    files, truncated = collect(root)
    refused = hxshell.refused_commands()
    return json.dumps({
        "stdout": out.getvalue(), "error": error, "refused": refused,
        "files": files, "truncated": truncated,
    })
`;

async function init({ base, hxtest, hxshell }) {
  const { loadPyodide } = await import(new URL("pyodide.mjs", base).href);
  pyodide = await loadPyodide({ indexURL: base, stdout: () => {}, stderr: () => {} });
  const response = await fetch(hxtest);
  if (!response.ok) throw new Error(`HTTP ${response.status} for hxtest.py`);
  const shell = await fetch(hxshell);
  if (!shell.ok) throw new Error(`HTTP ${shell.status} for hxshell.py`);
  pyodide.FS.mkdirTree("/hx");
  pyodide.FS.mkdirTree("/work");
  pyodide.FS.writeFile("/hx/hxtest.py", await response.text());
  pyodide.FS.writeFile("/hx/hxshell.py", await shell.text());
  pyodide.runPython("import sys\nsys.path.insert(0, '/hx')");
  self.postMessage({ type: "ready" });
}

// Async: an async def test is awaited on Pyodide's own event loop (hxtest.run_async), so runPythonAsync.
async function run({ id, code, tests }) {
  try {
    pyodide.FS.writeFile("/work/kata.py", code);
    pyodide.FS.writeFile("/work/test_kata.py", tests);
    const text = await pyodide.runPythonAsync(
      "import json, hxtest\njson.dumps(await hxtest.run_async('/work/test_kata.py'))",
    );
    self.postMessage({ type: "result", id, result: JSON.parse(text) });
  } catch (error) {
    self.postMessage({ type: "run-error", id, message: String(error?.message ?? error).slice(0, 300) });
  }
}

function exec({ id, files, setup, argv, stdin }) {
  try {
    if (!execReady) {
      pyodide.runPython(RUNNER);
      execReady = true;
    }
    const input = (stdin ?? []).map((line) => `${line}\n`).join("");
    const job = JSON.stringify({ name: `exec-${id}`, files, setup, argv, stdin: input });
    const text = pyodide.runPython(`run_job(json.loads(${JSON.stringify(job)}))`);
    self.postMessage({ type: "exec-result", id, result: JSON.parse(text) });
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
  } else if (message?.type === "exec") {
    exec(message);
  }
};
