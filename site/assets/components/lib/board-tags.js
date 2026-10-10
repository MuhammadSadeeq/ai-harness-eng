// Board tags (BP-1.5 §1, D-043): which module plugs onto which spoke of the Turn Clock, the comes-in module of
// each empty spoke, the tag labels of scenario boards, the learner's board and the turn steps. Pure: no DOM, no
// fetch, no store I/O. The Python side (tools/gen_pages.py) derives the same comes-in values.
import { pyjson } from "../../sim/pyjson.js";
import { formatInt, plural } from "./format.js";

/** Scenario board module -> the wire its tag sits on (BP-1.5 §1). */
export const SCENARIO_WIRE = Object.freeze({
  turn_limit: "loop",
  token_budget: "loop",
  loop_detect: "loop",
  close_books: "loop",
  output_cap: "context",
  retry: "errors",
  breaker: "errors",
  permissions: "permissions",
  sandbox: "permissions",
  verify_gate: "verify",
  rules_file: "control",
  redact: "observe",
  // ENGINE A5.4, A6.4, A6.5, A7 (the board labels those amendments give).
  history: "loop",
  first_block_only: "loop",
  compaction: "context",
  cache: "context",
  system_clock: "context",
  validate_inputs: "tools",
  split_results: "tools",
  effort: "control",
});

/** One label per ENGINE §9 event kind (the kinds the engine emits). */
export const EVENT_LABELS = Object.freeze({
  run_start: "run start",
  prompt_built: "prompt built",
  context_check: "context check",
  model_call: "model call",
  model_error: "model error",
  retry_wait: "retry wait",
  recovery_check: "recovery check",
  breaker: "breaker",
  model_reply: "model reply",
  interrupt: "interrupt",
  permission: "permission check",
  sandbox: "sandbox check",
  tool_call: "tool call",
  verify: "verify",
  guard: "guard",
  trace_write: "trace write",
  run_end: "run end",
});

const byId = (course) => Object.fromEntries(course.modules.map((m) => [m.id, m]));

/** The wires in clock order: the order of the spokes, starting at 12 o'clock. */
export function wiresInOrder(course) {
  return [...course.wires].sort((a, b) => a.angle - b.angle);
}

/** Core modules carry a board tag (D-043). Their order is the path order. */
export function taggedModules(course) {
  const modules = byId(course);
  return course.path.map((id) => modules[id]).filter((m) => m?.tag);
}

/** The words a bench panel shows for the history module (ENGINE A5): resent when the request holds the earlier messages. */
export function historyWords(params) {
  return params?.resend === false ? "history not resent" : "history resent";
}

/** The comes-in module of a wire: the first module on the default path whose tag is on that wire (D-043). */
export function comesIn(course, wireId) {
  const modules = byId(course);
  for (const id of course.path) {
    if (modules[id]?.tag?.wire === wireId) return id;
  }
  return null;
}

/** The learner's board: each done core module plugs its tag onto its wire. */
export function learnerBoard(course, doc) {
  const byWire = Object.fromEntries(course.wires.map((w) => [w.id, []]));
  let earned = 0;
  for (const mod of taggedModules(course)) {
    const status = doc?.modules?.[mod.id]?.status ?? "todo";
    if (status !== "done") continue;
    byWire[mod.tag.wire].push({ id: mod.id, label: mod.tag.label, title: mod.title });
    earned += 1;
  }
  return { byWire, earned, total: taggedModules(course).length };
}

/** The module a card belongs to: its id's prefix before the first dash (AUTHORING ids are <module>-c<n>). */
export function cardModule(cardId) {
  return String(cardId).split("-")[0].toUpperCase();
}

/**
 * Cards due by wire. A card counts toward its module's tag wire, or the module's first wire if it has no tag.
 * A card whose prefix is not a course module (lab cards) counts toward no wire.
 */
export function dueByWire(course, cards, today) {
  const modules = byId(course);
  const counts = Object.fromEntries(course.wires.map((w) => [w.id, 0]));
  for (const [cardId, card] of Object.entries(cards || {})) {
    if (!card || typeof card.due !== "string" || card.due > today) continue;
    const mod = modules[cardModule(cardId)];
    const wire = mod?.tag?.wire ?? mod?.wires?.[0] ?? null;
    if (wire && wire in counts) counts[wire] += 1;
  }
  return counts;
}

/** "Not started" or "L1 · can explain" (a tagged module on the wire is done). L2 and L3 come later. */
export function wireLevel(course, wireId, doc) {
  const plugged = learnerBoard(course, doc).byWire[wireId] ?? [];
  return plugged.length > 0 ? "L1 · can explain" : "Not started";
}

