// Patch Bay (D1): data and derived numbers. Everything shown comes from the fixture or from
// these functions; nothing is typed in as a result.
import { FIXTURE } from "../shared/fixture.js";

export const TRACE = FIXTURE.trace;
export const LAST = TRACE.length - 1;
export const T_MAX = 66; // timeline end in virtual seconds (trace ends at about 65 s)
export const CONTEXT_WINDOW = 8000;

// Wire metadata: ids, order, names, questions and laws copied from course.json → wires.
export const WIRES = [
  { id: "control", n: 1, name: "Control plane", short: "Control", glyph: "layers",
    question: "What is the model told, and which instruction wins?", law: "Words guide, code enforces.",
    later: "C1 · control" },
  { id: "context", n: 2, name: "Context & memory", short: "Context", glyph: "window",
    question: "What is on the desk this call, and what is saved?", law: "The smallest window that works." },
  { id: "loop", n: 3, name: "Loop & state", short: "Loop", glyph: "cycle",
    question: "What happens next, what do we carry, when do we stop?", law: "Every run needs more than one exit." },
  { id: "errors", n: 4, name: "Errors & recovery", short: "Errors", glyph: "zigzag",
    question: "When something fails, how do we continue without spinning?", law: "Errors are the main path.",
    later: "C6 · errors" },
  { id: "tools", n: 5, name: "Tools", short: "Tools", glyph: "hexagon",
    question: "What can the model do, and is each tool easy to use?", law: "A tool is a user interface for a model.",
    later: "B1 · tools" },
  { id: "permissions", n: 6, name: "Permissions & sandbox", short: "Permissions", glyph: "diamond",
    question: "Which actions are allowed, and how bad can a mistake get?", law: "Judge the action and its target.",
    later: "C9 · permissions" },
  { id: "verify", n: 7, name: "Verification & evals", short: "Verification", glyph: "shield",
    question: "How do we know it's really done, and did the change help?", law: "“Done” is a claim.",
    later: "C11 · verify" },
  { id: "observe", n: 8, name: "Observability", short: "Observability", glyph: "eye",
    question: "What exactly happened, and where did time and money go?", law: "If it isn't in the trace, it didn't happen.",
    later: "C12 · observe" },
];
export const WIRE_BY_ID = Object.fromEntries(WIRES.map((w) => [w.id, w]));

export function fmt(n) {
  return Number(n).toLocaleString("en-US");
}
export function units(c) {
  return c.toFixed(3);
}

// Glyph for an event (DESIGN §4.2 mapping; variants by status, decision and ok).
export function glyphFor(e) {
  switch (e.kind) {
    case "run_start": return "play";
    case "run_end": return e.status === "done" ? "flag-filled" : "flag";
    case "prompt_built": return "layers";
    case "model_call": return "box";
    case "model_reply": return "box-filled";
    case "tool_call": return e.ok ? "hexagon" : "hexagon-fail";
    case "permission":
      if (e.decision === "ask") return "permission-ask";
      if (e.decision === "deny") return "permission-deny";
      return "permission-allow";
    case "interrupt": return "pause";
    case "verify": return e.ok ? "shield-pass" : "shield-fail";
    case "compaction": return "squeeze";
    case "cache": return "cache-read";
    default: return "diamond";
  }
}

function askFor(toolUse) {
  if (!toolUse) return "ended its turn";
  const input = toolUse.input || {};
  switch (toolUse.name) {
    case "read_file": return `asked to read ${input.path}`;
    case "edit_file": return `asked to edit ${input.path}`;
    case "run_command": return `asked to run “${input.cmd}”`;
    default: return `asked to use ${toolUse.name}`;
  }
}

// One plain sentence for the event (the Friendly view).
export function friendly(e) {
  switch (e.kind) {
    case "run_start": return `The run starts. Task: “${e.task}”.`;
    case "prompt_built": return `The loop packs the desk: ${fmt(e.tokens)} tokens of ${e.layers.join(", ")}.`;
    case "model_call": return `Sends the desk to the model: ${fmt(e.tokens_in)} tokens in.`;
    case "model_reply": return `The model said “${e.text}” and ${askFor(e.tool_use)}.`;
    case "permission": return `Rule “${e.rule}”: ${e.decision} ${e.tool}.`;
    case "tool_call": return e.ok ? `${e.tool} ran and returned: ${e.output}` : `${e.tool} failed: ${e.output}`;
    case "interrupt": return e.note ? `${e.note}.` : "A person pressed stop.";
    case "run_end": return `The run ended (${e.status}): ${e.turns} turns, ≈ ${units(e.cost)} units.`;
    default: return e.kind;
  }
}

// Short row label for the tape log and the lanes.
export function summary(e) {
  switch (e.kind) {
    case "run_start": return "run starts";
    case "prompt_built": return `prompt · ${fmt(e.tokens)} tokens`;
    case "model_call": return `model call · ${fmt(e.tokens_in)} in`;
    case "model_reply": return `model reply · ${e.tool_use ? e.tool_use.name : "end"}`;
    case "permission": return `permission · ${e.decision} ${e.tool}`;
    case "tool_call": return `${e.tool} · ${e.ok ? "ok" : "failed"}`;
    case "interrupt": return "stop pressed";
    case "run_end": return `run ends · ${e.status}`;
    default: return e.kind;
  }
}

