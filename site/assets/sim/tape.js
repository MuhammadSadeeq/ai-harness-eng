// Tape loader (docs/ENGINE.md section 5 and 6.1). Validates and applies defaults;
// it never guesses. Every error names the field it rejects.

import { normalizePath, isInside } from "./vfs.js";

export const ASCII = /^[\x20-\x7E\n\t]*$/;
export const BUILTIN_TOOLS = ["read_file", "write_file", "edit_file", "list_files", "run_command"];
export const ERROR_TYPES = ["overloaded", "rate_limit", "api_error", "timeout", "invalid_request"];
const STOPS = ["end_turn", "tool_use", "max_tokens", "refusal"];
const CONDITIONS = ["last_result_error", "last_denied", "verify_feedback", "last_truncated"];

export const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

export function fail(where, msg) {
  throw new Error(`${where}: ${msg}`);
}

// Checks a parsed JSON value: integers only, ASCII strings, no numeric-string keys.
export function checkPlain(x, where) {
  if (x === null || typeof x === "boolean") return;
  if (typeof x === "number") {
    if (!Number.isInteger(x)) fail(where, `not an integer: ${x}`);
    return;
  }
  if (typeof x === "string") {
    if (!ASCII.test(x)) fail(where, `not ASCII: ${JSON.stringify(x)}`);
    return;
  }
  if (Array.isArray(x)) {
    x.forEach((v, i) => checkPlain(v, `${where}[${i}]`));
    return;
  }
  if (isObj(x)) {
    for (const [k, v] of Object.entries(x)) {
      if (!ASCII.test(k)) fail(where, `key is not ASCII: ${JSON.stringify(k)}`);
      if (/^(0|[1-9][0-9]*)$/.test(k)) fail(where, `non-negative canonical-integer key "${k}" is not allowed`);
      checkPlain(v, `${where}.${k}`);
    }
    return;
  }
  fail(where, `unsupported value of type ${typeof x}`);
}

export function reqInt(obj, key, where, min = 0) {
  const v = obj[key];
  if (!Number.isInteger(v) || v < min) fail(where, `${key} must be an integer >= ${min}`);
  return v;
}

export function optInt(obj, key, where, dflt, min = 0) {
  return obj[key] === undefined ? dflt : reqInt(obj, key, where, min);
}

export function reqStr(obj, key, where) {
  if (typeof obj[key] !== "string") fail(where, `${key} must be a string`);
  return obj[key];
}

export function noExtraKeys(obj, allowed, where) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) fail(where, `unknown field "${k}"`);
  }
}

// A3.13: a workspace key's normal form must be a relative path inside the root (not
// the root itself); an outside key's normal form must not be inside the root.
function checkFileKeys(map, where, inside) {
  for (const k of Object.keys(map)) {
    const norm = normalizePath(k);
    if (inside && (!isInside(norm) || norm === ".")) {
      fail(where, `"${k}" is not a relative path inside the workspace`);
    }
    if (!inside && isInside(norm)) {
      fail(where, `"${k}" is inside the workspace; outside keys start with "/" or "../"`);
    }
  }
}

function checkFileMap(map, where) {
  if (!isObj(map)) fail(where, "must be an object");
  for (const [path, v] of Object.entries(map)) {
    if (typeof v === "string") continue;
    if (isObj(v) && typeof v.link === "string" && Object.keys(v).length === 1) continue;
    fail(`${where}["${path}"]`, 'must be a string or {"link": "<target>"}');
  }
  return map;
}

export function checkError(step, where) {
  if (!ERROR_TYPES.includes(step)) fail(where, `unknown error type "${step}"`);
}

function checkCondition(cond, where) {
  if (CONDITIONS.includes(cond)) return;
  if (typeof cond === "string" && /^turn_gte:\d+$/.test(cond)) return;
  fail(where, `unknown condition "${cond}"`);
}

export function checkSteps(steps, where) {
  if (!Array.isArray(steps)) fail(where, "steps must be a list");
  steps.forEach((s, i) => checkStep(s, `${where}[${i}]`));
}

