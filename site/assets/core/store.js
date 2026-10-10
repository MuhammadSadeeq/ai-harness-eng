// The progress store (D-027). One JSON document under one key, with a schema number, a MIGRATIONS table,
// export and import of a file, reset that keeps preferences, and guarded storage: with storage unavailable
// the course still works in memory and says once that progress will not be saved.
// This module never touches the DOM at import time, so the tests run it under node.

export const KEY = "harnessed:v1";
export const SCHEMA = 1;
export const THEMES = ["day", "night", "auto"];
export const MOTIONS = ["reduced", "full", null];
export const UNAVAILABLE_NOTICE =
  "This browser is not saving progress, so it will be lost when you leave the page. Export a copy to keep it.";
export const UNREADABLE_NOTICE =
  "Saved progress could not be read, so new progress is not saved here. Export or reset to continue.";
export const NEWER_NOTICE =
  "Saved progress was written by a newer version of this site, so new progress is not saved here. Export or reset to continue.";

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function defaults() {
  return {
    schema: SCHEMA,
    prefs: { theme: "auto", motion: null, sound: false },
    modules: {},
    beats: {},
    cards: {},
    evidence: [],
    predictions: [],
  };
}

// Each entry turns a document of schema N into schema N+1. Add a new entry when SCHEMA changes.
export const MIGRATIONS = {
  // Schema 0 kept two flat settings at the top level. Schema 1 nests them under prefs.
  0: (doc) => ({
    ...defaults(),
    prefs: {
      theme: THEMES.includes(doc.theme) ? doc.theme : "auto",
      motion: MOTIONS.includes(doc.motion) ? doc.motion : null,
      sound: doc.sound === true,
    },
    modules: isObj(doc.modules) ? doc.modules : {},
  }),
};

/** Returns null when the document is valid for the current schema, else a plain message. */
export function validateDoc(doc) {
  if (!isObj(doc)) return "The file does not hold a progress object.";
  if (doc.schema !== SCHEMA) return `The file has schema ${String(doc.schema)}; this site reads schema ${SCHEMA}.`;
  if (!isObj(doc.prefs)) return "The file has no preferences object.";
  if (!THEMES.includes(doc.prefs.theme)) return "The theme in the file is not day, night or auto.";
  if (!MOTIONS.includes(doc.prefs.motion)) return "The motion setting in the file is not reduced, full or unset.";
  if (typeof doc.prefs.sound !== "boolean") return "The sound setting in the file is not true or false.";
  for (const key of ["modules", "beats", "cards"]) if (!isObj(doc[key])) return `The file's ${key} is not an object.`;
  for (const key of ["evidence", "predictions"]) if (!Array.isArray(doc[key])) return `The file's ${key} is not a list.`;
  return null;
}

/** Brings a parsed document up to SCHEMA through MIGRATIONS. Returns {doc} or {error}. */
export function migrateDoc(doc) {
  if (!isObj(doc) || !Number.isInteger(doc.schema) || doc.schema < 0) {
    return { error: "The file has no valid schema number." };
  }
  if (doc.schema > SCHEMA) return { error: `The file has schema ${doc.schema}; this site reads schema ${SCHEMA}.` };
  let current = doc;
  while (current.schema < SCHEMA) {
    const step = MIGRATIONS[current.schema];
    if (!step) return { error: `No migration from schema ${current.schema}.` };
    current = step(current);
  }
  const problem = validateDoc(current);
  return problem ? { error: problem } : { doc: current };
}

/** Legacy values from the v1 shell (theme light/dark, motion full/reduced/auto) map onto the schema 1 values. */
function normalizeLoaded(doc) {
  const prefs = { ...defaults().prefs, ...doc.prefs };
  if (prefs.theme === "light") prefs.theme = "day";
  if (prefs.theme === "dark") prefs.theme = "night";
  if (!THEMES.includes(prefs.theme)) prefs.theme = "auto";
  if (prefs.motion === "auto" || !MOTIONS.includes(prefs.motion)) prefs.motion = null;
  if (typeof prefs.sound !== "boolean") prefs.sound = false;
  return { ...defaults(), ...doc, prefs };
}

/** The file name for an export: harnessed-progress-YYYY-MM-DD.json (UTC date). */
export function exportFilename(date) {
  return `harnessed-progress-${date.toISOString().slice(0, 10)}.json`;
}

