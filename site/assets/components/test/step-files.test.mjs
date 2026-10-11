// lib/step-logic.js stepFiles (BP-4.4): the files a learner downloads for a step. The list comes from the compiled
// step (site/data/steps/<ID>.json): rein.py, the scenario tapes the commands name (scenarios/<name>.json), and the
// shared setup scripts the checkpoint runs (<name>.py, beside rein.py). Every real step is checked here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stepFiles } from "../lib/step-logic.js";

const STEPS = fileURLToPath(new URL("../../../data/steps/", import.meta.url));
const load = (id) => JSON.parse(readFileSync(`${STEPS}${id}.json`, "utf-8"));
const SAFE_PATH = /^(?:scenarios\/)?[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:py|json)$/;

test("H1 downloads rein.py and its one scenario tape, and no setup script", () => {
  const files = stepFiles(load("H1"));
  assert.deepEqual(files.map((f) => f.path), ["rein.py", "scenarios/01_hello.json"]);
});

test("H3 downloads rein.py, both of its tapes, and reset_demo.py beside rein.py", () => {
  const files = stepFiles(load("H3"));
  assert.deepEqual(files.map((f) => f.path), ["rein.py", "scenarios/03_fix.json", "scenarios/03_hostile.json", "reset_demo.py"]);
});

test("each file carries the text of the step, not a copy from another step", () => {
  const step = load("H2");
  const files = stepFiles(step);
  assert.equal(files[0].text, step.rein);
  assert.equal(files[1].text, step.scenarios["scenarios/02_read.json"]);
  assert.equal(files[2].text, step.shared.reset_demo);
});

test("the paths are the relative paths the commands use: no leading slash, no parent folders, no duplicates", () => {
  for (const id of readdirSync(STEPS).filter((name) => name.endsWith(".json")).map((name) => name.replace(/\.json$/, ""))) {
    const paths = stepFiles(load(id)).map((f) => f.path);
    assert.equal(new Set(paths).size, paths.length, `${id} lists a file twice`);
    for (const path of paths) assert.match(path, SAFE_PATH, `${id}: ${path} is not a plain relative path`);
  }
});

test("a setup script the step names but the data does not carry is left out, not downloaded as undefined", () => {
  const step = { rein: "print('x')", scenarios: {}, checkpoint: { setup: ["reset_demo"] }, shared: {} };
  assert.deepEqual(stepFiles(step), [{ path: "rein.py", text: "print('x')" }]);
});

test("a step with no scenarios and no setup downloads rein.py alone", () => {
  assert.deepEqual(stepFiles({ rein: "pass\n", checkpoint: {} }), [{ path: "rein.py", text: "pass\n" }]);
});
