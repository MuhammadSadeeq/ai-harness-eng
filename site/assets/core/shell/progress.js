// Module progress (BP-2.1 §1): a module is visited when its page loads (todo -> started) and done when every one of
// its objectives has an hx-evidence entry that names it. The store keeps modules[id] = {status, objectives,
// objectives_seen}. Pure: each function takes the document and changes it in place.

/** The page of module `id` loaded: record its objective ids and mark it started (never back to todo). */
export function noteVisit(doc, id, objectives) {
  const mod = (doc.modules[id] ??= { status: "todo" });
  mod.objectives = [...objectives];
  mod.objectives_seen = Array.isArray(mod.objectives_seen) ? mod.objectives_seen : [];
  if (mod.status !== "done") mod.status = "started";
  settle(mod);
  return doc;
}

/** An hx-evidence entry: its objectives count as seen for its module; the module is done when all are seen. */
export function noteEvidence(doc, entry) {
  const id = entry?.module;
  if (typeof id !== "string" || id === "") return doc;
  const mod = (doc.modules[id] ??= { status: "todo" });
  const seen = new Set(Array.isArray(mod.objectives_seen) ? mod.objectives_seen : []);
  for (const objective of Array.isArray(entry.objectives) ? entry.objectives : []) seen.add(objective);
  mod.objectives_seen = [...seen];
  if (mod.status === "todo") mod.status = "started";
  settle(mod);
  return doc;
}

/** Done when the module's objectives are all seen. Objectives unknown to the store cannot make it done. */
function settle(mod) {
  const objectives = Array.isArray(mod.objectives) ? mod.objectives : [];
  const seen = new Set(mod.objectives_seen ?? []);
  if (objectives.length > 0 && objectives.every((id) => seen.has(id))) mod.status = "done";
}

/** How many of the module's objectives have been seen. */
export function shownCount(doc, id) {
  const mod = doc.modules?.[id];
  const seen = new Set(mod?.objectives_seen ?? []);
  return (mod?.objectives ?? []).filter((objective) => seen.has(objective)).length;
}
