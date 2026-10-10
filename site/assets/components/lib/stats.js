// Pure helpers for hx-bench, hx-num and hx-check: bench statistics, Wilson intervals, histogram bins, the par
// sweep and number text. No DOM and no I/O, so Node tests import this file directly (test/stats.test.mjs).
//
// Costs are integer nano-units (ENGINE §8). When the tape's pricing names a fact, 1e9 nano-units = 1 USD.

/** z for a two-sided 95 % interval. */
export const Z95 = 1.959964;

/** Turn bins for the histograms: 0, 5, …, 60 (the engine's safety stop is turn 60). */
export const TURN_EDGES = Array.from({ length: 13 }, (_, i) => i * 5);

/** Stats for one board on one set of seeds (COMPONENTS §10). mean_cost is floored. */
export function summarize(trials) {
  const n = trials.length;
  if (n === 0) return { n: 0, passed: 0, worst_turns: 0, worst_cost: 0, mean_cost: 0 };
  let passed = 0;
  let worstTurns = 0;
  let worstCost = 0;
  let total = 0;
  for (const t of trials) {
    if (t.passed) passed += 1;
    if (t.turns > worstTurns) worstTurns = t.turns;
    if (t.cost > worstCost) worstCost = t.cost;
    total += t.cost;
  }
  return { n, passed, worst_turns: worstTurns, worst_cost: worstCost, mean_cost: Math.floor(total / n) };
}

/** Wilson score interval for `passed` successes in `n` trials, as fractions in [0, 1]. */
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

/** Integer with thousands separators: 60000 -> "60,000". */
export function formatInt(n) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

// Four decimals, truncated (integer arithmetic on nano-units): 26438000 -> "0.0264", 9466000 -> "0.0094".
function fourDecimals(nano) {
  const tenThousandths = Math.floor(nano / 100000);
  const whole = Math.floor(tenThousandths / 10000);
  return `${whole}.${String(tenThousandths % 10000).padStart(4, "0")}`;
}

/** "$0.0264" for a nano-unit cost (no approximation mark; the caller adds "≈" where DESIGN §11 asks). */
export function usdText(nano) {
  return `$${fourDecimals(nano)}`;
}

/** "$0.0264" or "0.0264" (no unit, no mark): the short form for chart axes. */
export function costValue(nano, priced) {
  return priced ? usdText(nano) : fourDecimals(nano);
}

/** "≈ $0.0264" when the tape is priced by a fact, else "≈ 0.0264 units". */
export function costText(nano, priced) {
  return priced ? `≈ ${usdText(nano)}` : `≈ ${fourDecimals(nano)} units`;
}

/** Text for a value in the reading format of hx-num: int, usd or percent. */
export function formatValue(value, format) {
  if (value === null || value === undefined) return "—";
  if (format === "usd") return usdText(value);
  if (format === "percent") return `${value}%`;
  if (format === "int") return formatInt(value);
  return String(value);
}
