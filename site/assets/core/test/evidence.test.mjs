// Tests for the hx-evidence listener (shell/evidence.js): entries are stamped and stored, predictions are also
// kept in their own list, lists keep only the newest CAP entries, and bad events and refused writes are ignored.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../store.js";
import { CAP, EVIDENCE_EVENT, appendCapped, mountEvidence, recordEvidence } from "../shell/evidence.js";

function fakeStorage() {
  const data = new Map();
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

function newStore() {
  const store = createStore({ storage: fakeStorage() });
  store.load();
  return store;
}

const FIXED = () => new Date("2026-10-10T12:00:00.000Z");

function fire(target, detail) {
  target.dispatchEvent(new CustomEvent(EVIDENCE_EVENT, { detail, bubbles: true }));
}

test("an hx-evidence event is stored with its timestamp", () => {
  const store = newStore();
  const target = new EventTarget();
  const stop = mountEvidence(store, target, FIXED);
  fire(target, { module: "S0", objectives: ["o1"], kind: "kata", detail: { ok: true } });
  assert.deepEqual(store.state.evidence, [
    { module: "S0", objectives: ["o1"], kind: "kata", detail: { ok: true }, at: "2026-10-10T12:00:00.000Z" },
  ]);
  assert.deepEqual(store.state.predictions, []);
  stop();
});

test("a prediction is kept in the predictions list as well", () => {
  const store = newStore();
  const target = new EventTarget();
  const stop = mountEvidence(store, target, FIXED);
  fire(target, { module: "A3", objectives: [], kind: "prediction", detail: { choice: "b" } });
  assert.equal(store.state.evidence.length, 1);
  assert.equal(store.state.predictions.length, 1);
  assert.equal(store.state.predictions[0].kind, "prediction");
  assert.equal(store.state.predictions[0].at, "2026-10-10T12:00:00.000Z");
  stop();
});

test("bad events are ignored", () => {
  const store = newStore();
  const target = new EventTarget();
  const stop = mountEvidence(store, target, FIXED);
  fire(target, null);
  fire(target, "not an object");
  fire(target, { module: "S0" });
  assert.deepEqual(store.state.evidence, []);
  stop();
});

test("the returned function stops the listener", () => {
  const store = newStore();
  const target = new EventTarget();
  const stop = mountEvidence(store, target, FIXED);
  stop();
  fire(target, { module: "S0", objectives: [], kind: "card", detail: {} });
  assert.deepEqual(store.state.evidence, []);
});

test("each list keeps only the newest CAP entries", () => {
  assert.equal(CAP, 2000);
  const list = Array.from({ length: CAP + 1 }, (_, i) => i);
  const capped = appendCapped(list.slice(0, CAP), CAP);
  assert.equal(capped.length, CAP);
  assert.equal(capped[0], 1);
  assert.equal(appendCapped([1, 2], 3, 5).length, 3);
});

test("the store lists hold no more than CAP entries", () => {
  const store = newStore();
  for (let i = 0; i < CAP + 5; i += 1) {
    assert.equal(recordEvidence(store, { module: "A1", objectives: [], kind: "prediction", detail: { i } }, FIXED()), true);
  }
  assert.equal(store.state.evidence.length, CAP);
  assert.equal(store.state.predictions.length, CAP);
  assert.equal(store.state.predictions[0].detail.i, 5);
  assert.equal(store.state.predictions.at(-1).detail.i, CAP + 4);
});

test("a refused write returns false and does not throw", () => {
  const refusing = { state: { evidence: [], predictions: [] }, update: () => { throw new Error("refused"); } };
  assert.equal(recordEvidence(refusing, { kind: "card" }, FIXED()), false);
  assert.deepEqual(refusing.state.evidence, []);
});
