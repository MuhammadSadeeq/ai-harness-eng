// The top bar and page chrome: the module code and title, the Menu sheet (phones), the due count, and the
// course map's open state (open on desktop, a drawer below 1100 px).
import { dueCards } from "./pure.js";

export function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function mountChrome(store, doc = document) {
  const root = doc.documentElement;
  const code = root.dataset.module;
  const codeEl = doc.querySelector(".module-id .mod-code");
  if (codeEl) {
    if (code) codeEl.textContent = code;
    else codeEl.hidden = true;
  }
  const h1 = doc.querySelector("main h1");
  const titleEl = doc.querySelector(".module-id .mod-title");
  if (titleEl && h1 && code) titleEl.textContent = h1.textContent;

  const menuButton = doc.querySelector("[data-menu-btn]");
  const sheet = doc.querySelector("[data-menu-sheet]");
  if (menuButton && sheet && typeof sheet.showModal === "function") {
    menuButton.hidden = false;
    menuButton.addEventListener("click", () => {
      sheet.showModal();
      menuButton.setAttribute("aria-expanded", "true");
    });
    sheet.addEventListener("close", () => menuButton.setAttribute("aria-expanded", "false"));
    sheet.querySelector("[data-close]")?.addEventListener("click", () => sheet.close());
  }

  const courseMap = doc.querySelector("details.course-map");
  if (courseMap) {
    const wide = matchMedia("(min-width: 1100px)");
    const apply = () => {
      courseMap.open = wide.matches;
    };
    apply();
    wide.addEventListener?.("change", apply);
  }

  // The course map rail scrolls on desktop. Its "More below" cue shows until the rail is at its end.
  const rail = doc.querySelector(".rail");
  if (rail) {
    const mark = () => {
      const atEnd = rail.scrollHeight - rail.clientHeight - rail.scrollTop <= 4;
      rail.dataset.end = atEnd ? "true" : "false";
    };
    mark();
    rail.addEventListener("scroll", mark, { passive: true });
    courseMap?.addEventListener("toggle", mark);
    if (typeof ResizeObserver === "function") new ResizeObserver(mark).observe(rail);
  }

  const paintDue = () => {
    const due = dueCards(store.state, todayIso());
    for (const el of doc.querySelectorAll("[data-due]")) el.textContent = String(due);
  };
  paintDue();
  store.subscribe(paintDue);
}