/** The tag label of one scenario board module, exactly as BP-1.5 §1 gives it. */
export function tagLabel(name, params) {
  switch (name) {
    case "turn_limit": return `turn limit ${formatInt(params.max_turns)}`;
    case "token_budget": return `budget ${formatInt(params.max_tokens)}`;
    case "loop_detect": return `loop guard ${params.window}`;
    case "close_books": return "close the books";
    case "output_cap": return `output cap ${formatInt(params.max_tokens)}`;
    case "retry": return `retry ×${params.max_attempts}`;
    case "breaker": return `breaker ${params.threshold}`;
    case "permissions": {
      const rules = Array.isArray(params.rules) ? params.rules.length : 0;
      return rules > 0 ? `${plural(rules, "rule")}, ${params.mode} by default` : `${params.mode} by default`;
    }
    case "sandbox": return "sandbox";
    case "verify_gate": return "verify gate";
    case "rules_file": return "rules file";
    case "redact": return "redact";
    // ENGINE A5.4: `history` with resend false is a bug on purpose; with resend true (or absent) it draws nothing.
    case "history": return params.resend === false ? "history not resent" : null;
    case "first_block_only": return "reads the first block only";
    case "compaction": return "compaction";
    case "cache": return "cache-friendly prefix";
    case "system_clock": return "time at the top of the prompt";
    case "validate_inputs": return "schema checks";
    case "split_results": return "results split across messages";
    case "effort": return `effort ${params.level}`;
    default: throw new Error(`unknown board module: ${name}`);
  }
}

/**
 * A harness bug on purpose (ENGINE A5.4, A6.4, A7.2; the fix is removing the module). These tags are drawn with the
 * warning mark and say "bug" in their accessible name.
 */
export function tagIsBug(name, params) {
  if (name === "history") return params.resend === false;
  return name === "first_block_only" || name === "system_clock" || name === "split_results";
}

/** A scenario board's modules on their wires. Throws on a module the map does not know. */
export function scenarioBoard(board) {
  const byWire = {};
  for (const [name, params] of Object.entries(board.modules ?? {})) {
    const wire = SCENARIO_WIRE[name];
    if (!wire) throw new Error(`unknown board module: ${name}`);
    const label = tagLabel(name, params);
    if (label === null) continue; // `history` with resend true draws nothing (ENGINE A5.5c)
    (byWire[wire] ??= []).push({ id: name, label, bug: tagIsBug(name, params) });
  }
  return { byWire, count: Object.keys(board.modules ?? {}).length };
}

/** The modules a new board adds: present on the new board and not on the old one, or with other parameters. */
export function boardChanges(oldBoard, newBoard) {
  const before = oldBoard.modules ?? {};
  const after = newBoard.modules ?? {};
  return Object.keys(after).filter((name) => !(name in before) || pyjson(before[name]) !== pyjson(after[name]));
}

/**
 * One row per wire whose tags differ between two boards (BP-1.5 §1, compare): the labels before and after.
 * Wires come in clock order.
 */
export function boardRows(course, oldBoard, newBoard) {
  const before = scenarioBoard(oldBoard).byWire;
  const after = scenarioBoard(newBoard).byWire;
  const rows = [];
  for (const wire of wiresInOrder(course)) {
    const was = (before[wire.id] ?? []).map((t) => t.label);
    const now = (after[wire.id] ?? []).map((t) => t.label);
    if (was.join("\u0001") === now.join("\u0001")) continue;
    rows.push({ wire, before: was, after: now });
  }
  return rows;
}

/** "Loop: nothing → turn limit 12, budget 60,000" (BP-1.5 §1, compare). */
export function changeText(row) {
  const side = (labels) => (labels.length ? labels.join(", ") : "nothing");
  return `${row.wire.short}: ${side(row.before)} → ${side(row.after)}`;
}

/** The turn number of an event (the run start is turn 0). */
export function turnCount(events) {
  return events.reduce((max, e) => Math.max(max, e.turn), 0);
}

/** The events of one turn, in order. */
export function turnEvents(events, turn) {
  return events.filter((e) => e.turn === turn).sort((a, b) => a.seq - b.seq);
}

/** The words that name one step: "permission check · Permissions". */
export function stepText(event, course) {
  const wire = course.wires.find((w) => w.id === event.wire);
  const kind = EVENT_LABELS[event.kind] ?? event.kind;
  return wire ? `${kind} · ${wire.short}` : kind;
}

/** The tag code drawn on a spoke in narrow boards (the legend carries the full label). */
export const SCENARIO_CODE = Object.freeze({
  turn_limit: "TL", token_budget: "TB", loop_detect: "LD", close_books: "CB", output_cap: "OC", retry: "RT",
  breaker: "BR", permissions: "PM", sandbox: "SB", verify_gate: "VG", rules_file: "RF", redact: "RD",
  history: "HR", first_block_only: "FB", compaction: "CP", cache: "CA", system_clock: "SC", validate_inputs: "VI",
  split_results: "SR", effort: "EF",
});

/** The name of each scenario module, for the key that explains a code ("TL turn limit"). */
export const SCENARIO_NAME = Object.freeze({
  turn_limit: "turn limit",
  token_budget: "token budget",
  loop_detect: "loop guard",
  close_books: "close the books",
  output_cap: "output cap",
  retry: "retry",
  breaker: "breaker",
  permissions: "permissions",
  sandbox: "sandbox",
  verify_gate: "verify gate",
  rules_file: "rules file",
  redact: "redact",
  history: "history",
  first_block_only: "first block only",
  compaction: "compaction",
  cache: "cache",
  system_clock: "system clock",
  validate_inputs: "input checks",
  split_results: "split results",
  effort: "effort",
});

/** The title of the module that comes in on a wire, from course.json ("Permissions" for C9). */
export function comesInTitle(course, wireId) {
  const id = comesIn(course, wireId);
  return course.modules.find((m) => m.id === id)?.title ?? "";
}
