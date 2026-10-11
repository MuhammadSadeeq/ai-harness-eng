// The daily on-call shift (SPEC §6.4, BP-5.4 §4): one incident, the due cards and one drill, picked by the day from
// the built modules. Done modules come first. The page draws the shift and records it as evidence (kind "shift").
// Everything that decides the shift is a pure function (test/shift.test.mjs); mountShift() only draws and records.
import { EVIDENCE_EVENT } from "./evidence.js";
import { loadComponents } from "./loader.js";
import { todayIso } from "./chrome.js";
import { dueCards } from "./pure.js";
import { formatInt } from "../../components/lib/format.js";
import { doneIds, poolOf, startedIds, wiresByModule } from "../../components/lib/pool.js";

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

const CORE_URL = new URL("../../../data/course-core.json", import.meta.url).href;
let coreData = null;

/** The course's core data (site/data/course-core.json): the path order and each module's wires, fetched once. */
export function loadCore(url = CORE_URL) {
  coreData ??= fetch(url).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.json();
  });
  return coreData;
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

/** The day number of each wire's latest shift (a shift's incident wires and drill wires); a wire never drilled is absent. */
export function lastDrilledDays(evidence, incidents, memory, wiresOf) {
  const tapeModule = new Map(incidents.map((incident) => [incident.tape, incident.module]));
  const kataModule = new Map(memory.map((kata) => [kata.id, kata.module]));
  const latest = new Map();
  for (const entry of Array.isArray(evidence) ? evidence : []) {
    if (entry?.kind !== "shift" || typeof entry.detail?.day !== "string") continue;
    const num = dayNumber(entry.detail.day);
    const modules = [tapeModule.get(entry.detail.incident), entry.detail.drill_module ?? kataModule.get(entry.detail.drill)];
    for (const mod of modules) {
      for (const wire of wiresOf.get(mod) ?? []) {
        if ((latest.get(wire) ?? -Infinity) < num) latest.set(wire, num);
      }
    }
  }
  return latest;
}

/** The day number of each incident's latest hunt (its tape's incident entry), read from the store's evidence. */
export function lastHuntDays(evidence) {
  const latest = new Map();
  for (const entry of Array.isArray(evidence) ? evidence : []) {
    if (entry?.kind !== "incident" || !entry.detail?.tape) continue;
    const day = dayOf(entry);
    if (!day) continue;
    const num = dayNumber(day);
    if ((latest.get(entry.detail.tape) ?? -Infinity) < num) latest.set(entry.detail.tape, num);
  }
  return latest;
}

/**
 * The day number of each drill item's latest drill, keyed "kata:<id>" or "say:<module>" (a shift's record names the
 * kata, or "say" with its module). An item never drilled is absent.
 */
export function lastDrillDays(evidence) {
  const latest = new Map();
  for (const entry of Array.isArray(evidence) ? evidence : []) {
    if (entry?.kind !== "shift" || typeof entry.detail?.day !== "string") continue;
    const key = entry.detail.drill === "say" ? `say:${entry.detail.drill_module ?? ""}` : entry.detail.drill ? `kata:${entry.detail.drill}` : "";
    if (!key) continue;
    const num = dayNumber(entry.detail.day);
    if ((latest.get(key) ?? -Infinity) < num) latest.set(key, num);
  }
  return latest;
}

/** The incident whose least recently drilled wire was drilled longest ago; ties go to the day's seed. */
function leastDrilledPick(candidates, wiresOf, lastDrilled, day) {
  const score = (incident) => {
    const wires = wiresOf.get(incident.module) ?? [];
    return wires.length === 0 ? -1 : Math.min(...wires.map((wire) => lastDrilled.get(wire) ?? -1));
  };
  const best = Math.min(...candidates.map(score));
  const tied = candidates.filter((incident) => score(incident) === best);
  return tied[seedOf(day) % tied.length];
}

/** The item drilled longest ago (never drilled counts as longest); ties go to the day's seed. */
function leastRecentlyDrilled(items, drillDays, day, salt) {
  const score = (item) => drillDays.get(item.key) ?? -1;
  const best = Math.min(...items.map(score));
  const tied = items.filter((item) => score(item) === best);
  return tied[seedOf(`${day}/${salt}`) % tied.length].item;
}

/**
 * The shift for a day (D-062, amended by the round 3 rulings). The pool is the modules the learner has started or
 * finished; with none, the first path module that has an incident.
 *  - An incident not hunted yet comes first, the one whose least recently drilled wire was drilled longest ago.
 *  - When every incident in the pool has been hunted, the one hunted longest ago is offered if that hunt was at least
 *    three days before today. Otherwise there is no incident today, and `note` points to the learner's next unfinished
 *    module on the path (never a module not started). Cards and the drill still run.
 *  - The drill comes from the pool, alternating by day: an odd day gives a memory kata, any other day a say prompt.
 *    Among the pool's katas (or say modules) the least recently drilled comes first; ties go to the day's seed.
 */
