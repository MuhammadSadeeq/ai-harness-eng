// Tape loader (docs/ENGINE.md section 5 and 6.1). Validates and applies defaults;
// it never guesses. Every error names the field it rejects.

import { normalizePath, isInside } from "./vfs.js";

export const ASCII = /^[\x20-\x7E\n\t]*$/;
export const BUILTIN_TOOLS = ["read_file", "write_file", "edit_file", "list_files", "run_command"];
export const ERROR_TYPES = ["overloaded", "rate_limit", "api_error", "timeout", "invalid_request"];
// A11.4: the labels a custom tool may carry (the course shows them; the run ignores them).
export const TRIFECTA = ["private_data", "untrusted_content", "exfiltration"];
const STOPS = ["end_turn", "tool_use", "max_tokens", "refusal"];
const CONDITIONS = ["last_result_error", "last_denied", "verify_feedback", "last_truncated", "results_split"];

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

// A3.13 (settled): two paths across workspace and outside with the same normal form are refused.
function checkDuplicatePaths(workspace, outside, where) {
  const seen = new Map();
  for (const map of [workspace, outside]) {
    for (const k of Object.keys(map)) {
      const norm = normalizePath(k);
      if (seen.has(norm)) fail(where, `paths "${seen.get(norm)}" and "${k}" are the same file`);
      seen.set(norm, k);
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
  if (typeof cond === "string" && /^session_gte:\d+$/.test(cond)) return;
  if (typeof cond === "string" && /^history_lt:(0|[1-9][0-9]*)$/.test(cond)) return;
  // A6.1: context_gte:<n>; sent_lacks:<text> where <text> is everything after the first colon.
  if (typeof cond === "string" && /^context_gte:(0|[1-9][0-9]*)$/.test(cond)) return;
  if (typeof cond === "string" && /^sent_lacks:[\s\S]+$/.test(cond)) return;
  // A11.1: last_result_contains:<text>, where <text> is everything after the first colon (never empty).
  if (typeof cond === "string" && /^last_result_contains:[\s\S]+$/.test(cond)) return;
  // A7.3: effort_gte:<level>, the level in force compared with a level name.
  if (typeof cond === "string" && /^effort_gte:(low|medium|high|xhigh|max)$/.test(cond)) return;
  // A9.2: tools_gte:<n>, and tool_loaded:<name> where <name> is everything after the colon.
  if (typeof cond === "string" && /^tools_gte:(0|[1-9][0-9]*)$/.test(cond)) return;
  if (typeof cond === "string" && /^tool_loaded:\S+$/.test(cond)) return;
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
  // A11.4: provenance. server and version come together or not at all; trifecta holds distinct labels.
  const hasServer = c.server !== undefined && c.server !== null;
  const hasVersion = c.version !== undefined && c.version !== null;
  if (hasServer !== hasVersion) fail(where, '"server" and "version" must be given together');
  if (hasServer && (typeof c.server !== "string" || typeof c.version !== "string")) {
    fail(where, "server and version must be strings");
  }
  const trifecta = c.trifecta ?? [];
  if (!Array.isArray(trifecta)) fail(where, "trifecta must be a list");
  for (const label of trifecta) {
    if (!TRIFECTA.includes(label)) fail(where, `trifecta "${label}" is not one of: ${TRIFECTA.join(", ")}`);
  }
  if (new Set(trifecta).size !== trifecta.length) fail(where, "trifecta must not repeat a label");
  // A14.4: a ledger is a workspace path each application appends a line to; lose_reply lists application numbers.
  if (c.ledger !== undefined && c.ledger !== null && (typeof c.ledger !== "string" || c.ledger === "")) {
    fail(where, "ledger must be a non-empty path");
  }
  const loseReply = c.lose_reply ?? [];
  if (!Array.isArray(loseReply) || loseReply.some((k) => !Number.isInteger(k) || k < 1)) {
    fail(where, "lose_reply must be a list of application numbers from 1");
  }
  return {
    name,
    description: c.description,
    input_schema: c.input_schema,
    latency_ms: optInt(c, "latency_ms", where, 100),
    ledger: c.ledger ?? null,
    lose_reply: [...loseReply],
    results,
    default: { output: reqStr(dflt, "output", `${where}.default`), ok: dflt.ok ?? false },
    effect: c.effect ?? null,
    server: hasServer ? c.server : null,
    version: hasVersion ? c.version : null,
    trifecta: [...trifecta],
  };
}

// A11.3: secret strings the tape plants; each non-empty and distinct. Absent means none.
function loadCanaries(raw, where) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) fail(where, "canaries must be a list");
  raw.forEach((s, i) => {
    if (typeof s !== "string" || s === "") fail(where, `canaries[${i}] must be a non-empty string`);
  });
  if (new Set(raw).size !== raw.length) fail(where, "canaries must not repeat");
  return [...raw];
}

