// Prove (DESIGN §7.5–§7.6): two boards run the same 20 seeds as step grids. Results are computed from the
// fixture, never typed. Then the turn-limit puzzle: a stepper, readouts and the solution-space chart, and
// "Plug it in" onto the Turn Clock board.
import { FIXTURE } from "../shared/fixture.js";
import { WIRES, PLUGGED, SOCKETS } from "./data.js";
import { el, glyph, svgEl, makeAnnouncer, clamp, fmtInt, fmtCost, reduceMotion } from "./common.js";
import { drawClock, moduleList, wireStates } from "./clock.js";

const BENCH = FIXTURE.bench;
const N = BENCH.old.length;
const PUZZLE = FIXTURE.puzzle;
const COST = PUZZLE.cost_by_turns;
const [LIM_LO, LIM_HI] = PUZZLE.limit_range;
const START = 12;
const RUN_MS = 1500;
const REVEAL_TRIES = 3;
const STATUS_TEXT = { done: "done", interrupted: "a person stopped it", max_turns: "stopped at the turn limit" };
const STATUS_GLYPH = { done: "check", interrupted: "pause", max_turns: "noentry" };
const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const costText = (c, digits = 2) => `≈ ${c.toFixed(digits)}`;
const liveText = () => document.getElementById("live-polite")?.textContent ?? "";

function summarize(trials) {
  return {
    passes: trials.filter((t) => t.passed).length,
    worstTurns: Math.max(...trials.map((t) => t.turns)),
    worstCost: Math.max(...trials.map((t) => t.cost)),
    meanCost: trials.reduce((sum, t) => sum + t.cost, 0) / trials.length,
  };
}
const OLD = summarize(BENCH.old);
const NEW = summarize(BENCH.new);
const RATIO = Math.round(OLD.worstCost / NEW.worstCost);

// The puzzle rule (fixture): a run passes if it fixes the bug and needs <= limit turns; otherwise the board
// stops it at the limit. A run's cost is cost_by_turns[its turns].
function evalLimit(limit) {
  let passes = 0;
  let worst = 0;
  for (const t of BENCH.old) {
    const passed = t.fixes && t.needs <= limit;
    if (passed) passes += 1;
    worst = Math.max(worst, COST[String(passed ? t.needs : limit)]);
  }
  return { limit, passes, worst };
}
const CURVE = [];
for (let L = LIM_LO; L <= LIM_HI; L += 1) CURVE.push(evalLimit(L));
const BASE = Math.max(...CURVE.map((c) => c.passes));
const PAR = PUZZLE.par.limit;
const COMPUTED_PAR = CURVE.filter((c) => c.passes === BASE).reduce((best, c) => (best === null || c.worst < best.worst ? c : best), null).limit;

const TURN_EDGES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
const COST_EDGES = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4];
function histogram(values, edges) {
  const counts = new Array(edges.length - 1).fill(0);
  for (const v of values) {
    for (let b = 0; b < counts.length; b += 1) {
      if (v >= edges[b] && (v < edges[b + 1] || (b === counts.length - 1 && v <= edges[b + 1]))) {
        counts[b] += 1;
        break;
      }
    }
  }
  return counts;
}
const TURN_OLD = histogram(BENCH.old.map((t) => t.turns), TURN_EDGES);
const TURN_NEW = histogram(BENCH.new.map((t) => t.turns), TURN_EDGES);
const COST_OLD = histogram(BENCH.old.map((t) => t.cost), COST_EDGES);
const COST_NEW = histogram(BENCH.new.map((t) => t.cost), COST_EDGES);

function notes(term, text) {
  return [
    el("p", { class: "mnote" }, el("strong", { text: term }), text),
    el("details", { class: "inote" }, el("summary", {}, glyph("info"), term), el("div", { class: "inote-body", text })),
  ];
}

