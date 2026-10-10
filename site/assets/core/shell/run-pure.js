// Pure helpers for the Run key under a module page's pre[data-run] (backlog B-13): the output as the checker compares it,
// what the key says while a run is in hand, and the line under the output. No DOM here, so the tests run them under node.
// The comparison is tools/check_snippets.py's: line ends and trailing blank lines do not count.

// The still-loading, failed and timeout copy is hx-kata's (components/hx-kata.js); the tests check that it matches.
export const LOADING_COPY = "Loading Python (about 13 MB, the first time only)…";
export const SLOW_COPY = "Still loading Python. A slow connection can take a minute or two.";
export const FAILED_COPY = "Python could not load. Check your connection and try again.";
export const RETRY_COPY = "Try again";
export const TIMEOUT_COPY = "Your code ran for more than 10 seconds and was stopped. Is there a loop without an exit?";
export const RUNNING_COPY = "Running…";
export const NO_OUTPUT_COPY = "No output.";
export const MATCH_COPY = "This matches the expected output.";
export const DIFFER_COPY = "This differs from the expected output.";
export const RAISES_COPY = "This raises the expected error.";
export const NOT_RAISES_COPY = "This does not raise the expected error.";

/** The output as the checker compares it: CR and CRLF read as LF, trailing spaces and blank lines are dropped. */
export function normalizeOutput(text) {
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/\s+$/, ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

/**
 * What the key says under its button. `running` is this key's run; `state` and `slow` are the page's Python host's
 * (lib/py-host.js); `message` is the line a settled run leaves. Null when there is nothing to say.
 */
export function keyStatus({ running, state, slow, message }) {
  if (running) {
    if (state === "failed") return { text: FAILED_COPY, retry: true };
    if (state === "loading") return slow ? { text: SLOW_COPY, retry: true } : { text: LOADING_COPY, retry: false };
    return { text: RUNNING_COPY, retry: false };
  }
  if (message) return { text: message, retry: state === "failed" };
  return null;
}

/** The first line under the output when the snippet raised: the exception's name. Empty when it did not. */
export function raisedLine(error) {
  return error ? `Raised ${error}.` : "";
}

/**
 * Whether the run is what the page expects. With data-raises the expected thing is that error; with data-output it is
 * that output (and no error). Null when the page expects neither.
 */
export function matchLine({ stdout = "", error = "" }, { output = null, raises = null }) {
  if (raises) return error === raises ? RAISES_COPY : NOT_RAISES_COPY;
  if (output === null) return null;
  return !error && normalizeOutput(stdout) === normalizeOutput(output) ? MATCH_COPY : DIFFER_COPY;
}
