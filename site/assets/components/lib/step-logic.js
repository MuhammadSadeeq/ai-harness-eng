// Pure logic for hx-step (BP-2.3): the diff rows, the copy text of a chunk, the match with the expected output,
// and the first line that differs. No DOM, so Node tests run it (test/step.test.mjs).

/** The lines a chunk adds, across its hunks, in order: what "Copy new lines" copies. */
export function addedLines(chunk) {
  const out = [];
  for (const hunk of chunk.hunks) {
    for (const row of hunk.diff.split("\n")) {
      if (row.startsWith("+")) out.push(row.slice(1));
    }
  }
  return out;
}

/** One row per diff line: the mark (+, −, or blank for context) and the line text. */
export function diffRows(diff) {
  const rows = [];
  for (const raw of diff.split("\n")) {
    if (raw === "") continue;
    const sign = raw[0];
    const mark = sign === "+" ? "+" : sign === "-" ? "−" : "";
    const kind = sign === "+" ? "add" : sign === "-" ? "del" : "ctx";
    rows.push({ kind, mark, text: raw.slice(1) });
  }
  return rows;
}

/** The error name of an expected output written as "error: Name", or null. */
export function expectedError(expected) {
  if (expected.startsWith("error: ") && !expected.trim().includes("\n")) return expected.slice("error: ".length).trim();
  return null;
}

/** Whether an outcome {stdout, error} is the expected output (the same rule as tools/check_steps.py). */
export function matches(outcome, expected) {
  const name = expectedError(expected);
  if (name !== null) return outcome.stdout === "" && outcome.error === name;
  return outcome.stdout === expected && outcome.error === "";
}

/** The first line where the two texts differ, or null when they are the same. */
export function firstDifference(got, expected) {
  const a = got.split("\n");
  const b = expected.split("\n");
  const count = Math.max(a.length, b.length);
  for (let index = 0; index < count; index += 1) {
    const x = index < a.length ? a[index] : null;
    const y = index < b.length ? b[index] : null;
    if (x !== y) return { line: index + 1, got: x, expected: y };
  }
  return null;
}

/** The JSON of a scenario, pretty-printed with two spaces. */
export function prettyScript(text) {
  return JSON.stringify(JSON.parse(text), null, 2) + "\n";
}

/** The command a learner types for a run with these arguments: python rein.py, arguments in double quotes when needed. */
export function commandOf(argv) {
  return ["python", "rein.py", ...argv.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg))].join(" ");
}

/** The answers a run types, shown beside it as "answers: n", or "" when the run types nothing. */
export function answersText(lines) {
  return lines && lines.length ? `answers: ${lines.join(", ")}` : "";
}

/** True when a step's files call subprocess: its runs go through the browser stand-in (BP-4.0 §3). */
export function usesSubprocess(texts) {
  return texts.some((text) => text.includes("subprocess"));
}

/**
 * The files a learner downloads for a step (BP-4.4): rein.py, the step's scenario tapes (scenarios/<name>.json, as the
 * commands name them) and the shared setup scripts its checkpoint runs (<name>.py, beside rein.py). Each entry is
 * {path, text}: path is the relative path the commands use, text is the file. A setup script the step names but the
 * data does not carry is left out (it is a data error the checker reports, not a download to make).
 */
export function stepFiles(step) {
  const files = [{ path: "rein.py", text: step.rein }];
  for (const path of Object.keys(step.scenarios ?? {})) files.push({ path, text: step.scenarios[path] });
  for (const name of step.checkpoint?.setup ?? []) {
    const text = step.shared?.[name];
    if (typeof text === "string") files.push({ path: `${name}.py`, text });
  }
  return files;
}