function checkStep(s, where) {
  if (!isObj(s)) fail(where, "step must be an object");
  if ("branch" in s) {
    if (!Array.isArray(s.branch) || s.branch.length === 0) fail(where, "branch must be a non-empty list");
    let sum = 0;
    s.branch.forEach((opt, i) => {
      noExtraKeys(opt, ["percent", "then"], `${where}.branch[${i}]`);
      sum += reqInt(opt, "percent", `${where}.branch[${i}]`, 0);
      checkSteps(opt.then, `${where}.branch[${i}].then`);
    });
    if (sum !== 100) fail(where, `branch percents must sum to 100, got ${sum}`);
    return;
  }
  if ("when" in s) {
    if (!Array.isArray(s.when) || s.when.length === 0) fail(where, "when must be a non-empty list");
    s.when.forEach((c, i) => {
      const w = `${where}.when[${i}]`;
      if ("else" in c) {
        if (i !== s.when.length - 1) fail(w, "else must be the last option");
        noExtraKeys(c, ["else"], w);
        checkSteps(c.else, `${w}.else`);
      } else {
        noExtraKeys(c, ["if", "then"], w);
        checkCondition(c.if, `${w}.if`);
        checkSteps(c.then, `${w}.then`);
      }
    });
    return;
  }
  if ("repeat" in s) {
    noExtraKeys(s.repeat, ["steps", "times"], `${where}.repeat`);
    checkSteps(s.repeat.steps, `${where}.repeat.steps`);
    const times = s.repeat.times;
    if (times !== "forever") reqInt(s.repeat, "times", `${where}.repeat`, 0);
    return;
  }
  if ("error" in s) {
    noExtraKeys(s, ["error", "retry_after_ms", "error_ms"], where);
    checkError(s.error, where);
    optInt(s, "retry_after_ms", where, 0);
    optInt(s, "error_ms", where, 300);
    return;
  }
  noExtraKeys(s, ["say", "tools", "stop", "latency_ms"], where);
  if ("say" in s && typeof s.say !== "string") fail(where, "say must be a string");
  if ("tools" in s) {
    if (!Array.isArray(s.tools)) fail(where, "tools must be a list of [name, input]");
    s.tools.forEach((pair, i) => {
      if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string" || !isObj(pair[1])) {
        fail(`${where}.tools[${i}]`, "must be [name, {input}]");
      }
    });
  }
  if ("stop" in s && !STOPS.includes(s.stop)) fail(where, `unknown stop "${s.stop}"`);
  const nTools = (s.tools ?? []).length;
  if (s.stop === "tool_use" && nTools === 0) fail(where, 'stop "tool_use" needs tools');
  if (nTools > 0 && "stop" in s && s.stop !== "tool_use") fail(where, `tools with stop "${s.stop}"`);
  optInt(s, "latency_ms", where, 0);
}

function loadCustomTool(c, i, seen) {
  const where = `custom_tools[${i}]`;
  if (!isObj(c)) fail(where, "must be an object");
  const name = reqStr(c, "name", where);
  if (BUILTIN_TOOLS.includes(name) || seen.has(name)) fail(where, `tool name "${name}" is already taken`);
  seen.add(name);
  reqStr(c, "description", where);
  if (!isObj(c.input_schema)) fail(where, "input_schema must be an object");
  const results = (c.results ?? []).map((r, j) => {
    const w = `${where}.results[${j}]`;
    if (!isObj(r.match ?? {})) fail(w, "match must be an object");
    return { match: r.match ?? {}, output: reqStr(r, "output", w), ok: r.ok ?? true };
  });
  const dflt = c.default ?? { output: "", ok: false };
  return {
    name,
    description: c.description,
    input_schema: c.input_schema,
    latency_ms: optInt(c, "latency_ms", where, 100),
    results,
    default: { output: reqStr(dflt, "output", `${where}.default`), ok: dflt.ok ?? false },
    effect: c.effect ?? null,
  };
}

