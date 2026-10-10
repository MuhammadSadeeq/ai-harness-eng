// Board tags (BP-1.5 §1, D-043): which module plugs onto which spoke of the Turn Clock, the comes-in module of
// each empty spoke, the tag labels of scenario boards, the learner's board and the turn steps. Pure: no DOM, no
// fetch, no store I/O. The Python side (tools/gen_pages.py) derives the same comes-in values.
import { pyjson } from "../../sim/pyjson.js";

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

/** Thousands separators, as in "60,000". */
export function groupThousands(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

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

/** Cards due by wire. A card counts toward its module's tag wire, or the module's first wire if it has no tag. */
export function dueByWire(course, cards, today) {
  const modules = byId(course);
  const counts = Object.fromEntries(course.wires.map((w) => [w.id, 0]));
  for (const card of Object.values(cards || {})) {
    if (!card || typeof card.due !== "string" || card.due > today) continue;
    const mod = modules[card.module];
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
    case "turn_limit": return `turn limit ${groupThousands(params.max_turns)}`;
    case "token_budget": return `budget ${groupThousands(params.max_tokens)}`;
    case "loop_detect": return `loop guard ${params.window}`;
    case "close_books": return "close the books";
    case "output_cap": return `output cap ${groupThousands(params.max_tokens)}`;
    case "retry": return `retry ×${params.max_attempts}`;
    case "breaker": return `breaker ${params.threshold}`;
    case "permissions": return `${params.mode} by default`;
    case "sandbox": return "sandbox";
    case "verify_gate": return "verify gate";
    case "rules_file": return "rules file";
    case "redact": return "redact";
    default: throw new Error(`unknown board module: ${name}`);
  }
}

/** A scenario board's modules on their wires. Throws on a module the map does not know. */
export function scenarioBoard(board) {
  const byWire = {};
  for (const [name, params] of Object.entries(board.modules ?? {})) {
    const wire = SCENARIO_WIRE[name];
    if (!wire) throw new Error(`unknown board module: ${name}`);
    (byWire[wire] ??= []).push({ id: name, label: tagLabel(name, params) });
  }
  return { byWire, count: Object.keys(board.modules ?? {}).length };
}

/** The modules a new board adds: present on the new board and not on the old one, or with other parameters. */
export function boardChanges(oldBoard, newBoard) {
  const before = oldBoard.modules ?? {};
  const after = newBoard.modules ?? {};
  return Object.keys(after).filter((name) => !(name in before) || pyjson(before[name]) !== pyjson(after[name]));
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
});
