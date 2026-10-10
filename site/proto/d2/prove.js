// Prove: measure the fix on the same 20 seeds, then find the turn limit that beats par.
// Every number on this page is computed from the fixture. Nothing is typed in by hand.
import { FIXTURE } from "../shared/fixture.js";
import { WIRES, SOCKETS } from "./data.js";
import { el, glyph, svgEl, makeAnnouncer, clamp, fmtInt, fmtCost, reduceMotion } from "./common.js";

const BENCH = FIXTURE.bench;
const N = BENCH.old.length;
const PUZZLE = FIXTURE.puzzle;
const COST = PUZZLE.cost_by_turns;
const [LIM_LO, LIM_HI] = PUZZLE.limit_range;
const START = 12;
const RUN_MS = 1500;
const STATUS_TEXT = { done: "done", interrupted: "interrupted by a person", max_turns: "stopped at the turn limit" };
const STATUS_GLYPH = { done: "check", interrupted: "pause", max_turns: "noentry" };
const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

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

// The puzzle rule, straight from the fixture: a run passes if it fixes the bug and needs <= limit turns.
// Otherwise the board stops it at the limit. A run's cost is cost_by_turns[its turns].
function evalLimit(limit) {
  let passes = 0;
  let worst = 0;
  for (const t of BENCH.old) {
    const passed = t.fixes && t.needs <= limit;
    if (passed) passes += 1;
    const turns = passed ? t.needs : limit;
    worst = Math.max(worst, COST[String(turns)]);
  }
  return { limit, passes, worst };
}
const CURVE = [];
for (let L = LIM_LO; L <= LIM_HI; L += 1) CURVE.push(evalLimit(L));
const BASE = Math.max(...CURVE.map((c) => c.passes));
const COMPUTED_PAR = CURVE.filter((c) => c.passes === BASE)
  .reduce((best, c) => (best === null || c.worst < best.worst ? c : best), null).limit;
const PAR = PUZZLE.par.limit;
const CURVE_MAX = Math.ceil(Math.max(...CURVE.map((c) => c.worst)) * 10) / 10;

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

function histPanel(counts, yMax, ticks, isNew, label) {
  const W = 300;
  const H = 190;
  const x0 = 40;
  const x1 = 290;
  const y0 = 14;
  const y1 = 150;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": label, focusable: "false" });
  const bw = (x1 - x0) / counts.length;
  counts.forEach((c, b) => {
    const h = yMax ? (c / yMax) * (y1 - y0) : 0;
    svg.append(svgEl("rect", { class: `bar-rect${isNew ? " is-new" : ""}`, x: x0 + b * bw + 2, y: y1 - h, width: bw - 4, height: h }));
  });
  svg.append(svgEl("line", { class: "axis", x1: x0, x2: x1, y1, y2: y1 }));
  svg.append(svgEl("line", { class: "axis", x1: x0, x2: x0, y1: y0, y2: y1 }));
  const yLabel = svgEl("text", { x: x0 - 6, y: y0 + 4, "text-anchor": "end" });
  yLabel.textContent = String(yMax);
  svg.append(yLabel);
  for (const [index, text] of ticks) {
    const t = svgEl("text", { x: x0 + (index / counts.length) * (x1 - x0), y: y1 + 18, "text-anchor": "middle" });
    t.textContent = text;
    svg.append(t);
  }
  return svg;
}

const OLD_TURNS = histogram(BENCH.old.map((t) => t.turns), TURN_EDGES);
const NEW_TURNS = histogram(BENCH.new.map((t) => t.turns), TURN_EDGES);
const OLD_COST = histogram(BENCH.old.map((t) => t.cost), COST_EDGES);
const NEW_COST = histogram(BENCH.new.map((t) => t.cost), COST_EDGES);
const TURN_TICKS = [[0, "0"], [2, "10"], [4, "20"], [6, "30"], [8, "40"], [10, "50"]];
const COST_TICKS = [[0, "0"], [2, "0.4"], [4, "0.8"], [6, "1.2"]];

