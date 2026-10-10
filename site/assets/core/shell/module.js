// The module page (BP-2.1 §1): the visit and the objective progress in the header, the current beat marked on the
// beat strip (a mark and the word "now"), margin notes shown inline on phones, and the wire glyph on the law. The
// header and the notes are plain markup first; this only adds what the store and the scroll position decide.
import { noteVisit, shownCount } from "./progress.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const MARKS = {
  done: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.6 2.6L16 9.5"/>',
  started: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" class="half"/>',
  todo: '<circle cx="12" cy="12" r="9"/>',
};

function mark(state) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", `path-mark is-${state}`);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.innerHTML = MARKS[state];
  return svg;
}

/** Writes "2 of 5 objectives done", marks each done objective in the list, and sets the progress mark. */
function paintProgress(store, doc, id, total) {
  const line = doc.querySelector("[data-progress]");
  if (!line) return;
  const shown = shownCount(store.state, id);
  const status = store.state.modules?.[id]?.status ?? "todo";
  const seen = new Set(store.state.modules?.[id]?.objectives_seen ?? []);
  for (const item of doc.querySelectorAll("[data-objective-list] [data-objective]")) {
    const done = seen.has(item.dataset.objective);
    item.classList.toggle("is-done", done);
    const word = item.querySelector(".objective-done");
    if (done && !word) {
      const tag = doc.createElement("span");
      tag.className = "objective-done";
      tag.textContent = "done";
      item.append(" ", tag);
    } else if (!done && word) {
      word.previousSibling?.remove();
      word.remove();
    }
  }
  const text = line.querySelector("[data-progress-text]");
  if (text) text.textContent = `${shown} of ${total} objectives done`;
  line.querySelector(".path-mark")?.remove();
  line.prepend(mark(status === "done" ? "done" : status === "started" ? "started" : "todo"));
}

function markCurrentBeat(doc) {
  const links = [...doc.querySelectorAll("[data-beat-link]")];
  if (links.length === 0 || typeof IntersectionObserver !== "function") return;
  const current = new Map();
  const set = (beat) => {
    for (const link of links) {
      const now = link.dataset.beatLink === beat;
      link.toggleAttribute("aria-current", now);
      link.querySelector(".now-mark")?.remove();
      if (now) {
        const word = doc.createElement("span");
        word.className = "now-mark";
        word.textContent = "now";
        link.append(word);
      }
    }
  };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) current.set(entry.target.dataset.beat, entry.isIntersecting ? entry.intersectionRatio : 0);
    const best = [...current.entries()].filter(([, ratio]) => ratio > 0).sort((a, b) => b[1] - a[1])[0];
    if (best) set(best[0]);
  }, { rootMargin: "-30% 0px -60% 0px", threshold: [0, 0.25, 0.5, 1] });
  for (const section of doc.querySelectorAll("section[data-beat]")) observer.observe(section);
}

/** Margin notes: on phones each aside.note also gets a tap-to-expand copy (CSS shows one or the other). */
function upgradeNotes(doc) {
  for (const note of doc.querySelectorAll("aside.note")) {
    if (note.dataset.inline === "true") continue;
    const details = doc.createElement("details");
    details.className = "note-inline";
    details.dataset.inline = "true";
    const summary = doc.createElement("summary");
    summary.textContent = "Note";
    const body = doc.createElement("div");
    body.append(...[...note.childNodes].map((child) => child.cloneNode(true)));
    details.append(summary, body);
    note.after(details);
    note.dataset.inline = "true";
  }
}

/** The law of a core module, set large, with the module's wire glyph before it (DESIGN §6.3). */
function decorateLaw(doc) {
  const glyph = doc.querySelector(".module-meta")?.dataset.glyph;
  if (!glyph) return;
  for (const law of doc.querySelectorAll("p.law")) {
    if (law.querySelector(".law-glyph")) continue;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "law-glyph");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", new URL(`../glyphs.svg#g-${glyph}`, import.meta.url).href);
    svg.append(use);
    law.prepend(svg);
  }
}

/** Mounts the module behaviour. Returns false on a page that is not a module page. */
export function mountModule(store, doc = document) {
  const id = doc.documentElement.dataset.module;
  const isPage = Boolean(id) || Boolean(doc.querySelector("[data-beat-strip]"));
  if (!isPage) return false;
  if (id) {
    // Progress belongs to a module (a real one has data-module on <html>); a specimen page only shows the layout.
    const objectives = [...doc.querySelectorAll("[data-objective-list] [data-objective]")].map((el) => el.dataset.objective);
    const total = objectives.length;
    try {
      store.update((next) => noteVisit(next, id, objectives));
    } catch {
      // A store that cannot save (blocked or unavailable) still shows the page; progress waits for a saved store.
    }
    paintProgress(store, doc, id, total);
    store.subscribe(() => paintProgress(store, doc, id, total));
  }
  markCurrentBeat(doc);
  upgradeNotes(doc);
  decorateLaw(doc);
  return true;
}
