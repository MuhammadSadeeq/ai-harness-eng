// Event -> plain sentence (BP-1.4 §1). The templates are the blueprint's table, word for word.
// explain(event, ctx) -> {text, terms}: terms names the course terms the sentence uses.
// Plurals follow the count. Numbers carry thousands separators.

const TERM_TOOL = "tool call";

/** 1234567 -> "1,234,567" */
export function grouped(x) {
  const sign = x < 0 ? "-" : "";
  return sign + String(Math.abs(Math.trunc(x))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** A list of names: "a", "a and b", "a, b and c". */
export function listJoin(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Milliseconds as seconds with one decimal at most: 2000 -> "2", 1200 -> "1.2". */
export function secsNum(ms) {
  return String(Math.round(ms / 100) / 10);
}

/** A wait: "800 ms" below one second, "1.2 s" from one second. */
export function formatWait(ms) {
  return ms < 1000 ? `${ms} ms` : `${secsNum(ms)} s`;
}

const plural = (count, one, many) => (count === 1 ? one : many);
const callsOf = (count) => `${count} ${plural(count, "tool call", "tool calls")}`;

function firstLine(output) {
  return String(output ?? "").split("\n")[0].slice(0, 80);
}

function explainModelReply(e) {
  switch (e.stop_reason) {
    case "tool_use": {
      const names = (e.tool_uses ?? []).map((u) => u.name);
      return { text: `The model asks for ${callsOf(names.length)}: ${listJoin(names)}.`, terms: [TERM_TOOL] };
    }
    case "end_turn":
      return { text: "The model says it is done.", terms: [] };
    case "max_tokens":
      return { text: "The reply hit its length limit and stops mid-way.", terms: [] };
    case "refusal":
      return { text: "The model declines the task.", terms: [] };
    default:
      return { text: "The model replies.", terms: [] };
  }
}

function explainPermission(e) {
  if (e.rule === "none") return { text: `No permission policy: ${e.tool} runs.`, terms: ["permission"] };
  if (e.decision === "ask") {
    return {
      text: `The policy asks a person about ${e.tool} (${e.reason}). They ${e.human}.`,
      terms: ["permission"],
    };
  }
  if (e.decision === "deny") {
    return { text: `${e.tool} is denied by ${e.rule}: ${e.reason}.`, terms: ["permission"] };
  }
  return { text: `${e.tool} is allowed by ${e.rule}: ${e.reason}.`, terms: ["permission"] };
}

function explainRunEnd(e) {
  switch (e.status) {
    case "done":
      return e.passed
        ? { text: "The run ends: done, and the checks pass.", terms: [] }
        : { text: 'The run ends "done", but the checks fail: a false done.', terms: ["false done"] };
    case "unverified":
      return { text: "The run ends unverified: the work still fails its checks.", terms: ["verify"] };
    case "max_turns":
      return { text: "The run ends: stopped by the turn limit.", terms: ["turn limit"] };
    case "budget":
      return { text: "The run ends: stopped by the token budget.", terms: ["token budget"] };
    case "loop":
      return { text: "The run ends: stopped by the loop guard.", terms: ["loop guard"] };
    case "circuit_open":
      return { text: "The run ends: the breaker stopped it.", terms: ["breaker"] };
    case "interrupted":
      return { text: "The run ends: interrupted.", terms: ["interrupt"] };
    case "error":
      return { text: "The run ends with an error.", terms: [] };
    case "refused":
      return { text: "The run ends: the model declined.", terms: [] };
    case "max_tokens_reply":
      return { text: "The run ends: a reply hit its length limit.", terms: [] };
    default:
      return { text: `The run ends: ${e.status}.`, terms: [] };
  }
}

/** The plain sentence for one event, and the course terms it uses. ctx = {events, index} (unused by most kinds). */
export function explain(e, ctx = {}) { // eslint-disable-line no-unused-vars
  switch (e.kind) {
    case "run_start":
      return { text: `The run starts. Task: "${e.task}".`, terms: [] };
    case "prompt_built":
      return {
        text: `The harness builds the prompt from ${listJoin(e.layers)}: ${grouped(e.tokens)} tokens.`,
        terms: ["prompt"],
      };
    case "context_check":
      if (e.action === "overflow") {
        return {
          text: `The prompt is ${grouped(e.tokens)} tokens, but the window holds ${grouped(e.window)}. It can't be sent.`,
          terms: ["context window"],
        };
      }
      return {
        text: `The prompt fills ${e.percent}% of the ${grouped(e.window)}-token window.`,
        terms: ["context window"],
      };
    case "model_call":
      return {
        text: e.attempt === 1
          ? "The harness sends the prompt to the model."
          : `Attempt ${e.attempt}: the harness sends the same prompt again.`,
        terms: [],
      };
    case "model_error": {
      const wait = e.retry_after_ms > 0 ? ` The server asks for a wait of ${secsNum(e.retry_after_ms)} s.` : "";
      return { text: `The call fails: ${e.message}.${wait}`, terms: [] };
    }
    case "retry_wait":
      return { text: `The harness waits ${formatWait(e.wait_ms)} before trying again.`, terms: ["retry"] };
    case "breaker":
      return {
        text: `${grouped(e.failures)} ${plural(e.failures, "failure", "failures")} in a row: the breaker opens and the run stops.`,
        terms: ["breaker"],
      };
    case "recovery_check":
      return {
        text: e.attempts === 1
          ? "The call went through on the first try."
          : `The call went through after ${e.attempts} attempts.`,
        terms: [],
      };
    case "model_reply":
      return explainModelReply(e);
    case "interrupt":
      if (e.by === "operator") {
        return { text: "Turn 60: an operator notices the run and stops it.", terms: ["interrupt"] };
      }
      return {
        text: `You stop the run. ${callsOf(e.pending.length)} ${plural(e.pending.length, "was", "were")} still waiting to run.`,
        terms: ["interrupt"],
      };
    case "permission":
      return explainPermission(e);
    case "sandbox":
      return e.allowed
        ? { text: `The sandbox lets ${e.tool} through.`, terms: ["sandbox"] }
        : { text: `The sandbox blocks ${e.tool}: ${e.reason}.`, terms: ["sandbox"] };
    case "tool_call":
      if (e.ok) {
        const cut = e.truncated ? " The result is cut to fit." : "";
        return {
          text: `${e.tool} runs and returns ${grouped(e.output_tokens)} ${plural(e.output_tokens, "token", "tokens")}.${cut}`,
          terms: [TERM_TOOL],
        };
      }
      return { text: `${e.tool} fails: ${firstLine(e.output)}.`, terms: [TERM_TOOL] };
    case "verify":
      return e.passed
        ? { text: "The harness checks the work: the tests pass.", terms: ["verify"] }
        : {
          text: "The harness checks the work: the tests fail, so it sends the failure back.",
          terms: ["verify"],
        };
    case "guard":
      if (e.guard === "budget") {
        return { text: `The token budget (${grouped(e.limit)}) is spent, so the harness stops the run.`, terms: ["token budget"] };
      }
      if (e.guard === "loop") {
        return {
          text: `The last ${e.limit} tool calls were identical, so the loop guard stops the run.`,
          terms: ["loop guard"],
        };
      }
      return { text: `The turn limit (${e.limit}) is reached, so the harness stops the run.`, terms: ["turn limit"] };
    case "trace_write": {
      const records = `The trace records ${grouped(e.events)} ${plural(e.events, "event", "events")}.`;
      const hidden = e.redacted > 0
        ? ` ${grouped(e.redacted)} ${plural(e.redacted, "secret is", "secrets are")} hidden.`
        : "";
      return { text: records + hidden, terms: ["trace"] };
    }
    case "run_end":
      return explainRunEnd(e);
    default:
      return { text: `The harness records a ${e.kind} event.`, terms: [] };
  }
}

/** The live-region sentence for a turn: "Turn 4 of 14: <the turn's model reply, or its last event>". */
export function turnSummary(events, turn, total = null) {
  const inTurn = events.filter((e) => e.turn === turn);
  const reply = inTurn.find((e) => e.kind === "model_reply") ?? inTurn[inTurn.length - 1];
  const of = total ?? Math.max(...events.map((e) => e.turn));
  if (!reply) return `Turn ${turn} of ${of}.`;
  return `Turn ${turn} of ${of}: ${explain(reply).text}`;
}
