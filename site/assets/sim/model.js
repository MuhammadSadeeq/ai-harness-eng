// The scripted model (docs/ENGINE.md sections 6.1 to 6.3, amendment A3.14).
// call() returns either {kind: "error", type, retry_after_ms, error_ms} or
// {kind: "reply", say, tool_uses, content, stop_reason, latency_ms}.
// Every branch choice is recorded in `branches` as [path, option_index], where path
// is the JSON-pointer-style location of the branch step in the tape's script (A3.22).

import { EFFORT_LEVELS } from "./tape.js";

export const ERROR_MESSAGE = {
  overloaded: "Overloaded",
  rate_limit: "Rate limited",
  api_error: "Internal server error",
  timeout: "Request timed out",
  invalid_request: "Invalid request",
};
export const DEFAULT_ERROR_MS = 300;
const MAX_STEP_EXPANSIONS = 100000;

function errorOutcome(type, retryAfter, errorMs) {
  return { kind: "error", type, retry_after_ms: retryAfter, error_ms: errorMs };
}

// Every string value inside a JSON-like value (values, not keys), in order.
export function stringsIn(v, out = []) {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) stringsIn(x, out);
  else if (v !== null && typeof v === "object") for (const k of Object.keys(v)) stringsIn(v[k], out);
  return out;
}

function conditionHolds(cond, snap) {
  if (cond.startsWith("turn_gte:")) return snap.turn >= Number(cond.slice("turn_gte:".length));
  // A5: the request about to be sent has fewer than n messages (snap.sent counts those).
  if (cond.startsWith("history_lt:")) return snap.sent < Number(cond.slice("history_lt:".length));
  // A7.3: the level in force is at least the named level (levels are in order, low to max).
  if (cond.startsWith("effort_gte:")) {
    return EFFORT_LEVELS.indexOf(snap.effort) >= EFFORT_LEVELS.indexOf(cond.slice("effort_gte:".length));
  }
  // A6.1: 100 * tokens(request) >= n * window, for the request about to be sent.
  if (cond.startsWith("context_gte:")) {
    return 100 * snap.request_tokens >= Number(cond.slice("context_gte:".length)) * snap.window;
  }
  // A6.1: no string value in the request contains the text (everything after the first colon).
  if (cond.startsWith("sent_lacks:")) {
    const text = cond.slice("sent_lacks:".length);
    return !stringsIn(snap.request).some((x) => x.includes(text));
  }
  // A9.2: the request about to be sent has at least n tool definitions (tool_search's own counts).
  if (cond.startsWith("tools_gte:")) return snap.request.tools.length >= Number(cond.slice("tools_gte:".length));
  // A9.2: the named tool is among the request's tool definitions.
  if (cond.startsWith("tool_loaded:")) {
    const name = cond.slice("tool_loaded:".length);
    return snap.request.tools.some((d) => d.name === name);
  }
  return snap[cond] === true;
}

// Queue items carry their own path, so spliced steps keep the location they have in the tape.
function children(steps, base) {
  return steps.map((step, j) => ({ step, path: `${base}/${j}` }));
}

export class ScriptedModel {
  constructor(tape, prng) {
    this.queue = tape.script.map((step, i) => ({ step, path: `/script/${i}` }));
    this.prng = prng;
    this.faults = tape.faults;
    this.outage = tape.outage;
    this.branches = [];
  }

  // Outage first, then the faults in order (A3.14); the first failing fault stops the draws.
  // snap: {turn, sent, request, request_tokens, window, last_result_error, last_denied, verify_feedback, last_truncated}, sent = messages in the request (A5), request = the request about to be sent (A6.1),
  // taken just before the call. t is the trial clock in ms.
  call(t, snap) {
    const o = this.outage;
    if (o && t >= o.from_ms && t < o.to_ms) return errorOutcome(o.type, o.retry_after_ms, DEFAULT_ERROR_MS);
    for (const f of this.faults) {
      if (this.prng.percent() < f.percent) return errorOutcome(f.type, 0, DEFAULT_ERROR_MS);
    }
    return this.nextStep(snap);
  }

  nextStep(snap) {
    const q = this.queue;
    let expansions = 0;
    for (;;) {
      if (q.length === 0) {
        const say = "(the script has run out)";
        return {
          kind: "reply",
          say,
          tool_uses: [],
          content: [{ type: "text", text: say }],
          stop_reason: "end_turn",
          latency_ms: null,
        };
      }
      expansions += 1;
      if (expansions > MAX_STEP_EXPANSIONS) {
        throw new Error("script: no reply after 100000 expansions (check repeat and when steps)");
      }
      const { step, path } = q.shift();
      if ("branch" in step) {
        const draw = this.prng.percent();
        let acc = 0;
        for (let k = 0; k < step.branch.length; k += 1) {
          acc += step.branch[k].percent;
          if (draw < acc) {
            this.branches.push([path, k]);
            q.unshift(...children(step.branch[k].then, `${path}/branch/${k}/then`));
            break;
          }
        }
      } else if ("when" in step) {
        for (let i = 0; i < step.when.length; i += 1) {
          const c = step.when[i];
          if ("else" in c) {
            q.unshift(...children(c.else, `${path}/when/${i}/else`));
            break;
          }
          if (conditionHolds(c.if, snap)) {
            q.unshift(...children(c.then, `${path}/when/${i}/then`));
            break;
          }
        }
      } else if ("repeat" in step) {
        const { steps, times } = step.repeat;
        const body = children(steps, `${path}/repeat/steps`);
        if (times === "forever") {
          if (steps.length > 0) q.unshift(...body, { step, path });
        } else {
          const all = [];
          for (let i = 0; i < times; i += 1) all.push(...body);
          q.unshift(...all);
        }
      } else if ("error" in step) {
        return errorOutcome(step.error, step.retry_after_ms ?? 0, step.error_ms ?? DEFAULT_ERROR_MS);
      } else {
        return replyOutcome(step, snap.turn);
      }
    }
  }
}

function replyOutcome(step, turn) {
  const tools = step.tools ?? [];
  const tool_uses = tools.map(([name, input], k) => ({ id: `toolu_${turn}_${k + 1}`, name, input }));
  const say = "say" in step ? step.say : null;
  const content = [];
  if (say !== null) content.push({ type: "text", text: say });
  for (const u of tool_uses) content.push({ type: "tool_use", id: u.id, name: u.name, input: u.input });
  const stop_reason = step.stop ?? (tool_uses.length > 0 ? "tool_use" : "end_turn");
  return {
    kind: "reply",
    say,
    tool_uses,
    content,
    stop_reason,
    latency_ms: step.latency_ms ?? null,
  };
}
