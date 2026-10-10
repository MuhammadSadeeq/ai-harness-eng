// Store tests: defaults, update and subscribe, export and import round trip, bad JSON, wrong schema,
// migration from a fake schema 0, reset that keeps preferences, and unavailable storage.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createStore, defaults, migrateDoc, validateDoc, exportFilename, MIGRATIONS, SCHEMA, KEY,
  UNAVAILABLE_NOTICE, NEWER_NOTICE, UNREADABLE_NOTICE,
} from "../store.js";

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
  };
}

const throwing = {
  getItem() { throw new Error("blocked"); },
  setItem() { throw new Error("blocked"); },
};

test("defaults: schema 1, auto theme, unset motion, sound off, empty collections", () => {
  const d = defaults();
  assert.equal(d.schema, SCHEMA);
  assert.deepEqual(d.prefs, { theme: "auto", motion: null, sound: false });
  assert.deepEqual([d.modules, d.beats, d.cards, d.evidence, d.predictions], [{}, {}, {}, [], []]);
  assert.equal(validateDoc(d), null);
});

test("a new store loads defaults when nothing is stored", () => {
  const storage = fakeStorage();
  const store = createStore({ storage });
  assert.deepEqual(store.load(), defaults());
  assert.equal(store.persistent, true);
});

test("update applies, saves and notifies subscribers", () => {
  const storage = fakeStorage();
  const store = createStore({ storage });
  store.load();
  const seen = [];
  const off = store.subscribe((doc, reason) => seen.push([doc.prefs.theme, reason]));
  store.update((draft) => { draft.prefs.theme = "night"; });
  assert.equal(store.state.prefs.theme, "night");
  assert.deepEqual(seen, [["night", "update"]]);
  assert.equal(JSON.parse(storage.data.get(KEY)).prefs.theme, "night");
  off();
  store.update((draft) => { draft.prefs.sound = true; });
  assert.equal(seen.length, 1, "unsubscribed listeners are not called");
});

test("update rejects a change that breaks the shape and keeps the old document", () => {
  const store = createStore({ storage: fakeStorage() });
  store.load();
  assert.throws(() => store.update((draft) => { draft.prefs.theme = "pink"; }), /not day, night or auto/);
  assert.equal(store.state.prefs.theme, "auto");
});

test("export then import round trips the whole document", () => {
  const a = createStore({ storage: fakeStorage() });
  a.load();
  a.update((draft) => {
    draft.prefs = { theme: "day", motion: "reduced", sound: true };
    draft.modules.B2 = { status: "started" };
    draft.cards.x = { box: 2, due: "2026-10-12" };
    draft.evidence.push({ kind: "bench", at: "2026-10-10" });
  });
  const text = a.exportJSON();
  const b = createStore({ storage: fakeStorage() });
  b.load();
  const result = b.importJSON(text);
  assert.equal(result.ok, true);
  assert.deepEqual(b.state, a.state);
});

test("bad JSON is rejected with a clear message and changes nothing", () => {
  const store = createStore({ storage: fakeStorage() });
  store.load();
  const before = JSON.stringify(store.state);
  const result = store.importJSON("{not json");
  assert.equal(result.ok, false);
  assert.match(result.error, /not valid JSON, so nothing was changed/);
  assert.equal(JSON.stringify(store.state), before);
});

test("a wrong schema number is rejected and changes nothing", () => {
  const store = createStore({ storage: fakeStorage() });
  store.load();
  const before = JSON.stringify(store.state);
  const future = { ...defaults(), schema: 7 };
  const result = store.importJSON(JSON.stringify(future));
  assert.equal(result.ok, false);
  assert.match(result.error, /schema 7; this site reads schema 1/);
  assert.equal(JSON.stringify(store.state), before);
  assert.equal(store.importJSON(JSON.stringify({ prefs: {} })).ok, false, "no schema number at all");
});