// Returns a new, validated tape object. The input is not modified.
// A6.2: the commitments a run builds up. The kinds are shared with the board's compaction.keep.
export const NOTE_KINDS = ["goal", "constraint", "decision", "progress", "file"];

function loadNotes(raw, where) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) fail(where, "notes must be a list");
  const ids = new Set();
  return raw.map((n, i) => {
    const w = `${where}.notes[${i}]`;
    if (!isObj(n)) fail(w, "a note is an object");
    noExtraKeys(n, ["id", "kind", "turn", "text"], w);
    const id = reqStr(n, "id", w);
    if (ids.has(id)) fail(w, `duplicate note id "${id}"`);
    ids.add(id);
    if (!NOTE_KINDS.includes(n.kind)) fail(w, `kind must be one of ${NOTE_KINDS.join(", ")}`);
    const turn = reqInt(n, "turn", w, 0);
    if (typeof n.text !== "string") fail(w, "text must be a string");
    return { id, kind: n.kind, turn, text: n.text };
  });
}

// A7.3: the effort levels, in order (low to max).
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"];

// A7.3: the tape's effort block: {default?, thinking_tokens?} (null when absent).
function loadEffort(raw, where) {
  if (raw === undefined || raw === null) return null;
  if (!isObj(raw)) fail(where, "effort must be an object");
  noExtraKeys(raw, ["default", "thinking_tokens"], `${where}.effort`);
  // null is what a loaded tape stores for an absent default, so loading a loaded tape is the same tape.
  if (raw.default !== undefined && raw.default !== null && !EFFORT_LEVELS.includes(raw.default)) {
    fail(where, `effort default must be one of: ${EFFORT_LEVELS.join(", ")}`);
  }
  const tt = raw.thinking_tokens ?? {};
  if (!isObj(tt)) fail(where, "effort thinking_tokens must be an object");
  noExtraKeys(tt, EFFORT_LEVELS, `${where}.effort.thinking_tokens`);
  for (const level of Object.keys(tt)) reqInt(tt, level, `${where}.effort.thinking_tokens`, 0);
  return { default: raw.default ?? null, thinking_tokens: { ...tt } };
}

// A6.5: the API's caching rules for this model, given by the tape (null when absent).
function loadCacheRules(raw, where) {
  if (raw === undefined || raw === null) return null;
  if (!isObj(raw)) fail(where, "cache_rules must be an object");
  noExtraKeys(raw, ["min_tokens", "ttl_ms"], `${where}.cache_rules`);
  return {
    min_tokens: reqInt(raw, "min_tokens", `${where}.cache_rules`, 0),
    ttl_ms: reqInt(raw, "ttl_ms", `${where}.cache_rules`, 0),
  };
}

