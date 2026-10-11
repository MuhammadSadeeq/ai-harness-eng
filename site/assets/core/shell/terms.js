// Term popovers (AUTHORING §5). Every tagged term is a button-like focus stop from the start. Its definition comes from
// terms.json on the first open, and that one load (a promise shared by every term on the page) serves every open after
// it. Nothing is fetched at load, so a page nobody opens a term on never downloads the glossary (BP-5.3 weight).
// check_content (B7) guarantees each data-term names a known id; if the list fails to load, or an id has no entry, the
// popover says so and keeps its Close button.
import { termEntry } from "./pure.js";
import { mountFacts } from "./facts.js";

export const LOADING_TEXT = "Loading the definition…";
export const LOAD_FAILED_TEXT = "The definition could not load.";

/** The popover's title and body for a term id: the entry's term and definition, or null when the list has no entry. */
export function definitionFor(terms, id) {
  const entry = termEntry(terms, id);
  if (!entry) return null;
  // A term that names a fact (terms.yaml `fact:`) carries it: its definition gets the fact's chip (AUTHORING §7).
  return { term: entry.term, body: entry.definition, ...(typeof entry.fact === "string" ? { fact: entry.fact } : {}) };
}

/**
 * Wires the tagged terms on the page. `load` returns a promise of terms.json (getTerms in the shell); it is called at
 * most once, on the first open. `doc` is the document (tests pass a stand-in).
 */
export function mountTerms(load, doc = document, loadFacts = null) {
  let pending = null;
  const loadOnce = () => {
    pending ??= Promise.resolve().then(() => load());
    return pending;
  };
  for (const el of doc.querySelectorAll("[data-term]")) {
    const id = el.dataset.term;
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-expanded", "false");
    const open = () => {
      const current = doc.querySelector(".term-pop");
      if (current) current.remove();
      const pop = doc.createElement("div");
      pop.className = "term-pop";
      pop.setAttribute("role", "dialog");
      pop.setAttribute("aria-label", el.textContent.trim());
      const title = doc.createElement("strong");
      title.textContent = el.textContent.trim();
      const body = doc.createElement("p");
      body.textContent = LOADING_TEXT;
      const close = doc.createElement("button");
      close.type = "button";
      close.textContent = "Close";
      close.addEventListener("click", () => shut());
      pop.append(title, body, close);
      // Escape closes the popover wherever focus is inside it: focus moves to Close on open, and a key there
      // bubbles to the popover, not to the term (the term's own listener never sees it).
      pop.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          shut();
        }
      });
      el.after(pop);
      el.setAttribute("aria-expanded", "true");
      close.focus();
      loadOnce().then(
        (terms) => {
          const found = definitionFor(terms, id);
          if (found) {
            title.textContent = found.term;
            pop.setAttribute("aria-label", found.term);
            if (found.fact) {
              const claim = doc.createElement("span");
              claim.className = "fact";
              claim.setAttribute("data-fact", found.fact);
              claim.textContent = found.body;
              body.textContent = "";
              body.append(claim);
              // The chip comes from the registry, as on the page; an unknown or unverified fact gets none.
              if (loadFacts) loadFacts().then((facts) => mountFacts(facts, body), () => mountFacts(null, body));
            } else {
              body.textContent = found.body;
            }
          } else {
            body.textContent = LOAD_FAILED_TEXT;
          }
        },
        () => {
          body.textContent = LOAD_FAILED_TEXT;
        },
      );
    };
    const shut = () => {
      doc.querySelector(".term-pop")?.remove();
      el.setAttribute("aria-expanded", "false");
      el.focus();
    };
    el.addEventListener("click", () => (el.getAttribute("aria-expanded") === "true" ? shut() : open()));
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        el.click();
      } else if (ev.key === "Escape") {
        shut();
      }
    });
  }
}