function bindScrub(node, { min, max, get, set, px }) {
  let drag = null;
  node.addEventListener("pointerdown", (ev) => {
    drag = { x: ev.clientX, v: get() };
    node.setPointerCapture(ev.pointerId);
    node.classList.add("is-active");
  });
  node.addEventListener("pointermove", (ev) => {
    if (drag) set(clamp(drag.v + Math.round((ev.clientX - drag.x) / px), min, max));
  });
  const end = () => {
    drag = null;
    node.classList.remove("is-active");
  };
  node.addEventListener("pointerup", end);
  node.addEventListener("pointercancel", end);
  node.addEventListener("keydown", (ev) => {
    const keys = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -5, PageUp: 5 };
    if (ev.key in keys) {
      ev.preventDefault();
      set(clamp(get() + keys[ev.key], min, max));
    } else if (ev.key === "Home") {
      ev.preventDefault();
      set(min);
    } else if (ev.key === "End") {
      ev.preventDefault();
      set(max);
    }
  });
}

function notes(term, text) {
  return [
    el("p", { class: "mnote" }, el("strong", { text: term }), text),
    el("details", { class: "inote" }, el("summary", {}, glyph("info"), term), el("div", { class: "inote-body", text })),
  ];
}

// Draw the lines on the first time a figure is seen (skipped under reduced motion: the final state shows at once).
function drawWhenSeen(node) {
  if (reduceMotion() || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      node.classList.add("is-drawing");
      io.disconnect();
    }
  }, { threshold: 0.35 });
  io.observe(node);
}

const pairText = (oldText, newText) => el("p", { class: "pair" },
  oldText, el("span", { text: " old" }), "  ·  ", newText, el("span", { text: " new" }));

export class ProveElement extends HTMLElement {
  connectedCallback() {
    if (this.built) return;
    this.built = true;
    this.say = makeAnnouncer();
    this.article = this.querySelector(".article") || this;
    this.limit = START;
    this.tried = new Set([START]);
    this.touched = false;
    this.parShown = false;
    this.plugged = false;
    this.running = false;
    this.finished = false;
    this.trialNodes = { old: [], new: [] };
    this.buildBoards();
    this.buildResults();
    this.buildPuzzle();
    this.article.append(this.boardRow, this.resultsRow, this.fig2, this.puzzleRow, this.fig3, this.plugRow);
    this.paintPuzzle();
    this.__test = { run: () => this.selfTest() };
  }

  // ---------- FIG 1: two boards, the same seeds ----------
  buildBoards() {
    const boardFor = (key) => {
      const info = FIXTURE.boards[key];
      const nodes = BENCH[key].map((t, k) => {
        const btn = el("button", { class: "trial is-pending", type: "button", "aria-label": `Seed ${k + 1}: not run yet` },
          el("span", { class: "turns", text: String(k + 1) }));
        btn.addEventListener("click", () => this.showTrial(key, k));
        btn.addEventListener("pointerenter", () => this.link(k, true));
        btn.addEventListener("pointerleave", () => this.link(k, false));
        btn.addEventListener("focus", () => this.link(k, true));
        btn.addEventListener("blur", () => this.link(k, false));
        this.trialNodes[key][k] = btn;
        return btn;
      });
      return el("article", { class: "board", "aria-labelledby": `board-${key}` },
        el("h3", { id: `board-${key}`, text: info.label }),
        el("p", { class: "exits", text: `Exits: ${info.exits.join(" · ")}` }),
        el("div", { class: "marks-grid" }, nodes));
    };
    this.runBtn = el("button", { class: "btn btn-primary", type: "button", text: `Run ×${N}` });
    this.runBtn.addEventListener("click", () => this.startRun());
    this.progress = el("p", { class: "progress-text", text: `Both boards will run the same ${N} seeds.` });
    this.trialDetail = el("p", { class: "trial-detail", text: "Tap a mark to see its seed, status, turns and cost." });
    this.boardRow = el("figure", { class: "plate" },
      el("div", { class: "plate-head" },
        el("span", { class: "fig-label", text: "FIG 1 · Two boards, same seeds" }),
        el("p", { class: "plate-state", text: "Old: one exit. New: plus a turn limit and a budget." })),
      el("div", { class: "boards" }, boardFor("old"), boardFor("new")),
      el("div", { class: "run-row" }, this.runBtn, this.progress),
      this.trialDetail,
      el("figcaption", { text: "Try this: press Run ×20, then tap a mark. Hover one mark to light up the same seed on the other board." }));
  }

  link(k, on) {
    for (const key of ["old", "new"]) this.trialNodes[key][k].classList.toggle("is-linked", on);
  }

