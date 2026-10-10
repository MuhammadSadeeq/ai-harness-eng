// Tests for the module progress rules (shell/progress.js): a visit starts a module, evidence counts toward its
// objectives, and a module is done only when every objective has been seen. A done module is never reopened.
import { test } from "node:test";
import assert from "node:assert/strict";
import { noteVisit, noteEvidence, shownCount } from "../shell/progress.js";

const ids = ["B2.o1", "B2.o2", "B2.o3"];

test("a visit moves a todo module to started and records its objectives", () => {
  const doc = { modules: {} };
  noteVisit(doc, "B2", ids);
  assert.deepEqual(doc.modules.B2, { status: "started", objectives: ids, objectives_seen: [] });
});

test("evidence counts toward the objectives it names, without repeats", () => {
  const doc = { modules: {} };
  noteVisit(doc, "B2", ids);
  noteEvidence(doc, { module: "B2", objectives: ["B2.o1"], kind: "check" });
  noteEvidence(doc, { module: "B2", objectives: ["B2.o1", "B2.o2"], kind: "kata" });
  assert.deepEqual(doc.modules.B2.objectives_seen.sort(), ["B2.o1", "B2.o2"]);
  assert.equal(doc.modules.B2.status, "started");
  assert.equal(shownCount(doc, "B2"), 2);
});

test("a module is done when every objective has been seen", () => {
  const doc = { modules: {} };
  noteVisit(doc, "B2", ids);
  noteEvidence(doc, { module: "B2", objectives: ids, kind: "check" });
  assert.equal(doc.modules.B2.status, "done");
  assert.equal(shownCount(doc, "B2"), 3);
});

test("a done module stays done when a later visit happens", () => {
  const doc = { modules: {} };
  noteVisit(doc, "B2", ids);
  noteEvidence(doc, { module: "B2", objectives: ids, kind: "check" });
  noteVisit(doc, "B2", ids);
  assert.equal(doc.modules.B2.status, "done");
});

test("evidence for another module, or without a module, changes nothing", () => {
  const doc = { modules: {} };
  noteVisit(doc, "B2", ids);
  noteEvidence(doc, { module: "A1", objectives: ids, kind: "check" });
  noteEvidence(doc, { module: "", objectives: ids, kind: "check" });
  assert.equal(doc.modules.B2.status, "started");
  assert.equal(doc.modules.A1.status, "started");
});

test("a module with no known objectives cannot become done", () => {
  const doc = { modules: {} };
  noteEvidence(doc, { module: "C1", objectives: ["C1.o1"], kind: "check" });
  assert.equal(doc.modules.C1.status, "started");
});
