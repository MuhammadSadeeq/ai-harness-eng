// Night Shift (D3): shared data, glyphs and helpers. Plain ES module, no dependencies.
// The data comes from the shared fixture; the wire names, questions and laws are copied
// from course.json (the prototype is served from site/, which cannot read the repo root).

import { FIXTURE } from "../shared/fixture.js";

export const DATA = FIXTURE;
export const EVENTS = DATA.trace;
export const LAST_INDEX = EVENTS.length - 1;
export const T_MAX = EVENTS[LAST_INDEX].t;
export const CONTEXT_WINDOW = 8000;
export const PAR_SECONDS = 60;
export const LIMIT_MIN = DATA.puzzle.limit_range[0];
export const LIMIT_MAX = DATA.puzzle.limit_range[1];
export const PAR_LIMIT = DATA.puzzle.par.limit;
export const PAR_TRIES = 3;
export const STORE_KEY = "d3.night-shift";

// Wires in turn order (DESIGN §3). Colours are the Night Shift palette (direction brief).
export const WIRES = [
  {
    id: "control", name: "Control plane", short: "Control", glyph: "layers", color: "#E69F00",
    question: "What is the model told, and which instruction wins?",
    law: "Words guide, code enforces.",
  },
  {
    id: "context", name: "Context & memory", short: "Context", glyph: "window", color: "#56B4E9",
    question: "What is on the desk this call, and what is saved?",
    law: "The smallest window that works.",
  },
  {
    id: "loop", name: "Loop & state", short: "Loop", glyph: "cycle", color: "#0072B2",
    question: "What happens next, what do we carry, when do we stop?",
    law: "Every run needs more than one exit.",
  },
  {
    id: "errors", name: "Errors & recovery", short: "Errors", glyph: "zigzag", color: "#D55E00",
    question: "When something fails, how do we continue without spinning?",
    law: "Errors are the main path.",
  },
  {
    id: "tools", name: "Tools", short: "Tools", glyph: "hexagon", color: "#F0E442",
    question: "What can the model do, and is each tool easy to use?",
    law: "A tool is a user interface for a model.",
  },
  {
    id: "permissions", name: "Permissions & sandbox", short: "Permissions", glyph: "diamond",
    color: "#CC79A7",
    question: "Which actions are allowed, and how bad can a mistake get?",
    law: "Judge the action and its target.",
  },
  {
    id: "verify", name: "Verification & evals", short: "Verification", glyph: "shield",
    color: "#C9CED6",
    question: "How do we know it's really done, and did the change help?",
    law: "“Done” is a claim.",
  },
  {
    id: "observe", name: "Observability", short: "Observability", glyph: "eye", color: "#009E73",
    question: "What exactly happened, and where did time and money go?",
    law: "If it isn't in the trace, it didn't happen.",
  },
];
export const WIRE = Object.fromEntries(WIRES.map((w) => [w.id, w]));

