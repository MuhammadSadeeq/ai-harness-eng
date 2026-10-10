// Prove: two racks run the same 20 seeds. Results are computed from the fixture. Then the par
// puzzle: find the turn limit with the cheapest worst case that loses no passing run.
import {
  OLD, NEW, STATS_OLD, STATS_NEW, SAME_PASSING_SEEDS, COST_RATIO_WHOLE, TURN_EDGES, COST_EDGES,
  histogram, statusWord, statusGlyph, units, puzzleAt, CURVE, LIMIT_MIN, LIMIT_MAX, PAR_LIMIT,
  FIXES_BASELINE, COST_BY_TURNS, fmt,
} from "./shared.js";
import { announce, click, reducedMotion } from "./app.js";
import { FIXTURE } from "../shared/fixture.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const START_LIMIT = 12;
const PAR_TRIES = 3;
const RULE_TEXT = FIXTURE.puzzle.rule;

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

function glyph(name, cls = "glyph") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `glyphs.svg#g-${name}`);
  svg.append(use);
  return svg;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function pct(n, d) {
  return `${n}/${d}`;
}

class ProveElement extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "1";
    this.state = { limit: START_LIMIT, tried: new Set(), done: false, running: false, selected: null, plugged: null, parShown: false, sweptPar: false };
    this.render();
    this.setLimit(START_LIMIT, false);
    this.__test = { run: async () => this.check() };
  }

  // ---------- markup ----------
  render() {
    this.innerHTML = "";
    this.runKey = el("button", { type: "button", class: "key primary run-key", "data-run": "", text: "Run ×20" });
    this.runHint = el("p", { class: "hint", "aria-live": "off", text: "Both boards run on the same 20 seeds. Same seed, same model behaviour." });

    this.boards = { old: this.board("old", "Old board", "One exit", ["model says done"]), new: this.board("new", "New board", "Plus a turn limit and a token budget", ["model says done", "turn limit 12", "token budget 60k"]) };

    this.summary = {
      passOld: el("div", { class: "readout" }, [el("span", { class: "u", text: "pass · old" }), el("span", { class: "v", "data-pass-old": "" })]),
      passNew: el("div", { class: "readout" }, [el("span", { class: "u", text: "pass · new" }), el("span", { class: "v", "data-pass-new": "" })]),
      turns: el("div", { class: "readout" }, [el("span", { class: "u", text: "worst turns · old / new" }), el("span", { class: "v", "data-turns": "" })]),
      cost: el("div", { class: "readout" }, [el("span", { class: "u", text: "worst cost · old / new" }), el("span", { class: "v", "data-worst": "" })]),
    };
    this.mean = el("p", { class: "hint", "data-mean": "" });
    this.honest = el("p", { class: "honest", "data-honest": "" });
    this.noise = el("p", { class: "noise", text: "These runs are scripted, so they repeat exactly; real models vary." });
    this.histWrap = el("div", { class: "hist-grid" });

    this.knobInput = el("input", { type: "range", class: "knob-input", min: String(LIMIT_MIN), max: String(LIMIT_MAX), step: "1", value: String(START_LIMIT), "aria-label": "Max turns", "aria-valuemin": String(LIMIT_MIN), "aria-valuemax": String(LIMIT_MAX) });
    this.knobFace = el("div", { class: "knob-face", "aria-hidden": "true" }, [el("span", { class: "ptr" })]);
    this.knobSvg = document.createElementNS(SVG_NS, "svg");
    this.knobSvg.setAttribute("class", "knob-svg");
    this.knobSvg.setAttribute("viewBox", "0 0 240 240");
    this.knobSvg.setAttribute("aria-hidden", "true");
    this.knobSvg.setAttribute("focusable", "false");
    this.minusBtn = el("button", { type: "button", class: "key sq", "aria-label": "Lower max turns", text: "−" });
    this.plusBtn = el("button", { type: "button", class: "key sq", "aria-label": "Raise max turns", text: "+" });
    this.limitRead = el("div", { class: "readout" }, [el("span", { class: "u", text: "max turns" }), el("span", { class: "v", "data-limit": "" })]);
    this.passRead = el("div", { class: "readout wide" }, [el("span", { class: "u", text: "passing runs" }), el("span", { class: "v", "data-passes": "" })]);
    this.worstRead = el("div", { class: "readout wide" }, [el("span", { class: "u", text: "worst case" }), el("span", { class: "v", "data-worst-now": "" })]);
    this.triesRead = el("p", { class: "tries", "data-tries": "", "aria-live": "polite" });
    this.parState = el("p", { class: "par-state", "data-par-text": "", "aria-live": "polite" });
    this.scope = el("div", { class: "scope", role: "img", "aria-label": "Solution space: worst-case cost for each turn limit from 2 to 30" });
    this.scopeSvg = document.createElementNS(SVG_NS, "svg");
    this.scopeSvg.setAttribute("aria-hidden", "true");
    this.scope.append(this.scopeSvg);
    this.scopeCaption = el("p", { class: "scope-caption", text: "Worst-case cost by max turns (x: max turns, y: units). Red zone: limits that lose a passing run." });
    this.miniRack = el("div", { class: "mini-board", role: "list", "aria-label": "Your board: eight slots" });
    this.plugBtn = el("button", { type: "button", class: "key primary", disabled: true, "data-plug": "", text: "Plug the turn limit into your board" });
    this.plugNote = el("p", { class: "hint", "data-plug-note": "" });

    const rule = el("details", { class: "rule-details" }, [
      el("summary", { text: "The rule, exactly" }),
      el("p", { text: RULE_TEXT }),
    ]);

    this.append(el("div", { class: "prove-wrap" }, [
      el("header", { class: "hero-head" }, [
        el("div", {}, [
          el("p", { class: "label small-ink", text: "B2 · The agent loop · 2 Prove" }),
          el("h1", { text: "Prove the fix, then beat par" }),
        ]),
        el("p", { class: "voice", text: "Same seeds, two boards. Only the rules differ." }),
      ]),
      el("section", { class: "section", "aria-labelledby": "run-h" }, [
        el("header", {}, [el("h2", { id: "run-h", text: "1 · Run both boards" })]),
        el("div", { class: "run-row" }, [this.runKey]),
        this.runHint,
        el("div", { class: "racks" }, [this.boards.old.el, this.boards.new.el]),
      ]),
      el("section", { class: "section", "aria-labelledby": "res-h" }, [
        el("header", {}, [el("h2", { id: "res-h", text: "2 · Results" }), el("p", { class: "hint", text: "Computed from the 20 runs on each board, never typed in." })]),
        el("div", { class: "summary-grid" }, [this.summary.passOld, this.summary.passNew, this.summary.turns, this.summary.cost]),
        this.mean,
        this.honest,
        this.noise,
        this.histWrap,
      ]),
      el("section", { class: "section", "aria-labelledby": "par-h" }, [
        el("header", {}, [
          el("h2", { id: "par-h", text: "3 · Beat par" }),
          el("p", { class: "hint", text: "Find the turn limit with the cheapest worst case that loses no passing run. Start at 12." }),
        ]),
        el("div", { class: "par-wrap" }, [
          el("div", { class: "panel lg knob-panel" }, [
            el("div", { class: "knob" }, [this.knobSvg, this.knobFace, this.knobInput]),
            el("div", { class: "knob-stepper" }, [this.minusBtn, this.limitRead, this.plusBtn]),
            el("p", { class: "label small-ink", text: "Turn the knob or use the arrow keys" }),
          ]),
          el("div", { class: "panel lg scope-panel" }, [
            this.passRead,
            this.worstRead,
            this.triesRead,
            this.parState,
            this.scope,
            this.scopeCaption,
            rule,
          ]),
        ]),
        el("div", { class: "panel lg plug-panel" }, [
          el("p", { class: "label small-ink", text: "Your board · loop socket" }),
          this.miniRack,
          this.plugBtn,
          this.plugNote,
        ]),
      ]),
    ]));

    this.buildHistograms();
    this.buildKnobTicks();
    this.buildMiniRack();
    this.bind();
  }

  board(id, title, subtitle, exits) {
    const steps = el("div", { class: "steps", role: "list", "aria-label": `${title} runs, one per seed` });
    const cells = [];
    const trials = id === "old" ? OLD : NEW;
    trials.forEach((t, k) => {
      const cell = el("button", { type: "button", class: "cell", role: "listitem", "data-board": id, "data-index": String(k), "aria-label": `Seed ${t.seed}: not run yet` });
      cell.append(el("span", { "aria-hidden": "true", text: "·" }));
      steps.append(cell);
      cells.push(cell);
    });
    const exitList = el("ul", { class: "exit-list", "aria-label": `${title} exits` }, exits.map((text) => el("li", {}, [
      el("span", { class: "led on", style: "--c:#D23A4A", "aria-hidden": "true" }),
      el("span", { text }),
    ])));
    const read = el("p", { class: "trial-read mono", "aria-live": "polite", "data-read": id, text: "Tap a step to see its seed, status, turns and cost." });
    const passLine = el("p", { class: "hint", "data-pass-line": id });
    const node = el("section", { class: "panel lg rack-board", "aria-labelledby": `${id}-h` }, [
      el("header", {}, [
        el("p", { class: "label small-ink", text: id === "old" ? "Board A" : "Board B" }),
        el("h3", { id: `${id}-h`, text: title }),
        el("p", { class: "hint", text: subtitle }),
      ]),
      exitList,
      steps,
      passLine,
      read,
    ]);
    return { el: node, cells, steps, read, passLine, id, trials };
  }

  buildHistograms() {
    const oldTurns = histogram(OLD.map((t) => t.turns), TURN_EDGES);
    const newTurns = histogram(NEW.map((t) => t.turns), TURN_EDGES);
    const oldCost = histogram(OLD.map((t) => t.cost), COST_EDGES);
    const newCost = histogram(NEW.map((t) => t.cost), COST_EDGES);
    this.histWrap.replaceChildren(
      this.histogramPanel("Turns per run", oldTurns, newTurns, ["0", "10", "20", "30", "40"], "turns, shared axis"),
      this.histogramPanel("Cost per run", oldCost, newCost, ["0", "0.5", "1.0"], "units, shared axis"),
    );
  }

  histogramPanel(title, oldCounts, newCounts, ticks, unit) {
    const max = Math.max(1, ...oldCounts, ...newCounts);
    const bins = oldCounts.map((count, k) => {
      const pair = el("div", { class: "hist-pair" }, [
        el("span", { class: "hist-bar old", style: `height:${(count / max) * 100}%` }),
        el("span", { class: "hist-bar new", style: `height:${(newCounts[k] / max) * 100}%` }),
      ]);
      return pair;
    });
    return el("section", { class: "panel hist", "aria-label": `${title}, old and new boards` }, [
      el("p", { class: "label", text: title }),
      el("div", { class: "hist-plot" }, [el("div", { class: "hist-bins" }, bins)]),
      el("div", { class: "hist-axis", "aria-hidden": "true" }, ticks.map((t) => el("span", { text: t }))),
      el("p", { class: "hint", text: `Bars per bin, ${unit}.` }),
      el("div", { class: "hist-legend" }, [el("span", { class: "lg-old", text: "Old board" }), el("span", { class: "lg-new", text: "New board" })]),
    ]);
  }

  buildKnobTicks() {
    const svg = this.knobSvg;
    const count = LIMIT_MAX - LIMIT_MIN + 1;
    for (let k = 0; k < count; k += 1) {
      const angle = -135 + (k / (count - 1)) * 270;
      const rad = ((angle - 90) * Math.PI) / 180;
      const r1 = 104;
      const r2 = k % 4 === 0 ? 116 : 110;
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(120 + r1 * Math.cos(rad)));
      line.setAttribute("y1", String(120 + r1 * Math.sin(rad)));
      line.setAttribute("x2", String(120 + r2 * Math.cos(rad)));
      line.setAttribute("y2", String(120 + r2 * Math.sin(rad)));
      line.setAttribute("stroke", "#1E2226");
      line.setAttribute("stroke-width", k % 4 === 0 ? "2.5" : "1.5");
      line.setAttribute("stroke-linecap", "round");
      svg.append(line);
    }
  }

  buildMiniRack() {
    const names = [
      ["control", "Control"], ["context", "Context"], ["loop", "Loop"], ["errors", "Errors"],
      ["tools", "Tools"], ["permissions", "Permissions"], ["verify", "Verify"], ["observe", "Observe"],
    ];
    const colors = { control: "#7457E6", context: "#14408F", loop: "#D23A4A", errors: "#6A2A10", tools: "#946E00", permissions: "#12553F", verify: "#187A6D", observe: "#36404E" };
    this.miniSlots = {};
    this.miniLeds = [];
    names.forEach(([id, label], k) => {
      const led = el("span", { class: "led", "aria-hidden": "true" });
      led.style.setProperty("--c", colors[id]);
      this.miniLeds.push(led);
      const slot = el("div", { class: `mini-slot${id === "loop" ? " loop-slot" : ""}`, role: "listitem", "data-mini": id, "aria-label": `${label}: ${id === "loop" ? "empty, plug the turn limit here" : "empty"}` }, [
        led,
        glyph(["layers", "window", "cycle", "zigzag", "hexagon", "diamond", "shield", "eye"][k], "glyph"),
        el("span", { class: "name", text: label }),
        el("span", { class: "lbl", text: id === "loop" ? "plug here" : "" }),
      ]);
      slot.style.setProperty("--c", colors[id]);
      this.miniSlots[id] = slot;
      this.miniRack.append(slot);
    });
  }

  // ---------- behaviour ----------
  bind() {
    const S = this.state;
    this.runKey.addEventListener("click", () => this.run());
    for (const b of [this.boards.old, this.boards.new]) {
      b.cells.forEach((cell, k) => {
        cell.addEventListener("click", () => this.select(b.id, k));
        cell.addEventListener("pointerenter", () => this.link(k, true));
        cell.addEventListener("focus", () => this.link(k, true));
        cell.addEventListener("pointerleave", () => this.link(k, false));
        cell.addEventListener("blur", () => this.link(k, false));
      });
    }
    this.knobInput.addEventListener("input", () => this.setLimit(Number(this.knobInput.value), true));
    this.minusBtn.addEventListener("click", () => this.setLimit(S.limit - 1, true));
    this.plusBtn.addEventListener("click", () => this.setLimit(S.limit + 1, true));
    this.plugBtn.addEventListener("click", () => this.plug());
    this.resizeObserver = new ResizeObserver(() => this.drawScope());
    this.resizeObserver.observe(this.scope);
  }

  select(board, k) {
    const trial = (board === "old" ? OLD : NEW)[k];
    this.state.selected = { board, k };
    this.boards[board].cells.forEach((c, i) => c.setAttribute("aria-pressed", i === k ? "true" : "false"));
    this.boards[board].read.textContent = `Seed ${trial.seed} · ${board} board · ${statusWord(trial.status)} · ${trial.turns} turns · ≈ ${units(trial.cost)} units · ${trial.passed ? "passed" : "did not pass"}`;
    this.boards[board].read.setAttribute("data-selected", "");
  }

  link(k, on) {
    for (const b of [this.boards.old, this.boards.new]) {
      b.cells.forEach((c, i) => c.classList.toggle("linked", on && i === k));
    }
  }

  async run() {
    const S = this.state;
    if (S.running) return;
    S.running = true;
    this.runKey.disabled = true;
    click("key");
    const reduced = reducedMotion();
    for (const b of [this.boards.old, this.boards.new]) {
      b.cells.forEach((c, k) => {
        c.className = "cell";
        c.setAttribute("aria-label", `Seed ${b.trials[k].seed}: waiting`);
        c.replaceChildren(el("span", { "aria-hidden": "true", text: "·" }));
      });
    }
    for (let k = 0; k < OLD.length; k += 1) {
      for (const b of [this.boards.old, this.boards.new]) this.light(b, k);
      if (!reduced) await wait(75);
    }
    S.done = true;
    S.running = false;
    this.runKey.disabled = false;
    this.renderResults();
    announce(`Run complete. Old board: ${pct(STATS_OLD.passes, STATS_OLD.n)} pass. New board: ${pct(STATS_NEW.passes, STATS_NEW.n)} pass.`);
  }

  light(board, k) {
    const trial = board.trials[k];
    const cell = board.cells[k];
    const status = trial.status;
    cell.className = `cell ${status}`;
    cell.replaceChildren(
      glyph(statusGlyph(status), "glyph"),
      el("span", { text: String(trial.turns) }),
    );
    cell.setAttribute("aria-label", `Seed ${trial.seed}, ${board.id} board: ${statusWord(status)}, ${trial.turns} turns`);
  }

  renderResults() {
    const S = this.state;
    const pOld = pct(STATS_OLD.passes, STATS_OLD.n);
    const pNew = pct(STATS_NEW.passes, STATS_NEW.n);
    this.summary.passOld.querySelector("[data-pass-old]").textContent = pOld;
    this.summary.passNew.querySelector("[data-pass-new]").textContent = pNew;
    this.boards.old.passLine.textContent = `${pOld} passed`;
    this.boards.new.passLine.textContent = `${pNew} passed`;
    this.summary.turns.querySelector("[data-turns]").textContent = `${STATS_OLD.worstTurns} / ${STATS_NEW.worstTurns}`;
    this.summary.cost.querySelector("[data-worst]").textContent = `${units(STATS_OLD.worstCost)} / ${units(STATS_NEW.worstCost)}`;
    this.mean.textContent = `Mean cost per run: old ≈ ${units(STATS_OLD.meanCost)} units, new ≈ ${units(STATS_NEW.meanCost)} units.`;
    const same = SAME_PASSING_SEEDS
      ? `The turn limit didn't make the agent smarter: the same ${STATS_NEW.passes} runs pass.`
      : `The turn limit didn't make the agent smarter: ${STATS_NEW.passes} runs pass on the new board, ${STATS_OLD.passes} on the old one.`;
    this.honest.textContent = `${same} It made every run end, and cut the worst case by about ${COST_RATIO_WHOLE}×.`;
    this.drawScope();
    this.updatePar();
    this.state.resultsReady = true;
  }

  setLimit(value, fromUser) {
    const S = this.state;
    const next = Math.max(LIMIT_MIN, Math.min(LIMIT_MAX, Math.round(value)));
    const changed = next !== S.limit;
    S.limit = next;
    if (fromUser && changed) {
      S.tried.add(next);
      click("detent");
    }
    this.knobInput.value = String(next);
    this.knobInput.setAttribute("aria-valuetext", `${next} turns`);
    this.limitRead.querySelector("[data-limit]").textContent = String(next);
    this.updatePar();
    this.drawScope();
  }

  updatePar() {
    const S = this.state;
    const now = puzzleAt(S.limit);
    const rot = -135 + ((S.limit - LIMIT_MIN) / (LIMIT_MAX - LIMIT_MIN)) * 270;
    this.knobFace.style.transform = `rotate(${rot}deg)`;
    this.passRead.querySelector("[data-passes]").textContent = `${now.passes} of ${FIXES_BASELINE}`;
    this.passRead.classList.toggle("neg", now.lost > 0);
    this.worstRead.querySelector("[data-worst-now]").textContent = `≈ ${units(now.worst)} units`;
    this.triesRead.textContent = `Values tried: ${S.tried.size}. Par shows after ${PAR_TRIES}.`;
    const isPar = S.limit === PAR_LIMIT && S.tried.size >= PAR_TRIES;
    if (isPar && !S.parShown) {
      S.parShown = true;
      this.sweep();
      announce("Par: no lost passes, cheapest worst case.");
    }
    this.parState.classList.toggle("is-par", S.parShown && S.limit === PAR_LIMIT);
    this.dataset.par = S.parShown && S.limit === PAR_LIMIT ? "true" : "false";
    this.plugBtn.disabled = S.tried.size === 0;
    if (S.parShown && S.limit === PAR_LIMIT) {
      this.parState.textContent = "PAR: no lost passes, cheapest worst case.";
      this.passRead.querySelector(".u").textContent = "passing runs · par";
    } else if (now.lost > 0) {
      this.parState.textContent = `${now.lost} passing run${now.lost === 1 ? "" : "s"} lost at ${S.limit}. Raise the limit.`;
      this.passRead.querySelector(".u").textContent = "passing runs";
    } else {
      this.parState.textContent = S.tried.size >= PAR_TRIES
        ? "No passing run is lost. Look for the cheapest worst case."
        : "Keep turning. Passing runs need enough room.";
      this.passRead.querySelector(".u").textContent = "passing runs";
    }
    this.plugNote.textContent = S.plugged === null
      ? "The module goes into the loop socket once you plug it in."
      : `Plugged in: MAX TURNS ${S.plugged}.`;
  }

  sweep() {
    if (reducedMotion()) return;
    this.miniLeds.forEach((led, k) => {
      led.classList.remove("on");
      window.setTimeout(() => {
        led.classList.add("on");
        led.animate([{ transform: "scale(1.5)" }, { transform: "scale(1)" }], { duration: 160 });
      }, k * 75);
    });
  }

  plug() {
    const S = this.state;
    if (S.tried.size === 0) return;
    S.plugged = S.limit;
    click("key");
    const slot = this.miniSlots.loop;
    slot.classList.remove("filled", "hit");
    slot.classList.add("filled");
    slot.replaceChildren(
      this.miniLeds[2],
      glyph("cycle", "glyph"),
      el("span", { class: "name", text: "Max turns" }),
      el("span", { class: "lbl", text: `${S.limit} turns` }),
    );
    this.miniLeds[2].classList.add("on");
    void slot.offsetWidth;
    if (!reducedMotion()) slot.classList.add("hit");
    this.updatePar();
    announce(`Plugged in: max turns ${S.limit}.`);
  }

  // ---------- scope chart ----------
  drawScope() {
    const S = this.state;
    const svg = this.scopeSvg;
    const w = this.scope.clientWidth;
    const h = this.scope.clientHeight;
    if (!w || !h) return;
    svg.replaceChildren();
    const plot = { left: 52, right: w - 16, top: 14, bottom: h - 40 };
    const plotW = plot.right - plot.left;
    const plotH = plot.bottom - plot.top;
    const yMax = 0.6;
    const x = (L) => plot.left + ((L - LIMIT_MIN) / (LIMIT_MAX - LIMIT_MIN)) * plotW;
    const y = (c) => plot.top + (1 - c / yMax) * plotH;
    const add = (tag, attrs) => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      svg.append(node);
      return node;
    };
    // Losing zone: limits that lose a passing run.
    const losing = CURVE.filter((p) => p.lost > 0);
    if (losing.length) {
      const lastLose = losing[losing.length - 1].limit;
      add("rect", { x: x(LIMIT_MIN) - 4, y: plot.top, width: x(lastLose + 0.5) - x(LIMIT_MIN) + 4, height: plotH, fill: "rgba(179,38,30,0.32)" });
    }
    // Grid
    for (const v of [0, 0.2, 0.4, 0.6]) {
      add("line", { x1: plot.left, x2: plot.right, y1: y(v), y2: y(v), stroke: "#2B343B", "stroke-width": 1 });
    }
    add("line", { x1: plot.left, x2: plot.left, y1: plot.top, y2: plot.bottom, stroke: "#4A565F", "stroke-width": 1 });
    add("line", { x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom, stroke: "#4A565F", "stroke-width": 1 });
    // Curve
    const pts = CURVE.map((p) => `${x(p.limit).toFixed(1)},${y(p.worst).toFixed(1)}`).join(" ");
    add("polyline", { points: pts, fill: "none", stroke: "#F2D06B", "stroke-width": 2.5, "stroke-linejoin": "round" });
    for (const p of CURVE) {
      add("circle", { cx: x(p.limit), cy: y(p.worst), r: p.lost > 0 ? 3.5 : 2, fill: p.lost > 0 ? "#FF9C91" : "#F2D06B" });
    }
    // Learner point
    const now = puzzleAt(S.limit);
    add("circle", { cx: x(S.limit), cy: y(now.worst), r: 7, fill: "#FFFFFF", stroke: "#F2D06B", "stroke-width": 3 });
    // Par marker (only once revealed)
    if (S.parShown) {
      add("line", { x1: x(PAR_LIMIT), x2: x(PAR_LIMIT), y1: plot.top, y2: plot.bottom, stroke: "#8FE3AE", "stroke-width": 1.5, "stroke-dasharray": "4 4" });
    }
    this.scopeLabels(plot, x, y, yMax);
  }

  scopeLabels(plot, x, y, yMax) {
    // HTML labels (14 px), positioned over the SVG so text never scales.
    for (const node of this.scope.querySelectorAll(".scope-tick")) node.remove();
    const put = (text, left, top, cls) => {
      const span = el("span", { class: `scope-tick ${cls || ""}`, text, "aria-hidden": "true" });
      span.style.position = "absolute";
      span.style.left = `${left}px`;
      span.style.top = `${top}px`;
      span.style.fontFamily = "var(--mono)";
      span.style.fontSize = "14px";
      span.style.color = "#E8C35E";
      span.style.transform = cls === "y" ? "translate(-100%, -50%)" : "translate(-50%, 0)";
      this.scope.append(span);
    };
    for (const v of [0, 0.2, 0.4, 0.6]) put(v.toFixed(1), plot.left - 8, y(v), "y");
    for (const L of [2, 6, 10, 15, 20, 25, 30]) put(String(L), x(L), plot.bottom + 8, "x");
    if (this.state.parShown) put(`PAR ${PAR_LIMIT}`, x(PAR_LIMIT) + 6, plot.top + 2, "x");
  }

  check() {
    // Drive the real UI: run ×20, check both pass rates, then set the limit to 6 via 9, 7, 6.
    this.runKey.click();
    return this.waitForResults(8000).then(async (ok) => {
      if (!ok) return false;
      const oldPass = this.summary.passOld.querySelector("[data-pass-old]").textContent;
      const newPass = this.summary.passNew.querySelector("[data-pass-new]").textContent;
      if (oldPass !== "13/20" || newPass !== "13/20") return false;
      for (const v of [9, 7, 6]) {
        this.knobInput.value = String(v);
        this.knobInput.dispatchEvent(new Event("input", { bubbles: true }));
        await wait(0);
      }
      return this.dataset.par === "true" && this.parState.textContent.startsWith("PAR");
    });
  }

  async waitForResults(timeout) {
    const start = performance.now();
    while (!this.state.resultsReady) {
      if (performance.now() - start > timeout) return false;
      await wait(40);
    }
    return true;
  }
}

customElements.define("hx-proto-prove", ProveElement);
