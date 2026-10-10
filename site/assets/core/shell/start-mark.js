// The course map's "Suggested start" mark (BP-3.1b §1): the module the placement check suggested, marked on each
// course map on the page. A suggestion only: nothing is locked or hidden. Only the map's list items carry the mark
// (a module page's header also has a data-module-id).
export function markSuggestedStart(doc, root = document) {
  const start = doc?.placement?.start ?? null;
  for (const item of root.querySelectorAll("li[data-module-id]")) {
    const mark = item.querySelector(":scope > .start-mark");
    if (item.dataset.moduleId === start) {
      if (!mark) {
        const label = root.createElement("span");
        label.className = "start-mark";
        label.textContent = "Suggested start";
        item.append(label);
      }
    } else {
      mark?.remove();
    }
  }
}

/** Keeps the mark in step with the store: at load and after every change (a new placement, a reset). */
export function mountStartMark(store, root = document) {
  markSuggestedStart(store.state, root);
  store.subscribe((doc) => markSuggestedStart(doc, root));
}