// Glyph path data from DESIGN §4 (viewBox 0 0 24 24). Shapes are reused, styled here.
const PATHS = {
  layers: ["M4 6h16M6.5 12h11M9 18h6"],
  window: ["M8 4H5v16h3M16 4h3v16h-3M9.5 13h5M9.5 16.5h5"],
  cycle: ["M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.2h-4.2"],
  zigzag: ["M2.5 12l3-6 3.6 12 3.8-12 3.6 12 3-6"],
  hexagon: [
    "M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z",
    "M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 1 0 0-5.6",
  ],
  diamond: ["M12 2.8l9.2 9.2-9.2 9.2L2.8 12z"],
  shield: [
    "M12 2.8l7.5 3v5.6c0 4.6-3.1 8.1-7.5 10-4.4-1.9-7.5-5.4-7.5-10V5.8z",
    "M8.6 12.2l2.4 2.4 4.4-4.8",
  ],
  eye: [
    "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z",
    "M12 9.3a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 1 0 0-5.4",
  ],
  play: ["M8 5.5l11 6.5-11 6.5z"],
  flag: ["M5.5 21V4h11l-2.2 4.2 2.2 4.3H5.5"],
  box: ["M5 7h14a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H5a2.5 2.5 0 0 1-2.5-2.5v-5A2.5 2.5 0 0 1 5 7z"],
  pause: ["M8.5 5v14M15.5 5v14"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  cross: ["M6.5 6.5l11 11M17.5 6.5l-11 11"],
  bang: ["M12 4.5v10M12 19v.5"],
  slash: ["M5 19L19 5"],
  allow: ["M8.8 12.2l2.2 2.2 4.2-4.6"],
  ask: ["M10 9.8a2 2 0 1 1 2.8 1.9c-.6.3-.8.8-.8 1.4M12 16.2v.1"],
  deny: ["M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"],
  "shield-fail": ["M9.2 9.6l5.6 5.6M14.8 9.6l-5.6 5.6"],
  "prog-0": ["M12 5a7 7 0 1 0 0 14 7 7 0 1 0 0-14z"],
  "prog-1": ["M12 5a7 7 0 1 0 0 14 7 7 0 1 0 0-14z", "M12 5a7 7 0 0 1 0 14z"],
  "prog-2": ["M12 5a7 7 0 1 0 0 14 7 7 0 1 0 0-14z"],
};
const FILLED = new Set(["prog-2"]);

// Inline SVG for a glyph. `filled` fills the shape; `extra` adds extra path data.
export function glyph(name, { size = 18, filled = false, extra = [], label = "" } = {}) {
  const paths = [...(PATHS[name] ?? []), ...extra];
  const fill = filled || FILLED.has(name) ? "currentColor" : "none";
  const body = paths.map((d) => `<path d="${d}"/>`).join("");
  const aria = label ? ` role="img" aria-label="${esc(label)}"` : ' aria-hidden="true" focusable="false"';
  return `<svg class="glyph" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${aria}>${body}</svg>`;
}

// The glyph for one trace event (DESIGN §4.2). Filled `flag` on done; `box` filled on reply.
export function eventGlyph(ev, size = 18) {
  switch (ev.kind) {
    case "run_start":
      return glyph("play", { size });
    case "run_end":
      return glyph("flag", { size, filled: ev.status === "done" });
    case "prompt_built":
      return glyph("layers", { size });
    case "model_call":
      return glyph("box", { size });
    case "model_reply":
      return glyph("box", { size, filled: true });
    case "permission": {
      const inner = ev.decision === "allow" ? "allow" : ev.decision === "deny" ? "deny" : "ask";
      const mark = { allow: PATHS.allow, deny: PATHS.deny, ask: PATHS.ask }[inner];
      return glyph("diamond", { size, extra: mark });
    }
    case "tool_call":
      return glyph("hexagon", { size, extra: ev.ok === false ? PATHS.slash : [] });
    case "interrupt":
      return glyph("pause", { size });
    default:
      return glyph("bang", { size });
  }
}

export function wireGlyph(id, size = 18) {
  return glyph(WIRE[id].glyph, { size });
}

// --- trace helpers -------------------------------------------------------------------

// Per-event metadata: turn, latest prompt tokens, latest cumulative cost, repeats.
export const META = (() => {
  const out = [];
  let tokens = 0;
  let cost = 0;
  const seen = new Map();
  EVENTS.forEach((ev, i) => {
    if (ev.kind === "prompt_built") tokens = ev.tokens;
    if (ev.kind === "model_reply") cost = ev.cost;
    let repeatOfTurn = null;
    if (ev.kind === "tool_call") {
      const key = `${ev.tool}|${JSON.stringify(ev.input)}`;
      if (seen.has(key)) repeatOfTurn = seen.get(key);
      else seen.set(key, ev.turn);
    }
    out.push({ index: i, turn: ev.turn, tokens, cost, repeatOfTurn });
  });
  return out;
})();

export function contextPct(i) {
  return Math.round((META[i].tokens / CONTEXT_WINDOW) * 100);
}

export function costAt(i) {
  return META[i].cost;
}

export function visibleIndices(filter) {
  return EVENTS.flatMap((ev, i) => (!filter || ev.wire === filter ? [i] : []));
}

// Next index in a visible set, starting from `from` (-1 = before the first).
export function stepIndex(current, dir, visible) {
  if (visible.length === 0) return current;
  if (dir > 0) {
    const next = visible.find((i) => i > current);
    return next ?? current;
  }
  const prev = [...visible].reverse().find((i) => i < current);
  return prev ?? current;
}

export function describeTool(use) {
  if (!use) return "";
  const input = use.input ?? {};
  switch (use.name) {
    case "read_file":
      return `read ${input.path}`;
    case "edit_file":
      return `edit ${input.path}`;
    case "run_command":
      return `run ${input.cmd}`;
    default:
      return `use ${use.name}`;
  }
}

function firstLine(text) {
  const parts = String(text ?? "").split("\n");
  return parts.length > 1 ? `${parts[0]} …` : parts[0];
}

const DECISION_WORD = { allow: "allowed", ask: "held for a person", deny: "denied" };

// The plain-English sentence for one event (Friendly view; Addendum 2).
export function friendly(ev) {
  switch (ev.kind) {
    case "run_start":
      return `The run starts with one task: “${ev.task}”.`;
    case "prompt_built":
      return `The harness builds this call’s prompt from ${ev.layers.join(", ")}: ${fmt(ev.tokens)} tokens.`;
    case "model_call":
      return `The model is called with ${fmt(ev.tokens_in)} tokens of input.`;
    case "model_reply":
      if (ev.tool_use) {
        return `The model said “${ev.text}” and asked to ${describeTool(ev.tool_use)}.`;
      }
      return `The model said “${ev.text}” and stopped.`;
    case "permission":
      return `The permission check for ${ev.tool} says ${DECISION_WORD[ev.decision] ?? ev.decision} (“${ev.rule}”).`;
    case "tool_call":
      if (ev.ok === false) return `${ev.tool} failed: “${firstLine(ev.output)}”.`;
      return `${ev.tool} ran and returned “${firstLine(ev.output)}”.`;
    case "interrupt":
      return `${ev.note}.`;
    case "run_end":
      return `The run ended as ${ev.status} after ${ev.turns} turns: ${fmtCost(ev.cost)}.`;
    default:
      return ev.kind;
  }
}

// The one-line label for the event list rows.
export function summary(ev) {
  switch (ev.kind) {
    case "run_start":
      return "Run starts";
    case "prompt_built":
      return `Prompt: ${fmt(ev.tokens)} tokens`;
    case "model_call":
      return `Model call: ${fmt(ev.tokens_in)} in`;
    case "model_reply":
      if (ev.tool_use) return `Model asks to ${describeTool(ev.tool_use)}`;
      return "Model says it is done";
    case "permission":
      return `${DECISION_WORD[ev.decision] ?? ev.decision}: ${ev.tool}`;
    case "tool_call":
      return `${ev.tool} ${ev.ok === false ? "failed" : "ok"}`;
    case "interrupt":
      return "A person pressed stop";
    case "run_end":
      return `Run ${ev.status}`;
    default:
      return ev.kind;
  }
}

// --- puzzle and bench statistics -----------------------------------------------------

export function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  if (p >= 100) return sorted[sorted.length - 1];
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export function armStats(arm) {
  const runs = DATA.bench[arm];
  const turns = runs.map((r) => r.turns);
  const costs = runs.map((r) => r.cost);
  return {
    runs,
    passes: runs.filter((r) => r.passed).length,
    turnsP50: percentile(turns, 50),
    turnsP100: percentile(turns, 100),
    costP50: percentile(costs, 50),
    costP100: percentile(costs, 100),
    costMean: costs.reduce((a, b) => a + b, 0) / costs.length,
  };
}

// The guard rule (puzzle.rule): a trial passes if it fixes the bug and needs <= limit.
// Otherwise the new board stops it at the limit. Trials are the candidate arm's runs.
export function guardAt(limit) {
  const cost = DATA.puzzle.cost_by_turns;
  let passes = 0;
  let worst = 0;
  for (const run of DATA.bench.new) {
    const pass = run.fixes && run.needs <= limit;
    if (pass) passes += 1;
    const turns = pass ? run.needs : limit;
    worst = Math.max(worst, cost[String(turns)]);
  }
  return { limit, passes, worst };
}

export const GUARD_CURVE = Array.from({ length: LIMIT_MAX - LIMIT_MIN + 1 }, (_, k) =>
  guardAt(LIMIT_MIN + k),
);
export const PASS_TOTAL = DATA.bench.new.filter((r) => r.passed).length;

// --- formatting ----------------------------------------------------------------------

export function esc(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function fmt(n) {
  return Number(n).toLocaleString("en-US");
}

export function fmtCost(c) {
  return `≈ ${Number(c).toFixed(3)} units`;
}

export function fmtSeconds(s) {
  if (s < 60) return `${s.toFixed(1)}\u00a0s`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s - m * 60);
  return `${m} min ${rest}\u00a0s`;
}

// --- motion, storage and announcements ------------------------------------------------

export function readStore() {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "null") ?? {};
  } catch {
    return {};
  }
}