export function pickShift({
  incidents = [], memory = [], sayModules = [], started = new Set(), done = new Set(), path = [],
  wiresOf = new Map(), huntDays = new Map(), lastDrilled = new Map(), drillDays = new Map(), day,
}) {
  const pool = poolOf(started, path, incidents.map((incident) => incident.module));
  const scope = started.size > 0 ? "started" : "first";
  const poolIncidents = incidents.filter((incident) => pool.has(incident.module));
  const unhunted = poolIncidents.filter((incident) => !huntDays.has(incident.tape));
  const today = dayNumber(day);
  let incident = null;
  let note = null;
  if (unhunted.length > 0) {
    incident = leastDrilledPick(unhunted, wiresOf, lastDrilled, day);
  } else if (poolIncidents.length > 0) {
    const oldest = Math.min(...poolIncidents.map((item) => huntDays.get(item.tape)));
    if (today - oldest >= 3) {
      const longest = poolIncidents.filter((item) => huntDays.get(item.tape) === oldest);
      incident = longest[seedOf(day) % longest.length];
    } else {
      note = nothingNewNote(incidents, path, done, started);
    }
  }
  const katas = memory.filter((kata) => pool.has(kata.module));
  const say = sayModules.filter((mod) => pool.has(mod));
  const useKata = dayNumber(day) % 2 === 1 && katas.length > 0;
  const drill = useKata
    ? kataDrill(leastRecentlyDrilled(katas.map((kata) => ({ key: `kata:${kata.id}`, item: kata })), drillDays, day, "kata"))
    : sayDrill(say, drillDays, day);
  return { day, incident, note, drill, scope };
}

/**
 * The line for a day with nothing new to hunt: the next path module that has an incident and is neither finished nor
 * started. Starting it adds its incident to the pool; a started module's incident is already in the pool.
 */
function nothingNewNote(incidents, path, done, started) {
  const titles = new Map(incidents.map((incident) => [incident.module, incident.title]));
  const next = path.find((id) => !done.has(id) && !started.has(id) && titles.has(id));
  return next === undefined
    ? "Nothing new to hunt today."
    : `Nothing new to hunt today. Start ${next} · ${titles.get(next)} to add its incident.`;
}

function kataDrill(kata) {
  return { kind: "kata", id: kata.id, title: kata.title, module: kata.module };
}

/** A say drill: one pool module's prompts, the least recently drilled module first (ties to the day's seed). */
function sayDrill(modules, drillDays, day) {
  if (modules.length === 0) return { kind: "say", module: "" };
  const items = modules.map((mod) => ({ key: `say:${mod}`, item: mod }));
  return { kind: "say", module: leastRecentlyDrilled(items, drillDays, day, "say") };
}

/** What is left of the shift today: "incident" and "drill", in that order, or none. */
export function shiftLeft(shift, entries) {
  const left = [];
  if (shift.incident && !incidentHunted(entries, shift.incident.tape)) left.push("incident");
  if (shift.drill && !drillDone(entries, shift.drill)) left.push("drill");
  return left;
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
export function mountShift(store, { root = document, now = () => new Date(), data = loadShift, core = loadCore } = {}) {
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
      const text = shift.scope === "started"
        ? `From ${shift.incident.module} · ${shift.incident.title}, a module you have started or finished.`
        : `You have not started a module yet, so this incident is the first on the path: ${shift.incident.module} · ${shift.incident.title}.`;
      const incidentNote = slot("incident-note");
      if (incidentNote) incidentNote.textContent = text;
    } else {
      // Nothing new to hunt today: the one-line note stands in for the incident, and nothing is started.
      const incidentNote = slot("incident-note");
      if (incidentNote && shift.note) {
        incidentNote.textContent = shift.note;
      } else {
        slot("incident-section")?.setAttribute("hidden", "");
      }
    }
    const drillSlot = slot("drill-slot");
    if (drillSlot) {
      const drill = shift.drill;
      const make = drill.kind === "kata"
        ? () => element("hx-kata", { kata: drill.id, mode: "memory", "data-objective": drillSlot.dataset.objective ?? "", "data-module": drillSlot.dataset.module ?? "" })
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
      drill_module: shift.drill.module ?? "",
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
  Promise.all([data(), core()]).then(([doc, core]) => {
    boardSize = Number(doc.board_cards ?? 0);
    const incidents = doc.incidents ?? [];
    const memory = doc.memory_katas ?? [];
    const wiresOf = wiresByModule(core);
    const evidence = store.state.evidence ?? [];
    shift = pickShift({
      incidents,
      memory,
      sayModules: doc.say_modules ?? [],
      started: startedIds(store.state.modules),
      path: core.path ?? [],
      wiresOf,
      done: doneIds(store.state.modules),
      huntDays: lastHuntDays(evidence),
      drillDays: lastDrillDays(evidence),
      lastDrilled: lastDrilledDays(evidence, incidents, memory, wiresOf),
      day,
    });
    if (!built) build();
    render();
  }).catch(() => {
    slot("error")?.removeAttribute("hidden");
  });
  return render;
}
