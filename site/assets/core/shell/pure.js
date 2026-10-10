// Pure helpers for the shell: progress marks from the store and the course, the Continue target, the
// shift copy, the oldest verified fact, the fact chip label, the loader's registry filter, and the due count.
// No DOM here, so the tests run them under node.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** started | done | todo, from the store's modules record. */
export function moduleStatus(doc, id) {
  const status = doc?.modules?.[id]?.status;
  return status === "done" || status === "started" ? status : "todo";
}

/** One mark per part: done (all modules done), in_progress (some started or done), ahead (none). */
export function partMarks(course, doc) {
  return course.parts.map((part) => {
    const modules = course.modules.filter((m) => m.part === part.id);
    const done = modules.filter((m) => moduleStatus(doc, m.id) === "done").length;
    const started = modules.some((m) => moduleStatus(doc, m.id) !== "todo");
    let state = "ahead";
    if (modules.length > 0 && done === modules.length) state = "done";
    else if (done > 0 || started) state = "in_progress";
    return { id: part.id, title: part.title, total: modules.length, done, state };
  });
}

/** The first path module the learner has not finished, with its page address. Null when the path is done. */
export function continueTarget(course, doc) {
  const id = course.path.find((moduleId) => moduleStatus(doc, moduleId) !== "done");
  if (!id) return null;
  const module = course.modules.find((m) => m.id === id);
  return { id, title: module.title, part: module.part, href: `modules/${module.slug}.html` };
}

/** The shift is the current module's failure family: its name and its one-line summary, from course.json. */
export function shiftFor(course, moduleId) {
  const module = course.modules.find((m) => m.id === moduleId);
  const family = course.failure_families.find((f) => f.id === module?.family);
  return family ? { module: module.id, name: family.name, summary: family.summary, wire: family.wire } : null;
}

/** Cards due on or before today (ISO dates compare as strings). */
export function dueCards(doc, todayIso) {
  return Object.values(doc.cards || {}).filter((card) => card && typeof card.due === "string" && card.due <= todayIso).length;
}

/** The oldest verified_on date across the facts registry, or null if none is verified. */
export function oldestFactDate(facts) {
  let oldest = null;
  for (const fact of Object.values(facts || {})) {
    if (fact?.status !== "verified" || typeof fact.verified_on !== "string") continue;
    if (oldest === null || fact.verified_on < oldest) oldest = fact.verified_on;
  }
  return oldest;
}

/** "10 Oct 2026" for the footer. */
export function formatDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "verified Oct 2026" for a fact chip (AUTHORING §7). */
export function factChipLabel(iso) {
  const [y, m] = iso.split("-").map(Number);
  return `verified ${MONTHS[m - 1]} ${y}`;
}

/** Only the registry entries whose tags the page actually has, in page order. Unknown tags are left alone. */
export function filterRegistry(registry, presentTags) {
  return presentTags.filter((tag) => Object.prototype.hasOwnProperty.call(registry, tag)).map((tag) => ({ tag, url: registry[tag] }));
}

/** The module record's terms for popovers; empty (not an error) when the course has none for that id. */
export function termEntry(terms, id) {
  return (Array.isArray(terms) ? terms : []).find((t) => t && t.id === id) ?? null;
}