  showTrial(key, k) {
    if (!this.done) {
      this.trialDetail.textContent = "Run ×20 first, then tap a mark.";
      return;
    }
    const t = BENCH[key][k];
    const fix = t.fixes ? "fixed the bug" : "did not fix the bug";
    this.trialDetail.textContent = `${FIXTURE.boards[key].label}, seed ${t.seed}: ${STATUS_TEXT[t.status]}, ${t.turns} turns, ${fmtCost(t.cost)}, and it ${fix}.`;
  }

  paintTrial(key, k) {
    const t = BENCH[key][k];
    const node = this.trialNodes[key][k];
    node.classList.remove("is-pending", "is-pass", "is-fail");
    node.classList.add(t.passed ? "is-pass" : "is-fail");
    node.replaceChildren(glyph(STATUS_GLYPH[t.status]), el("span", { class: "turns", text: String(t.turns) }));
    node.setAttribute("aria-label", `Seed ${t.seed}: ${STATUS_TEXT[t.status]}, ${t.turns} turns, ${fmtCost(t.cost)}`);
  }

  resetTrials() {
    for (const key of ["old", "new"]) {
      this.trialNodes[key].forEach((node, k) => {
        node.className = "trial is-pending";
        node.replaceChildren(el("span", { class: "turns", text: String(k + 1) }));
        node.setAttribute("aria-label", `Seed ${k + 1}: not run yet`);
      });
    }
  }

  startRun() {
    if (this.running) return;
    this.lastRun = this.runAll();
  }

  async runAll() {
    this.running = true;
    this.done = false;
    this.runBtn.disabled = true;
    this.resetTrials();
    this.resultsRow.hidden = true;
    this.fig2.hidden = true;
    const step = reduceMotion() ? 0 : Math.round(RUN_MS / N);
    for (let k = 0; k < N; k += 1) {
      this.paintTrial("old", k);
      this.paintTrial("new", k);
      this.progress.textContent = `Trial ${k + 1} of ${N}`;
      if (step) await sleep(step);
    }
    this.running = false;
    this.done = true;
    this.runBtn.disabled = false;
    this.runBtn.textContent = `Run ×${N} again`;
    this.progress.textContent = `Done: ${N} seeds on each board.`;
    this.resultsRow.hidden = false;
    this.fig2.hidden = false;
    this.say(`Done. Both boards: ${OLD.passes} of ${N} pass on the old board, ${NEW.passes} of ${N} on the new one.`);
  }

  // ---------- results: computed from the bench data, never typed in ----------
  buildResults() {
    const stat = (label, ...kids) => el("div", { class: "stat" }, el("p", { class: "label", text: label }), ...kids);
    this.resultsRow = el("section", { class: "row results-row", "aria-labelledby": "results-h" },
      el("h2", { id: "results-h", text: "What changed" }),
      el("p", { class: "lede", text: "The turn limit did not make the agent any smarter. It changed how each run ends." }),
      el("div", { class: "results" },
        stat("Pass rate", pairText(`${OLD.passes}/${N}`, `${NEW.passes}/${N}`)),
        stat("Worst case, turns", pairText(String(OLD.worstTurns), String(NEW.worstTurns))),
        stat("Worst case, cost", pairText(fmtCost(OLD.worstCost, 2), fmtCost(NEW.worstCost, 2))),
        stat("Mean cost", pairText(fmtCost(OLD.meanCost, 2), fmtCost(NEW.meanCost, 2)))),
      el("div", { class: "sentence-block" },
        el("p", {
          text: OLD.passes === NEW.passes
            ? `The turn limit didn't make the agent smarter: the same ${NEW.passes} runs pass. It made every run end, and cut the worst case by about ${RATIO}×.`
            : `The new board passes ${NEW.passes} runs and the old one ${OLD.passes}. The worst case is about ${RATIO}× cheaper.`,
        }),
        el("p", { class: "note-inline", text: "These runs are scripted, so they repeat exactly. Real models vary." })),
      notes("Pass", "A pass means the bug is fixed and the run ends within the limit."));
    const turnMax = Math.max(...OLD_TURNS, ...NEW_TURNS);
    const costMax = Math.max(...OLD_COST, ...NEW_COST);
    this.fig2 = el("figure", { class: "plate", "aria-labelledby": "fig2" },
      el("div", { class: "plate-head" }, el("span", { class: "fig-label", id: "fig2", text: "FIG 2 · Same axes, old and new" })),
      el("div", { class: "small-multiples" },
        el("div", { class: "sm-panel" }, el("p", { class: "sm-title", text: "Turns, old board" }), histPanel(OLD_TURNS, turnMax, TURN_TICKS, false, "Old board: runs by turns")),
        el("div", { class: "sm-panel" }, el("p", { class: "sm-title", text: "Turns, new board" }), histPanel(NEW_TURNS, turnMax, TURN_TICKS, true, "New board: runs by turns")),
        el("div", { class: "sm-panel" }, el("p", { class: "sm-title", text: "Cost, old board" }), histPanel(OLD_COST, costMax, COST_TICKS, false, "Old board: runs by cost")),
        el("div", { class: "sm-panel" }, el("p", { class: "sm-title", text: "Cost, new board" }), histPanel(NEW_COST, costMax, COST_TICKS, true, "New board: runs by cost"))),
      el("figcaption", { text: "Try this: compare the two boards on the same axes. The tall bars on the old side are the runs a person had to stop." }));
    this.resultsRow.hidden = true;
    this.fig2.hidden = true;
    drawWhenSeen(this.fig2);
  }

