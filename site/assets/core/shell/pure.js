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
/**
 * The module of the most recent evidence entry that belongs to a module on the path: by its `at` time, with the list
 * order breaking a tie (the list is appended in order). Null when no entry belongs to the path.
 */
export function mostRecentModule(evidence, path) {
  const onPath = new Set(path);
  let best = null;
  (Array.isArray(evidence) ? evidence : []).forEach((entry, index) => {
    if (typeof entry?.module !== "string" || !onPath.has(entry.module)) return;
    const at = typeof entry.at === "string" ? entry.at : "";
    if (best === null || at > best.at || (at === best.at && index > best.index)) {
      best = { module: entry.module, at, index };
    }
  });
  return best?.module ?? null;
}

/**
 * Where Continue goes: resume where the learner left off. The module of the most recent evidence entry is the place to
 * resume while it is unfinished. Once it is done, Continue goes to the first unfinished module after it in path order,
 * then (if none comes after it) to the first unfinished module. With no evidence, the first unfinished module.
 * Null when every module on the path is done.
 */
export function continueTarget(course, doc) {
  const path = course.path;
  const latest = mostRecentModule(doc?.evidence, path);
  if (latest !== null && moduleStatus(doc, latest) !== "done") return targetOf(course, latest);
  const after = latest === null ? -1 : path.indexOf(latest);
  const id = path.find((moduleId, index) => index > after && moduleStatus(doc, moduleId) !== "done")
    ?? path.find((moduleId) => moduleStatus(doc, moduleId) !== "done");
  return id ? targetOf(course, id) : null;
}

function targetOf(course, id) {
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
/**
 * The nearest closed <details> around an element, or null. An element in a closed details is hidden: its position is
 * top 0 and it cannot intersect the viewport, so the loader waits for the details to open instead of loading it now.
 */
export function closedDetailsOf(el) {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement ?? null) {
    if (node.localName === "details" && !node.open) return node;
  }
  return null;
}

export function filterRegistry(registry, presentTags) {
  return presentTags.filter((tag) => Object.prototype.hasOwnProperty.call(registry, tag)).map((tag) => ({ tag, url: registry[tag] }));
}

/**
 * Which tags load at once and which wait. `items` holds one entry per element, {tag, top} with top in CSS px from the
 * page top. A tag loads at once when any of its elements starts within `eagerVh` viewport heights of the top.
 */
export function splitLoads(items, viewportHeight, eagerVh = 1.5) {
  const limit = eagerVh * viewportHeight;
  const eager = [...new Set(items.filter((item) => item.top < limit).map((item) => item.tag))];
  const now = new Set(eager);
  const lazy = [...new Set(items.map((item) => item.tag))].filter((tag) => !now.has(tag));
  return { eager, lazy };
}

/**
 * The entry for a term id, or null. terms.json (tools/gen_data.py) is an object keyed by id; a list of entries
 * with an `id` is accepted too. A missing id is plain text on the page, not an error.
 */
export function termEntry(terms, id) {
  if (Array.isArray(terms)) return terms.find((t) => t && t.id === id) ?? null;
  if (terms && typeof terms === "object" && Object.hasOwn(terms, id)) {
    const entry = terms[id];
    return entry && typeof entry === "object" ? entry : null;
  }
  return null;
}
