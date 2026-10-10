// The shared transcript and lane logic (BP-1.4 §2), on real simulator events.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runTrial, parseStrictJson } from "../../sim/index.js";
import { rows, visibleIndexes, repeats, eventGlyph, frac, turnStarts, sortedJson, cardLines, WIRES, axisTurns } from "../lib/transcript.js";

const ROOT = new URL("../../../../", import.meta.url);
const load = (rel) => parseStrictJson(readFileSync(fileURLToPath(new URL(rel, ROOT)), "utf8"));
const tape = load("scenarios/b2-spiral.json");
const board = load("scenarios/boards/b2-old.json");
const facts = JSON.parse(readFileSync(fileURLToPath(new URL("site/data/facts.json", ROOT)), "utf8"));
const { events } = runTrial(tape, board, 1, { facts });

test("the wire table matches course.json (ids, names, glyphs, order)", () => {
  const course = JSON.parse(readFileSync(fileURLToPath(new URL("site/data/course.json", ROOT)), "utf8"));
  const wires = [...course.wires].sort((a, b) => a.n - b.n);
  assert.deepEqual(WIRES.map((w) => w.id), wires.map((w) => w.id));
  for (let i = 0; i < WIRES.length; i += 1) {
    assert.equal(WIRES[i].name, wires[i].name);
    assert.equal(WIRES[i].short, wires[i].short);
    assert.equal(WIRES[i].glyph, wires[i].glyph);
  }
});

test("story detail hides the harness plumbing; full shows every event", () => {
  const full = rows(events, { detail: "full" });
  const story = rows(events, { detail: "story" });
  assert.equal(full.length, events.length);
  const hidden = new Set(["prompt_built", "model_call", "recovery_check", "trace_write"]);
  assert.ok(story.every((r) => !hidden.has(r.event.kind)));
  assert.ok(story.every((r) => !(r.event.kind === "context_check" && r.event.action === "none")));
  assert.ok(story.length < full.length);
});

test("an overflow context_check stays in the story", () => {
  const overflow = [{ kind: "context_check", action: "overflow", turn: 1, wire: "context", seq: 0, t: 0 }];
  assert.equal(rows(overflow).length, 1);
});

test("visibleIndexes filters by one wire, in step order", () => {
  const perms = visibleIndexes(events, { detail: "full", wire: "permissions" });
  assert.ok(perms.length > 0);
  assert.ok(perms.every((i) => events[i].wire === "permissions"));
  assert.deepEqual(perms, [...perms].sort((a, b) => a - b));
});

test("repeats: the turn of the first earlier identical call, else null", () => {
  const seen = repeats(events);
  assert.equal(seen.length, events.length);
  assert.ok(events.every((e, i) => e.kind === "tool_call" || seen[i] === null));
  const repeated = seen.map((t, i) => (t === null ? null : [i, t])).filter(Boolean);
  assert.ok(repeated.length > 0, "the spiral repeats its edit and test calls");
  const [i, firstTurn] = repeated[0];
  assert.ok(firstTurn < events[i].turn);
  assert.equal(events[i].tool, events.find((e, j) => j < i && e.kind === "tool_call" && e.turn === firstTurn)?.tool);
});

test("eventGlyph covers every kind the replay can show", () => {
  const kinds = ["run_start", "run_end", "prompt_built", "context_check", "model_call", "model_reply", "model_error", "retry_wait", "breaker", "recovery_check", "tool_call", "permission", "sandbox", "verify", "guard", "interrupt", "trace_write"];
  for (const kind of kinds) assert.match(eventGlyph({ kind, ok: true, decision: "allow", status: "done", passed: true }), /^g-/, kind);
  assert.equal(eventGlyph({ kind: "tool_call", ok: false }), "g-hexagon-fail");
  assert.equal(eventGlyph({ kind: "verify", passed: false }), "g-shield-fail");
  assert.equal(eventGlyph({ kind: "run_end", status: "error" }), "g-flag");
});

test("frac places index 0 at the left and the last event at the right", () => {
  assert.equal(frac(0, 5), 0);
  assert.equal(frac(4, 5), 1);
  assert.equal(frac(0, 1), 0);
});

test("turnStarts gives the first index of each turn", () => {
  const starts = turnStarts(events);
  assert.equal(starts[0].index, 0);
  assert.ok(starts.every((s, k) => k === 0 || s.turn > starts[k - 1].turn));
});

test("sortedJson sorts keys at every depth, two-space indent", () => {
  assert.equal(sortedJson({ b: 1, a: { d: 2, c: [{ z: 1, y: 2 }] } }), '{\n  "a": {\n    "c": [\n      {\n        "y": 2,\n        "z": 1\n      }\n    ],\n    "d": 2\n  },\n  "b": 1\n}');
});

test("cardLines keeps six lines and reports whether there is more", () => {
  const seven = Array.from({ length: 7 }, (_, i) => `l${i}`).join("\n");
  assert.deepEqual(cardLines(seven), { shown: "l0\nl1\nl2\nl3\nl4\nl5", more: true, total: 7 });
  assert.equal(cardLines("a\nb").more, false);
});

// The turn labels of the lane axis (BP-1.4 notes, item 4): from turn 1 (turn 0 is the run start), thinned.
test("axisTurns labels from turn 1, never turn 0, and thins past eight turns", () => {
  const turnEvents = (turns) => turns.flatMap((turn) => [{ turn, kind: "model_reply" }, { turn, kind: "tool_call" }]);
  const short = axisTurns([{ turn: 0, kind: "run_start" }, ...turnEvents([1, 2, 3])]);
  assert.deepEqual(short.map((t) => t.turn), [1, 2, 3]);
  const long = axisTurns([{ turn: 0, kind: "run_start" }, ...turnEvents(Array.from({ length: 20 }, (_, i) => i + 1))]);
  assert.equal(long[0].turn, 1);
  assert.ok(long.every((t) => t.turn === 1 || t.turn % 3 === 0), "every third turn once there are more than eight");
  assert.ok(long.length <= 9);
});