// Repeated action: a tool_call with the same tool and input as an earlier one.
export const REPEATS = (() => {
  const seen = new Map();
  const out = new Map();
  for (const e of TRACE) {
    if (e.kind !== "tool_call") continue;
    const key = `${e.tool}|${JSON.stringify(e.input)}`;
    if (seen.has(key)) out.set(e.seq, seen.get(key));
    else seen.set(key, e);
  }
  return out; // seq -> earlier event
})();

export function repeatCue(e) {
  const earlier = REPEATS.get(e.seq);
  return earlier ? `seen at turn ${earlier.turn}` : null;
}

// Context and cost at event index i (latest values at or before i).
export function stateAt(i) {
  let tokens = 0;
  let cost = 0;
  let costSeq = -1;
  for (let k = 0; k <= i; k += 1) {
    const e = TRACE[k];
    if (e.kind === "prompt_built") tokens = e.tokens;
    if (e.kind === "model_reply") { cost = e.cost; costSeq = e.seq; }
  }
  return { tokens, pct: tokens / CONTEXT_WINDOW, cost, costSeq, turn: TRACE[i].turn, t: TRACE[i].t };
}

// Bench: old and new boards on the same 20 seeds.
export const OLD = FIXTURE.bench.old;
export const NEW = FIXTURE.bench.new;
export function boardStats(trials) {
  const costs = trials.map((t) => t.cost);
  return {
    n: trials.length,
    passes: trials.filter((t) => t.passed).length,
    worstTurns: Math.max(...trials.map((t) => t.turns)),
    worstCost: Math.max(...costs),
    meanCost: costs.reduce((a, b) => a + b, 0) / costs.length,
  };
}
export const STATS_OLD = boardStats(OLD);
export const STATS_NEW = boardStats(NEW);
export const SAME_PASSING_SEEDS = (() => {
  const a = OLD.filter((t) => t.passed).map((t) => t.seed).sort().join(",");
  const b = NEW.filter((t) => t.passed).map((t) => t.seed).sort().join(",");
  return a === b;
})();
export const COST_RATIO = STATS_OLD.worstCost / STATS_NEW.worstCost;
export const COST_RATIO_WHOLE = Math.round(COST_RATIO);

export function statusWord(s) {
  return { done: "done", interrupted: "interrupted", max_turns: "stopped at the limit" }[s] || s;
}
export function statusGlyph(s) {
  return { done: "check", interrupted: "cross", max_turns: "bang" }[s] || "bang";
}

// Histogram of values into bins [edges[k], edges[k+1]).
export function histogram(values, edges) {
  const counts = new Array(edges.length - 1).fill(0);
  for (const v of values) {
    for (let k = 0; k < counts.length; k += 1) {
      if (v >= edges[k] && (v < edges[k + 1] || k === counts.length - 1)) { counts[k] += 1; break; }
    }
  }
  return counts;
}
export const TURN_EDGES = Array.from({ length: 25 }, (_, k) => k * 2); // 0..48 turns
export const COST_EDGES = Array.from({ length: 14 }, (_, k) => Number((k * 0.1).toFixed(1))); // 0..1.3

// Par puzzle, recomputed from the new board's trials and the cost table.
export const COST_BY_TURNS = FIXTURE.puzzle.cost_by_turns;
export const LIMIT_MIN = FIXTURE.puzzle.limit_range[0];
export const LIMIT_MAX = FIXTURE.puzzle.limit_range[1];
export const FIXES_BASELINE = NEW.filter((t) => t.fixes).length;
export function puzzleAt(limit) {
  let passes = 0;
  let worst = 0;
  for (const t of NEW) {
    const pass = t.fixes && t.needs <= limit;
    if (pass) passes += 1;
    const turns = pass ? t.needs : limit;
    worst = Math.max(worst, COST_BY_TURNS[String(turns)]);
  }
  return { limit, passes, lost: FIXES_BASELINE - passes, worst };
}
export const CURVE = Array.from({ length: LIMIT_MAX - LIMIT_MIN + 1 }, (_, k) => puzzleAt(LIMIT_MIN + k));
export const PAR = (() => {
  const ok = CURVE.filter((p) => p.lost === 0);
  return ok.reduce((best, p) => (p.worst < best.worst ? p : best), ok[0]);
})();
export const PAR_LIMIT = PAR.limit;
export const PAR_FROM_FIXTURE = FIXTURE.puzzle.par.limit;

// The incident and the run's outcome, from the fixture.
export const INCIDENT = FIXTURE.incident;
export const RUN_END = TRACE[LAST];
export function outcomeLine() {
  const e = RUN_END;
  if (e.status === "done") return `It stopped on its own: ${e.turns} turns, ≈ ${units(e.cost)} units.`;
  return `It never stopped on its own: ${e.turns} turns, ≈ ${units(e.cost)} units, until a person pressed stop.`;
}
