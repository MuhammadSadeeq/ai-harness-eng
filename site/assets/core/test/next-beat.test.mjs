// The "Next:" line under a module's progress line (shell/module.js nextBeatFor): the first beat not yet reached,
// and null when every beat has been reached.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextBeatFor } from "../shell/module.js";

const beats = [
  { id: "break", label: "1 Break", title: "Break" },
  { id: "see", label: "2 See", title: "How the loop works" },
  { id: "fix", label: "3 Fix", title: "Fix it yourself" },
  { id: "keep", label: "5 Keep", title: "What to keep" },
];

test("before any beat is reached, the first beat is next", () => {
  assert.deepEqual(nextBeatFor(beats, -1), { id: "break", label: "1 Break", title: "Break" });
});

test("the next beat is the one after the furthest beat reached", () => {
  assert.equal(nextBeatFor(beats, 1).id, "fix");
  assert.equal(nextBeatFor(beats, 2).label, "5 Keep");
});

test("when the last beat is reached, nothing is next", () => {
  assert.equal(nextBeatFor(beats, 3), null);
  assert.equal(nextBeatFor([], -1), null);
});