test("migration from a fake schema 0 document", () => {
  const schema0 = { schema: 0, theme: "night", motion: "reduced", sound: true, modules: { B1: { status: "done" } } };
  const result = migrateDoc(schema0);
  assert.equal(result.error, undefined);
  assert.equal(result.doc.schema, 1);
  assert.deepEqual(result.doc.prefs, { theme: "night", motion: "reduced", sound: true });
  assert.deepEqual(result.doc.modules, { B1: { status: "done" } });
  assert.equal(validateDoc(result.doc), null);
  // importing a schema 0 file runs the same migration
  const store = createStore({ storage: fakeStorage() });
  store.load();
  assert.equal(store.importJSON(JSON.stringify(schema0)).ok, true);
  assert.equal(store.state.prefs.theme, "night");
  assert.ok(MIGRATIONS[0], "the MIGRATIONS table has the schema 0 entry");
});

test("a stored schema 0 document loads through the migration", () => {
  const storage = fakeStorage({ [KEY]: JSON.stringify({ schema: 0, theme: "day", motion: null, sound: false }) });
  const store = createStore({ storage });
  assert.equal(store.load().prefs.theme, "day");
  assert.equal(store.blocked, false);
});

test("legacy v1 shell values are read as schema 1 values", () => {
  const storage = fakeStorage({ [KEY]: JSON.stringify({ schema: 1, prefs: { theme: "dark", motion: "reduced" } }) });
  const store = createStore({ storage });
  const doc = store.load();
  assert.deepEqual(doc.prefs, { theme: "night", motion: "reduced", sound: false });
});

test("reset keeps preferences by default and clears progress", () => {
  const store = createStore({ storage: fakeStorage() });
  store.load();
  store.update((draft) => {
    draft.prefs.theme = "night";
    draft.modules.A1 = { status: "done" };
    draft.cards.q = { box: 1 };
  });
  const after = store.reset();
  assert.equal(after.prefs.theme, "night");
  assert.deepEqual(after.modules, {});
  assert.deepEqual(after.cards, {});
  const full = store.reset({ keepPrefs: false });
  assert.deepEqual(full.prefs, { theme: "auto", motion: null, sound: false });
});

test("unavailable storage: the course works in memory and says once that progress is not saved", () => {
  const notices = [];
  const store = createStore({ storage: throwing, onNotice: (m) => notices.push(m) });
  assert.deepEqual(store.load(), defaults());
  assert.equal(store.persistent, false);
  store.update((draft) => { draft.prefs.theme = "day"; });
  store.update((draft) => { draft.prefs.theme = "night"; });
  store.reset();
  assert.equal(store.state.prefs.theme, "night", "reset keeps the learner's theme");
  assert.deepEqual(notices, [UNAVAILABLE_NOTICE], "the notice is said once");
});

test("storage that is missing entirely is the same case", () => {
  const notices = [];
  const store = createStore({ storage: null, onNotice: (m) => notices.push(m) });
  store.load();
  store.update((draft) => { draft.prefs.theme = "day"; });
  assert.equal(store.persistent, false);
  assert.equal(notices.length, 1);
});

test("unreadable stored data is left in storage and blocks saves until reset or import", () => {
  const notices = [];
  const storage = fakeStorage({ [KEY]: "{broken" });
  const store = createStore({ storage, onNotice: (m) => notices.push(m) });
  store.load();
  assert.equal(store.blocked, true);
  assert.deepEqual(notices, [UNREADABLE_NOTICE]);
  store.update((draft) => { draft.prefs.theme = "day"; });
  assert.equal(storage.data.get(KEY), "{broken", "the unreadable data is not overwritten");
  store.reset();
  assert.equal(store.blocked, false);
  assert.notEqual(storage.data.get(KEY), "{broken");
});

test("a stored document from a newer schema is not overwritten", () => {
  const notices = [];
  const stored = JSON.stringify({ schema: 9, prefs: {} });
  const storage = fakeStorage({ [KEY]: stored });
  const store = createStore({ storage, onNotice: (m) => notices.push(m) });
  store.load();
  store.update((draft) => { draft.prefs.sound = true; });
  assert.equal(storage.data.get(KEY), stored);
  assert.deepEqual(notices, [NEWER_NOTICE]);
});

test("the export file name carries the UTC date", () => {
  assert.equal(exportFilename(new Date("2026-10-10T23:30:00Z")), "harnessed-progress-2026-10-10.json");
});

test("downloadExport returns the file name even with no document to download into", () => {
  const store = createStore({ storage: fakeStorage(), now: () => new Date("2026-10-10T08:00:00Z") });
  store.load();
  assert.equal(store.downloadExport({}), "harnessed-progress-2026-10-10.json");
});
