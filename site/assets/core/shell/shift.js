// The daily on-call shift (SPEC §6.4, BP-5.4 §4): one incident, the due cards and one drill, picked by the day from
// the built modules. Done modules come first. The page draws the shift and records it as evidence (kind "shift").
// Everything that decides the shift is a pure function (test/shift.test.mjs); mountShift() only draws and records.
import { EVIDENCE_EVENT } from "./evidence.js";
import { loadComponents } from "./loader.js";
import { todayIso } from "./chrome.js";
import { dueCards } from "./pure.js";
import { formatInt } from "../../components/lib/format.js";

// The cards a session takes when none is due: the same limit as hx-cards' session (lib/leitner.js SESSION_LIMIT).
const SESSION_CARDS = 20;

// The site root, from this module's place (site/assets/core/shell/): the same file on every page, module pages too.
const SHIFT_URL = new URL("../../../data/oncall/shift.json", import.meta.url).href;
let shiftData = null;

/** The shift's data (site/data/oncall/shift.json), fetched once per page. */
export function loadShift(url = SHIFT_URL) {
  shiftData ??= fetch(url).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.json();
  });
  return shiftData;
}

/** FNV-1a, 32 bits: the same text gives the same number, so one day picks the same incident for everyone. */
export function seedOf(text) {
  let hash = 0x811c9dc5;
  for (const unit of String(text)) {
    hash ^= unit.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Whole days since 1970 for a YYYY-MM-DD day, so consecutive days differ by one and drills can alternate. */
export function dayNumber(day) {
  const [year, month, date] = day.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, date) / 86400000);
}

/** The local day an evidence entry was recorded on, or "" when it has no usable timestamp. */
export function dayOf(entry) {
  if (typeof entry?.at !== "string") return "";
  const when = new Date(entry.at);
  return Number.isNaN(when.getTime()) ? "" : todayIso(when);
}

/** The line above the on-call cards: the due count (as the Board button says it), or the new cards a session starts. */
export function cardsLine({ due, started, boardSize }) {
  if (due > 0) return `${formatInt(due)} ${due === 1 ? "card due" : "cards due"} today.`;
  const start = Math.min(SESSION_CARDS, Math.max(0, boardSize - started));
  return start > 0
    ? `Nothing is due yet. Start your board with ${formatInt(start)} new cards.`
    : "Nothing is due yet, and every card on the board has been started.";
}

/** The evidence entries recorded on `day`. */
export function entriesOn(evidence, day) {
  return (Array.isArray(evidence) ? evidence : []).filter((entry) => dayOf(entry) === day);
}

/** hx-incident reports kind "incident" when a hunt ends; the tape names the incident. */
export function incidentHunted(entries, tape) {
  return entries.some((entry) => entry.kind === "incident" && entry.detail?.tape === tape);
}

/** The incidents not hunted yet, in the order given. */
export function unhuntedIncidents(incidents, evidence) {
  return incidents.filter((incident) => !incidentHunted(evidence, incident.tape));
}

/** A say drill is done once the learner has self-graded a prompt; a kata drill once its tests passed. */
export function drillDone(entries, drill) {
  if (!drill) return false;
  if (drill.kind === "say") return entries.some((entry) => entry.kind === "say");
  return entries.some(
    (entry) => entry.kind === "kata" && entry.detail?.id === drill.id && entry.detail?.passed === true,
  );
}

/**
 * The shift for a day. The incident comes from the modules the learner has done when there are any (scope "done"),
 * else from the whole course (scope "course"); the day's seed picks one. Drills alternate by day: an odd day gives a
 * memory kata when one exists, and any other day gives a say prompt from the bank.
 */
export function pickShift({ incidents = [], memory = [], sayModules = [], doneModules = [], day }) {
  const done = new Set(doneModules);
  const pool = (items) => {
    const finished = items.filter((item) => done.has(item.module));
    return finished.length > 0 ? { items: finished, scope: "done" } : { items, scope: "course" };
  };
  const incidentPool = pool(incidents);
  const incident = incidentPool.items.length > 0
    ? incidentPool.items[seedOf(day) % incidentPool.items.length]
    : null;
  const katas = pool(memory).items;
  const useKata = dayNumber(day) % 2 === 1 && katas.length > 0;
  const drill = useKata
    ? kataDrill(katas[seedOf(`${day}/kata`) % katas.length])
    : sayDrill(pool(sayModules.map((module) => ({ module }))).items, day);
  return { day, incident, drill, scope: incidentPool.scope };
}

function kataDrill(kata) {
  return { kind: "kata", id: kata.id, title: kata.title, module: kata.module };
}

/** A say drill: one built module's prompts (a small file), chosen by the day; the module's own prompts are the drill. */
function sayDrill(modules, day) {
  if (modules.length === 0) return { kind: "say", module: "" };
  return { kind: "say", module: modules[seedOf(`${day}/say`) % modules.length].module };
}

/** What is left of the shift today: "incident" and "drill", in that order, or none. */
export function shiftLeft(shift, entries) {
  const left = [];
  if (shift.incident && !incidentHunted(entries, shift.incident.tape)) left.push("incident");
  if (shift.drill && !drillDone(entries, shift.drill)) left.push("drill");
  return left;
}

