// Prove: the canary dashboard (BP-0.7-common, screen 3). Custom element <hx-proto-prove>.
import {
  DATA,
  GUARD_CURVE,
  LIMIT_MAX,
  LIMIT_MIN,
  PAR_LIMIT,
  PAR_TRIES,
  PASS_TOTAL,
  WIRES,
  announce,
  armStats,
  esc,
  fmtSeconds,
  glyph,
  guardAt,
  initChrome,
  readStore,
  reducedMotion,
  writeStore,
} from "./app.js";

const ARMS = [
  { id: "old", title: "Control", sub: DATA.boards.old.label, exits: DATA.boards.old.exits },
  { id: "new", title: "Candidate", sub: DATA.boards.new.label, exits: DATA.boards.new.exits },
];
const STATUS = {
  done: { icon: "check", word: "done", cls: "is-done" },
  interrupted: { icon: "cross", word: "stopped by a person", cls: "is-interrupted" },
  max_turns: { icon: "bang", word: "stopped at the limit", cls: "is-limit" },
};
const TRIAL_GAP_MS = 75;
const TURN_BINS = [
  { label: "1\u20134", lo: 0, hi: 4 },
  { label: "5\u201312", lo: 4, hi: 12 },
  { label: "13\u201330", lo: 12, hi: 30 },
  { label: "31\u201350", lo: 30, hi: 50 },
];
const COST_BINS = [
  { label: "\u22640.05", lo: 0, hi: 0.05 },
  { label: "\u22640.2", lo: 0.05, hi: 0.2 },
  { label: "\u22640.6", lo: 0.2, hi: 0.6 },
  { label: "\u22641.25", lo: 0.6, hi: 1.25 },
];
const UNIT = (c) => `≈ ${c.toFixed(3)} units`;

function binCounts(values, bins) {
  return bins.map((bin, i) =>
    values.filter((v) => (i === 0 ? v >= bin.lo && v <= bin.hi : v > bin.lo && v <= bin.hi)).length,
  );
}

