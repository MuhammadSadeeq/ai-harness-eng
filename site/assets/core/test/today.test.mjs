// Tests for the learner's calendar date (shell/chrome.js todayIso): near midnight it follows the learner's local
// date, not UTC. The zone is injected as an offset, so the result never depends on the machine's time zone. The
// export filename keeps the UTC date (store.js exportFilename), and the test pins that too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { todayIso } from "../shell/chrome.js";
import { dueCards } from "../shell/pure.js";
import { exportFilename } from "../store.js";

test("Tokyo (UTC+9): 16:30 UTC is already the next local day", () => {
  assert.equal(todayIso(new Date("2026-10-10T16:30:00Z"), 540), "2026-10-11");
});

test("New York (UTC-5): 03:30 UTC is still the previous local day", () => {
  assert.equal(todayIso(new Date("2026-10-11T03:30:00Z"), -300), "2026-10-10");
});

test("the local day turns exactly at local midnight", () => {
  assert.equal(todayIso(new Date("2026-10-10T14:59:59.999Z"), 540), "2026-10-10");
  assert.equal(todayIso(new Date("2026-10-10T15:00:00Z"), 540), "2026-10-11");
});

test("by default the date is the machine's local calendar date", () => {
  const now = new Date(2026, 9, 10, 23, 59);
  assert.equal(todayIso(now), "2026-10-10");
  assert.equal(todayIso(new Date(2026, 0, 1, 0, 1)), "2026-01-01");
});

test("a card due today in the learner's zone is due, though UTC is still yesterday", () => {
  const now = new Date("2026-10-10T16:30:00Z");
  const doc = { cards: { "a3-c1": { due: "2026-10-11" }, "a3-c2": { due: "2026-10-12" } } };
  assert.equal(dueCards(doc, todayIso(now, 540)), 1);
  assert.equal(dueCards(doc, now.toISOString().slice(0, 10)), 0, "the UTC date would count nothing");
});

test("the export filename keeps the UTC date", () => {
  assert.equal(exportFilename(new Date("2026-10-10T23:30:00Z")), "harnessed-progress-2026-10-10.json");
});