  // ---------- FIG 3 and the par puzzle ----------
  buildPuzzle() {
    this.limitRange = el("input", { type: "range", min: String(LIM_LO), max: String(LIM_HI), step: "1", value: String(START), "aria-label": "Turn limit" });
    this.limitRange.addEventListener("input", () => this.setLimit(Number(this.limitRange.value)));
    this.limitMinus = el("button", { class: "icon-btn", type: "button", "aria-label": "Lower the turn limit" }, glyph("minus"));
    this.limitMinus.addEventListener("click", () => this.setLimit(this.limit - 1));
    this.limitPlus = el("button", { class: "icon-btn", type: "button", "aria-label": "Raise the turn limit" }, glyph("plus"));
    this.limitPlus.addEventListener("click", () => this.setLimit(this.limit + 1));
    this.scrubLimit = el("span", {
      class: "scrub", role: "slider", tabindex: "0", "aria-label": "Turn limit",
      "aria-valuemin": String(LIM_LO), "aria-valuemax": String(LIM_HI),
    });
    bindScrub(this.scrubLimit, { min: LIM_LO, max: LIM_HI, get: () => this.limit, set: (n) => this.setLimit(n), px: 14 });
    this.passEl = el("strong");
    this.worstEl = el("strong");
    this.sentence = el("p", { class: "limit-line" },
      "With a limit of ", this.scrubLimit, " turns, ", this.passEl, " runs still pass and the worst run costs ", this.worstEl, ".");
    this.passValue = el("p", { class: "pair" });
    this.passNote = el("p", { class: "note-inline" });
    this.passStat = el("div", { class: "stat" }, el("p", { class: "label", text: "Passing runs" }), this.passValue, this.passNote);
    this.worstValue = el("p", { class: "pair" });
    this.worstStat = el("div", { class: "stat" }, el("p", { class: "label", text: "Worst run" }), this.worstValue);
    this.limitValue = el("p", { class: "pair" });
    this.limitStat = el("div", { class: "stat" }, el("p", { class: "label", text: "Turn limit" }), this.limitValue);
    this.buildCurve();
    this.parUnderline = svgEl("svg", { class: "underline", viewBox: "0 0 360 14", preserveAspectRatio: "none", "aria-hidden": "true" });
    this.parUnderline.append(svgEl("path", { d: "M3 9 C 90 2, 220 13, 357 5" }));
    this.parHolder = el("div", { class: "par-holder" },
      el("div", { class: "par-note" },
        el("p", { text: "Par: no lost passes, cheapest worst case." }),
        this.parUnderline,
        el("span", { class: "why", text: `Limit ${PAR} keeps all ${BASE} passing runs and cuts the worst run to ${fmtCost(CURVE[PAR - LIM_LO].worst, 3)}.` })));
    this.parNote = this.parHolder.querySelector(".par-note");
    this.plugBtn = el("button", { class: "btn btn-primary", type: "button", disabled: true, text: "Plug the turn limit into your board" });
    this.plugBtn.addEventListener("click", () => this.plug());
    this.plugMsg = el("p", { class: "plug-msg", text: "Try a few limits first. Then plug the one you like into your board." });
    this.loopSlot = null;
    this.miniBoard = el("ol", { class: "mini-board", "aria-label": "Your board, one socket per wire" }, WIRES.map((w) => {
      const li = el("li", { class: `w-${w.id}` });
      if (w.id === "loop") {
        this.loopSlot = li;
        li.append(el("span", { class: "tag-slot" }, `${SOCKETS.loop.title} · ${SOCKETS.loop.id}, empty`));
      } else {
        li.append(el("span", { class: "tag-slot" }, glyph(w.glyph), `${w.short}: empty`));
      }
      return li;
    }));
    this.puzzleRow = el("section", { class: "row puzzle", "aria-labelledby": "puzzle-h" },
      el("h2", { id: "puzzle-h", text: "Beat par" }),
      el("p", { class: "lede", text: "Find the turn limit with the cheapest worst case that loses no passing run." }),
      el("div", { class: "limit-controls" },
        el("div", { class: "range-row" }, this.limitMinus, this.limitRange, this.limitPlus)),
      this.sentence,
      el("div", { class: "pass-state" }, this.passStat, this.worstStat, this.limitStat),
      notes("Par", "The cheapest setting that still keeps every passing run."));
    this.fig3 = el("figure", { class: "plate", "aria-labelledby": "fig3" },
      el("div", { class: "plate-head" }, el("span", { class: "fig-label", id: "fig3", text: "FIG 3 · Every limit, from 2 to 30" })),
      this.curveWrap,
      el("div", { class: "curve-key" },
        el("span", {}, el("i", { style: "background:var(--ink);height:3px" }), "worst case at each limit"),
        el("span", {}, el("i", { style: "background:var(--fail);border-radius:50%" }), "loses a passing run"),
        el("span", {}, el("i", { style: "border:3px solid var(--pass);border-radius:50%;width:12px;height:12px" }), "par"),
        el("span", {}, el("i", { style: "background:var(--ink);border-radius:50%" }), "your limit")),
      this.parHolder,
      el("figcaption", { text: "Try this: drag the limit with the slider or the arrow keys, and watch the dot move along the curve." }));
    this.plugRow = el("section", { class: "row plug-row", "aria-label": "Plug in" },
      el("div", { class: "plug" },
        el("div", { class: "mini-clock" }, this.miniBoard),
        el("div", {}, this.plugBtn, this.plugMsg)));
    drawWhenSeen(this.curveWrap);
  }

