// Events (docs/ENGINE.md section 9): envelope, wire category, redaction and the
// trace_write bookkeeping. Serialization is traceLine in pyjson.js (section 10).
export { traceLine } from "./pyjson.js";

const WIRE = {
  run_start: "loop",
  prompt_built: "control",
  context_check: "context",
  model_call: "loop",
  model_error: "errors",
  retry_wait: "errors",
  breaker: "errors",
  recovery_check: "errors",
  model_reply: "loop",
  interrupt: "loop",
  permission: "permissions",
  sandbox: "permissions",
  tool_call: "tools",
  verify: "verify",
  guard: "loop",
  trace_write: "observe",
  run_end: "loop",
  compaction: "context",
  cache: "context",
  input_check: "tools",
  cost: "observe",
  leak: "permissions",
  tool_rejected: "tools",
  // A14: sub-agents, sessions, crash and resume, capability.
  subagent_start: "loop",
  subagent_end: "loop",
  session_start: "context",
  crash: "loop",
  resume: "loop",
  capability: "control",
};

export class Trace {
  // st is the harness clock: {t, turn}, read at each emit.
  constructor(run, patterns, st) {
    this.run = run;
    this.patterns = patterns;
    this.st = st;
    this.events = [];
    this.seq = 0;
    this.pending = 0;
    this.redacted = 0;
    // A14.4: the agent field of every event; a sub-agent's events carry its name, the parent's "main".
    this.label = "main";
  }

  // Replaces every redact pattern in every string of the payload, counting replacements.
  redactValue(v) {
    if (typeof v === "string") {
      let s = v;
      for (const p of this.patterns) {
        const parts = s.split(p);
        if (parts.length > 1) {
          this.redacted += parts.length - 1;
          s = parts.join("[REDACTED]");
        }
      }
      return s;
    }
    if (Array.isArray(v)) return v.map((x) => this.redactValue(x));
    if (v !== null && typeof v === "object") {
      const o = {};
      for (const [k, x] of Object.entries(v)) o[k] = this.redactValue(x);
      return o;
    }
    return v;
  }

  emit(kind, fields = {}) {
    const payload = {};
    for (const [k, v] of Object.entries(fields)) payload[k] = this.redactValue(v);
    const ev = {
      v: 1,
      run: this.run,
      seq: this.seq,
      t: this.st.t,
      turn: this.st.turn,
      agent: this.label,
      kind,
      wire: WIRE[kind],
      ...payload,
    };
    this.seq += 1;
    this.events.push(ev);
    if (kind !== "trace_write") this.pending += 1;
    return ev;
  }

  // trace_write for the events since the previous one. Nothing happens when none.
  flush() {
    if (this.pending === 0) return;
    const events = this.pending;
    const redacted = this.redacted;
    this.pending = 0;
    this.redacted = 0;
    this.emit("trace_write", { events, redacted });
  }
}
