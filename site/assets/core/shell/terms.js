// Term popovers (AUTHORING §5). A tagged term with an entry in terms.json gets a button-like focus stop and a
// popover with its definition. With no entry the term is plain text: graceful when the list is empty.
import { termEntry } from "./pure.js";

export function mountTerms(terms = [], doc = document) {
  for (const el of doc.querySelectorAll("[data-term]")) {
    const entry = termEntry(terms, el.dataset.term);
    if (!entry) continue;
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-expanded", "false");
    const open = () => {
      const current = doc.querySelector(".term-pop");
      if (current) current.remove();
      const pop = doc.createElement("div");
      pop.className = "term-pop";
      pop.setAttribute("role", "dialog");
      pop.setAttribute("aria-label", entry.term);
      const title = doc.createElement("strong");
      title.textContent = entry.term;
      const body = doc.createElement("p");
      body.textContent = entry.definition;
      const close = doc.createElement("button");
      close.type = "button";
      close.textContent = "Close";
      close.addEventListener("click", () => shut());
      pop.append(title, body, close);
      el.after(pop);
      el.setAttribute("aria-expanded", "true");
      close.focus();
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
