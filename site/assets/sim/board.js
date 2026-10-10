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
  verify_gate: ["max_feedback", "pristine_tests"],
  tool_overrides: [],
  tool_search: ["always"],
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
  cost_attribution: [],
};
const DECISIONS = ["allow", "ask", "deny"];

function loadModule(name, p, where) {
  if (!isObj(p)) fail(where, "module parameters must be an object");
  if (name === "tool_overrides") return loadToolOverrides(p, where);
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
    case "verify_gate": {
      // A9.3: pristine_tests is optional, true or false (false when absent).
      if (p.pristine_tests !== undefined && typeof p.pristine_tests !== "boolean") {
        fail(where, "pristine_tests must be true or false");
      }
      return { max_feedback: reqInt(p, "max_feedback", where), pristine_tests: p.pristine_tests === true };
    }
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
    case "cost_attribution":
      return {};
    case "effort": {
      // A7.3: the board sets the level in force (the tape default is used when absent).
      if (!EFFORT_LEVELS.includes(p.level)) fail(where, `level must be one of: ${EFFORT_LEVELS.join(", ")}`);
      return { level: p.level };
    }
    case "tool_search": {
      // A9.2: the always list names tools the request sends from the start; none when absent.
      const always = p.always ?? [];
      if (!Array.isArray(always) || always.some((n) => typeof n !== "string")) {
        fail(where, "always must be a list of tool names");
      }
      if (new Set(always).size !== always.length) fail(where, "always must not repeat a tool");
      return { always: [...always] };
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

// A9.1: {"<tool name>": {"description"?, "input_schema"?}}. A null-prototype map, so any name is a key.
function loadToolOverrides(p, where) {
  const out = Object.create(null);
  for (const [name, o] of Object.entries(p)) {
    const w = `${where} ${name}`;
    if (!isObj(o)) fail(w, "an override is an object with description and/or input_schema");
    noExtraKeys(o, ["description", "input_schema"], w);
    if ("description" in o && typeof o.description !== "string") fail(w, "description must be a string");
    if ("input_schema" in o && !isObj(o.input_schema)) fail(w, "input_schema must be an object");
    out[name] = { ...o };
  }
  return out;
}

// Checks a loaded board against the loaded tape it runs on (A9.1 and A9.2). A tool is a built-in the
// tape lists or a custom tool the tape defines; the names the board gives must be such tools.
export function checkBoardForTape(tape, board) {
  const where = `board ${board.id}`;
  const names = new Set([...tape.tools, ...tape.custom_tools.map((c) => c.name)]);
  for (const name of Object.keys(board.modules.tool_overrides ?? {})) {
    if (!names.has(name)) fail(where, `tool_overrides names unknown tool "${name}"`);
  }
  const search = board.modules.tool_search;
  if (search) {
    for (const name of search.always) {
      if (!names.has(name)) fail(where, `tool_search always names unknown tool "${name}"`);
    }
    if (names.has("tool_search")) fail(where, 'tool_search is the harness\'s own tool name; the tape may not define it');
  }
}
