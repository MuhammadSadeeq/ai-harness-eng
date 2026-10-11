// Readiness (BP-5.2 §2, SPEC §6.4): each wire's level, from the course and the store's evidence. Pure: no DOM, so the
// tests run under node. The rules are the blueprint's. The edges it leaves open are rulings, marked "Ruling" below.
import { formatDay } from "../../core/shell/pure.js";
import { formatInt } from "./format.js";

export const LEVEL_WORDS = ["not started", "can explain", "have built", "can defend with data"];

/** An entry earned objective credit: its objectives list is not empty. Ruling: "credited" means exactly this. */
const credited = (entry) => Array.isArray(entry.objectives) && entry.objectives.length > 0;

/** A passing kata or step with credit (the blueprint's "passing kata or step (an evidence entry with objectives)"). */
const passes = (entry) =>
  credited(entry)
  && ((entry.kind === "kata" && entry.detail?.passed === true) || (entry.kind === "step" && entry.detail?.match === true));

/** The trial count of a bench side (its Stats.n), or null when the entry does not carry one. */
const trialCount = (stats) => (Number.isFinite(stats?.n) ? stats.n : null);

/** The latest `at` of the entries that name a module ("" if none): the date a row shows. */
export function lastAt(evidence, moduleId) {
  let latest = "";
  for (const entry of evidence) {
    if (entry.module === moduleId && typeof entry.at === "string" && entry.at > latest) latest = entry.at;
  }
  return latest;
}

/**
 * The modules whose objectives all carry credit: the same credit a module page counts (shell/progress.js). Ruling: an
 * entry credits the module its `module` field names, and a module with no objectives is never explained.
 */
/** "an" before a wire name that starts with a vowel sound (Errors, Observability), else "a". */
const article = (word) => (/^[AEIOU]/.test(word) ? "an" : "a");

export function explainedModules(course, evidence) {
  const seen = new Map();
  for (const entry of evidence) {
    if (typeof entry?.module !== "string") continue;
    const set = seen.get(entry.module) ?? new Set();
    for (const id of Array.isArray(entry.objectives) ? entry.objectives : []) set.add(id);
    seen.set(entry.module, set);
  }
  const explained = new Set();
  for (const mod of course.modules) {
    const ids = (mod.objectives ?? []).map((objective) => objective.id);
    const have = seen.get(mod.id) ?? new Set();
    if (ids.length > 0 && ids.every((id) => have.has(id))) explained.add(mod.id);
  }
  return explained;
}

/** The next step a wire needs, in the course's voice. */
export function nextStep(short, level, builtCount) {
  if (level === 0) return builtCount === 0 ? `No built module teaches ${short} yet.` : `Explain every ${short} module.`;
  if (level === 1) return `Pass one kata or step on ${article(short)} ${short} module.`;
  if (level === 2) return `Run ${article(short)} ${short} bench or par experiment, or finish a design drill.`;
  return `${short} has reached L3.`;
}

/**
 * One wire's level and the evidence behind it. L1 (can explain): every built module on the wire is explained, and there
 * is at least one. L2 (have built): L1, and a passing kata or step on a module of the wire. L3 (can defend with data):
 * L2, and a credited bench or par on a module of the wire, or a credited design drill (design counts for every wire).
 * Ruling: a kata or step counts when it is on any module of the wire, built or not, since only a page can make one.
 */
export function wireReadiness(course, built, evidence, explained, wire) {
  const modules = course.modules.filter((mod) => (mod.wires ?? []).includes(wire.id));
  const onWire = new Set(modules.map((mod) => mod.id));
  const builtHere = modules.filter((mod) => built.has(mod.id));
  const explainedBuilt = builtHere.filter((mod) => explained.has(mod.id));
  const passing = evidence.filter((entry) => onWire.has(entry.module) && passes(entry));
  const defend = evidence.filter((entry) => credited(entry)
    && (((entry.kind === "bench" || entry.kind === "par") && onWire.has(entry.module)) || entry.kind === "design"));
  const l1 = builtHere.length > 0 && explainedBuilt.length === builtHere.length;
  const l2 = l1 && passing.length > 0;
  const l3 = l2 && defend.length > 0;
  const level = l3 ? 3 : l2 ? 2 : l1 ? 1 : 0;
  return {
    id: wire.id,
    name: wire.name,
    short: wire.short,
    glyph: wire.glyph,
    level,
    word: LEVEL_WORDS[level],
    next: nextStep(wire.short, level, builtHere.length),
    lines: [
      builtHere.length === 0
        ? "L1: no built module on this wire yet"
        : `L1: ${formatInt(explainedBuilt.length)} of ${formatInt(builtHere.length)} modules explained`,
      `L2: ${formatInt(passing.length)} kata or step passed`,
      `L3: ${formatInt(defend.length)} experiments or design drills`,
    ],
    entries: {
      explained: explainedBuilt.map((mod) => ({ kind: "explained", module: mod.id, title: mod.title, at: lastAt(evidence, mod.id) })),
      passing: passing.map((entry) => ({ kind: entry.kind, module: entry.module, at: entry.at ?? "", detail: entry.detail ?? {} })),
      defend: defend.map((entry) => ({ kind: entry.kind, module: entry.module, at: entry.at ?? "", detail: entry.detail ?? {} })),
    },
  };
}