// A9.3: the tape's test suite (null when absent): [{id, marker: {file, contains}, check: {file, contains | not_contains}}].
function loadTests(raw, where) {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) fail(where, "tests must be a list");
  const ids = new Set();
  return raw.map((t, i) => {
    const w = `${where}.tests[${i}]`;
    if (!isObj(t)) fail(w, "a test is an object");
    noExtraKeys(t, ["id", "marker", "check"], w);
    const id = reqStr(t, "id", w);
    if (ids.has(id)) fail(w, `duplicate test id "${id}"`);
    ids.add(id);
    if (!isObj(t.marker)) fail(w, "marker must be an object");
    noExtraKeys(t.marker, ["file", "contains"], `${w}.marker`);
    reqStr(t.marker, "file", `${w}.marker`);
    reqStr(t.marker, "contains", `${w}.marker`);
    if (!isObj(t.check)) fail(w, "check must be an object");
    noExtraKeys(t.check, ["file", "contains", "not_contains"], `${w}.check`);
    reqStr(t.check, "file", `${w}.check`);
    const kinds = ["contains", "not_contains"].filter((k) => k in t.check);
    if (kinds.length !== 1) fail(w, 'check: give exactly one of "contains" or "not_contains"');
    reqStr(t.check, kinds[0], `${w}.check`);
    return { id, marker: { file: t.marker.file, contains: t.marker.contains }, check: { file: t.check.file, [kinds[0]]: t.check[kinds[0]] } };
  });
}

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
  checkDuplicatePaths(t.workspace, t.outside, where);
  t.tools = raw.tools ?? [];
  if (!Array.isArray(t.tools)) fail(where, "tools must be a list");
  for (const name of t.tools) {
    if (!BUILTIN_TOOLS.includes(name)) fail(where, `unknown built-in tool "${name}"`);
  }
  const seen = new Set();
  t.custom_tools = (raw.custom_tools ?? []).map((c, i) => loadCustomTool(c, i, seen));
  t.canaries = loadCanaries(raw.canaries, where);
  t.checks = (raw.checks ?? []).map((c, i) => {
    const w = `${where}.checks[${i}]`;
    if (typeof c.file !== "string") fail(w, "file must be a string");
    // A14.4: "lines" is the exact number of lines in the file.
    const kinds = ["contains", "not_contains", "lines"].filter((k) => k in c);
    if (kinds.length !== 1) fail(w, 'give exactly one of "contains", "not_contains" or "lines"');
    if (kinds[0] === "lines") reqInt(c, "lines", w, 0);
    else reqStr(c, kinds[0], w);
    return c;
  });
  if (!isObj(raw.test_output)) fail(where, "test_output is required");
  reqStr(raw.test_output, "pass", `${where}.test_output`);
  reqStr(raw.test_output, "fail", `${where}.test_output`);
  // A14.2: a tape has a script or sessions, not both.
  if (raw.sessions !== undefined && raw.sessions !== null) {
    if (raw.script !== undefined) fail(where, "give script or sessions, not both");
    t.sessions = loadSessions(raw.sessions, where);
  } else {
    checkSteps(raw.script, `${where}.script`);
    t.sessions = null;
  }
  t.agents = loadAgents(raw.agents, where);
  t.models = loadModels(raw.models, where);
  // A17.3: a model profile with a script on a tape with sessions is refused by the loader (Python does the same).
  if (t.sessions) {
    for (const [id, m] of Object.entries(t.models)) {
      if (m.script !== null) fail(`${where}.models ${id}`, "a model profile's script cannot replace sessions (A17.3)");
    }
  }
  t.crash = loadCrash(raw.crash, where);
  t.human = loadHuman(raw.human ?? { default: "deny" }, where);
  t.notes = loadNotes(raw.notes, where);
  t.cache_rules = loadCacheRules(raw.cache_rules, where);
  t.effort = loadEffort(raw.effort, where);
  t.tests = loadTests(raw.tests, where);
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
  if (raw.incident === undefined) delete t.incident;
  else t.incident = loadIncident(raw.incident, `${where}.incident`);
  t.boards = raw.boards ?? [];
  t.golden_seeds = raw.golden_seeds ?? [];
  return t;
}

// A14.2: sessions is a list of 2 to 5 sessions, each with its own script.
function loadSessions(raw, where) {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 5) fail(where, "sessions must be a list of 2 to 5 sessions");
  return raw.map((x, i) => {
    const w = `${where}.sessions[${i}]`;
    if (!isObj(x)) fail(w, "a session is an object with a script");
    noExtraKeys(x, ["script"], w);
    checkSteps(x.script, `${w}.script`);
    return { script: x.script };
  });
}

const AGENT_NAME = /^[a-z][a-z0-9-]*$/;

// A14.1: agents maps a name to a script and an optional system prompt. Absent means none.
function loadAgents(raw, where) {
  if (raw === undefined || raw === null) return {};
  if (!isObj(raw)) fail(where, "agents must be an object");
  const out = {};
  for (const [name, a] of Object.entries(raw)) {
    const w = `${where}.agents ${name}`;
    if (!AGENT_NAME.test(name)) fail(w, "agent names match [a-z][a-z0-9-]*");
    if (!isObj(a)) fail(w, "an agent is an object with a script");
    noExtraKeys(a, ["script", "system"], w);
    checkSteps(a.script, `${w}.script`);
    if (a.system !== undefined && a.system !== null && typeof a.system !== "string") fail(w, "system must be a string");
    out[name] = { script: a.script, system: a.system ?? null };
  }
  return out;
}

