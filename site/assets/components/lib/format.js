// Shared number and status wording for every component (director-owned), so a cost or a status reads
// the same in the replay, the bench, the clock and the cards.

const INT = new Intl.NumberFormat("en-US");

/** 10991 -> "10,991" */
export function formatInt(n) {
  return INT.format(n);
}

/**
 * A cost in nano-units (ENGINE §8) -> "≈ $0.0264" when the tape's pricing names a fact (real USD),
 * else "≈ 0.0264 units". Rounded half up to 4 decimals.
 */
export function formatCost(nano, { usd = true } = {}) {
  const tenThousandths = Math.floor(nano / 1e5 + 0.5);
  const text = (tenThousandths / 1e4).toFixed(4);
  return usd ? `≈ $${text}` : `≈ ${text} units`;
}

/** True when a tape's pricing comes from the facts registry (so costs are real USD). */
export function pricingIsUsd(tape) {
  return Boolean(tape?.pricing && typeof tape.pricing.fact === "string");
}

/** 1200 -> "1.2 s", 800 -> "800 ms", 2000 -> "2 s". */
export function formatMs(ms) {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  return Number.isInteger(s) ? `${s} s` : `${s.toFixed(1)} s`;
}

/** "1 run", "2 runs". */
export function plural(n, one, many = `${one}s`) {
  return `${formatInt(n)} ${n === 1 ? one : many}`;
}

/**
 * A pass is a true done (DECISIONS D-045): the harness ended the run "done" and the tape's checks
 * hold. A false done, an unverified run, or a run a guard stopped with the files right is not a pass.
 */
export function isPass(status, passed) {
  return status === "done" && passed === true;
}

const STATUS_WORDS = {
  unverified: "unverified, checks fail",
  max_turns: "stopped by the turn limit",
  max_time: "stopped by the time limit", // D-060: Rein's time guard (H8); the simulator never ends this way
  budget: "stopped by the token budget",
  loop: "stopped by the loop guard",
  circuit_open: "stopped by the breaker",
  interrupted: "interrupted",
  error: "ended with an error",
  refused: "the model declined",
  max_tokens_reply: "a reply was cut off",
};

/** How a run ended, in words: "done, checks pass", "false done, checks fail", "stopped by the turn limit", ... */
export function statusWords(status, passed) {
  if (status === "done") return passed ? "done, checks pass" : "false done, checks fail";
  return STATUS_WORDS[status] ?? status;
}