export function writeStore(patch) {
  try {
    const next = { ...readStore(), ...patch };
    sessionStorage.setItem(STORE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return patch;
  }
}

function readMotionPref() {
  try {
    return localStorage.getItem("d3.motion");
  } catch {
    return null;
  }
}

// "reduced" | "full" as set by the in-app toggle; null means follow the system setting.
export function motionOverride() {
  return readMotionPref();
}

export function reducedMotion() {
  const override = motionOverride();
  if (override === "reduced") return true;
  if (override === "full") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function applyMotion(value) {
  if (value === "reduced" || value === "full") {
    document.documentElement.dataset.motion = value;
  } else {
    delete document.documentElement.dataset.motion;
  }
  const button = document.querySelector("[data-motion-toggle]");
  if (button) {
    const reduced = reducedMotion();
    button.setAttribute("aria-pressed", String(reduced));
    button.querySelector("[data-motion-label]").textContent = reduced ? "On" : "Off";
  }
  document.dispatchEvent(new CustomEvent("d3:motion", { detail: { reduced: reducedMotion() } }));
}

// Wires the motion toggle in the page header. Call once per page.
export function initChrome() {
  applyMotion(motionOverride());
  const button = document.querySelector("[data-motion-toggle]");
  if (!button) return;
  button.addEventListener("click", () => {
    const next = reducedMotion() ? "full" : "reduced";
    try {
      localStorage.setItem("d3.motion", next);
    } catch {
      // Storage can be blocked; the toggle still works for this page view.
    }
    applyMotion(next);
  });
  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => {
    applyMotion(motionOverride());
  });
}

// One polite announcement at a time; callers throttle (at most one per turn).
export function announce(text) {
  const region = document.getElementById("live");
  if (!region) return;
  region.textContent = "";
  requestAnimationFrame(() => {
    region.textContent = text;
  });
}

export function nowLabel() {
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
