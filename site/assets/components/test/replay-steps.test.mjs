// hx-replay's keyboard steps (BP-6.2 A1): a key or a - or + press says which way it goes, so with a wire filter
// ArrowRight moves to the next event of that wire, and Home and End snap to the first and last event of that wire.
// The real prototype methods run on a stand-in with no DOM: the stand-in has the model, the state and setState.
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { HxReplay, indexByWire } = await import("../hx-replay.js");

// Twelve events on three wires: wire a at 0, 3, 5, 8 and 10; wire b at 1, 4, 7 and 11; wire c at 2, 6 and 9.
const WIRES = ["a", "b", "c", "a", "b", "a", "c", "b", "a", "c", "a", "b"];

function stand(wire, index = 0) {
  const events = WIRES.map((w, i) => ({ wire: w, turn: i }));
  return {
    model: { events, byWire: indexByWire(events) },
    state: { index, wire, finished: false },
    get events() {
      return this.model.events;
    },
    setState(patch) {
      this.state = { ...this.state, ...patch };
    },
    finish() {
      this.state.finished = true;
    },
    snap: HxReplay.prototype.snap,
    go: HxReplay.prototype.go,
    stepTo: HxReplay.prototype.stepTo,
    onScrubKey: HxReplay.prototype.onScrubKey,
  };
}

const press = (replay, key) => {
  replay.onScrubKey({ key, preventDefault() {} });
  return replay.state.index;
};

test("ArrowRight four times on a wire filter moves four events on that wire", () => {
  const replay = stand("a", 0);
  const seen = [0, 1, 2, 3].map(() => press(replay, "ArrowRight"));
  assert.deepEqual(seen, [3, 5, 8, 10], "each press lands on the next event of wire a, not on the event after the playhead");
});

test("ArrowLeft on a wire filter moves to the previous event of that wire", () => {
  const replay = stand("a", 8);
  assert.equal(press(replay, "ArrowLeft"), 5);
  assert.equal(press(replay, "ArrowLeft"), 3);
});

test("with no filter, ArrowRight moves one event at a time", () => {
  const replay = stand(null, 0);
  assert.deepEqual([0, 1, 2, 3].map(() => press(replay, "ArrowRight")), [1, 2, 3, 4]);
});

test("Home and End snap to the first and last event of the filtered wire", () => {
  const first = stand("c", 9);
  assert.equal(press(first, "Home"), 2, "the first event of wire c, which is not event 0");
  const last = stand("c", 2);
  assert.equal(press(last, "End"), 9, "the last event of wire c");
  const plain = stand(null, 5);
  assert.equal(press(plain, "Home"), 0);
  assert.equal(press(plain, "End"), 11);
});

test("the - and + buttons step the way their key does on a filter", () => {
  const replay = stand("b", 1);
  replay.stepTo(replay.state.index + 1);
  assert.equal(replay.state.index, 4, "+ moves to the next event of wire b");
  replay.stepTo(replay.state.index - 1);
  assert.equal(replay.state.index, 1, "- moves back to the previous event of wire b");
});

test("a step past the last event of the wire stays on it, and does not finish the run", () => {
  const replay = stand("a", 10);
  assert.equal(press(replay, "ArrowRight"), 10);
  assert.equal(replay.state.finished, false);
});

test("the wire index lists each wire's events in order", () => {
  const byWire = indexByWire(WIRES.map((wire) => ({ wire })));
  assert.deepEqual(byWire.get("a"), [0, 3, 5, 8, 10]);
  assert.deepEqual(byWire.get("c"), [2, 6, 9]);
});
