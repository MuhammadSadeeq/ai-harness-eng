// Pure helpers for hx-bench and hx-num: bench statistics, Wilson intervals, histogram bins, the par sweep and
// the reading format of hx-num. No DOM and no I/O, so Node tests import this file directly.
// Number and cost wording come from lib/format.js (shared). A pass is isPass(status, passed) (DECISIONS D-045).
import { isPass, formatCost, formatInt } from "./format.js";

/** z for a two-sided 95 % interval. */
export const Z95 = 1.959964;

/** Turn bins for the histograms: 0, 5, …, 60 (the engine's safety stop is turn 60). */
export const TURN_EDGES = Array.from({ length: 13 }, (_, i) => i * 5);

/** Stats for one board on one set of seeds (COMPONENTS §10). passed counts true passes; mean_cost is floored. */
export function summarize(trials) {
  const n = trials.length;
  if (n === 0) return { n: 0, passed: 0, worst_turns: 0, worst_cost: 0, mean_cost: 0, worst_ms: 0, mean_ms: 0 };
  let passed = 0;
  let worstTurns = 0;
  let worstCost = 0;
  let worstMs = 0;
  let total = 0;
  let totalMs = 0;
  for (const t of trials) {
    if (isPass(t.status, t.passed)) passed += 1;
    if (t.turns > worstTurns) worstTurns = t.turns;
    if (t.cost > worstCost) worstCost = t.cost;
    const ms = t.ms ?? 0;
    if (ms > worstMs) worstMs = ms;
    total += t.cost;
    totalMs += ms;
  }
  // B-17: worst_ms is the longest run's clock at run_end; mean_ms is the floored mean, as mean_cost is.
  return {
    n,
    passed,
    worst_turns: worstTurns,
    worst_cost: worstCost,
    mean_cost: Math.floor(total / n),
    worst_ms: worstMs,
    mean_ms: Math.floor(totalMs / n),
  };
}

/** Wilson score interval for `passed` passes in `n` trials, as fractions in [0, 1]. */
export function wilson(passed, n, z = Z95) {
  if (!(n > 0)) return { lo: 0, hi: 1 };
  const p = passed / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/** A whole-number percentage, rounded half up. */
export function percent(passed, n) {
  return n > 0 ? Math.floor((100 * passed) / n + 0.5) : 0;
}

/** Counts per bin. edges has k+1 ascending values for k bins; the last bin includes its upper edge. */
export function histogram(values, edges) {
  const counts = new Array(edges.length - 1).fill(0);
  const last = counts.length - 1;
  for (const v of values) {
    for (let b = 0; b <= last; b += 1) {
      if (v >= edges[b] && (v < edges[b + 1] || (b === last && v <= edges[b + 1]))) {
        counts[b] += 1;
        break;
      }
    }
  }
  return counts;
}

/**
 * The par sweep. rows: [{value, passed, worst_cost}], one per knob value, on the same seeds as the old board.
 * A value is feasible when the new board passes at least as many runs as the old board (oldPassed). Par is the
 * feasible value with the lowest worst_cost; on a tie, the smallest value. par is null when nothing is feasible.
 */
export function sweepPar(rows, oldPassed) {
  const scored = [...rows]
    .sort((a, b) => a.value - b.value)
    .map((r) => ({ value: r.value, passed: r.passed, worst_cost: r.worst_cost, feasible: r.passed >= oldPassed }));
  let par = null;
  for (const r of scored) {
    if (r.feasible && (par === null || r.worst_cost < par.worst_cost)) par = r;
  }
  return { rows: scored, par: par === null ? null : { value: par.value, passed: par.passed, worst_cost: par.worst_cost } };
}

/** Text for a value in the reading format of hx-num: int, usd (no "≈" mark: the prose adds it) or percent. */
export function formatValue(value, format) {
  if (value === null || value === undefined) return "—";
  if (format === "usd") return formatCost(value).replace(/^≈ /, "");
  if (format === "percent") return `${value}%`;
  if (format === "int") return formatInt(value);
  return String(value);
}
