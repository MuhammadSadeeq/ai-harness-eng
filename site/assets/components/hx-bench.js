// hx-bench: the Knob Bench (DESIGN §7.5–§7.6, COMPONENTS §10). Every number is computed from runBench results.
// Attributes are read at upgrade. Values: knob, passed.*, worst_turns.*, worst_cost.*, trials; hxLabel(name).
import { HxElement } from "./lib/hx-element.js";
import { getTape, getBoard, getFacts } from "./lib/data.js";
import { runBench } from "../sim/index.js";
import { summarize, wilson, percent, histogram, TURN_EDGES, sweepPar } from "./lib/stats.js";
import { formatCost, formatInt, plural, pricingIsUsd, statusWords, isPass } from "./lib/format.js";

const KNOB_LABELS = {
  "turn_limit.max_turns": "Turn limit",
  "token_budget.max_tokens": "Token budget",
  "loop_detect.window": "Loop window",
  "output_cap.max_tokens": "Output cap (tokens)",
  "retry.max_attempts": "Retry attempts",
  "retry.base_ms": "Backoff base (ms)",
  "breaker.threshold": "Breaker threshold",
  "verify_gate.max_feedback": "Verify retries",
};
const PAR_MODE = "cheapest-worst-case";
const REVEAL_AFTER = 3;
const GUARD_STATUSES = new Set(["max_turns", "budget", "loop", "circuit_open"]);
const GOAL_LINE = "Find the cheapest worst case without losing a passing run.";
const PAR_LINE = "Par: the cheapest worst case that keeps every passing run.";
const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
let uidCount = 0;
const BOARD_KEYS = ["old", "new"];

const yieldToLoop = () => new Promise((resolve) => {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    channel.port1.close();
    resolve();
  };
  channel.port2.postMessage(null);
});

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key === "text") node.textContent = value;
    else node.setAttribute(key, String(value));
  }
  node.append(...children);
  return node;
};

const svgNode = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key === "text") node.textContent = String(value);
    else node.setAttribute(key, String(value));
  }
  return node;
};