function doneModuleIds(state) {
  return Object.entries(state.modules ?? {})
    .filter(([, mod]) => mod?.status === "done")
    .map(([id]) => id);
}

function setText(node, text) {
  if (node) node.textContent = text;
}

/** A start button: the part's component is made and loaded only when the learner starts it (the clock starts then). */
function startButton(label, onStart) {
  const button = element("button", { type: "button", class: "key" });
  button.textContent = label;
  button.addEventListener("click", () => {
    button.remove();
    onStart();
  });
  return button;
}

function mountInto(slot, node) {
  slot.replaceChildren(node);
  loadComponents({ root: slot });
}

function element(tag, attrs = {}) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

/**
 * Draws today's shift on a page with [data-shift-page] and records it. The components are created here and loaded
 * with the loader; the page's own text is filled from the shift. Returns the render function, or null when the page
 * has no shift.
 */
export function mountShift(store, { root = document, now = () => new Date(), data = loadShift } = {}) {
  const page = root.querySelector("[data-shift-page]");
  if (!page) return null;
  const slot = (name) => page.querySelector(`[data-shift-${name}]`);
  const day = todayIso(now());
  const dayEl = slot("day");
  if (dayEl) {
    dayEl.textContent = day;
    dayEl.setAttribute("datetime", day);
  }
  let shift = null;
  let built = false;
  let boardSize = 0;
  const cardsStatus = slot("cards-status");

  // The same due count as the Board button (shell/chrome.js), so the two never disagree. A session with nothing due
  // starts new cards, and the line says so.
  const paintCards = () => {
    if (!cardsStatus || boardSize === 0) return;
    const started = Object.keys(store.state.cards ?? {}).length;
    cardsStatus.textContent = cardsLine({ due: dueCards(store.state, day), started, boardSize });
  };

  const recorded = () => entriesOn(store.state.evidence, day).some((entry) => entry.kind === "shift");

  const build = () => {
    built = true;
    const incidentSlot = slot("incident-slot");
    if (shift.incident && incidentSlot) {
      const tape = shift.incident.tape;
      incidentSlot.replaceChildren(startButton("Start the incident", () => mountInto(incidentSlot, element("hx-incident", { tape }))));
      const text = shift.scope === "done"
        ? `From ${shift.incident.module} · ${shift.incident.title}, a module you have done.`
        : `No module is done yet, so this incident comes from the whole course: ${shift.incident.module} · ${shift.incident.title}.`;
      const incidentNote = slot("incident-note");
      if (incidentNote) incidentNote.textContent = text;
    } else {
      slot("incident-section")?.setAttribute("hidden", "");
    }
    const drillSlot = slot("drill-slot");
    if (drillSlot) {
      const drill = shift.drill;
      const make = drill.kind === "kata"
        ? () => element("hx-kata", { kata: drill.id, mode: "memory" })
        : () => element("hx-say", { src: drill.module });
      drillSlot.replaceChildren(startButton(drill.kind === "kata" ? "Start the kata" : "Start the drill", () => mountInto(drillSlot, make())));
      setText(slot("drill-note"), drill.kind === "kata"
        ? `From ${drill.module}: ${drill.title}. Write it from memory, then run the tests.`
        : `Answer one prompt from ${drill.module} out loud, then grade it against its rubric.`);
    }
    slot("record")?.addEventListener("click", () => record());
  };

  const record = () => {
    if (!shift || recorded()) return;
    const entries = entriesOn(store.state.evidence, day);
    const detail = {
      day,
      incident: shift.incident?.tape ?? "",
      drill: shift.drill.kind === "kata" ? shift.drill.id : "say",
      incident_done: shift.incident ? incidentHunted(entries, shift.incident.tape) : false,
      drill_done: drillDone(entries, shift.drill),
    };
    slot("record").dispatchEvent(new CustomEvent(EVIDENCE_EVENT, {
      bubbles: true,
      detail: { module: null, objectives: [], kind: "shift", detail },
    }));
    render();
    const status = slot("status");
    if (status && !recorded()) status.textContent = "This shift could not be saved on this device.";
  };

  const render = () => {
    paintCards();
    if (!shift) return;
    const entries = entriesOn(store.state.evidence, day);
    const left = shiftLeft(shift, entries);
    const leftEl = slot("left");
    if (leftEl) {
      const words = { incident: "hunt the incident", drill: "do the drill" };
      leftEl.textContent = left.length === 0
        ? "Both parts of today's shift are done."
        : `Left today: ${left.map((item) => words[item]).join(", ")}.`;
    }
    const button = slot("record");
    if (button) {
      const done = recorded();
      button.disabled = done;
      button.textContent = done ? "Recorded for today" : "Record today's shift";
    }
    const status = slot("status");
    if (status && recorded()) status.textContent = "Recorded for today. Nothing carries over to tomorrow.";
  };

  store.subscribe(render);
  data().then((doc) => {
    boardSize = Number(doc.board_cards ?? 0);
    shift = pickShift({
      incidents: doc.incidents ?? [],
      memory: doc.memory_katas ?? [],
      sayModules: doc.say_modules ?? [],
      doneModules: doneModuleIds(store.state),
      day,
    });
    if (!built) build();
    render();
  }).catch(() => {
    slot("error")?.removeAttribute("hidden");
  });
  return render;
}
