// The evidence listener (docs/COMPONENTS.md §5). A component reports what the learner did with a bubbling
// `hx-evidence` CustomEvent, {module, objectives, kind, detail}. The shell adds a timestamp, appends the entry
// to the store's evidence list, and to the predictions list when the kind is "prediction". Each list keeps only
// its newest CAP entries, so a long course cannot grow the stored document without limit.
import { noteEvidence } from "./progress.js";

export const CAP = 2000;
export const EVIDENCE_EVENT = "hx-evidence";

/** The list with `entry` appended, keeping at most `cap` entries (the newest). */
export function appendCapped(list, entry, cap = CAP) {
  const next = [...list, entry];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/** Writes one evidence entry through the store. Returns false (and writes nothing) if the store refuses. */
export function recordEvidence(store, detail, now = new Date()) {
  const entry = { ...detail, at: now.toISOString() };
  try {
    store.update((doc) => {
      doc.evidence = appendCapped(doc.evidence ?? [], entry);
      if (detail.kind === "prediction") doc.predictions = appendCapped(doc.predictions ?? [], entry);
      noteEvidence(doc, entry);
      return doc;
    });
    return true;
  } catch {
    return false;
  }
}

/** Listens once on `target` (the document, in the shell) for hx-evidence. Returns a function that stops listening. */
export function mountEvidence(store, target = document, now = () => new Date()) {
  const onEvidence = (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== "object" || typeof detail.kind !== "string") return;
    recordEvidence(store, detail, now());
  };
  target.addEventListener(EVIDENCE_EVENT, onEvidence);
  return () => target.removeEventListener(EVIDENCE_EVENT, onEvidence);
}