const glyph = (name) => {
  const icon = svgNode("svg", { class: "glyph", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" });
  const use = svgNode("use");
  use.setAttribute("href", `${SPRITE}#g-${name}`);
  icon.append(use);
  return icon;
};

const words = (module) => module.replace(/_/g, " ");
const money = (nano, priced) => formatCost(nano, { usd: priced });

/** "turn limit 12, token budget 60,000", or "no modules plugged". */
function modulesText(board) {
  const parts = [];
  for (const [module, params] of Object.entries(board.modules ?? {})) {
    const entries = Object.entries(params ?? {});
    if (entries.length === 0) parts.push(words(module));
    let plain = false;
    for (const [param, value] of entries) {
      const label = KNOB_LABELS[`${module}.${param}`];
      if (label && Number.isInteger(value)) parts.push(`${label.toLowerCase()} ${formatInt(value)}`);
      else if (!plain) {
        plain = true;
        parts.push(words(module));
      }
    }
  }
  return parts.length > 0 ? parts.join(", ") : "no modules plugged";
}

/** The mark for a trial (the words come from statusWords). */
function markOf(trial) {
  if (isPass(trial.status, trial.passed)) return "check";
  if (trial.status === "done") return "bang";
  if (trial.status === "error") return "cross";
  if (GUARD_STATUSES.has(trial.status)) return "noentry";
  return "pause";
}

const sameStats = (a, b) => ["n", "passed", "worst_turns", "worst_cost", "mean_cost"].every((k) => a[k] === b[k]);

function honestSentence(run, n, priced) {
  const o = run.old;
  const w = run.new;
  return `On the same ${plural(n, "seed")}, the new board passes ${plural(w.passed, "run")}`
    + ` and the old board passes ${plural(o.passed, "run")}.`
    + ` The worst case goes from ${plural(o.worst_turns, "turn")} to ${plural(w.worst_turns, "turn")},`
    + ` and from ${money(o.worst_cost, priced)} to ${money(w.worst_cost, priced)}.`;
}

function noiseSentence(run) {
  const o = run.old;
  const w = run.new;
  const ci = (s) => wilson(s.passed, s.n);
  const oi = ci(o);
  const ni = ci(w);
  const overlap = ni.lo <= oi.hi && oi.lo <= ni.hi;
  const range = (x) => `${Math.round(x.lo * 100)}–${Math.round(x.hi * 100)}%`;
  return `Pass rate: old ${percent(o.passed, o.n)}% (${range(oi)}), new ${percent(w.passed, w.n)}% (${range(ni)}).`
    + (overlap
      ? " The ranges overlap, so this difference could be noise: run more trials before you claim it."
      : " The ranges don't overlap, so this difference is unlikely to be noise.");
}

// Turns per run: one row per board on one shared scale (0 to the tallest bin); old hatched, new solid.
function drawTurns(width, uid, oldTrials, newTrials) {
  const W = Math.round(width);
  const plotH = 84;
  const labelH = 22;
  const rowH = labelH + plotH;
  const gap = 8;
  const top = 24;
  const x0 = 34;
  const x1 = W - 8;
  const bins = TURN_EDGES.length - 1;
  const oldCounts = histogram(oldTrials.map((t) => t.turns), TURN_EDGES);
  const newCounts = histogram(newTrials.map((t) => t.turns), TURN_EDGES);
  const yMax = Math.max(1, ...oldCounts, ...newCounts);
  const lastBase = top + 2 * rowH + gap;
  const svg = svgNode("svg", {
    class: "hist", viewBox: `0 0 ${W} ${lastBase + 30}`, width: W, height: lastBase + 30, role: "img",
    "aria-label": "Runs by turns for the old board and the new board, on the same axes",
  });
  const defs = svgNode("defs");
  const pattern = svgNode("pattern", { id: `${uid}-hatch`, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
  pattern.append(svgNode("line", { class: "hatch-ink", x1: 0, y1: 0, x2: 0, y2: 6 }));
  defs.append(pattern);
  svg.append(defs);
  svg.append(svgNode("text", { class: "axis-title", x: x0, y: 16, "font-size": 14, text: "Runs by turns (bins of 5)" }));
  const bw = (x1 - x0) / bins;
  [["Old board", oldCounts, true], ["New board", newCounts, false]].forEach(([label, counts, hatched], r) => {
    const rowTop = top + r * (rowH + gap);
    const base = rowTop + rowH;
    svg.append(svgNode("text", { class: "series-label", x: x0 + 4, y: rowTop + 14, "font-size": 14, text: label }));
    counts.forEach((c, b) => {
      if (c === 0) return;
      const h = (c / yMax) * plotH;
      svg.append(svgNode("rect", {
        class: hatched ? "bar-before" : "bar-after",
        x: x0 + b * bw + 2, y: base - h, width: bw - 4, height: h,
        fill: hatched ? `url(#${uid}-hatch)` : null,
      }));
    });
    svg.append(svgNode("line", { class: "axis", x1: x0, x2: x1, y1: base, y2: base }));
  });
  const plotTop = top + labelH;
  svg.append(svgNode("line", { class: "axis", x1: x0, x2: x0, y1: plotTop, y2: lastBase }));
  svg.append(svgNode("text", { class: "tick", x: x0 - 6, y: plotTop + 5, "text-anchor": "end", "font-size": 14, text: String(yMax) }));
  svg.append(svgNode("text", { class: "tick", x: x0 - 6, y: lastBase + 5, "text-anchor": "end", "font-size": 14, text: "0" }));
  for (let b = 0; b <= bins; b += 2) {
    const anchor = b === bins ? "end" : b === 0 ? "start" : "middle";
    svg.append(svgNode("text", { class: "tick", x: x0 + b * bw, y: lastBase + 18, "text-anchor": anchor, "font-size": 14, text: String(b * 5) }));
  }
  return svg;
}

// The solution space: the worst-case cost of every knob value, infeasible values hatched, tried values dotted.
function drawSolution(width, uid, model) {
  const { rows, cfg, tried, current, par, revealed, priced } = model;
  const W = Math.round(width);
  const H = 252;
  const x0 = 88;
  const x1 = W - 12;
  const y0 = 34;
  const y1 = H - 40;
  const span = Math.max(1, cfg.max - cfg.min);
  const xOf = (v) => x0 + ((v - cfg.min) / span) * (x1 - x0);
  const yMax = Math.max(1, ...rows.map((r) => r.worst_cost));
  const yOf = (c) => y1 - (c / yMax) * (y1 - y0);
  const colW = Math.max(2, (x1 - x0) / Math.max(1, rows.length - 1));
  const svg = svgNode("svg", {
    class: "solution", viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img",
    "aria-label": `Worst-case cost for every ${cfg.label.toLowerCase()} from ${cfg.min} to ${cfg.max}. Shaded values lose a passing run.`,
  });
  const defs = svgNode("defs");
  const pattern = svgNode("pattern", { id: `${uid}-hatch2`, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
  pattern.append(svgNode("line", { class: "hatch-rule", x1: 0, y1: 0, x2: 0, y2: 6 }));
  defs.append(pattern);
  svg.append(defs);
  for (const r of rows) {
    if (r.feasible) continue;
    svg.append(svgNode("rect", { class: "infeasible", x: xOf(r.value) - colW / 2, y: y0, width: colW, height: y1 - y0, fill: `url(#${uid}-hatch2)` }));
  }
  svg.append(svgNode("line", { class: "axis", x1: x0, x2: x1, y1, y2: y1 }));
  svg.append(svgNode("line", { class: "axis", x1: x0, x2: x0, y1: y0, y2: y1 }));
  svg.append(svgNode("text", { class: "axis-title", x: x0, y: 18, "font-size": 14, text: "Worst-case cost" }));
  svg.append(svgNode("text", { class: "tick", x: x0 - 6, y: y0 + 6, "text-anchor": "end", "font-size": 14, text: money(yMax, priced) }));
  const last = rows.length - 1;
  rows.forEach((r, i) => {
    const onStep = i % 4 === 0 && last - i >= 3;
    if (i !== last && !onStep) return;
    svg.append(svgNode("text", { class: "tick", x: xOf(r.value), y: y1 + 18, "text-anchor": "middle", "font-size": 14, text: String(r.value) }));
  });
  svg.append(svgNode("text", { class: "axis-title", x: x1, y: H - 4, "text-anchor": "end", "font-size": 14, text: cfg.label }));
  const d = rows.map((r, k) => `${k === 0 ? "M" : "L"}${xOf(r.value).toFixed(1)} ${yOf(r.worst_cost).toFixed(1)}`).join(" ");
  svg.append(svgNode("path", { class: "curve-line", d }));
  for (const value of tried) {
    const r = rows.find((row) => row.value === value);
    if (r) svg.append(svgNode("circle", { class: "tried", cx: xOf(value), cy: yOf(r.worst_cost), r: 5 }));
  }
  if (current !== null) {
    const r = rows.find((row) => row.value === current);
    if (r) svg.append(svgNode("circle", { class: "your-point", cx: xOf(current), cy: yOf(r.worst_cost), r: 10 }));
  }
  if (revealed && par) {
    const cx = xOf(par.value);
    const cy = yOf(par.worst_cost);
    svg.append(svgNode("circle", { class: "par-ring", cx, cy, r: 13 }));
    svg.append(svgNode("text", { class: "par-label", x: Math.min(cx + 16, x1 - 60), y: cy - 22, "font-size": 14, text: `PAR ${par.value}` }));
  }
  return svg;
}

export class HxBench extends HxElement {
  static observedAttributes = ["tape", "old", "new", "trials", "knob", "knob-min", "knob-max", "knob-step", "par", "locked"];
  static styles = new URL("./hx-bench.css", import.meta.url).href;

  async setup() {
    const tapeId = this.getAttribute("tape");
    if (!tapeId) throw new Error("hx-bench needs tape");
    this.uid = `hxb${++uidCount}`;
    this.N = this.intAttr("trials", 20, 1, 50);
    const [tape, facts] = await Promise.all([getTape(tapeId), getFacts()]);
    this.tape = tape;
    this.facts = facts;
    const oldId = this.getAttribute("old") ?? tape.boards[0];
    const newId = this.getAttribute("new") ?? tape.boards[1];
    [this.oldBoard, this.newBoard] = await Promise.all([getBoard(oldId), getBoard(newId)]);
    this.priced = pricingIsUsd(tape);
    this.knobCfg = this.parseKnob();
    const par = this.getAttribute("par");
    if (par !== null && (par !== PAR_MODE || !this.knobCfg)) throw new Error("hx-bench: par needs knob and cheapest-worst-case");
    this.parOn = par !== null;
    this.cursor = { board: "old", k: 0 };
    this.selected = null;
    this.twinK = null;
    this.drawn = { hist: 0, solution: 0 };
    this.state = { knob: this.knobCfg ? this.knobCfg.start : null, run: null, running: false, progress: 0, tries: [], sweep: null, sweepProgress: 0 };
  }

  intAttr(name, fallback, min, max) {
    const raw = this.getAttribute(name) ?? (fallback === undefined ? null : String(fallback));
    if (raw === null || !/^-?\d+$/.test(raw.trim())) throw new Error(`hx-bench: ${name} must be an integer`);
    const value = Number(raw);
    if (min !== undefined && (value < min || value > max)) throw new Error(`hx-bench: ${name} must be ${min} to ${max}`);
    return value;
  }

  parseKnob() {
    const name = this.getAttribute("knob");
    if (!name) return null;
    const label = KNOB_LABELS[name];
    if (!label) throw new Error(`hx-bench: unknown knob ${name}`);
    const min = this.intAttr("knob-min", undefined);
    const max = this.intAttr("knob-max", undefined);
    const step = this.intAttr("knob-step", 1);
    if (min > max || step < 1) throw new Error("hx-bench: bad knob range");
    const [module, param] = name.split(".");
    const current = this.newBoard.modules?.[module]?.[param];
    const cfg = { name, module, param, label, min, max, step };
    return { ...cfg, start: this.snap(Number.isInteger(current) ? current : min, cfg) };
  }

  snap(value, range) {
    const onGrid = range.min + Math.round((value - range.min) / range.step) * range.step;
    return Math.min(range.max, Math.max(range.min, onGrid));
  }

  // ---------- values and the gate (COMPONENTS §10) ----------
  values() {
    const r = this.state?.run ?? null;
    return {
      knob: this.knobCfg ? this.state.knob : null,
      "passed.old": r ? r.old.passed : null,
      "passed.new": r ? r.new.passed : null,
      "worst_turns.old": r ? r.old.worst_turns : null,
      "worst_turns.new": r ? r.new.worst_turns : null,
      "worst_cost.old": r ? r.old.worst_cost : null,
      "worst_cost.new": r ? r.new.worst_cost : null,
      trials: this.N ?? null,
    };
  }

  hxValue(name) {
    const v = this.values();
    return Object.prototype.hasOwnProperty.call(v, name) ? v[name] : null;
  }

  hxSetValue(name, value) {
    if (name === "knob" && this.knobCfg && Number.isInteger(value)) this.setKnob(value);
  }

  hxRange(name) {
    return name === "knob" && this.knobCfg ? { min: this.knobCfg.min, max: this.knobCfg.max, step: this.knobCfg.step } : null;
  }

  hxLabel(name) {
    return name === "knob" && this.knobCfg ? this.knobCfg.label : null;
  }

  emitChange(name, value) {
    this.dispatchEvent(new CustomEvent("hx-change", { bubbles: true, detail: { name, value } }));
  }

  setKnob(value) {
    const next = this.snap(value, this.knobCfg);
    if (next === this.state.knob) return;
    this.setState({ knob: next });
    this.emitChange("knob", next);
  }

  // ---------- running ----------
  // One trial: seed_base + i, through runBench with one seed, so the page can yield between trials.
  trial(board, i) {
    const tape = { ...this.tape, seed_base: this.tape.seed_base + i };
    return runBench(tape, board, 1, { facts: this.facts }).trials[0];
  }

  boardAt(value) {
    if (!this.knobCfg || value === null || value === undefined) return this.newBoard;
    const { module, param } = this.knobCfg;
    return {
      ...this.newBoard,
      modules: { ...this.newBoard.modules, [module]: { ...this.newBoard.modules?.[module], [param]: value } },
    };
  }

  run() {
    if (this.state.running || this.hasAttribute("locked")) return null;
    if (this.parOn && !this.sweepJob) this.sweepJob = this.sweepAll();
    this.runJob = this.doRun();
    return this.runJob;
  }

  async doRun() {
    const value = this.knobCfg ? this.state.knob : null;
    const newBoard = this.boardAt(value);
    const before = this.values();
    this.setState({ running: true, progress: 0 });
    const oldTrials = [];
    const newTrials = [];
    for (let i = 0; i < this.N; i += 1) {
      oldTrials.push(this.trial(this.oldBoard, i));
      newTrials.push(this.trial(newBoard, i));
      this.setState({ progress: i + 1 });
      await yieldToLoop();
    }
    const run = { value, old: summarize(oldTrials), new: summarize(newTrials), oldTrials, newTrials };
    const tries = value === null || this.state.tries.includes(value) ? this.state.tries : [...this.state.tries, value];
    this.setState({ running: false, progress: 0, run, tries });
    this.dispatchEvent(new CustomEvent("hx-result", { bubbles: true, detail: { source: "bench", old: run.old, new: run.new } }));
    this.evidence("bench", {
      tape: this.tape.id, old: run.old, new: run.new, knob: this.knobCfg ? this.knobCfg.name : null, value,
      old_passed: run.old.passed, new_passed: run.new.passed,
    });
    const after = this.values();
    for (const key of Object.keys(after)) {
      if (after[key] !== before[key]) this.emitChange(key, after[key]);
    }
    const d = this.derive();
    if (d.atPar && !this.parEvidenced) {
      this.parEvidenced = true;
      this.evidence("par", { tape: this.tape.id, knob: this.knobCfg.name, value: d.sweep.par.value });
    }
    return true;
  }

  // The par sweep: every knob value, N trials each, on the same seeds as the old board (background, after setup).
  async series(board) {
    const trials = [];
    for (let i = 0; i < this.N; i += 1) {
      trials.push(this.trial(board, i));
      await yieldToLoop();
    }
    return trials;
  }

  async sweepAll() {
    const cfg = this.knobCfg;
    const values = [];
    for (let v = cfg.min; v <= cfg.max; v += cfg.step) values.push(v);
    const oldPassed = summarize(await this.series(this.oldBoard)).passed;
    const rows = [];
    for (const value of values) {
      const s = summarize(await this.series(this.boardAt(value)));
      rows.push({ value, passed: s.passed, worst_cost: s.worst_cost });
      this.setState({ sweepProgress: rows.length });
    }
    this.setState({ sweep: { ...sweepPar(rows, oldPassed), total: values.length } });
  }

  derive() {
    const s = this.state;
    const run = s.run;
    const stale = Boolean(run && this.knobCfg && run.value !== s.knob);
    const current = Boolean(run) && !stale;
    const sweep = s.sweep;
    const triedCount = s.tries.length;
    const revealed = Boolean(sweep && sweep.par && triedCount >= REVEAL_AFTER);
    const atPar = Boolean(this.parOn && current && revealed && run.value === sweep.par.value);
    return { run, stale, current, sweep, triedCount, revealed, atPar };
  }

  // ---------- rendering ----------
  render() {
    if (!this.dom) this.build();
    const d = this.derive();
    this.paintControls(d);
    this.refreshGrid(d);
    this.paintResults(d);
    this.paintPar(d);
    const staleLine = d.stale ? `Results are for a ${this.knobCfg.label.toLowerCase()} of ${d.run.value}. Run again.` : "";
    this.live(this.liveText(d, staleLine));
  }

  liveText(d, staleLine) {
    if (this.state.running) return "Running…";
    if (staleLine) return staleLine;
    if (d.run) return honestSentence(d.run, this.N, this.priced) + (d.atPar ? ` ${PAR_LINE}` : "");
    return "";
  }

  build() {
    const N = this.N;
    const cfg = this.knobCfg;
    const dom = { cells: { old: [], new: [] }, modules: {}, windowValues: {} };
    this.dom = dom;
    const kids = [];
    if (cfg) {
      dom.knobLabel = el("p", { class: "knob-name", text: cfg.label });
      dom.minus = el("button", { class: "key key-icon", type: "button", "data-key": "knob-minus", "aria-label": `Lower ${cfg.label}`, text: "−" });
      dom.range = el("input", {
        type: "range", min: cfg.min, max: cfg.max, step: cfg.step, "aria-label": cfg.label, "data-key": "knob-range",
      });
      dom.plus = el("button", { class: "key key-icon", type: "button", "data-key": "knob-plus", "aria-label": `Raise ${cfg.label}`, text: "+" });
      dom.knobValue = el("span", { class: "readout-value" });
      dom.minus.addEventListener("click", () => this.setKnob(this.state.knob - cfg.step));
      dom.plus.addEventListener("click", () => this.setKnob(this.state.knob + cfg.step));
      dom.range.addEventListener("input", () => this.setKnob(Number(dom.range.value)));
      kids.push(el("div", { class: "knob" },
        el("div", { class: "knob-head" }, dom.knobLabel, el("div", { class: "readout knob-readout" }, dom.knobValue)),
        el("div", { class: "knob-row" }, dom.minus, dom.range, dom.plus)));
    }
    dom.run = el("button", { class: "btn btn-primary run-key", type: "button", "data-key": "run", "data-run": "", text: `Run ×${N}` });
    dom.run.addEventListener("click", () => this.run());
    dom.progress = el("p", { class: "progress" });
    dom.lock = el("p", { class: "lock-line", text: "Make your prediction above to unlock the run." });
    dom.stale = el("p", { class: "stale-line" });
    kids.push(el("div", { class: "bench-controls" },
      el("div", { class: "run-row" }, dom.run, dom.progress),
      dom.lock, dom.stale));
    kids.push(this.buildBoards());
    kids.push(this.buildResults());
    if (cfg && this.parOn) kids.push(this.buildPar());
    this.ui.append(...kids);
    this.ro = new ResizeObserver(() => {
      const hist = Math.floor(dom.histHost.getBoundingClientRect().width);
      const solution = dom.solutionHost ? Math.floor(dom.solutionHost.getBoundingClientRect().width) : 0;
      if (hist !== this.drawn.hist || solution !== this.drawn.solution) this.render();
    });
    this.ro.observe(dom.histHost);
    if (dom.solutionHost) this.ro.observe(dom.solutionHost);
  }

  buildBoards() {
    const dom = this.dom;
    const racks = BOARD_KEYS.map((key) => this.buildRack(key));
    dom.detail = el("p", { class: "trial-detail", text: "Tap a seed to see its status, turns and cost." });
    dom.boardsFigure = el("figure", { class: "plate instrument boards-plate", "aria-labelledby": `${this.uid}-boards` },
      el("div", { class: "plate-head" }, el("span", { class: "fig-label", id: `${this.uid}-boards`, text: "Two boards, the same seeds" })),
      el("div", { class: "racks" }, ...racks),
      el("p", { class: "pass-legend", text: "Pass: the run ends done and the checks pass." }),
      dom.detail);
    return dom.boardsFigure;
  }

  buildRack(key) {
    const dom = this.dom;
    const board = key === "old" ? this.oldBoard : this.newBoard;
    const cells = [];
    for (let k = 0; k < this.N; k += 1) {
      const cell = el("button", {
        type: "button", class: "cell is-pending", tabindex: "-1", "data-key": `cell-${key}-${k}`, "data-board": key, "data-k": k,
      });
      cell.addEventListener("click", () => this.focusCell(key, k));
      cell.addEventListener("focus", () => this.focusCell(key, k));
      cell.addEventListener("blur", () => this.setTwin(null));
      cell.addEventListener("pointerenter", () => this.setTwin(k));
      cell.addEventListener("pointerleave", () => this.setTwin(null));
      cell.addEventListener("keydown", (event) => this.gridKey(event, key, k));
      cells.push(cell);
      dom.cells[key].push(cell);
    }
    dom.modules[key] = el("p", { class: "rack-mods" });
    const list = el("ol", { class: "grid", role: "list", "aria-label": `${board.label}: seeds 1 to ${this.N}` },
      ...cells.map((cell) => el("li", {}, cell)));
    return el("section", { class: "rack", "data-board": key },
      el("h3", { class: "rack-title", text: board.label }),
      dom.modules[key],
      list);
  }

  buildResults() {
    const dom = this.dom;
    const windows = [
      ["Pass rate", "pass"], ["Worst case, turns", "turns"], ["Worst case, cost", "cost"], ["Mean cost", "mean"],
    ];
    const cards = windows.map(([label, id]) => {
      dom.windowValues[id] = { old: el("span", { class: "readout-value", text: "—" }), new: el("span", { class: "readout-value", text: "—" }) };
      return el("div", { class: "readout" },
        el("p", { class: "readout-label", text: label }),
        el("p", { class: "readout-line" }, el("span", { class: "readout-unit", text: "old" }), dom.windowValues[id].old),
        el("p", { class: "readout-line" }, el("span", { class: "readout-unit", text: "new" }), dom.windowValues[id].new));
    });
    dom.readouts = el("div", { class: "instrument readout-grid" }, ...cards);
    dom.honest = el("p", { class: "honest" });
    dom.noise = el("p", { class: "noise" });
    dom.histHost = el("div", { class: "hist-host" });
    dom.histSummary = el("p", { class: "chart-summary" });
    dom.resultsFigure = el("figure", { class: "plate instrument hist-plate", "aria-labelledby": `${this.uid}-hist` },
      el("div", { class: "plate-head" }, el("span", { class: "fig-label", id: `${this.uid}-hist`, text: "Turns per run, same axes" })),
      dom.histHost,
      dom.histSummary);
    dom.results = el("section", { class: "bench-results", hidden: "" }, dom.readouts, dom.honest, dom.noise, dom.resultsFigure);
    return dom.results;
  }

  buildPar() {
    const dom = this.dom;
    dom.goal = el("p", { class: "goal", text: GOAL_LINE });
    const win = (label) => {
      const value = el("p", { class: "readout-value" });
      const note = el("p", { class: "readout-note" });
      return { node: el("div", { class: "readout" }, el("p", { class: "readout-label", text: label }), value, note), value, note };
    };
    dom.pPass = win("Passing runs");
    dom.pWorst = win("Worst run");
    dom.pTried = win("Values tried");
    dom.pPar = win("Par");
    dom.parState = el("p", { class: "par-state" });
    dom.solutionHost = el("div", { class: "solution-host" });
    dom.solutionFigure = el("figure", { class: "plate instrument solution-plate", "aria-labelledby": `${this.uid}-solution` },
      el("div", { class: "plate-head" }, el("span", { class: "fig-label", id: `${this.uid}-solution`, text: "Solution space" })),
      dom.solutionHost,
      el("p", { class: "chart-summary", text: "Shaded values lose a passing run. Dots are the values you tried." }));
    return el("section", { class: "bench-par" },
      dom.goal,
      el("div", { class: "instrument readout-grid par-readouts" }, dom.pPass.node, dom.pWorst.node, dom.pTried.node, dom.pPar.node),
      dom.parState,
      dom.solutionFigure);
  }

  paintControls(d) {
    const dom = this.dom;
    const s = this.state;
    const locked = this.hasAttribute("locked");
    if (this.knobCfg) {
      const cfg = this.knobCfg;
      dom.range.value = String(s.knob);
      dom.range.disabled = locked;
      dom.minus.disabled = locked || s.knob <= cfg.min;
      dom.plus.disabled = locked || s.knob >= cfg.max;
      dom.knobValue.textContent = String(s.knob);
    }
    dom.run.setAttribute("aria-disabled", String(locked || s.running));
    dom.lock.hidden = !locked;
    dom.progress.textContent = s.running ? `Running ${s.progress} of ${this.N}…` : "";
    dom.stale.hidden = !d.stale;
    dom.stale.textContent = d.stale ? `Results are for a ${this.knobCfg.label.toLowerCase()} of ${d.run.value}. Run again.` : "";
  }

  // Cells: the same seed on both boards is a twin. Only the cursor cell is in the tab order.
  refreshGrid(d = this.derive()) {
    const dom = this.dom;
    const run = d.run;
    const priced = this.priced;
    const boardNow = this.boardAt(this.knobCfg ? this.state.knob : null);
    dom.modules.old.textContent = modulesText(this.oldBoard);
    dom.modules.new.textContent = modulesText(boardNow);
    for (const key of BOARD_KEYS) {
      const trials = run ? (key === "old" ? run.oldTrials : run.newTrials) : null;
      dom.cells[key].forEach((cell, k) => {
        const trial = trials ? trials[k] : null;
        const isCursor = this.cursor.board === key && this.cursor.k === k;
        cell.tabIndex = isCursor ? 0 : -1;
        cell.classList.toggle("is-twin", this.twinK === k);
        const label = (key === "old" ? this.oldBoard : this.newBoard).label.toLowerCase();
        const sig = trial ? `${trial.status}|${trial.passed}|${trial.turns}|${trial.cost}` : "pending";
        if (cell.dataset.sig === sig) return;
        cell.dataset.sig = sig;
        cell.classList.remove("is-pending", "is-pass", "is-fail");
        if (!trial) {
          cell.classList.add("is-pending");
          cell.replaceChildren(el("span", { class: "cell-seed", text: String(k + 1) }), el("span", { class: "cell-status", text: "·" }));
          cell.setAttribute("aria-label", `Seed ${k + 1}, ${label}: not run yet`);
          return;
        }
        cell.classList.add(isPass(trial.status, trial.passed) ? "is-pass" : "is-fail");
        cell.replaceChildren(
          el("span", { class: "cell-seed", text: String(k + 1) }),
          el("span", { class: "cell-status" }, glyph(markOf(trial)), formatInt(trial.turns)));
        cell.setAttribute("aria-label", `Seed ${k + 1}, ${label}: ${statusWords(trial.status, trial.passed)}, ${plural(trial.turns, "turn")}, ${money(trial.cost, priced)}`);
      });
    }
    const sel = this.selected;
    const selTrial = sel && run ? (sel.board === "old" ? run.oldTrials : run.newTrials)[sel.k] : null;
    dom.detail.textContent = sel && selTrial
      ? `${dom.cells[sel.board][sel.k].getAttribute("aria-label")}.`
      : "Tap a seed to see its status, turns and cost.";
  }

  focusCell(key, k) {
    this.cursor = { board: key, k };
    this.selected = { board: key, k };
    this.twinK = k;
    this.refreshGrid();
  }

  setTwin(k) {
    this.twinK = k;
    this.refreshGrid();
  }

  gridKey(event, key, k) {
    let board = key;
    let seed = k;
    switch (event.key) {
      case "ArrowLeft": seed = Math.max(0, k - 1); break;
      case "ArrowRight": seed = Math.min(this.N - 1, k + 1); break;
      case "ArrowUp": board = "old"; break;
      case "ArrowDown": board = "new"; break;
      case "Home": seed = 0; break;
      case "End": seed = this.N - 1; break;
      default: return;
    }
    event.preventDefault();
    this.dom.cells[board][seed].focus();
  }

  paintResults(d) {
    const dom = this.dom;
    const run = d.run;
    dom.results.hidden = !run;
    const width = Math.floor(dom.histHost.getBoundingClientRect().width);
    this.drawn.hist = width;
    if (!run) {
      dom.histSummary.textContent = "";
      dom.histHost.replaceChildren();
      return;
    }
    const o = run.old;
    const w = run.new;
    const priced = this.priced;
    const pair = {
      pass: [`${o.passed}/${o.n} pass`, `${w.passed}/${w.n} pass`],
      turns: [plural(o.worst_turns, "turn"), plural(w.worst_turns, "turn")],
      cost: [money(o.worst_cost, priced), money(w.worst_cost, priced)],
      mean: [money(o.mean_cost, priced), money(w.mean_cost, priced)],
    };
    for (const [id, [oldText, newText]] of Object.entries(pair)) {
      dom.windowValues[id].old.textContent = oldText;
      dom.windowValues[id].new.textContent = newText;
    }
    dom.honest.textContent = honestSentence(run, this.N, priced);
    dom.noise.textContent = noiseSentence(run);
    const oldTurns = run.oldTrials.map((t) => t.turns);
    const newTurns = run.newTrials.map((t) => t.turns);
    const span = (turns) => (Math.min(...turns) === Math.max(...turns)
      ? plural(Math.min(...turns), "turn")
      : `${Math.min(...turns)} to ${plural(Math.max(...turns), "turn")}`);
    dom.histSummary.textContent = `Old board runs take ${span(oldTurns)}, and new board runs take ${span(newTurns)}.`;
    dom.histHost.replaceChildren(...(width >= 280 ? [drawTurns(width, this.uid, run.oldTrials, run.newTrials)] : []));
  }

  paintPar(d) {
    if (!this.parOn) return;
    const dom = this.dom;
    const cfg = this.knobCfg;
    const sweep = d.sweep;
    const priced = this.priced;
    const row = sweep ? sweep.rows.find((r) => r.value === this.state.knob) : null;
    dom.pPass.value.textContent = row ? `${row.passed} of ${this.N}` : "…";
    dom.pWorst.value.textContent = row ? money(row.worst_cost, priced) : "…";
    dom.pTried.value.textContent = `${plural(d.triedCount, "value")} tried`;
    dom.pTried.note.textContent = d.revealed ? "Par is in the chart." : "";
    dom.pPar.node.classList.toggle("is-par", d.atPar);
    dom.pPar.node.querySelector(".readout-label").textContent = d.atPar ? "PAR" : "Par";
    dom.pPar.note.textContent = "";
    if (d.triedCount < REVEAL_AFTER) {
      dom.pPar.value.textContent = "Hidden";
      dom.pPar.note.textContent = `Par appears after ${plural(REVEAL_AFTER, "different value")}.`;
      dom.parState.textContent = "";
    } else if (!sweep) {
      dom.pPar.value.textContent = "Checking…";
      dom.parState.textContent = `Checking every ${cfg.label.toLowerCase()}: ${this.state.sweepProgress} of ${this.sweepTotal()}…`;
    } else if (!sweep.par) {
      dom.pPar.value.textContent = "None in range";
      dom.parState.textContent = "No value in this range keeps every passing run.";
    } else {
      dom.pPar.value.textContent = `${sweep.par.value}`;
      dom.parState.textContent = d.atPar ? PAR_LINE : "Par is in the chart. Keep looking.";
    }
    dom.solutionFigure.hidden = !sweep;
    const solutionWidth = sweep ? Math.floor(dom.solutionHost.getBoundingClientRect().width) : 0;
    this.drawn.solution = solutionWidth;
    if (!sweep || solutionWidth < 280) {
      dom.solutionHost.replaceChildren();
      return;
    }
    dom.solutionHost.replaceChildren(drawSolution(solutionWidth, this.uid, {
      rows: sweep.rows,
      cfg,
      tried: this.state.tries,
      current: this.state.knob,
      par: sweep.par,
      revealed: d.revealed,
      priced,
    }));
  }

  sweepTotal() {
    const cfg = this.knobCfg;
    return cfg ? Math.floor((cfg.max - cfg.min) / cfg.step) + 1 : 0;
  }

  // ---------- self-test: drives Run, then the knob, through the real controls ----------
  async selfTest() {
    if (this.hasAttribute("locked")) return false;
    const job = this.run();
    if (!job) return false;
    await job;
    const run = this.state.run;
    const expectOld = summarize(runBench(this.tape, this.oldBoard, this.N, { facts: this.facts }).trials);
    const expectNew = summarize(runBench(this.tape, this.boardAt(run.value), this.N, { facts: this.facts }).trials);
    if (!sameStats(expectOld, run.old) || !sameStats(expectNew, run.new)) return false;
    const text = this.ui.textContent;
    if (!text.includes(`${expectOld.passed}/${this.N} pass`) || !text.includes(`${expectNew.passed}/${this.N} pass`)) return false;
    if (!this.knobCfg) return true;
    const { label, step, max } = this.knobCfg;
    const before = this.state.knob;
    const key = before + step <= max ? this.dom.plus : this.dom.minus;
    key.click();
    const after = this.state.knob;
    if (after === before) return false;
    return this.dom.stale.textContent === `Results are for a ${label.toLowerCase()} of ${before}. Run again.`;
  }

  disconnectedCallback() {
    this.ro?.disconnect();
  }
}

customElements.define("hx-bench", HxBench);
