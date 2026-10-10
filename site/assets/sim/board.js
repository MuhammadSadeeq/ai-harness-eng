// Board loader (docs/ENGINE.md section 7). Absent module = not plugged.
import { EFFORT_LEVELS, NOTE_KINDS, checkPlain, fail, isObj, noExtraKeys, reqInt, reqStr } from "./tape.js";

const MODULE_PARAMS = {
  turn_limit: ["max_turns"],
  token_budget: ["max_tokens"],
  loop_detect: ["window"],
  output_cap: ["max_tokens"],
  retry: ["max_attempts", "base_ms", "cap_ms", "jitter"],
  breaker: ["threshold"],
  permissions: ["mode", "rules"],
  sandbox: ["egress"],
  verify_gate: ["max_feedback"],
  close_books: [],
  rules_file: [],
  redact: ["patterns"],
  history: ["resend"],
  first_block_only: [],
  compaction: ["threshold_percent", "keep"],
  system_clock: [],
  cache: [],
  validate_inputs: [],
  split_results: [],
  effort: ["level"],
};
const DECISIONS = ["allow", "ask", "deny"];

function loadModule(name, p, where) {
  if (!isObj(p)) fail(where, "module parameters must be an object");
  noExtraKeys(p, MODULE_PARAMS[name], where);
  switch (name) {
    case "turn_limit":
      return { max_turns: reqInt(p, "max_turns", where) };
    case "token_budget":
      return { max_tokens: reqInt(p, "max_tokens", where) };
    case "loop_detect":
      return { window: reqInt(p, "window", where, 2) };
    case "output_cap":
      return { max_tokens: reqInt(p, "max_tokens", where) };
    case "retry": {
      if (p.jitter !== "none" && p.jitter !== "full") fail(where, 'jitter must be "none" or "full"');
      return {
        max_attempts: reqInt(p, "max_attempts", where, 1),
        base_ms: reqInt(p, "base_ms", where),
        cap_ms: reqInt(p, "cap_ms", where),
        jitter: p.jitter,
      };
    }
    case "breaker":
      return { threshold: reqInt(p, "threshold", where, 1) };
    case "permissions": {
      if (!DECISIONS.includes(p.mode)) fail(where, 'mode must be "allow", "ask" or "deny"');
      const rules = (p.rules ?? []).map((r, i) => {
        const w = `${where}.rules[${i}]`;
        noExtraKeys(r, ["decision", "tool", "match", "reason"], w);
        if (!DECISIONS.includes(r.decision)) fail(w, 'decision must be "allow", "ask" or "deny"');
        reqStr(r, "tool", w);
        const match = r.match ?? {};
        for (const [field, glob] of Object.entries(match)) {
          if (typeof glob !== "string") fail(w, `match.${field} must be a glob string`);
        }
        if (typeof r.reason !== "string" || r.reason === "") fail(w, "reason must be a non-empty string");
        return { decision: r.decision, tool: r.tool, match, reason: r.reason };
      });
      return { mode: p.mode, rules };
    }
    case "sandbox": {
      const egress = p.egress ?? [];
      if (!Array.isArray(egress) || egress.some((h) => typeof h !== "string")) {
        fail(where, "egress must be a list of host names");
      }
      egress.forEach((h, i) => {
        if (h !== h.toLowerCase()) fail(where, `egress[${i}] "${h}" must be lowercase`);
      });
      return { egress };
    }
    case "verify_gate":
      return { max_feedback: reqInt(p, "max_feedback", where) };
    case "close_books":
    case "rules_file":
      return {};
    case "history":
      // A5 ruling (c): {"resend": false} forgets; {"resend": true} is the same as absent. Any other shape is refused.
      if (p.resend !== false && p.resend !== true) fail(where, 'resend must be true or false (A5: the forgetful harness)');
      return { resend: p.resend };
    case "first_block_only":
      return {};
    case "compaction": {
      // A6.3: P is 1-100; keep is a list of distinct note kinds, possibly empty.
      const P = reqInt(p, "threshold_percent", where, 1);
      if (P > 100) fail(where, "threshold_percent must be 1-100");
      if (!Array.isArray(p.keep)) fail(where, "keep must be a list of note kinds");
      for (const k of p.keep) {
        if (!NOTE_KINDS.includes(k)) fail(where, `keep has unknown kind "${k}"`);
      }
      if (new Set(p.keep).size !== p.keep.length) fail(where, "keep must not repeat a kind");
      return { threshold_percent: P, keep: [...p.keep] };
    }
    case "system_clock":
    case "cache":
    case "validate_inputs":
    case "split_results":
      return {};
    case "effort": {
      // A7.3: the board sets the level in force (the tape default is used when absent).
      if (!EFFORT_LEVELS.includes(p.level)) fail(where, `level must be one of: ${EFFORT_LEVELS.join(", ")}`);
      return { level: p.level };
    }
    case "redact": {
      const patterns = p.patterns ?? [];
      if (!Array.isArray(patterns) || patterns.some((s) => typeof s !== "string" || s === "")) {
        fail(where, "patterns must be non-empty strings");
      }
      return { patterns };
    }
    default:
      throw new Error(`unreachable: ${name}`);
  }
}

// Returns a new, validated board object with every module's defaults applied.
export function loadBoard(raw) {
  if (!isObj(raw)) fail("board", "must be an object");
  checkPlain(raw, "board");
  const where = `board ${raw.id ?? "?"}`;
  const id = reqStr(raw, "id", where);
  const modules = {};
  const given = raw.modules ?? {};
  if (!isObj(given)) fail(where, "modules must be an object");
  for (const [name, p] of Object.entries(given)) {
    if (!(name in MODULE_PARAMS)) fail(where, `unknown module "${name}"`);
    modules[name] = loadModule(name, p, `${where} ${name}`);
  }
  return { id, label: raw.label ?? id, modules };
}
