// The top bar and page chrome: the module code and title, the Menu sheet (phones), the due count, and the
// course map's open state (open on desktop, a drawer below 1100 px).
import { dueCards } from "./pure.js";
import { formatInt } from "../../components/lib/format.js";

/**
 * The learner's local calendar date as YYYY-MM-DD. offsetMinutes is the zone's offset east of UTC; by default it is
 * the machine's zone, so the date is the one the learner sees on their clock. Tests pass an offset.
 */
export function todayIso(now = new Date(), offsetMinutes = -now.getTimezoneOffset()) {
  const local = new Date(now.getTime() + offsetMinutes * 60000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
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

  // The Board button shows the count and, from 360 px, the words; below 360 px only the count shows (CSS), and the
  // link's aria-label keeps the full name ("Board, 0 cards due") at every width.
  const paintDue = () => {
    const due = dueCards(store.state, todayIso());
    const count = formatInt(due);
    const words = due === 1 ? "card due" : "cards due";
    for (const el of doc.querySelectorAll("[data-due]")) el.textContent = String(due);
    for (const el of doc.querySelectorAll("[data-due-num]")) el.textContent = count;
    for (const el of doc.querySelectorAll("[data-due-words]")) el.textContent = ` ${words}`;
    for (const el of doc.querySelectorAll("[data-due-label]")) el.setAttribute("aria-label", `Board, ${count} ${words}`);
  };
  paintDue();
  store.subscribe(paintDue);
}
