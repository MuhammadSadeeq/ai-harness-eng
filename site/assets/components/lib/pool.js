// The learner's pool (D-062): the modules a learner has started or finished, the fallback pool for a new learner, and
// the order of fresh cards and new say prompts (round-robin by wire, seeded per day). Pure: no DOM, no I/O. The shift,
// the board (hx-cards src="board") and the question bank (hx-say src="bank") use these, so they draw from one pool.
import { seedOf, shuffle } from "./leitner.js";

/** Module ids the learner has started or finished: a visit or any evidence starts a module (shell/progress.js). */
export function startedIds(modules) {
  return new Set(Object.entries(modules ?? {})
    .filter(([, mod]) => mod?.status === "started" || mod?.status === "done")
    .map(([id]) => id));
}

/** Module ids the learner has finished (status done). */
export function doneIds(modules) {
  return new Set(Object.entries(modules ?? {}).filter(([, mod]) => mod?.status === "done").map(([id]) => id));
}

/** D-062: the pool is the started modules; with none, the first path module that has an incident (a new learner's). */
export function poolOf(started, path, incidentModules) {
  if (started.size > 0) return new Set(started);
  const first = path.find((id) => incidentModules.includes(id)) ?? incidentModules[0];
  return new Set(first === undefined ? [] : [first]);
}

/** A Map from each module id in course-core to its wire ids. */
export function wiresByModule(core) {
  return new Map((core.modules ?? []).map((mod) => [mod.id, mod.wires ?? []]));
}

/**
 * The ids in round-robin order by wire: each wire's ids in a seeded order for the day, the wires in a seeded order,
 * then one id from each wire in turn. `wireOf(id)` gives an id's wire ("" when it has none).
 */
export function orderFresh(ids, { wireOf, day }) {
  const groups = new Map();
  for (const id of ids) {
    const wire = wireOf(id) ?? "";
    if (!groups.has(wire)) groups.set(wire, []);
    groups.get(wire).push(id);
  }
  const wires = shuffle([...groups.keys()].sort(), seedOf(`${day}/wires`));
  const lists = wires.map((wire) => shuffle(groups.get(wire), seedOf(`${day}/${wire}`)));
  const longest = Math.max(0, ...lists.map((list) => list.length));
  const out = [];
  for (let i = 0; i < longest; i += 1) {
    for (const list of lists) if (i < list.length) out.push(list[i]);
  }
  return out;
}

/** The board's fresh cards (ids in order) from the pool's modules; `cards` are the board's cards in board order. */
export function boardFreshOrder({ cards, course, incidentModules, modules }, day) {
  const pool = poolOf(startedIds(modules), course.path ?? [], incidentModules);
  const wires = wiresByModule(course);
  const moduleOf = new Map(cards.map((card) => [card.id, card.module]));
  const inPool = cards.filter((card) => pool.has(card.module)).map((card) => card.id);
  return orderFresh(inPool, { wireOf: (id) => (wires.get(moduleOf.get(id)) ?? [])[0], day });
}

/** The question bank's fresh prompts (ids in order) from the pool's modules; each prompt has its own wire. */
export function promptFreshOrder(prompts, { path, incidentModules, modules }, day) {
  const pool = poolOf(startedIds(modules), path ?? [], incidentModules);
  const wireOf = new Map(prompts.map((prompt) => [prompt.id, prompt.wire]));
  const inPool = prompts.filter((prompt) => pool.has(prompt.module)).map((prompt) => prompt.id);
  return orderFresh(inPool, { wireOf: (id) => wireOf.get(id), day });
}
