// Event text for the replay: one Friendly sentence per trace event (shown on the event),
// a story line for the transcript, and the glyph that marks each event kind (DESIGN §4.2).
import { WIRES } from "./data.js";
import { fmtInt, shorten } from "./common.js";

export const WIRE_BY_ID = Object.fromEntries(WIRES.map((w) => [w.id, w]));

const DECISION = { allow: "allowed", ask: "asked about", deny: "denied" };
const DECISION_INNER = { allow: "permAllow", ask: "permAsk", deny: "permDeny" };

function phrase(toolUse) {
  const input = toolUse.input || {};
  switch (toolUse.name) {
    case "read_file": return `read ${input.path}`;
    case "edit_file": return `edit ${input.path}`;
    case "run_command": return `run “${input.cmd}”`;
    default: return `use ${toolUse.name}`;
  }
}

/** The plain sentence shown on the event itself (addendum: explanations sit on the event). */
export function friendly(event) {
  switch (event.kind) {
    case "run_start":
      return `The run starts. The task: “${event.task}”.`;
    case "prompt_built":
      return `Turn ${event.turn}: the model reads a prompt of ${fmtInt(event.tokens)} tokens, made of ${event.layers.join(", ")}.`;
    case "model_call":
      return `The model is called with ${fmtInt(event.tokens_in)} input tokens.`;
    case "model_reply": {
      const said = event.text ? `The model said “${event.text}”` : "The model replied";
      return event.tool_use ? `${said} and asked to ${phrase(event.tool_use)}.` : `${said}.`;
    }
    case "permission":
      return `Permission check: ${event.tool} is ${DECISION[event.decision] || event.decision}, because “${event.rule}”.`;
    case "tool_call":
      return `${event.ok ? "The tool ran" : "The tool failed"} and returned: ${shorten(event.output, 110)}`;
    case "interrupt":
      return `A person pressed stop. The trace says: “${event.note}”.`;
    case "run_end":
      return `The run ends with status “${event.status}” after ${event.turns} turns, at ≈ ${Number(event.cost).toFixed(3)} units.`;
    default:
      return `${event.kind} on ${event.wire}.`;
  }
}

/** Glyph for an event: the wire's glyph for most kinds, with a filled or inner mark where DESIGN says so. */
export function eventIcon(event) {
  switch (event.kind) {
    case "run_start": return { names: ["play"] };
    case "run_end": return { names: ["flag"], fill: event.status === "done" };
    case "prompt_built": return { names: ["layers"] };
    case "model_call": return { names: ["box"] };
    case "model_reply": return { names: ["box"], fill: true };
    case "permission": return { names: ["diamond", DECISION_INNER[event.decision] || "permAsk"] };
    case "tool_call": return { names: event.ok ? ["hexagon"] : ["hexagon", "slash"] };
    case "interrupt": return { names: ["pause"] };
    default: return { names: ["bang"] };
  }
}

/** Keys that are shown in the Fields view (everything except the common header and the wire JSON). */
export const HEADER_KEYS = ["v", "run", "seq", "t", "turn", "agent", "kind", "wire"];

/** Repetition cue: the first turn at which the same tool was called with the same input. */
export function repeatMap(trace) {
  const first = new Map();
  const seen = new Map();
  trace.forEach((event, index) => {
    if (event.kind !== "tool_call") return;
    const key = `${event.tool}:${JSON.stringify(event.input)}`;
    if (first.has(key)) seen.set(index, first.get(key));
    else first.set(key, event.turn);
  });
  return seen;
}