// A histogram drawn at the measured width: the before series hatched, the after series solid, shared axes.
function drawHistogram(width, oldCounts, newCounts, edges, ticks, unitLabel) {
  const W = Math.max(280, Math.round(width));
  const H = 230;
  const x0 = 44;
  const x1 = W - 12;
  const y0 = 30;
  const y1 = H - 36;
  const yMax = Math.max(1, ...oldCounts, ...newCounts);
  const svg = svgEl("svg", { class: "hist", viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": `Runs by ${unitLabel}, before and after, on the same axes` });
  const defs = svgEl("defs");
  const pattern = svgEl("pattern", { id: `hatch-${unitLabel}`, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
  pattern.append(svgEl("line", { x1: 0, y1: 0, x2: 0, y2: 6, style: "stroke: var(--hx-ink-2); stroke-width: 2" }));
  defs.append(pattern);
  svg.append(defs);
  const bins = oldCounts.length;
  const bw = (x1 - x0) / bins;
  for (let b = 0; b < bins; b += 1) {
    const hOld = (oldCounts[b] / yMax) * (y1 - y0);
    const hNew = (newCounts[b] / yMax) * (y1 - y0);
    if (oldCounts[b]) svg.append(svgEl("rect", { class: "bar-before", x: x0 + b * bw + 2, y: y1 - hOld, width: bw - 4, height: hOld, fill: `url(#hatch-${unitLabel})`, style: "stroke: var(--hx-ink-2)", "stroke-width": 1 }));
    if (newCounts[b]) svg.append(svgEl("rect", { class: "bar-after", x: x0 + b * bw + bw * 0.3, y: y1 - hNew, width: bw * 0.4, height: hNew }));
  }
  svg.append(svgEl("line", { class: "axis", x1: x0, x2: x1, y1, y2: y1 }), svgEl("line", { class: "axis", x1: x0, x2: x0, y1: y0, y2: y1 }));
  const yTop = svgEl("text", { class: "tick", x: x0 - 8, y: y0 + 5, "text-anchor": "end", "font-size": 14 });
  yTop.textContent = String(yMax);
  svg.append(yTop);
  for (const [index, text] of ticks) {
    const t = svgEl("text", { class: "tick", x: x0 + (index / bins) * (x1 - x0), y: y1 + 20, "text-anchor": "middle", "font-size": 14 });
    t.textContent = text;
    svg.append(t);
  }
  const name = svgEl("text", { class: "axis-title", x: x0, y: 16, "font-size": 14 });
  name.textContent = `Runs by ${unitLabel}`;
  svg.append(name);
  return svg;
}

// The solution-space chart at the measured width: every limit from 2 to 30, infeasible limits shaded.
function drawSolution(width, state) {
  const W = Math.max(280, Math.round(width));
  const H = 260;
  const x0 = 46;
  const x1 = W - 14;
  const y0 = 34;
  const y1 = H - 36;
  const yMax = Math.ceil(Math.max(...CURVE.map((c) => c.worst)) * 10) / 10;
  const xOf = (L) => x0 + ((L - LIM_LO) / (LIM_HI - LIM_LO)) * (x1 - x0);
  const yOf = (c) => y1 - (c / yMax) * (y1 - y0);
  const svg = svgEl("svg", { class: "solution", viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Worst-case cost for every turn limit from 2 to 30. Shaded limits lose a passing run." });
  const step = (x1 - x0) / (LIM_HI - LIM_LO);
  for (const c of CURVE) {
    if (c.passes < BASE) svg.append(svgEl("rect", { class: "infeasible", x: xOf(c.limit) - step / 2, y: y0, width: step, height: y1 - y0 }));
  }
  svg.append(svgEl("line", { class: "axis", x1: x0, x2: x1, y1, y2: y1 }), svgEl("line", { class: "axis", x1: x0, x2: x0, y1: y0, y2: y1 }));
  for (const L of [2, 6, 12, 18, 24, 30]) {
    const t = svgEl("text", { class: "tick", x: xOf(L), y: y1 + 20, "text-anchor": "middle", "font-size": 14 });
    t.textContent = String(L);
    svg.append(t);
  }
  const yTop = svgEl("text", { class: "tick", x: x0 - 8, y: y0 + 5, "text-anchor": "end", "font-size": 14 });
  yTop.textContent = yMax.toFixed(1);
  svg.append(yTop);
  const d = CURVE.map((c, k) => `${k === 0 ? "M" : "L"}${xOf(c.limit).toFixed(1)} ${yOf(c.worst).toFixed(1)}`).join(" ");
  svg.append(svgEl("path", { class: "curve-line", d }));
  const title = svgEl("text", { class: "axis-title", x: x0, y: 18, "font-size": 14 });
  title.textContent = "Worst-case cost by limit";
  svg.append(title);
  const xName = svgEl("text", { class: "axis-title", x: x1, y: H - 4, "text-anchor": "end", "font-size": 14 });
  xName.textContent = "turn limit";
  svg.append(xName);
  if (state.parRevealed) {
    const cx = xOf(PAR);
    const cy = yOf(CURVE[PAR - LIM_LO].worst);
    svg.append(svgEl("circle", { class: "par-ring", cx, cy, r: 11 }));
    const label = svgEl("text", { class: "par-label", x: cx + 14, y: cy - 12, "font-size": 14 });
    label.textContent = `PAR ${PAR}`;
    svg.append(label);
  }
  const cur = CURVE[state.limit - LIM_LO];
  svg.append(svgEl("circle", { class: "your-point", cx: xOf(state.limit), cy: yOf(cur.worst), r: 7 }));
  return svg;
}

export class ProveElement extends HTMLElement {
  connectedCallback() {
    if (this.built) return;
    this.built = true;
    this.say = makeAnnouncer();
    this.article = this.querySelector(".article") || this;
    this.state = { limit: START, tried: new Set([START]), touched: false, running: false, done: false, plugged: false, twinSeed: null };
    this.cells = { old: [], new: [] };
    this.buildRacks();
    this.buildResults();
    this.buildPuzzle();
    this.article.append(this.racksRow, this.resultsRow, this.puzzleRow, this.plugRow);
    this.paintPuzzle();
    this.resizer = new ResizeObserver(() => this.redraw());
    this.resizer.observe(this.histHost);
    this.resizer.observe(this.solutionHost);
    this.resizer.observe(this.clockHost);
    this.redraw();
    this.__test = { run: () => this.selfTest() };
  }

  disconnectedCallback() {
    this.resizer?.disconnect();
  }

  // ---------- FIG B2.2: two boards as step grids ----------
  buildRacks() {
    const rack = (key) => {
      const info = FIXTURE.boards[key];
      const cells = BENCH[key].map((t, k) => {
        const btn = el("button", { class: "cell is-pending", type: "button", tabindex: k === 0 ? "0" : "-1", "data-seed": String(k + 1), "aria-label": `Seed ${k + 1}: not run yet` },
          el("span", { class: "cell-seed", text: String(k + 1) }),
          el("span", { class: "cell-status", text: "·" }));
        btn.addEventListener("click", () => this.showTrial(key, k));
        btn.addEventListener("focus", () => this.twin(k, true));
        btn.addEventListener("blur", () => this.twin(k, false));
        btn.addEventListener("pointerenter", () => this.twin(k, true));
        btn.addEventListener("pointerleave", () => this.twin(k, false));
        this.cells[key][k] = btn;
        return el("li", {}, btn);
      });
      const grid = el("ol", { class: "grid", role: "list", "aria-label": `${info.label}: seeds 1 to ${N}` }, cells);
      grid.addEventListener("keydown", (ev) => this.gridKey(ev, key));
      return el("section", { class: "rack", "aria-labelledby": `rack-${key}` },
        el("h3", { id: `rack-${key}`, text: info.label }),
        el("p", { class: "exits", text: `Exits: ${info.exits.join(" · ")}` }),
        grid);
    };
    this.runBtn = el("button", { class: "btn btn-primary", type: "button", text: `Run ×${N}` });
    this.runBtn.addEventListener("click", () => { this.lastRun = this.runAll(); });
    this.runStatus = el("p", { class: "progress", "aria-live": "off", text: `Both boards run the same ${N} seeds.` });
    this.trialDetail = el("p", { class: "trial-detail", text: "Tap a seed to see its status, turns and cost." });
    this.legend = el("ul", { class: "key-row", "aria-label": "What the marks mean" },
      el("li", {}, glyph("check"), "done"),
      el("li", {}, glyph("pause"), "a person stopped it"),
      el("li", {}, glyph("noentry"), "stopped at the turn limit"),
      el("li", {}, "number under the seed = turns"));
    this.racksRow = el("figure", { class: "plate instrument", "aria-labelledby": "fig-b2-2" },
      el("div", { class: "plate-head" }, el("span", { class: "fig-label", id: "fig-b2-2", text: "FIG B2.2 · TWO BOARDS, SAME SEEDS" })),
      el("div", { class: "racks" }, rack("old"), rack("new")),
      el("div", { class: "run-row" }, this.runBtn, this.runStatus),
      this.legend,
      this.trialDetail,
      el("figcaption", { class: "caption", text: `Try this: press Run ×${N}, then focus a seed. Its twin on the other board lights up.` }));
  }

  gridKey(ev, key) {
    const keys = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5 };
    if (!(ev.key in keys) && ev.key !== "Home" && ev.key !== "End") return;
    ev.preventDefault();
    const cells = this.cells[key];
    const current = cells.indexOf(document.activeElement);
    let next = current < 0 ? 0 : current;
    if (ev.key === "Home") next = 0;
    else if (ev.key === "End") next = cells.length - 1;
    else next = clamp(next + keys[ev.key], 0, cells.length - 1);
    cells.forEach((c, k) => { c.tabIndex = k === next ? 0 : -1; });
    cells[next].focus();
  }

  twin(k, on) {
    for (const key of ["old", "new"]) this.cells[key][k]?.classList.toggle("is-twin", on);
  }

  showTrial(key, k) {
    if (!this.state.done) {
      this.trialDetail.textContent = "Run ×20 first, then tap a seed.";
      return;
    }
    const t = BENCH[key][k];
    const fix = t.fixes ? "fixed the bug" : "did not fix the bug";
    this.trialDetail.textContent = `${FIXTURE.boards[key].label}, seed ${k + 1}: ${STATUS_TEXT[t.status]}, ${t.turns} turns, ${fmtCost(t.cost)}. It ${fix}.`;
  }

  paintCell(key, k) {
    const t = BENCH[key][k];
    const node = this.cells[key][k];
    node.classList.remove("is-pending", "is-pass", "is-fail");
    node.classList.add(t.passed ? "is-pass" : "is-fail");
    node.replaceChildren(
      el("span", { class: "cell-seed", text: String(k + 1) }),
      el("span", { class: "cell-status" }, glyph(STATUS_GLYPH[t.status]), String(t.turns)));
    node.setAttribute("aria-label", `Seed ${k + 1}: ${STATUS_TEXT[t.status]}, ${t.turns} turns, ${fmtCost(t.cost)}`);
  }

  resetCells() {
    for (const key of ["old", "new"]) {
      this.cells[key].forEach((node, k) => {
        node.className = "cell is-pending";
        node.replaceChildren(el("span", { class: "cell-seed", text: String(k + 1) }), el("span", { class: "cell-status", text: "·" }));
        node.setAttribute("aria-label", `Seed ${k + 1}: not run yet`);
      });
    }
  }

  async runAll() {
    const s = this.state;
    if (s.running) return;
    s.running = true;
    s.done = false;
    this.runBtn.disabled = true;
    this.resetCells();
    this.resultsRow.hidden = true;
    const step = reduceMotion() ? 0 : Math.round(RUN_MS / N);
    for (let k = 0; k < N; k += 1) {
      this.paintCell("old", k);
      this.paintCell("new", k);
      this.runStatus.textContent = `Seed ${k + 1} of ${N}`;
      if (step) await sleep(step);
    }
    s.running = false;
    s.done = true;
    this.runBtn.disabled = false;
    this.runBtn.textContent = `Run ×${N} again`;
    this.runStatus.textContent = `Done: ${N} seeds on each board.`;
    this.resultsRow.hidden = false;
    this.say(`Done. ${OLD.passes} of ${N} pass on the old board, ${NEW.passes} of ${N} on the new one.`);
  }

  // ---------- results: readout windows, histograms and the two sentences ----------
  buildResults() {
    const windowOf = (label, oldText, newText) => el("div", { class: "readout" },
      el("p", { class: "readout-label", text: label }),
      el("p", { class: "readout-line" }, el("span", { class: "readout-unit", text: "old" }), el("span", { class: "readout-value", text: oldText })),
      el("p", { class: "readout-line" }, el("span", { class: "readout-unit", text: "new" }), el("span", { class: "readout-value", text: newText })));
    this.histHost = el("div", { class: "hist-host" });
    this.resultsRow = el("section", { class: "row results-row", "aria-labelledby": "results-h" },
      el("h2", { id: "results-h", text: "What changed" }),
      el("div", { class: "instrument readouts-grid" },
        windowOf("Pass rate", `${OLD.passes}/${N}`, `${NEW.passes}/${N}`),
        windowOf("Worst case, turns", String(OLD.worstTurns), String(NEW.worstTurns)),
        windowOf("Worst case, cost", costText(OLD.worstCost), costText(NEW.worstCost)),
        windowOf("Mean cost", costText(OLD.meanCost), costText(NEW.meanCost))),
      el("p", { class: "honest", text: OLD.passes === NEW.passes
        ? `The turn limit didn't make the agent smarter: the same ${NEW.passes} runs pass. It made every run end, and cut the worst case by about ${RATIO}×.`
        : `The new board passes ${NEW.passes} runs and the old one ${OLD.passes}. The worst case is about ${RATIO}× cheaper.` }),
      el("p", { class: "noise", text: "These runs are scripted, so they repeat exactly; real models vary." }),
      el("figure", { class: "plate instrument hist-plate", "aria-labelledby": "fig-b2-3" },
        el("div", { class: "plate-head" }, el("span", { class: "fig-label", id: "fig-b2-3", text: "FIG B2.3 · SAME AXES, BEFORE AND AFTER" })),
        el("p", { class: "legend-inline" }, el("span", { class: "swatch hatch" }), "before (hatched)", el("span", { class: "swatch solid" }), "after (solid)"),
        this.histHost,
        el("figcaption", { class: "caption", text: "Try this: compare the tall hatched bars on the left with the solid bars. Same axes, so the heights compare directly." })),
      notes("Pass", "A pass means the bug is fixed and the run ends within the limit."));
  }

  // ---------- the par puzzle, and plug it in ----------
  buildPuzzle() {
    this.limitRange = el("input", { type: "range", min: String(LIM_LO), max: String(LIM_HI), step: "1", value: String(START), "aria-label": "Turn limit" });
    this.limitRange.addEventListener("input", () => this.setLimit(Number(this.limitRange.value)));
    this.minus = el("button", { class: "key key-icon", type: "button", "aria-label": "Lower the turn limit" }, glyph("minus"));
    this.minus.addEventListener("click", () => this.setLimit(this.state.limit - 1));
    this.plus = el("button", { class: "key key-icon", type: "button", "aria-label": "Raise the turn limit" }, glyph("plus"));
    this.plus.addEventListener("click", () => this.setLimit(this.state.limit + 1));
    // The number in the sentence is a pointer affordance only: the slider is the one keyboard control.
    this.scrubLimit = el("span", { class: "scrub", "aria-hidden": "true" });
    this.bindLimitScrub(this.scrubLimit);
    this.passEl = el("strong");
    this.worstEl = el("strong");
    this.sentence = el("p", { class: "limit-line" }, "With a limit of ", this.scrubLimit, " turns, ", this.passEl, " runs still pass and the worst run costs ", this.worstEl, ".");
    this.roPass = el("p", { class: "readout-value" });
    this.roPassNote = el("p", { class: "readout-note" });
    this.roWorst = el("p", { class: "readout-value" });
    this.roTried = el("p", { class: "readout-value" });
    this.roTriedNote = el("p", { class: "readout-note" });
    this.parLabel = el("p", { class: "readout-label", text: "Par" });
    this.parValue = el("p", { class: "readout-value", text: "Not yet" });
    this.parWindow = el("div", { class: "readout par-window" }, this.parLabel, this.parValue);
    this.parState = el("p", { class: "par-line", "aria-live": "polite" });
    this.solutionHost = el("div", { class: "solution-host" });
    this.puzzleRow = el("section", { class: "row puzzle", "aria-labelledby": "puzzle-h" },
      el("h2", { id: "puzzle-h", text: "Beat par" }),
      el("p", { class: "lede", text: "Find the turn limit with the cheapest worst case that loses no passing run." }),
      this.sentence,
      el("div", { class: "limit-controls" }, el("div", { class: "range-row" }, this.minus, this.limitRange, this.plus)),
      el("div", { class: "instrument readouts-grid puzzle-readouts" },
        el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Passing runs" }), this.roPass, this.roPassNote),
        el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Worst run" }), this.roWorst),
        el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Values tried" }), this.roTried, this.roTriedNote)),
      this.parWindow,
      this.parState,
      el("figure", { class: "plate instrument solution-plate", "aria-labelledby": "fig-b2-4" },
        el("div", { class: "plate-head" }, el("span", { class: "fig-label", id: "fig-b2-4", text: "FIG B2.4 · SOLUTION SPACE" })),
        this.solutionHost,
        el("figcaption", { class: "caption", text: "Try this: drag the number in the sentence, or use the slider. The shaded limits lose a passing run." })),
      notes("Par", "The cheapest setting that still keeps every passing run."));
    this.plugBtn = el("button", { class: "btn btn-primary", type: "button", disabled: true, text: "Plug it in" });
    this.plugBtn.addEventListener("click", () => this.plugIn());
    this.plugMsg = el("p", { class: "plug-msg", text: "Move the limit first. Then plug it into your board." });
    this.clockHost = el("div", { class: "clock-host" });
    this.plugRow = el("section", { class: "row plug-row", "aria-labelledby": "plug-h" },
      el("h2", { id: "plug-h", text: "Plug it in" }),
      el("figure", { class: "plate instrument board-plate" },
        el("div", { class: "plate-head" }, el("span", { class: "fig-label", text: "FIG B2.5 · YOUR BOARD" })),
        this.clockHost,
        el("figcaption", { class: "caption", text: "The loop spoke is the turn limit. Plugging it in adds its tag to the loop wire." })),
      el("div", { class: "plug-actions" }, this.plugBtn, this.plugMsg));
  }

  bindLimitScrub(node) {
    let drag = null;
    node.addEventListener("pointerdown", (ev) => {
      drag = { x: ev.clientX, v: this.state.limit };
      node.setPointerCapture(ev.pointerId);
      node.classList.add("is-active");
    });
    node.addEventListener("pointermove", (ev) => {
      if (drag) this.setLimit(drag.v + Math.round((ev.clientX - drag.x) / 14));
    });
    const end = () => {
      drag = null;
      node.classList.remove("is-active");
    };
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
    const keys = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -5, PageUp: 5 };
    node.addEventListener("keydown", (ev) => {
      if (ev.key in keys) {
        ev.preventDefault();
        this.setLimit(this.state.limit + keys[ev.key]);
      } else if (ev.key === "Home") {
        ev.preventDefault();
        this.setLimit(LIM_LO);
      } else if (ev.key === "End") {
        ev.preventDefault();
        this.setLimit(LIM_HI);
      }
    });
  }

  setLimit(n) {
    const s = this.state;
    const next = clamp(Math.round(n), LIM_LO, LIM_HI);
    if (next !== s.limit) s.touched = true;
    s.limit = next;
    s.tried.add(next);
    this.paintPuzzle();
    this.redraw();
    if (s.plugged) {
      this.redrawClock();
      this.plugMsg.textContent = this.plugText();
    }
    // The live message is replaced on every change, and always describes the current limit.
    this.say(s.plugged ? this.plugText() : this.puzzleStatus());
  }

  // Derived from the current state, so it never describes a limit the learner has left.
  puzzleStatus() {
    const s = this.state;
    const c = CURVE[s.limit - LIM_LO];
    if (s.limit === PAR && s.tried.size >= REVEAL_TRIES) {
      return `Par: limit ${PAR} keeps all ${BASE} passing runs and has the cheapest worst case.`;
    }
    return `Limit ${s.limit}: ${c.passes} of ${N} pass, and the worst run costs ${fmtCost(c.worst, 3)}.`;
  }

  plugText() {
    const s = this.state;
    return `Plugged: the loop now stops at ${s.limit} turns. The worst run costs ${fmtCost(CURVE[s.limit - LIM_LO].worst, 3)}.`;
  }

  paintPuzzle() {
    const s = this.state;
    const c = CURVE[s.limit - LIM_LO];
    const lost = BASE - c.passes;
    const revealed = s.tried.size >= REVEAL_TRIES;
    const atPar = s.limit === PAR && revealed;
    this.limitRange.value = String(s.limit);
    this.scrubLimit.textContent = String(s.limit);
    this.limitRange.setAttribute("aria-valuetext", `${s.limit} turns`);
    this.passEl.textContent = String(c.passes);
    this.worstEl.textContent = fmtCost(c.worst, 3);
    this.minus.disabled = s.limit <= LIM_LO;
    this.plus.disabled = s.limit >= LIM_HI;
    this.roPass.textContent = `${c.passes} of ${N}`;
    this.roPassNote.textContent = lost > 0
      ? `${lost} passing run${lost === 1 ? "" : "s"} lost at ${s.limit}. Raise the limit.`
      : `No passing run lost. ${BASE} still pass.`;
    this.roPassNote.classList.toggle("is-bad", lost > 0);
    this.roWorst.textContent = fmtCost(c.worst, 3);
    this.roTried.textContent = `${s.tried.size} tried`;
    this.roTriedNote.textContent = revealed ? "Par is in the chart." : `Par shows after ${REVEAL_TRIES} different values.`;
    if (atPar) {
      this.parLabel.textContent = `PAR · limit ${PAR}`;
      this.parValue.textContent = `${c.passes} of ${N} pass`;
      this.parState.textContent = "No lost passes, cheapest worst case.";
    } else {
      this.parLabel.textContent = "Par";
      this.parValue.textContent = revealed ? "Not yet" : "Hidden";
      this.parState.textContent = revealed ? "Par is in the chart. Keep looking." : `Par appears after ${REVEAL_TRIES} different values.`;
    }
    this.parWindow.classList.toggle("is-par", atPar);
    this.plugBtn.disabled = !s.touched;
  }

  // ---------- the clock board and the plug-in ----------
  plugIn() {
    if (!this.state.touched) return;
    this.state.plugged = true;
    this.redrawClock(true);
    this.plugMsg.textContent = this.plugText();
    this.say(this.plugMsg.textContent);
  }

  clockStates() {
    const states = wireStates();
    if (this.state.plugged) states.loop = { ...states.loop, extra: { id: SOCKETS.loop.id, title: `turn limit ${this.state.limit}` } };
    return states;
  }

  redrawClock(animate = false) {
    const width = Math.floor(this.clockHost.getBoundingClientRect().width);
    if (width < 300) return;
    const clock = drawClock(width, { states: this.clockStates(), plugMotion: animate && this.state.plugged ? "loop" : null });
    this.clockHost.replaceChildren(clock, moduleList(this.clockStates()));
  }

  redraw() {
    const hw = Math.floor(this.histHost.getBoundingClientRect().width);
    if (hw >= 280) {
      this.histHost.replaceChildren(
        drawHistogram(hw, TURN_OLD, TURN_NEW, TURN_EDGES, [[0, "0"], [2, "10"], [4, "20"], [6, "30"], [8, "40"], [10, "50"]], "turns"),
        drawHistogram(hw, COST_OLD, COST_NEW, COST_EDGES, [[0, "0"], [2, "0.4"], [4, "0.8"], [6, "1.2"]], "cost"));
    }
    const sw = Math.floor(this.solutionHost.getBoundingClientRect().width);
    if (sw >= 280) this.solutionHost.replaceChildren(drawSolution(sw, { limit: this.state.limit, parRevealed: this.state.tried.size >= REVEAL_TRIES }));
    if (!this.state.plugged) this.redrawClock(false);
  }

  // ---------- test hook: Run x20, both pass rates, then the limit through the real controls ----------
  async selfTest() {
    try {
      this.runBtn.click();
      await this.lastRun;
      const text = this.resultsRow.textContent;
      if (!text.includes(`${OLD.passes}/${N}`) || !text.includes(`${NEW.passes}/${N}`)) return false;
      if (OLD.passes !== 13 || NEW.passes !== 13) return false;
      for (const value of ["9", String(PAR)]) {
        this.limitRange.value = value;
        this.limitRange.dispatchEvent(new Event("input"));
      }
      if (COMPUTED_PAR !== PAR) return false;
      if (!(this.parWindow.classList.contains("is-par") && this.parLabel.textContent === `PAR · limit ${PAR}`)) return false;
      // The live region says par while the learner is at par...
      await sleep(60);
      if (!/\bpar\b/i.test(liveText())) return false;
      // ...and stops saying it as soon as they leave par.
      this.limitRange.value = "8";
      this.limitRange.dispatchEvent(new Event("input"));
      await sleep(60);
      return !/\bpar\b/i.test(liveText());
    } catch (error) {
      console.error(error);
      return false;
    }
  }
}
