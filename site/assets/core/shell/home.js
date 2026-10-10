// The course home: the static course map and path are the fallback; this reads them back from the DOM and
// draws the progress marks, the Continue target, and the on-call card for the current theme. A module whose
// page is not built yet is not a link: its keys are disabled and say that the module opens soon.
import { partMarks, continueTarget } from "./pure.js";
import { resolvedTheme } from "./settings.js";

const MARK_PATHS = {
  done: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.6 2.6L16 9.5"/>',
  in_progress: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" class="half"/>',
  ahead: '<circle cx="12" cy="12" r="9"/>',
};

function courseFromDom(doc) {
  const modules = [...doc.querySelectorAll("[data-module-id]")].map((el) => ({
    id: el.dataset.moduleId, slug: el.dataset.slug, part: el.dataset.part, title: el.dataset.title,
    family: el.dataset.family || null, familyName: el.dataset.familyName || null, familySummary: el.dataset.familySummary || null,
    minutes: Number(el.dataset.minutes) || 0, built: el.dataset.built === "true",
  }));
  const parts = [...doc.querySelectorAll("[data-part-id]")].map((el) => ({ id: el.dataset.partId, title: el.dataset.partTitle }));
  // The path is the order of data-path on the module rows (course.json "path"), not the order of the parts.
  const path = [...doc.querySelectorAll("[data-module-id][data-path]")]
    .sort((a, b) => Number(a.dataset.path) - Number(b.dataset.path))
    .map((el) => el.dataset.moduleId);
  return { parts, modules, path };
}

/** A key that opens a module page is a link; one whose page is not built is disabled (no href). */
function setOpens(el, href) {
  if (!el) return;
  if (href) {
    el.setAttribute("href", href);
    el.removeAttribute("aria-disabled");
  } else {
    el.removeAttribute("href");
    el.setAttribute("aria-disabled", "true");
  }
}

function markSvg(state) {
  const ns = "http://www.w3.org/2000/svg";
  const wrap = document.createElementNS(ns, "svg");
  wrap.setAttribute("viewBox", "0 0 24 24");
  wrap.setAttribute("aria-hidden", "true");
  wrap.setAttribute("focusable", "false");
  wrap.setAttribute("class", `path-mark is-${state.replace("_", "-")}`);
  wrap.innerHTML = MARK_PATHS[state];
  return wrap;
}

export function renderHome(store, doc = document) {
  const course = courseFromDom(doc);
  const paint = () => {
    const doc2 = store.state;
    const marks = partMarks(course, doc2);
    for (const mark of marks) {
      const row = doc.querySelector(`[data-part-row="${mark.id}"]`);
      if (!row) continue;
      row.querySelector(".path-mark")?.replaceWith(markSvg(mark.state));
      const count = row.querySelector(".path-count");
      if (count) count.textContent = `${mark.done} of ${mark.total} · ${mark.state.replace("_", " ")}`;
      row.classList.toggle("is-now", mark.state === "in_progress");
    }
    for (const el of doc.querySelectorAll("[data-module-id]")) {
      const id = el.dataset.moduleId;
      const status = doc2.modules?.[id]?.status ?? "todo";
      el.dataset.state = status;
      const slot = el.querySelector(".module-mark");
      if (slot) slot.replaceChildren(markSvg(status === "done" ? "done" : status === "started" ? "in_progress" : "ahead"));
    }
    const next = continueTarget(course, doc2);
    const shift = next ? course.modules.find((m) => m.id === next.id) : null;
    const built = Boolean(shift?.built);
    const href = built ? next.href : null;
    const title = doc.querySelector("[data-continue-title]");
    const link = doc.querySelector("[data-continue-link]");
    const meta = doc.querySelector("[data-continue-meta]");
    const note = doc.querySelector("[data-soon-note]");
    if (next) {
      if (title) title.textContent = `${next.id} · ${next.title}`;
      setOpens(link, href);
      if (link) link.textContent = built ? "Continue" : `${next.id} opens soon`;
      if (link) link.hidden = false;
      if (meta) meta.textContent = `${shift.minutes} minutes · Part ${shift.part}`;
      if (note) note.hidden = built;
    } else {
      if (title) title.textContent = "Every module in the path is done";
      if (link) link.hidden = true;
      if (note) note.hidden = true;
      if (meta) meta.textContent = "Keep going with the other parts in the course map.";
    }
    for (const el of doc.querySelectorAll("[data-slot=\"family-name\"]")) el.textContent = shift?.familyName ?? "No incident for this module";
    for (const el of doc.querySelectorAll("[data-slot=\"family-summary\"]")) el.textContent = shift?.familySummary ?? "";
    for (const el of doc.querySelectorAll("[data-family-link]")) setOpens(el, href);
    const night = resolvedTheme(store.state.prefs.theme) === "night";
    const shiftCard = doc.querySelector("[data-shift]");
    const pageCard = doc.querySelector("[data-page-card]");
    if (shiftCard) shiftCard.hidden = night;
    if (pageCard) pageCard.hidden = !night;
    const state = doc.querySelector("[data-page-state]");
    const take = doc.querySelector("[data-take-page]");
    const open = doc.querySelector("[data-open-incident]");
    if (take) {
      take.hidden = page.taken;
      take.disabled = !built;
    }
    if (state) {
      state.hidden = !page.taken && built;
      state.textContent = page.taken
        ? "You have the page. Open the incident to start."
        : `${next?.id ?? "This module"} opens soon. You can take the page once its module is built.`;
    }
    if (open) open.hidden = !page.taken;
  };
  const page = { taken: false };
  doc.querySelector("[data-take-page]")?.addEventListener("click", () => {
    page.taken = true;
    paint();
  });
  document.addEventListener("hx:theme", paint);
  paint();
  store.subscribe(paint);
}