// A14.5: model profiles, keyed by model id. Absent means none.
function loadModels(raw, where) {
  if (raw === undefined || raw === null) return Object.create(null);
  if (!isObj(raw)) fail(where, "models must be an object");
  const out = Object.create(null);
  for (const [id, m] of Object.entries(raw)) {
    const w = `${where}.models ${id}`;
    if (!isObj(m)) fail(w, "a model profile is an object");
    noExtraKeys(m, ["pricing", "rejects", "script"], w);
    if (!isObj(m.pricing)) fail(w, "pricing is required");
    const rejects = m.rejects ?? [];
    if (!Array.isArray(rejects) || rejects.some((n) => typeof n !== "string")) {
      fail(w, "rejects must be a list of parameter names");
    }
    if (m.script !== undefined && m.script !== null) checkSteps(m.script, `${w}.script`);
    out[id] = { pricing: m.pricing, rejects: [...rejects], script: m.script ?? null };
  }
  return out;
}

// A14.3: crash: {"turn": n}, or absent.
function loadCrash(raw, where) {
  if (raw === undefined || raw === null) return null;
  if (!isObj(raw)) fail(where, "crash is an object with a turn");
  noExtraKeys(raw, ["turn"], `${where}.crash`);
  return { turn: reqInt(raw, "turn", `${where}.crash`, 1) };
}

// A4: the incident block. Shape only; references to course.json and traces are
// checked by check_scenarios. Absent means the tape has no incident.
const INCIDENT_KEYS = ["family", "wire", "board", "seed", "first_bad_seq", "accept_seqs", "why", "hint", "notes", "fixes", "correct_fix", "par_s"];
const INCIDENT_REQUIRED = ["family", "wire", "board", "seed", "first_bad_seq", "why", "hint", "fixes", "correct_fix", "par_s"];
const INCIDENT_WIRES = ["control", "context", "loop", "errors", "tools", "permissions", "verify", "observe"];

function nonEmpty(obj, key, where) {
  if (typeof obj[key] !== "string" || obj[key] === "") fail(where, `${key} must be a non-empty string`);
  return obj[key];
}

function nonNegInt(obj, key, where) {
  if (!Number.isInteger(obj[key]) || obj[key] < 0) fail(where, `${key} must be an integer >= 0`);
  return obj[key];
}

function loadIncident(inc, where) {
  if (!isObj(inc)) fail(where, "incident must be an object");
  noExtraKeys(inc, INCIDENT_KEYS, where);
  for (const k of INCIDENT_REQUIRED) {
    if (!(k in inc)) fail(where, `incident is missing "${k}"`);
  }
  if (!INCIDENT_WIRES.includes(inc.wire)) fail(where, `wire "${inc.wire}" is not a wire category`);
  const accept_seqs = inc.accept_seqs ?? [];
  if (!Array.isArray(accept_seqs)) fail(where, "accept_seqs must be a list of seqs");
  accept_seqs.forEach((s, i) => {
    if (!Number.isInteger(s) || s < 0) fail(where, `accept_seqs[${i}] must be an integer >= 0`);
  });
  const notes = inc.notes ?? [];
  if (!Array.isArray(notes)) fail(where, "notes must be a list of {seq, text}");
  const noteList = notes.map((n, i) => {
    const w = `${where}.notes[${i}]`;
    if (!isObj(n)) fail(w, "must be {seq, text}");
    noExtraKeys(n, ["seq", "text"], w);
    return { seq: nonNegInt(n, "seq", w), text: nonEmpty(n, "text", w) };
  });
  if (!Array.isArray(inc.fixes) || inc.fixes.length < 2 || inc.fixes.length > 4) {
    fail(where, "fixes must be a list of 2 to 4 {text, why}");
  }
  const fixes = inc.fixes.map((f, i) => {
    const w = `${where}.fixes[${i}]`;
    if (!isObj(f)) fail(w, "must be {text, why}");
    noExtraKeys(f, ["text", "why"], w);
    return { text: nonEmpty(f, "text", w), why: nonEmpty(f, "why", w) };
  });
  const correct_fix = nonNegInt(inc, "correct_fix", where);
  if (correct_fix >= fixes.length) fail(where, `correct_fix ${correct_fix} is not an index of fixes`);
  return {
    family: nonEmpty(inc, "family", where),
    wire: inc.wire,
    board: nonEmpty(inc, "board", where),
    seed: nonNegInt(inc, "seed", where),
    first_bad_seq: nonNegInt(inc, "first_bad_seq", where),
    accept_seqs,
    why: nonEmpty(inc, "why", where),
    hint: nonEmpty(inc, "hint", where),
    notes: noteList,
    fixes,
    correct_fix,
    par_s: nonNegInt(inc, "par_s", where),
  };
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