  buildCurve() {
    const W = 640;
    const H = 300;
    const x0 = 48;
    const x1 = 620;
    const y0 = 16;
    const y1 = 250;
    const xOf = (L) => x0 + ((L - LIM_LO) / (LIM_HI - LIM_LO)) * (x1 - x0);
    const yOf = (c) => y1 - (c / CURVE_MAX) * (y1 - y0);
    this.xOf = xOf;
    this.yOf = yOf;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Worst-case cost for every turn limit from 2 to 30" });
    svg.append(svgEl("line", { class: "axis", x1: x0, x2: x1, y1, y2: y1 }), svgEl("line", { class: "axis", x1: x0, x2: x0, y1: y0, y2: y1 }));
    for (const v of [0, 0.2, 0.4, 0.6]) {
      if (v > CURVE_MAX) continue;
      const t = svgEl("text", { x: x0 - 8, y: yOf(v) + 5, "text-anchor": "end" });
      t.textContent = v.toFixed(1);
      svg.append(t);
    }
    for (const L of [2, 6, 12, 18, 24, 30]) {
      const t = svgEl("text", { x: xOf(L), y: y1 + 22, "text-anchor": "middle" });
      t.textContent = String(L);
      svg.append(t);
    }
    const axisName = svgEl("text", { x: x1, y: y1 + 44, "text-anchor": "end" });
    axisName.textContent = "turn limit";
    svg.append(axisName);
    const yName = svgEl("text", { x: x0, y: y0 - 4, "text-anchor": "start" });
    yName.textContent = "worst-case cost";
    svg.append(yName);
    const d = CURVE.map((c, k) => `${k === 0 ? "M" : "L"}${xOf(c.limit).toFixed(1)} ${yOf(c.worst).toFixed(1)}`).join(" ");
    const line = svgEl("path", { class: "line-path draw-on", d });
    svg.append(line);
    for (const c of CURVE) {
      if (c.passes < BASE) {
        const x = xOf(c.limit);
        const y = yOf(c.worst);
        svg.append(svgEl("path", { class: "loss-mark", d: `M${x - 5} ${y - 5} L${x + 5} ${y + 5} M${x + 5} ${y - 5} L${x - 5} ${y + 5}` }));
      }
    }
    this.parRing = svgEl("circle", { class: "par-ring", r: 12, cx: xOf(PAR), cy: yOf(CURVE[PAR - LIM_LO].worst), hidden: true });
    this.parLabel = svgEl("text", { class: "par-label", x: xOf(PAR) + 16, y: yOf(CURVE[PAR - LIM_LO].worst) - 14, hidden: true });
    this.parLabel.textContent = `par ${PAR}`;
    this.dot = svgEl("circle", { class: "choice-dot", r: 7 });
    svg.append(this.parRing, this.parLabel, this.dot);
    this.curveSvg = svg;
    this.curveWrap = el("div", { class: "curve" }, svg);
    requestAnimationFrame(() => {
      try {
        line.style.setProperty("--len", String(Math.ceil(line.getTotalLength())));
      } catch (error) {
        // getTotalLength can fail before layout; the default dash length still draws.
      }
    });
  }