// Returns a new, validated tape object. The input is not modified.
export function loadTape(raw) {
  if (!isObj(raw)) fail("tape", "must be an object");
  checkPlain(raw, "tape");
  const where = `tape ${raw.id ?? "?"}`;
  if (raw.schema !== 1) fail(where, "schema must be 1");
  const t = structuredClone(raw);
  t.id = reqStr(raw, "id", where);
  t.title = raw.title ?? t.id;
  t.task = reqStr(raw, "task", where);
  t.model_id = reqStr(raw, "model_id", where);
  t.system = reqStr(raw, "system", where);
  t.window = reqInt(raw, "window", where, 1);
  if (!isObj(raw.pricing)) fail(where, "pricing is required");
  t.rules = raw.rules ?? [];
  if (!Array.isArray(t.rules) || t.rules.some((r) => typeof r !== "string")) fail(where, "rules must be a list of strings");
  t.workspace = checkFileMap(raw.workspace ?? {}, `${where}.workspace`);
  checkFileKeys(t.workspace, `${where}.workspace`, true);
  t.outside = checkFileMap(raw.outside ?? {}, `${where}.outside`);
  checkFileKeys(t.outside, `${where}.outside`, false);
  t.tools = raw.tools ?? [];
  if (!Array.isArray(t.tools)) fail(where, "tools must be a list");
  for (const name of t.tools) {
    if (!BUILTIN_TOOLS.includes(name)) fail(where, `unknown built-in tool "${name}"`);
  }
  const seen = new Set();
  t.custom_tools = (raw.custom_tools ?? []).map((c, i) => loadCustomTool(c, i, seen));
  t.checks = (raw.checks ?? []).map((c, i) => {
    const w = `${where}.checks[${i}]`;
    if (typeof c.file !== "string") fail(w, "file must be a string");
    const kinds = ["contains", "not_contains"].filter((k) => k in c);
    if (kinds.length !== 1) fail(w, 'give exactly one of "contains" or "not_contains"');
    reqStr(c, kinds[0], w);
    return c;
  });
  if (!isObj(raw.test_output)) fail(where, "test_output is required");
  reqStr(raw.test_output, "pass", `${where}.test_output`);
  reqStr(raw.test_output, "fail", `${where}.test_output`);
  checkSteps(raw.script, `${where}.script`);
  t.human = loadHuman(raw.human ?? { default: "deny" }, where);
  if (raw.interrupt === undefined || raw.interrupt === null) {
    t.interrupt = null;
  } else {
    noExtraKeys(raw.interrupt, ["turn", "resume"], `${where}.interrupt`);
    t.interrupt = {
      turn: reqInt(raw.interrupt, "turn", `${where}.interrupt`, 1),
      resume: raw.interrupt.resume ?? false,
    };
  }
  t.faults = (raw.faults ?? []).map((f, i) => {
    const w = `${where}.faults[${i}]`;
    const percent = reqInt(f, "percent", w, 0);
    if (percent > 100) fail(w, "percent must be 0-100");
    checkError(f.type, w);
    return { percent, type: f.type };
  });
  if (raw.outage === undefined || raw.outage === null) {
    t.outage = null;
  } else {
    const o = raw.outage;
    checkError(o.type, `${where}.outage`);
    t.outage = {
      from_ms: reqInt(o, "from_ms", `${where}.outage`),
      to_ms: reqInt(o, "to_ms", `${where}.outage`),
      type: o.type,
      retry_after_ms: optInt(o, "retry_after_ms", `${where}.outage`, 0),
    };
  }
  t.seed_base = optInt(raw, "seed_base", where, 0);
  t.boards = raw.boards ?? [];
  t.golden_seeds = raw.golden_seeds ?? [];
  return t;
}

function loadHuman(h, where) {
  const w = `${where}.human`;
  if (!isObj(h)) fail(w, "must be an object");
  noExtraKeys(h, ["default", "deny_if", "fatigue"], w);
  if (h.default !== "approve" && h.default !== "deny") fail(w, 'default must be "approve" or "deny"');
  const deny_if = h.deny_if ?? {};
  for (const [field, glob] of Object.entries(deny_if)) {
    if (typeof glob !== "string") fail(w, `deny_if.${field} must be a glob string`);
  }
  let fatigue = null;
  if (h.fatigue !== undefined && h.fatigue !== null) {
    noExtraKeys(h.fatigue, ["after", "approve_percent"], `${w}.fatigue`);
    const approve = reqInt(h.fatigue, "approve_percent", `${w}.fatigue`, 0);
    if (approve > 100) fail(`${w}.fatigue`, "approve_percent must be 0-100");
    fatigue = { after: reqInt(h.fatigue, "after", `${w}.fatigue`, 0), approve_percent: approve };
  }
  return { default: h.default, deny_if, fatigue };
}