/** Storage that may be missing, blocked or throwing. Returns null when it cannot be used at all. */
export function browserStorage(scope = globalThis) {
  try {
    const storage = scope.localStorage;
    if (!storage) return null;
    storage.getItem(KEY);
    return storage;
  } catch {
    return null;
  }
}

export function createStore({ storage = null, key = KEY, now = () => new Date(), onNotice = () => {} } = {}) {
  let doc = defaults();
  let persistent = Boolean(storage);
  let blocked = false;
  let blockReason = null;
  let noticed = false;
  const listeners = new Set();

  function notice(message) {
    if (noticed) return;
    noticed = true;
    onNotice(message);
  }

  function markUnavailable() {
    persistent = false;
    notice(UNAVAILABLE_NOTICE);
  }

  function readRaw() {
    if (!storage) {
      markUnavailable();
      return { available: false, value: null };
    }
    try {
      return { available: true, value: storage.getItem(key) };
    } catch {
      markUnavailable();
      return { available: false, value: null };
    }
  }

  function writeRaw(text) {
    if (blocked) return false;
    if (!storage) {
      markUnavailable();
      return false;
    }
    try {
      storage.setItem(key, text);
      return true;
    } catch {
      markUnavailable();
      return false;
    }
  }

  function emit(reason) {
    for (const fn of listeners) fn(doc, reason);
  }

  /**
   * Loads the stored document. Data this version cannot read (corrupt, or from a newer schema) is left
   * in storage untouched: the store blocks saves and says why, until the learner resets or imports.
   */
  function block(reason, message) {
    blocked = true;
    blockReason = reason;
    notice(message);
    return doc;
  }

  function load() {
    const raw = readRaw();
    doc = defaults();
    blocked = false;
    blockReason = null;
    if (!raw.available || raw.value === null) return doc;
    let parsed;
    try {
      parsed = JSON.parse(raw.value);
    } catch {
      return block("unreadable", UNREADABLE_NOTICE);
    }
    if (isObj(parsed) && Number.isInteger(parsed.schema) && parsed.schema > SCHEMA) {
      return block("newer", NEWER_NOTICE);
    }
    const result = migrateDoc(isObj(parsed) && parsed.schema === 1 ? normalizeLoaded(parsed) : parsed);
    if (result.error) return block("unreadable", UNREADABLE_NOTICE);
    doc = result.doc;
    return doc;
  }

  function save() {
    return writeRaw(JSON.stringify(doc));
  }

  return {
    load,
    save,
    get persistent() {
      return persistent;
    },
    get state() {
      return doc;
    },
    get blocked() {
      return blocked;
    },
    /** "unreadable" | "newer" | null: why saves are blocked. */
    get blockReason() {
      return blockReason;
    },
    /** Applies fn to a copy of the document (returning the new document, or mutating the copy). */
    update(fn) {
      const draft = structuredClone(doc);
      const next = fn(draft) ?? draft;
      const problem = validateDoc(next);
      if (problem) throw new Error(problem);
      doc = next;
      save();
      emit("update");
      return doc;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    exportJSON() {
      return JSON.stringify(doc, null, 2);
    },
    /** Triggers a download when a document is present; returns the file name either way. */
    downloadExport(scope = globalThis) {
      const name = exportFilename(now());
      const { document: dom, Blob, URL } = scope;
      if (!dom || !Blob || !URL) return name;
      const url = URL.createObjectURL(new Blob([this.exportJSON()], { type: "application/json" }));
      const link = dom.createElement("a");
      link.href = url;
      link.download = name;
      dom.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return name;
    },
    /** Replaces the document with a valid file, or changes nothing and says why. */
    importJSON(text) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { ok: false, error: "The file is not valid JSON, so nothing was changed." };
      }
      const result = migrateDoc(parsed);
      if (result.error) return { ok: false, error: `${result.error} Nothing was changed.` };
      doc = result.doc;
      blocked = false;
      blockReason = null;
      save();
      emit("import");
      return { ok: true, doc };
    },
    /** Clears progress. keepPrefs (the default) keeps the learner's theme, motion and sound settings. */
    reset({ keepPrefs = true } = {}) {
      const prefs = keepPrefs ? doc.prefs : defaults().prefs;
      doc = { ...defaults(), prefs };
      blocked = false;
      blockReason = null;
      save();
      emit("reset");
      return doc;
    },
  };
}
