// The Run key under each pre[data-run] of a module page (backlog B-13). The shell adds it, so the page's markup and its
// no-JS view do not change. The code stays read-only. A run goes to the page's one Python (lib/py-host.js, the host that
// hx-kata and hx-step use). That loads on the first Run, and the snippet's stdout shows under the key. With data-output
// the key says whether the output matches; with data-raises it says whether the snippet raised that error. Nothing is
// credited. mountModule (core/shell/module.js) imports this only on a page with a pre[data-run].
import { sharedPython } from "../../components/lib/py-host.js";
import {
  FAILED_COPY, NO_OUTPUT_COPY, RETRY_COPY, TIMEOUT_COPY, keyStatus, matchLine, normalizeOutput, raisedLine,
} from "./run-pure.js";

let serial = 0;

/** Adds the key after every pre[data-run] under doc. `python` is injectable for tests. */
export function mountRunKeys(doc = document, python = sharedPython()) {
  for (const pre of doc.querySelectorAll("pre[data-run]")) {
    // data-run="machine": checked by check_snippets on CPython, but it starts a child process, which
    // the page's Python cannot do, so it gets no key (the block says it runs on your machine).
    if (pre.dataset.run === "machine") continue;
    if (pre.nextElementSibling?.classList.contains("run-key")) continue;
    mountKey(doc, pre, python);
  }
}

function mountKey(doc, pre, python) {
  const id = `run-${++serial}`;
  const code = (pre.querySelector("code") ?? pre).textContent;
  // The page's expectation: the pre[data-output] right after the snippet (read before the key is inserted), or data-raises.
  const next = pre.nextElementSibling;
  const expected = {
    output: next?.matches("pre[data-output]") ? next.textContent : null,
    raises: pre.dataset.raises || null,
  };

  const key = doc.createElement("div");
  key.className = "run-key";
  const button = doc.createElement("button");
  button.type = "button";
  button.textContent = "Run";
  button.setAttribute("aria-controls", `${id}-output`);
  const status = doc.createElement("p");
  status.className = "run-status";
  status.setAttribute("role", "status");
  const retry = doc.createElement("button");
  retry.type = "button";
  retry.textContent = RETRY_COPY;
  key.append(button, status, retry);

  const output = doc.createElement("pre");
  output.className = "run-output";
  output.id = `${id}-output`;
  output.tabIndex = 0;
  output.setAttribute("role", "region");
  output.setAttribute("aria-label", "Output of the snippet");
  output.hidden = true;
  const match = doc.createElement("p");
  match.className = "run-match";
  match.setAttribute("role", "status");
  match.hidden = true;
  pre.after(key, output, match);

  let running = false;
  let message = null;
  const paint = () => {
    const shown = keyStatus({ running, state: python.state, slow: python.slow, message });
    status.hidden = !shown;
    status.textContent = shown ? shown.text : "";
    retry.hidden = !(shown && shown.retry);
    button.disabled = running;
  };
  // subscribe() calls back now, so the key starts blank. Nothing here starts the Python worker.
  python.subscribe(paint);

  // The run: the snippet goes to the worker's exec job as rein.py in a fresh folder (no setup, no argv).
  const runSnippet = async () => {
    running = true;
    message = null;
    output.hidden = true;
    match.hidden = true;
    paint();
    const outcome = await python.exec({ "rein.py": code }, [], []);
    running = false;
    if (outcome.timedOut) {
      message = TIMEOUT_COPY;
    } else if (outcome.error) {
      message = python.state === "failed" ? FAILED_COPY : outcome.error;
    } else {
      showResult(outcome.result ?? {}, expected, output, match);
    }
    paint();
  };
  button.addEventListener("click", runSnippet);
  // Try again: restart Python. A run already waiting goes on once it is ready; a run that failed starts again.
  retry.addEventListener("click", () => {
    python.restart();
    if (!running) runSnippet();
  });
}

function showResult(result, expected, output, match) {
  const stdout = result.stdout ?? "";
  const error = result.error ?? "";
  const shown = normalizeOutput(stdout);
  output.textContent = shown === "" ? NO_OUTPUT_COPY : shown;
  output.hidden = false;
  const text = [raisedLine(error), matchLine({ stdout, error }, expected) ?? ""].filter(Boolean).join(" ");
  match.textContent = text;
  match.hidden = text === "";
}