/**
 * The one-line summary: the strongest wire, and the next step on the weakest (ties go to the first in turn order).
 * Nothing explained yet reads differently. Ruling: a course with every wire at L3 says so.
 */
export function summarize(wires) {
  const top = wires.reduce((best, wire) => (wire.level > best.level ? wire : best), wires[0]);
  const low = wires.reduce((worst, wire) => (wire.level < worst.level ? wire : worst), wires[0]);
  if (low.level === 3) return "Every wire is at L3.";
  if (top.level === 0) return `Nothing explained yet. Next step: ${low.next}`;
  return `Strongest: ${top.short} (L${top.level}). Next step: ${low.next}`;
}

/** The whole model: the levels per wire in turn order, the explained modules, and the summary line. */
export function readiness(course, core, evidence) {
  const built = new Set(core.modules.filter((mod) => mod.built).map((mod) => mod.id));
  const explained = explainedModules(course, evidence);
  const wires = course.wires.map((wire) => wireReadiness(course, built, evidence, explained, wire));
  return { wires, explained, summary: summarize(wires) };
}

export const REASON_MAX = 140;

/**
 * A learner's lowered level for one wire (BP-5.4 §5, I2.o2): at most the evidence level, never above it, with a
 * reason of one line. Throws with the rule that failed, so the control can say why.
 */
export function adjustment(evidenceLevel, chosen, reason) {
  if (!Number.isInteger(chosen) || chosen < 0 || chosen > evidenceLevel) {
    throw new Error(`A level can only be lowered: choose L0 to L${evidenceLevel}.`);
  }
  const text = String(reason ?? "").trim();
  if (text === "" || /[\r\n]/.test(text) || text.length > REASON_MAX) {
    throw new Error(`Give one line of reason, up to ${REASON_MAX} characters.`);
  }
  return { level: chosen, reason: text };
}

/**
 * The level a wire shows: its evidence level, or the learner's lower level when that is valid for the evidence.
 * A stored level above the evidence, or without a reason, is ignored: adjustments never raise a level.
 */
export function shownLevel(wire, adjustments) {
  const a = adjustments?.[wire.id];
  const valid = a && Number.isInteger(a.level) && a.level >= 0 && a.level < wire.level
    && typeof a.reason === "string" && a.reason.trim() !== "" && !/[\r\n]/.test(a.reason);
  if (!valid) return { level: wire.level, adjusted: false, reason: "" };
  return { level: a.level, adjusted: true, reason: a.reason.trim() };
}

/**
 * The brag sheet's figures: the levels, the modules explained, katas and steps passed, bench results (old and new pass
 * counts) and design drills (ticked of total), and the date. Ruling: katas and steps count every passing entry, credited
 * or not, because the sheet reports what was done.
 */
export function bragData(course, model, evidence, name, todayIso, adjustments = {}) {
  const titles = course.modules.filter((mod) => model.explained.has(mod.id)).map((mod) => ({ id: mod.id, title: mod.title }));
  return {
    name,
    date: formatDay(todayIso),
    levels: model.wires.map((wire) => {
      const shown = shownLevel(wire, adjustments);
      return {
        short: wire.short,
        evidence: wire.level,
        level: shown.level,
        word: LEVEL_WORDS[shown.level],
        adjusted: shown.adjusted,
        reason: shown.reason,
      };
    }),
    explained: titles,
    katasPassed: evidence.filter((entry) => entry.kind === "kata" && entry.detail?.passed === true).length,
    stepsPassed: evidence.filter((entry) => entry.kind === "step" && entry.detail?.match === true).length,
    benches: evidence
      .filter((entry) => entry.kind === "bench" && Number.isFinite(entry.detail?.old_passed) && Number.isFinite(entry.detail?.new_passed))
      .map((entry) => ({
        module: entry.module ?? "",
        before: { passed: entry.detail.old_passed, n: trialCount(entry.detail.old) },
        after: { passed: entry.detail.new_passed, n: trialCount(entry.detail.new) },
      })),
    designs: evidence
      .filter((entry) => entry.kind === "design" && Number.isFinite(entry.detail?.ticked) && Number.isFinite(entry.detail?.total))
      .map((entry) => ({ item: entry.detail.item ?? "", ticked: entry.detail.ticked, total: entry.detail.total })),
  };
}