class HxProtoProve extends HTMLElement {
  constructor() {
    super();
    this.__test = { run: () => this.selfTest() };
    this.s = {
      running: false,
      shown: 0,
      selected: null,
      limit: 12,
      tried: new Set(),
      par: false,
      flashed: false,
      plugged: false,
      plugNew: false,
      guardLimit: null,
    };
    this.stats = { old: armStats("old"), new: armStats("new") };
    this.sameRuns = DATA.bench.old.every((run, i) => run.passed === DATA.bench.new[i].passed);
  }

  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "1";
    this.render();
    this.bind();
    this.restoreGuard();
    this.updateGuard();
  }

  disconnectedCallback() {
    clearTimeout(this.timer);
  }

  // --- structure ---------------------------------------------------------------------

  render() {
    const boards = ARMS.map((arm) => {
      const cells = DATA.bench[arm.id]
        .map((run, i) => {
          return `<button type="button" class="cell is-pending" data-arm="${arm.id}" data-i="${i}" aria-pressed="false" aria-label="Trial ${i + 1}, seed ${run.seed}: pending">
            <span class="n">${i + 1}</span>
            <span class="cell-mark" data-mark>${glyph("pause", { size: 14 })}</span>
          </button>`;
        })
        .join("");
      return `<section class="panel board" aria-labelledby="board-${arm.id}">
        <div class="board-title">
          <h2 id="board-${arm.id}">${esc(arm.title)}</h2>
          <span class="small muted">${esc(arm.sub)}</span>
        </div>
        <div class="exits" aria-label="Exits on this board">${arm.exits.map((e) => `<span class="exit">${esc(e)}</span>`).join("")}</div>
        <div class="heat" data-heat="${arm.id}" role="group" aria-label="${esc(arm.title)} board: 20 trials">${cells}</div>
      </section>`;
    }).join("");

    this.innerHTML = `
<section class="canary-head" aria-labelledby="canary-title">
  <p class="kicker">Canary · turn-limit guard · same 20 seeds on both boards</p>
  <div class="board-title">
    <h1 id="canary-title">Run canary ×20</h1>
    <span class="status quiet" data-run-status>${glyph("pause", { size: 14 })}Not run yet</span>
  </div>
  <p class="muted" style="max-width:66ch">Control runs the old board. Candidate adds a turn limit and a token budget. Each trial uses the same seed on both boards, so the model behaves the same until a limit cuts it off.</p>
  <div class="cta-row">
    <button type="button" class="btn" data-run>Run canary ×20</button>
    <div class="legend-status" aria-label="Status key">
      <span class="done">${glyph("check", { size: 14 })}done</span>
      <span class="limit">${glyph("bang", { size: 14 })}stopped at the limit</span>
      <span class="interrupted">${glyph("cross", { size: 14 })}stopped by a person</span>
    </div>
  </div>
</section>

<div class="boards">${boards}</div>
<section class="panel trial-detail" data-trial-detail aria-live="off">
  <p class="muted">Tap a trial to see its seed, status, turns and cost on both boards.</p>
</section>

<section class="panel" data-results aria-labelledby="results-title" hidden>
  <p class="kicker" id="results-title">Results · computed from the 20 trials</p>
  <div class="metrics" style="margin-top:12px">
    <div class="metric is-good"><div class="label">Passing runs</div><div class="big" data-pass-both></div><div class="sub" data-pass-sub></div></div>
    <div class="metric"><div class="label">Worst-case turns</div><div class="big" data-worst-turns></div><div class="sub" data-worst-turns-sub></div></div>
    <div class="metric"><div class="label">Worst-case cost</div><div class="big" data-worst-cost></div><div class="sub" data-worst-cost-sub></div></div>
    <div class="metric"><div class="label">Mean cost</div><div class="big" data-mean-cost></div><div class="sub" data-mean-cost-sub></div></div>
  </div>
  <div class="honest" style="margin-top:14px">
    <p data-honest></p>
    <p class="noise">These runs are scripted, so they repeat exactly; real models vary.</p>
  </div>
  <div class="hist-grid" style="margin-top:16px" data-hists></div>
  <div class="table-wrap"><table class="compare" data-table-fallback></table></div>
</section>

<section class="panel guard" data-guard aria-labelledby="guard-title" style="margin-top:16px">
  <div>
    <p class="kicker">Set the turn-limit guard</p>
    <h2 id="guard-title">Find the turn limit with the cheapest worst case that loses no passing run.</h2>
    <p class="small muted" style="margin-top:6px">SLO: lowest p100 cost without losing a passing run. The rule: a trial passes if it fixes the bug and needs no more turns than the limit. Otherwise the new board stops it at the limit.</p>
  </div>
  <div class="par-banner" data-par role="status">
    ${glyph("check", { size: 20 })}
    <div><strong>Par: no lost passes, cheapest worst case</strong><div class="small" data-par-detail></div></div>
  </div>
  <div class="guard-controls">
    <div class="stepper">
      <button type="button" class="field-btn" data-dec aria-label="Lower the limit by one">−</button>
      <input type="range" min="${LIMIT_MIN}" max="${LIMIT_MAX}" step="1" value="12" data-slider aria-label="Turn limit" aria-describedby="limit-help" />
      <button type="button" class="field-btn" data-inc aria-label="Raise the limit by one">+</button>
    </div>
    <p class="small muted" id="limit-help">Turn limit <output data-limit-value class="num" style="color:var(--ink);font-weight:700">12</output> turns · range ${LIMIT_MIN}–${LIMIT_MAX}</p>
  </div>
  <div class="guard-readouts">
    <div class="metric" data-passes-card><div class="label">Passing runs</div><div class="big" data-guard-passes></div><div class="sub">of 20; the control board passes ${PASS_TOTAL}</div></div>
    <div class="metric" data-worst-card><div class="label">Worst-case cost</div><div class="big" data-guard-worst></div><div class="sub" data-guard-worst-sub></div></div>
  </div>
  <figure style="margin:0">
    <svg class="chart" data-chart viewBox="0 0 640 280" role="img" aria-labelledby="chart-title chart-desc"></svg>
    <figcaption class="chart-note" data-chart-note></figcaption>
  </figure>
  <div class="resolved-banner" data-resolved role="status">
    ${glyph("check", { size: 20 })}
    <div><strong>Incident resolved</strong><div class="small" data-resolved-detail></div></div>
  </div>
  <div class="plug-row">
    <div class="cta-row">
      <button type="button" class="btn" data-plug disabled>Plug the turn limit into your board</button>
      <span class="small muted" data-plug-note>Try a value first.</span>
    </div>
    <div class="mini-board" data-mini aria-label="Your board, after the plug"></div>
  </div>
</section>`;
    this.renderMiniBoard();
    this.updateHistograms();
  }

  renderMiniBoard() {
    const tiles = WIRES.map((wire) => {
      const socket = wire.id === "loop"
        ? (this.s.plugged ? `<span class="module ${this.s.plugNew ? "is-new" : ""}">${glyph("check", { size: 14 })}turn limit ${this.s.guardLimit} · guard</span>` : `<span class="small muted">Empty socket: turn limit · B2</span>`)
        : `<span class="small muted">${wire.id === "tools" ? "tool registry · B1" : "installed later"}</span>`;
      return `<div class="mini-tile" style="--w:${wire.color}" data-mini-wire="${wire.id}">
        <div class="tile-head">${glyph(wire.glyph, { size: 18 })}<span>${esc(wire.short)}</span></div>
        ${socket}
      </div>`;
    }).join("");
    this.querySelector("[data-mini]").innerHTML = tiles;
  }

  // --- behaviour ---------------------------------------------------------------------

  bind() {
    this.addEventListener("click", (event) => {
      const runButton = event.target.closest("[data-run]");
      if (runButton) return this.run();
      const cell = event.target.closest(".cell");
      if (cell) return this.select(cell.dataset.arm, Number(cell.dataset.i));
      if (event.target.closest("[data-dec]")) return this.setLimit(this.limit() - 1);
      if (event.target.closest("[data-inc]")) return this.setLimit(this.limit() + 1);
      if (event.target.closest("[data-plug]")) return this.plug();
    });
    this.querySelector("[data-slider]").addEventListener("input", (event) => {
      this.setLimit(Number(event.target.value));
    });
    window.addEventListener("resize", () => {
      this.drawChart();
      this.updateHistograms();
    });
  }

  limit() {
    return this.s.limit;
  }

  setLimit(value) {
    const next = Math.max(LIMIT_MIN, Math.min(LIMIT_MAX, value));
    this.s.limit = next;
    this.s.tried.add(next);
    this.updateGuard();
  }

  // --- canary ------------------------------------------------------------------------

  run() {
    if (this.s.running) return;
    this.s.running = true;
    this.s.shown = 0;
    this.s.selected = null;
    const button = this.querySelector("[data-run]");
    button.disabled = true;
    button.textContent = "Running…";
    this.setRunStatus("Running", "warn");
    this.querySelectorAll(".cell").forEach((cell) => {
      cell.classList.add("is-pending");
      cell.classList.remove("is-appear");
    });
    const instant = reducedMotion();
    const finish = () => {
      this.s.running = false;
      this.s.shown = 20;
      button.disabled = false;
      button.textContent = "Run again";
      this.setRunStatus("Canary complete", "ok");
      this.showResults();
      announce("Canary complete. Both boards ran the same 20 seeds.");
    };
    if (instant) {
      for (let i = 0; i < 20; i += 1) this.showTrial(i, false);
      finish();
      return;
    }
    const step = (i) => {
      if (i >= 20) return finish();
      this.showTrial(i, true);
      this.timer = setTimeout(() => step(i + 1), TRIAL_GAP_MS);
    };
    step(0);
  }

  showTrial(i, animate) {
    for (const arm of ARMS) {
      const run = DATA.bench[arm.id][i];
      const st = STATUS[run.status];
      const cell = this.querySelector(`.cell[data-arm="${arm.id}"][data-i="${i}"]`);
      cell.classList.remove("is-pending", "is-done", "is-interrupted", "is-limit");
      cell.classList.add(st.cls);
      if (animate) {
        cell.classList.add("is-appear");
      }
      cell.querySelector("[data-mark]").innerHTML = glyph(st.icon, { size: 16 });
      cell.setAttribute("aria-label", `Trial ${i + 1}, seed ${run.seed}, ${arm.title}: ${st.word} after ${run.turns} turns`);
    }
    this.s.shown = Math.max(this.s.shown, i + 1);
  }

  select(arm, i) {
    if (this.s.running || this.s.shown <= i) return;
    this.s.selected = i;
    this.querySelectorAll(".cell").forEach((cell) => {
      const sameIndex = Number(cell.dataset.i) === i;
      cell.setAttribute("aria-pressed", String(sameIndex && cell.dataset.arm === arm));
      cell.classList.toggle("is-linked", sameIndex && cell.dataset.arm !== arm);
    });
    const detail = this.querySelector("[data-trial-detail]");
    const lines = ARMS.map((a) => {
      const run = DATA.bench[a.id][i];
      const st = STATUS[run.status];
      return `<div><strong>${esc(a.title)}</strong>: ${esc(st.word)} after ${run.turns} turns, ${UNIT(run.cost)}</div>`;
    }).join("");
    detail.innerHTML = `<div class="mono">Trial ${i + 1} · seed ${DATA.bench.old[i].seed} · same seed on both boards</div>${lines}`;
  }

  setRunStatus(text, tone) {
    const el = this.querySelector("[data-run-status]");
    el.className = `status ${tone} fade-status`;
    el.innerHTML = `${glyph(tone === "ok" ? "check" : "pause", { size: 14 })}${esc(text)}`;
  }

  showResults() {
    const results = this.querySelector("[data-results]");
    results.hidden = false;
    const { old, new: candidate } = this.stats;
    this.querySelector("[data-pass-both]").textContent = `${old.passes} / 20`;
    this.querySelector("[data-pass-sub]").textContent = this.sameRuns
      ? "same runs pass on both boards"
      : `control ${old.passes}, candidate ${candidate.passes}`;
    const ratio = Math.round(old.costP100 / candidate.costP100);
    this.querySelector("[data-worst-turns]").textContent = `${candidate.turnsP100}`;
    this.querySelector("[data-worst-turns-sub]").textContent = `candidate; control ${old.turnsP100}`;
    this.querySelector("[data-worst-cost]").textContent = candidate.costP100.toFixed(3);
    this.querySelector("[data-worst-cost-sub]").textContent = `candidate; control ${old.costP100.toFixed(3)}`;
    this.querySelector("[data-mean-cost]").textContent = candidate.costMean.toFixed(3);
    this.querySelector("[data-mean-cost-sub]").textContent = `candidate; control ${old.costMean.toFixed(3)}`;
    const same = this.sameRuns ? `the same ${old.passes} runs pass` : `${candidate.passes} runs pass on the candidate`;
    this.querySelector("[data-honest]").textContent = `The turn limit didn’t make the agent smarter: ${same}. It made every run end, and cut the worst case by about ${ratio}×.`;
    this.updateHistograms();
    // The same numbers as a plain table (readable, and what screen readers announce best).
    const rows = [
      ["Passing runs", `${old.passes} of 20`, `${candidate.passes} of 20`],
      ["p50 turns", old.turnsP50, candidate.turnsP50],
      ["p100 turns (worst case)", old.turnsP100, candidate.turnsP100],
      ["p50 cost (units)", old.costP50.toFixed(3), candidate.costP50.toFixed(3)],
      ["p100 cost (units, worst case)", old.costP100.toFixed(3), candidate.costP100.toFixed(3)],
      ["Mean cost (units)", old.costMean.toFixed(3), candidate.costMean.toFixed(3)],
    ];
    this.querySelector("[data-table-fallback]").innerHTML = `<caption>Control and candidate, 20 trials</caption><thead><tr><th>Measure</th><th>Control</th><th>Candidate</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join("")}</tbody>`;
  }

  updateHistograms() {
    const host = this.querySelector("[data-hists]");
    if (!host || this.stats.old === undefined) return;
    const countsOld = binCounts(this.stats.old.runs.map((r) => r.turns), TURN_BINS);
    const countsNew = binCounts(this.stats.new.runs.map((r) => r.turns), TURN_BINS);
    const costOld = binCounts(this.stats.old.runs.map((r) => r.cost), COST_BINS);
    const costNew = binCounts(this.stats.new.runs.map((r) => r.cost), COST_BINS);
    const yMax = Math.max(...countsOld, ...countsNew, ...costOld, ...costNew, 1);
    // Draw at the rendered width so one SVG unit is one CSS pixel (labels stay at 14 px).
    const cols = window.matchMedia("(min-width: 700px)").matches ? 2 : 1;
    const hostW = host.clientWidth;
    const W = hostW ? Math.max(240, Math.floor((hostW - (cols - 1) * 16) / cols)) : 320;
    host.innerHTML = `
      <div class="hist"><p class="hist-title">Turns per run</p>${histogram(countsOld, TURN_BINS, yMax, "Control", "turns", W)}${histogram(countsNew, TURN_BINS, yMax, "Candidate", "turns", W)}</div>
      <div class="hist"><p class="hist-title">Cost per run (units)</p>${histogram(costOld, COST_BINS, yMax, "Control", "cost", W)}${histogram(costNew, COST_BINS, yMax, "Candidate", "cost", W)}</div>`;
  }

  // --- guard puzzle ------------------------------------------------------------------

  updateGuard() {
    const limit = this.s.limit;
    const slider = this.querySelector("[data-slider]");
    slider.value = String(limit);
    slider.setAttribute("aria-valuetext", `${limit} turns`);
    this.querySelector("[data-limit-value]").textContent = String(limit);
    const guard = guardAt(limit);
    const passOk = guard.passes >= PASS_TOTAL;
    const passCard = this.querySelector("[data-passes-card]");
    passCard.classList.toggle("is-bad", !passOk);
    passCard.classList.toggle("is-good", passOk);
    this.querySelector("[data-guard-passes]").innerHTML = `${glyph(passOk ? "check" : "cross", { size: 22 })}${guard.passes} / 20`;
    this.querySelector("[data-guard-worst]").textContent = guard.worst.toFixed(3);
    this.querySelector("[data-guard-worst-sub]").textContent = `units at ${limit} turns`;
    const parNow = limit === PAR_LIMIT && this.s.tried.size >= PAR_TRIES;
    this.s.par = parNow;
    const banner = this.querySelector("[data-par]");
    banner.classList.toggle("is-on", parNow);
    if (parNow) {
      this.querySelector("[data-par-detail]").textContent = `${guard.passes} of ${PASS_TOTAL} passing runs still pass. Worst case ${guard.worst.toFixed(3)} units, against ${this.stats.old.costP100.toFixed(3)} with no limit.`;
      if (!this.s.flashed && !reducedMotion()) {
        banner.classList.add("is-flash");
        this.s.flashed = true;
      }
      announce(`Par: no lost passes, cheapest worst case at ${limit} turns.`);
    }
    this.querySelector("[data-resolved]").classList.toggle("is-on", parNow && this.s.plugged);
    this.querySelector("[data-resolved-detail]").textContent = this.timeNote();
    const plug = this.querySelector("[data-plug]");
    plug.disabled = this.s.tried.size === 0;
    this.querySelector("[data-plug-note]").textContent = this.s.plugged
      ? `Plugged at ${this.s.guardLimit} turns. Try another value to replug.`
      : this.s.tried.size === 0
        ? "Try a value first."
        : parNow
          ? "Par reached. Plug it in to resolve the incident."
          : "Plug any value in, or keep looking for par.";
    this.drawChart();
  }

  timeNote() {
    const seconds = readStore().break?.diagnosedSeconds;
    if (!seconds) return `Time to diagnose was not recorded in this session. Par is ${fmtSeconds(60)}.`;
    return `Time to diagnose ${fmtSeconds(seconds)}, par ${fmtSeconds(60)}.`;
  }

  plug() {
    if (this.s.tried.size === 0) return;
    const limit = this.s.limit;
    const fresh = !this.s.plugged || this.s.guardLimit !== limit;
    this.s.plugged = true;
    this.s.guardLimit = limit;
    this.s.plugNew = fresh;
    this.renderMiniBoard();
    writeStore({ guard: { limit, par: this.s.par } });
    this.querySelector("[data-plug-note]").textContent = `Plugged at ${limit} turns. The loop socket shows the guard.`;
    this.querySelector("[data-resolved]").classList.toggle("is-on", this.s.par);
    this.querySelector("[data-plug]").textContent = "Plugged";
    announce(`Turn-limit guard plugged at ${limit} turns.`);
    this.s.plugNew = false;
  }

  restoreGuard() {
    const guard = readStore().guard;
    if (guard && guard.limit) {
      this.s.guardLimit = guard.limit;
      this.s.plugged = true;
      this.renderMiniBoard();
      this.querySelector("[data-plug]").textContent = "Plugged";
    }
  }

  drawChart() {
    const svg = this.querySelector("[data-chart]");
    if (!svg) return;
    const W = svg.clientWidth || 640;
    const H = 280;
    const pad = { l: 44, r: 14, t: 34, b: 44 };
    const xMin = LIMIT_MIN;
    const xMax = LIMIT_MAX;
    const yMax = 0.6;
    const x = (v) => pad.l + ((v - xMin) / (xMax - xMin)) * (W - pad.l - pad.r);
    const y = (v) => H - pad.b - (v / yMax) * (H - pad.t - pad.b);
    const feasibleFrom = GUARD_CURVE.find((g) => g.passes >= PASS_TOTAL)?.limit ?? xMax;
    const points = GUARD_CURVE.map((g) => `${x(g.limit).toFixed(1)},${y(g.worst).toFixed(1)}`).join(" ");
    const ticks = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((v) => `<g><line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)" /><text x="${pad.l - 8}" y="${y(v) + 5}" text-anchor="end" fill="var(--ink-2)">${v.toFixed(1)}</text></g>`).join("");
    const xTicks = [2, 6, 10, 14, 18, 22, 26, 30].map((v) => `<text x="${x(v)}" y="${H - pad.b + 20}" text-anchor="middle" fill="var(--ink-2)">${v}</text>`).join("");
    const losing = GUARD_CURVE.filter((g) => g.passes < PASS_TOTAL)
      .map((g) => `<text x="${x(g.limit)}" y="${y(g.worst) - 10}" text-anchor="middle" fill="var(--fail)">✕</text>`)
      .join("");
    const pick = guardAt(this.s.limit);
    const selX = x(this.s.limit);
    const selY = y(pick.worst);
    const parX = x(PAR_LIMIT);
    const parY = y(guardAt(PAR_LIMIT).worst);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = `
      <title id="chart-title">Solution space: worst-case cost for each turn limit</title>
      <desc id="chart-desc">Worst-case cost against turn limit from 2 to 30. Limits below 6 lose passing runs; from 6 on, no passing run is lost and the worst case grows with the limit.</desc>
      <rect x="${x(feasibleFrom)}" y="${pad.t}" width="${x(xMax) - x(feasibleFrom)}" height="${H - pad.t - pad.b}" fill="var(--ok)" opacity="0.10" />
      <text x="0" y="14" fill="var(--ink-2)">worst-case cost (units)</text>
      ${ticks}
      ${xTicks}
      <text x="${(pad.l + W - pad.r) / 2}" y="${H - 6}" text-anchor="middle" fill="var(--ink-2)">turn limit</text>
      <polyline points="${points}" fill="none" stroke="var(--ink)" stroke-width="2.25" stroke-linejoin="round" />
      ${losing}
      <line x1="${selX}" x2="${selX}" y1="${pad.t}" y2="${H - pad.b}" stroke="var(--ink)" stroke-dasharray="4 4" opacity="0.7" />
      <circle cx="${parX}" cy="${parY}" r="6" fill="none" stroke="var(--ok)" stroke-width="2.5" />
      <circle cx="${selX}" cy="${selY}" r="7" fill="var(--ink)" stroke="var(--bg)" stroke-width="2" />
      <text x="${selX}" y="${pad.t + 14}" text-anchor="middle" fill="var(--ink)" font-weight="700">${this.s.limit}</text>`;
    this.querySelector("[data-chart-note]").textContent = `Shaded: no passing run lost (limit ${feasibleFrom} and up). ✕ marks limits that lose a passing run. Dashed line: your choice (${this.s.limit}).`;
  }

  // --- self test (QA) ----------------------------------------------------------------

  async selfTest() {
    try {
      this.querySelector("[data-run]").click();
      const deadline = performance.now() + 6000;
      while (this.s.running && performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      if (this.s.running) return false;
      const both = this.querySelectorAll("[data-pass-both]")[0]?.textContent ?? "";
      if (!both.startsWith(`${PASS_TOTAL} /`)) return false;
      const dec = this.querySelector("[data-slider]");
      for (const value of [9, 4, PAR_LIMIT]) {
        dec.value = String(value);
        dec.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (!this.querySelector("[data-par]").classList.contains("is-on")) return false;
      return this.querySelector("[data-limit-value]").textContent === String(PAR_LIMIT);
    } catch {
      return false;
    }
  }
}

function histogram(counts, bins, yMax, label, kind, W) {
  const H = 120;
  const pad = { l: 40, r: 8, t: 8, b: 28 };
  const bw = (W - pad.l - pad.r) / bins.length;
  const bars = counts
    .map((count, i) => {
      const h = yMax === 0 ? 0 : (count / yMax) * (H - pad.t - pad.b);
      const x = pad.l + i * bw + 3;
      const y = H - pad.b - h;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 6).toFixed(1)}" height="${h.toFixed(1)}" fill="${label === "Control" ? "var(--ink-2)" : "var(--ink)"}" opacity="${label === "Control" ? 0.55 : 0.95}"><title>${bins[i].label}: ${count} runs</title></rect>`;
    })
    .join("");
  const labels = bins
    .map((bin, i) => `<text x="${(pad.l + i * bw + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="var(--ink-2)">${esc(bin.label)}</text>`)
    .join("");
  const yTicks = [0, yMax].map((v) => `<text x="${pad.l - 6}" y="${(H - pad.b - (v / yMax) * (H - pad.t - pad.b) + 5).toFixed(1)}" text-anchor="end" fill="var(--ink-2)">${v}</text>`).join("");
  const desc = counts.map((c, i) => `${bins[i].label} ${kind}: ${c}`).join("; ");
  return `<div><p class="arm-title">${esc(label)}</p>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} ${kind} histogram: ${esc(desc)}"><line x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}" stroke="var(--line-strong)" />${bars}${labels}${yTicks}</svg></div>`;
}

customElements.define("hx-proto-prove", HxProtoProve);
initChrome();