  setLimit(n) {
    const next = clamp(Math.round(n), LIM_LO, LIM_HI);
    const changed = next !== this.limit;
    this.limit = next;
    this.tried.add(next);
    if (changed) this.touched = true;
    this.paintPuzzle();
    if (changed && this.plugged) this.paintPlug();
  }

  paintPuzzle() {
    const c = CURVE[this.limit - LIM_LO];
    const lost = BASE - c.passes;
    this.limitRange.value = String(this.limit);
    this.scrubLimit.textContent = String(this.limit);
    this.scrubLimit.setAttribute("aria-valuenow", String(this.limit));
    this.scrubLimit.setAttribute("aria-valuetext", `${this.limit} turns`);
    this.passEl.textContent = String(c.passes);
    this.worstEl.textContent = fmtCost(c.worst, 3);
    this.limitMinus.disabled = this.limit <= LIM_LO;
    this.limitPlus.disabled = this.limit >= LIM_HI;
    this.passStat.classList.toggle("is-bad", lost > 0);
    this.passStat.classList.toggle("is-good", lost === 0);
    this.passValue.textContent = `${c.passes} of ${N}`;
    this.passNote.textContent = lost > 0
      ? `${lost} passing run${lost === 1 ? "" : "s"} lost. Below ${BASE} is a loss.`
      : `No passing run lost. Still ${BASE} of ${N}.`;
    this.worstValue.textContent = fmtCost(c.worst, 3);
    this.limitValue.textContent = `${this.limit} turns`;
    this.dot.setAttribute("cx", String(this.xOf(this.limit)));
    this.dot.setAttribute("cy", String(this.yOf(c.worst)));
    const shown = this.limit === PAR && this.tried.size >= 3;
    if (shown && !this.parShown && !reduceMotion()) {
      this.parHolder.classList.add("is-drawing");
      window.setTimeout(() => this.parHolder.classList.remove("is-drawing"), 800);
    }
    this.parShown = shown;
    this.parNote.classList.toggle("is-shown", shown);
    this.parRing.hidden = !shown;
    this.parLabel.hidden = !shown;
    if (shown) this.say("Par: no lost passes, cheapest worst case.");
    this.plugBtn.disabled = !this.touched;
  }

  plug() {
    if (!this.touched) return;
    this.plugged = true;
    this.paintPlug();
    this.plugMsg.textContent = `Plugged: the loop now stops at ${this.limit} turns. The worst run costs ${fmtCost(CURVE[this.limit - LIM_LO].worst, 3)}.`;
    this.say(this.plugMsg.textContent);
  }

  paintPlug() {
    this.loopSlot.replaceChildren(el("span", { class: "tag is-on-loop is-new" }, glyph("cycle"), `turn limit = ${this.limit}`));
  }

  // ---------- test hook: Run x20, check both pass rates, then find par through the real controls ----------
  async selfTest() {
    try {
      this.runBtn.click();
      await this.lastRun;
      const text = this.resultsRow.textContent;
      if (!text.includes(`${OLD.passes}/${N}`) || !text.includes(`${NEW.passes}/${N}`)) return false;
      if (OLD.passes !== 13 || NEW.passes !== 13) return false;
      this.limitRange.value = "9";
      this.limitRange.dispatchEvent(new Event("input"));
      this.limitRange.value = String(PAR);
      this.limitRange.dispatchEvent(new Event("input"));
      if (COMPUTED_PAR !== PAR) return false;
      return this.parShown && this.parNote.classList.contains("is-shown");
    } catch (error) {
      console.error(error);
      return false;
    }
  }
}
