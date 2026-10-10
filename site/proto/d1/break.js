// Break: the cold open. Prediction gate, a tape transport over the fixture trace (73 events),
// readouts (turn, context VU, cost), lanes or a tape log, the reveal, the first-bad-moment hunt,
// and the fix choice. Learner-paced: nothing plays until the learner presses play.
import {
  TRACE, LAST, T_MAX, WIRES, WIRE_BY_ID, CONTEXT_WINDOW, INCIDENT, glyphFor, friendly, summary,
  repeatCue, stateAt, fmt, units, outcomeLine, RUN_END,
} from "./shared.js";
import { announce, click, reducedMotion } from "./app.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const PREDICT = INCIDENT.prediction;
const FIX_REASONS = [
  "Yes. A limit is a rule the loop enforces. The model cannot argue with it.",
  "Not quite. It asks the model to try harder, but the loop still has no exit. Words guide, code enforces.",
  "Not quite. A bigger model can spiral too: the loop still has no exit.",
  "Not quite. A retry runs the same loop again, with no exit.",
];
const WHY_TEMPTING = [
  "Tempting: the first fix really works, so the early turns look like progress.",
  "Tempting: the model keeps saying “Almost done”, which sounds like a finish line.",
  "Right: the model keeps asking for one more tool, so only a person ends the run.",
  "Tempting: failing tests feel like crashes. They are results, and the loop keeps going.",
];
const SPEEDS = [1, 2, 4];
const WIRE_COLORS = {
  control: "#7457E6", context: "#14408F", loop: "#D23A4A", errors: "#6A2A10",
  tools: "#946E00", permissions: "#12553F", verify: "#187A6D", observe: "#36404E",
};
const LANE_LABEL_W = 170;

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

function visible(nodes) {
  return [...nodes].find((node) => node.offsetParent !== null) || null;
}

function tick() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function clampIndex(i) {
  return Math.max(0, Math.min(LAST, i));
}

function xPct(t) {
  return (t / T_MAX) * 100;
}

// Notes and the playhead are inset by half a note (15 px) so they stay inside their track.
function xCss(t) {
  return `calc(15px + (100% - 30px) * ${(t / T_MAX).toFixed(5)})`;
}

// The event nearest to a time (used by the overview strip and the slider).
function nearestIndex(t) {
  let best = 0;
  let gap = Infinity;
  for (let k = 0; k < TRACE.length; k += 1) {
    const d = Math.abs(TRACE[k].t - t);
    if (d < gap) { gap = d; best = k; }
  }
  return best;
}

class BreakElement extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "1";
    this.S = {
      pick: null, locked: false, idx: 0, playing: false, speed: 1, filter: null, view: "friendly",
      found: false, guesses: 0, findStart: 0, findSeconds: null, fix: null, lastTurn: 0, announced: new Set(),
      timer: null, finding: false, revealed: false,
    };
    this.reduced = reducedMotion();
    this.render();
    this.refresh(false);
    this.__test = { run: async () => this.check() };
    this.resizeObserver = new ResizeObserver(() => { this.layoutLanes(); this.placeCallout(); });
    this.resizeObserver.observe(this);
    this.layoutLanes();
  }

  // ---------- markup ----------
  render() {
    this.innerHTML = "";
    const S = this.S;
    this.predictButtons = PREDICT.options.map((text, i) => el("button", {
      type: "button", class: "key", role: "radio", "aria-checked": "false", "data-option": String(i),
      text,
    }));
    this.lockButton = el("button", { type: "button", class: "key primary", disabled: true, text: "Lock in" });
    this.pickLine = el("p", { class: "pick-line", "aria-live": "off" });

    this.backBtn = el("button", { type: "button", class: "key sq", disabled: true }, [
      el("span", { "aria-hidden": "true", text: "◀" }), el("span", { class: "sr", text: "Step back" }),
    ]);
    this.playBtn = el("button", { type: "button", class: "key big primary", disabled: true, "aria-pressed": "false" }, [
      el("span", { "aria-hidden": "true", text: "▶" }), el("span", { text: "Play" }),
    ]);
    this.fwdBtn = el("button", { type: "button", class: "key big primary", disabled: true }, [
      el("span", { "aria-hidden": "true", text: "▶|" }), el("span", { text: "Step" }),
    ]);
    this.startBtn = el("button", { type: "button", class: "key quiet", disabled: true, text: "Start over" });
    this.speedButtons = SPEEDS.map((s) => el("button", { type: "button", role: "radio", "aria-checked": s === 1 ? "true" : "false", "data-speed": String(s), text: `${s}×` }));
    this.fader = el("input", { type: "range", class: "fader", min: "0", max: String(LAST), step: "1", value: "0", "aria-label": "Replay position", disabled: true });
    this.minus = el("button", { type: "button", class: "key sq", "aria-label": "Previous event", disabled: true, text: "−" });
    this.plus = el("button", { type: "button", class: "key sq", "aria-label": "Next event", disabled: true, text: "+" });
    this.posRead = el("p", { class: "ctx-text", "aria-hidden": "true" });
    this.lockHint = el("p", { class: "hint", text: "Lock your prediction to start the replay." });

    this.vu = el("div", { class: "vu", role: "img", "aria-label": "Context window" }, Array.from({ length: 20 }, () => el("span")));
    this.ctxText = el("p", { class: "ctx-text" });
    this.costRead = el("div", { class: "readout", "aria-live": "off" }, [
      el("span", { class: "u", text: "cost so far" }), el("span", { class: "v", "data-cost": "" }),
    ]);
    this.turnRead = el("div", { class: "readout" }, [
      el("span", { class: "u", text: "turn" }), el("span", { class: "v", "data-turn": "" }),
    ]);

    this.phoneFilter = el("div", { class: "phone-filter", role: "group", "aria-label": "Filter by wire" }, WIRES.map((w) => el("button", {
      type: "button", "aria-pressed": "false", "data-filter": w.id, "data-wire": w.id,
    }, [glyph(w.glyph, "glyph sm"), el("span", { text: w.short })])));

    this.strip = el("div", { class: "strip", role: "slider", tabindex: "0", "aria-label": "Overview: all events. Arrow keys move one event.", "aria-valuemin": "0", "aria-valuemax": String(LAST), "aria-valuenow": "0" });
    this.stripCursor = el("div", { class: "strip-cursor" });
    this.stripRead = el("p", { class: "strip-read", "aria-hidden": "true" });
    this.buildStrip();

    this.lanes = el("div", { class: "lanes", role: "list", "aria-label": "Lanes, one per wire" });
    this.laneRows = {};
    this.laneItems = {};
    this.noteButtons = [];
    for (const w of WIRES) {
      const row = el("div", { class: "lane", "data-wire": w.id, "data-lane": w.id, role: "listitem" });
      const led = el("span", { class: "led", "aria-hidden": "true" });
      const label = el("button", { type: "button", class: "lane-label", "aria-pressed": "false", "data-filter": w.id, "aria-label": `Show only ${w.name}` }, [
        glyph(w.glyph, "glyph sm"), el("span", { text: w.short }), led,
      ]);
      const track = el("div", { class: "track", "data-track": w.id });
      track.append(el("span", { class: "rail", "aria-hidden": "true" }));
      const playhead = el("span", { class: "playhead", "aria-hidden": "true" });
      track.append(playhead);
      const events = TRACE.filter((e) => e.wire === w.id);
      if (events.length === 0) {
        track.append(el("p", { class: "lane-empty", text: "No trace event for this wire yet." }));
      }
      const items = [];
      for (const e of events) {
        const note = el("button", {
          type: "button", class: "note", "data-seq": String(e.seq), "data-wire": e.wire,
          "aria-label": `${w.short}: ${summary(e)} at ${e.t.toFixed(1)} s, turn ${e.turn}`,
        }, [glyph(glyphFor(e), "glyph")]);
        note.style.left = xCss(e.t);
        if (repeatCue(e)) note.classList.add("repeat");
        track.append(note);
        items.push({ t: e.t, btn: note });
        this.noteButtons.push({ seq: e.seq, node: note, wire: w.id, x: xPct(e.t), t: e.t });
      }
      this.laneItems[w.id] = { items, track };
      row.append(label, track);
      this.lanes.append(row);
      this.laneRows[w.id] = { row, label, track, led, playhead, events: events.length };
    }
    this.lanesWrap = el("div", { class: "lanes-wrap" }, [
      el("div", { class: "lane-tools" }, [
        el("p", { class: "filter-text", "aria-live": "polite", "data-filter-text": "" }),
        el("button", { type: "button", class: "key quiet", "data-show-all": "", hidden: true, text: "Show all wires" }),
      ]),
      this.lanes,
    ]);
    this.callout = el("div", { class: "callout", role: "note", "aria-live": "off" });
    this.lanesWrap.append(this.callout);

    this.viewFriendly = el("button", { type: "button", "aria-pressed": "true", "data-view": "friendly", text: "Friendly" });
    this.viewWire = el("button", { type: "button", "aria-pressed": "false", "data-view": "wire", text: "Wire" });
    this.detailBody = el("div", { class: "detail-body", "aria-live": "polite" });
    this.detail = el("section", { class: "panel detail detail-col", "aria-label": "Event detail" }, [
      el("div", { class: "view-toggle", role: "group", "aria-label": "Event view" }, [this.viewFriendly, this.viewWire]),
      this.detailBody,
    ]);

    this.tapeLog = el("div", { class: "tape-log", role: "list", "aria-label": "Event log" });
    this.logRows = [];
    TRACE.forEach((e) => {
      const w = WIRE_BY_ID[e.wire];
      const row = el("button", {
        type: "button", class: "log-row", role: "listitem", "data-seq": String(e.seq), "data-log-wire": e.wire,
        "aria-label": `${e.t.toFixed(1)} s, turn ${e.turn}, ${w.short}: ${summary(e)}`,
      }, [
        el("span", { class: "cursor", "aria-hidden": "true", text: "" }),
        el("span", { class: "t", text: `t${e.t.toFixed(1)}` }),
        el("span", { class: "sum" }, [glyph(glyphFor(e), "glyph"), el("span", { text: ` ${w.short} · ${summary(e)}` })]),
      ]);
      this.logRows.push({ seq: e.seq, node: row, wire: e.wire });
      this.tapeLog.append(row);
    });

    this.revealPanel = el("section", { class: "panel lg reveal", hidden: true, "aria-labelledby": "reveal-h", id: "reveal" });
    this.findPanel = el("section", { class: "panel lg find", hidden: true, "aria-labelledby": "find-h", id: "find" });
    this.fixPanel = el("section", { class: "panel lg fixes", hidden: true, "aria-labelledby": "fix-h", id: "fixes" });

    this.append(el("div", { class: "break-wrap" }, [
      el("header", { class: "hero-head" }, [
        el("div", {}, [
          el("p", { class: "label small-ink", text: "B2 · The agent loop · 1 Break" }),
          el("h1", { text: "Break: the loop that never stops" }),
        ]),
        el("p", { class: "voice", text: "The fault light is on. That's your cue." }),
      ]),
      el("section", { class: "panel lg setup section", "aria-labelledby": "setup-h" }, [
        el("h2", { id: "setup-h", text: "The job" }),
        el("p", { text: "An agent has one job: fix the failing test in calc.py. It can read files, edit them and run the tests." }),
        el("p", { text: "Its loop stops only when the model says it is done. Nothing else stops it. Watch the run before you read the answer." }),
      ]),
      el("section", { class: "panel lg section", "aria-labelledby": "predict-h" }, [
        el("header", {}, [el("h2", { id: "predict-h", text: "1 · Predict" }), el("p", { class: "hint", text: PREDICT.question })]),
        el("div", { class: "predict-grid", role: "radiogroup", "aria-label": "Your prediction" }, this.predictButtons),
        el("div", { class: "cta-row" }, [this.lockButton]),
        this.pickLine,
      ]),
      el("section", { class: "panel lg section", id: "replay", "aria-labelledby": "replay-h" }, [
        el("header", {}, [
          el("h2", { id: "replay-h", text: "2 · Replay" }),
          el("p", { class: "hint", text: "The run is paused at event 1. Step to see what the loop does. Nothing plays until you do." }),
        ]),
        el("div", { class: "deck" }, [
          el("div", { class: "transport-bar sticky-phone", "data-transport": "" }, [
            el("div", { class: "transport-keys" }, [this.backBtn, this.playBtn, this.fwdBtn, this.startBtn]),
            el("div", { class: "fader-line" }, [
              el("span", { class: "label small-ink", text: "Speed" }),
              el("div", { class: "switch3", role: "radiogroup", "aria-label": "Speed" }, this.speedButtons),
            ]),
          ]),
          el("div", { class: "fader-wrap" }, [
            el("div", { class: "fader-row" }, [
              el("div", { class: "fader-line" }, [this.minus, this.fader, this.plus]),
              this.posRead,
            ]),
          ]),
          el("div", { class: "ctx-row" }, [
            el("div", {}, [el("p", { class: "label small-ink", text: "Context window · 8,000 tokens" }), this.vu, this.ctxText]),
            el("div", { class: "readout-stack" }, [this.turnRead, this.costRead]),
          ]),
          this.phoneFilter,
          el("div", { class: "strip-wrap overview" }, [this.strip, this.stripRead]),
          el("div", { class: "deck-grid" }, [this.lanesWrap, this.detail, this.tapeLog]),
        ]),
        this.lockHint,
      ]),
      this.revealPanel,
      this.findPanel,
      this.fixPanel,
      el("div", { class: "cta-foot" }, [
        el("a", { class: "key primary", href: "prove.html" }, [el("span", { text: "Fix it → Prove" })]),
      ]),
    ]));

    this.bind();
  }

  // Notes in one lane go into rows so that no two notes in a row overlap (32 px pitch).
  layoutLanes() {
    const anyTrack = this.laneItems.control && this.laneItems.control.track;
    if (!anyTrack) return;
    const width = anyTrack.clientWidth || 600;
    const secondsPerPx = T_MAX / Math.max(1, width - 30);
    const gap = 32 * secondsPerPx;
    for (const w of WIRES) {
      const entry = this.laneItems[w.id];
      const placed = [];
      let maxRow = 0;
      for (const item of entry.items) {
        let r = 0;
        while (placed.some((p) => p.row === r && Math.abs(p.t - item.t) < gap)) r += 1;
        placed.push({ t: item.t, row: r });
        item.btn.style.top = `${4 + r * 32}px`;
        maxRow = Math.max(maxRow, r);
      }
      entry.track.style.minHeight = `${Math.max(44, 8 + (maxRow + 1) * 32)}px`;
    }
  }

  buildStrip() {
    this.strip.replaceChildren();
    const laneY = { control: 0, context: 1, loop: 2, errors: 3, tools: 4, permissions: 5, verify: 6, observe: 7 };
    for (const e of TRACE) {
      const mark = el("span", { class: "strip-mark", "data-strip-seq": String(e.seq) });
      mark.style.left = `${xPct(e.t)}%`;
      mark.style.top = `${laneY[e.wire] * 11 + 4}px`;
      mark.style.background = WIRE_COLORS[e.wire];
      this.strip.append(mark);
    }
    this.strip.append(this.stripCursor);
  }

  bind() {
    const S = this.S;
    for (const b of this.predictButtons) {
      b.addEventListener("click", () => {
        if (S.locked) return;
        S.pick = Number(b.dataset.option);
        click("key");
        this.refresh(false);
      });
      b.addEventListener("keydown", (ev) => this.radioKeys(ev, this.predictButtons, S.locked ? null : (i) => { S.pick = i; this.refresh(false); }));
    }
    this.lockButton.addEventListener("click", () => {
      if (S.pick === null || S.locked) return;
      S.locked = true;
      click("key");
      this.refresh(true);
      announce(`Prediction locked: ${PREDICT.options[S.pick]}`);
    });
    this.playBtn.addEventListener("click", () => { click("key"); this.togglePlay(); });
    this.fwdBtn.addEventListener("click", () => { click("key"); this.stopPlay(); this.goto(S.idx + 1, true); });
    this.backBtn.addEventListener("click", () => { click("key"); this.stopPlay(); this.goto(S.idx - 1, true); });
    this.startBtn.addEventListener("click", () => { click("key"); this.stopPlay(); this.goto(0, false); });
    this.minus.addEventListener("click", () => { click("key"); this.stopPlay(); this.goto(S.idx - 1, true); });
    this.plus.addEventListener("click", () => { click("key"); this.stopPlay(); this.goto(S.idx + 1, true); });
    this.fader.addEventListener("input", () => { this.stopPlay(); this.goto(Number(this.fader.value), false); });
    for (const b of this.speedButtons) {
      b.addEventListener("click", () => { S.speed = Number(b.dataset.speed); click("detent"); this.refresh(false); });
    }
    this.speedButtons.forEach((b, i, all) => b.addEventListener("keydown", (ev) => this.radioKeys(ev, all, (k) => { S.speed = SPEEDS[k]; this.refresh(false); })));
    this.strip.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowRight" || ev.key === "ArrowUp") { ev.preventDefault(); this.stopPlay(); this.goto(S.idx + 1, false); }
      if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") { ev.preventDefault(); this.stopPlay(); this.goto(S.idx - 1, false); }
    });
    this.strip.addEventListener("pointerdown", (ev) => this.scrubStrip(ev));
    this.strip.addEventListener("pointermove", (ev) => { if (ev.buttons === 1) this.scrubStrip(ev); });
    this.phoneFilter.addEventListener("click", (ev) => this.toggleFilter(ev));
    this.lanes.addEventListener("click", (ev) => this.toggleFilter(ev));
    this.lanesWrap.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-show-all]")) { S.filter = null; click("detent"); this.refresh(false); }
    });
    this.detail.addEventListener("click", (ev) => {
      const v = ev.target.closest("[data-view]");
      if (!v) return;
      S.view = v.dataset.view;
      this.refresh(false);
    });
    this.tapeLog.addEventListener("click", (ev) => {
      const row = ev.target.closest("[data-seq]");
      if (row) this.pressEvent(Number(row.dataset.seq));
    });
    this.lanes.addEventListener("click", (ev) => {
      const note = ev.target.closest(".note");
      if (note) this.pressEvent(Number(note.dataset.seq));
    });
    this.fixPanel.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-fix]");
      if (!b || S.fix !== null) return;
      S.fix = Number(b.dataset.fix);
      click("key");
      this.refresh(false);
      announce(S.fix === INCIDENT.correct_fix ? "Right fix: a turn limit and a token budget." : "Not that one. See the reason.");
    });
  }

  radioKeys(ev, buttons, onPick) {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(ev.key) || !onPick) return;
    ev.preventDefault();
    const i = buttons.indexOf(ev.currentTarget);
    const step = ev.key === "ArrowRight" || ev.key === "ArrowDown" ? 1 : -1;
    const next = (i + step + buttons.length) % buttons.length;
    buttons[next].focus();
    onPick(next);
  }

  toggleFilter(ev) {
    const S = this.S;
    const target = ev.target && ev.target.closest ? ev.target.closest("[data-filter]") : null;
    if (!target) return;
    const id = target.dataset.filter;
    S.filter = S.filter === id ? null : id;
    click("detent");
    this.refresh(false);
  }

  pressEvent(seq) {
    const S = this.S;
    if (S.finding && !S.found) {
      this.guess(seq);
      return;
    }
    if (!S.locked) return;
    this.stopPlay();
    this.goto(seq, false);
  }

  // ---------- replay ----------
  goto(i, animate) {
    const S = this.S;
    const next = clampIndex(i);
    const moved = next !== S.idx;
    S.idx = next;
    if (moved && animate && next > 0 && !this.reduced) this.pulseFor(TRACE[next]);
    if (moved && animate && !this.reduced) this.blinkFor(TRACE[next]);
    this.refresh(false);
    if (next === LAST) this.onEnd();
  }

  togglePlay() {
    const S = this.S;
    if (!S.locked) return;
    if (S.playing) { this.stopPlay(); return; }
    if (S.idx >= LAST) this.goto(0, false);
    S.playing = true;
    this.playBtn.setAttribute("aria-pressed", "true");
    this.playBtn.lastElementChild.textContent = "Pause";
    this.schedule();
  }

  stopPlay() {
    const S = this.S;
    if (S.timer) window.clearTimeout(S.timer);
    S.timer = null;
    if (!S.playing) return;
    S.playing = false;
    this.playBtn.setAttribute("aria-pressed", "false");
    this.playBtn.lastElementChild.textContent = "Play";
  }

  schedule() {
    const S = this.S;
    if (!S.playing) return;
    const i = S.idx;
    const dt = i < LAST ? TRACE[i + 1].t - TRACE[i].t : 0;
    const delay = Math.min(1500, Math.max(380, 380 + dt * 55)) / S.speed;
    S.timer = window.setTimeout(() => {
      if (!S.playing) return;
      if (S.idx >= LAST) { this.stopPlay(); return; }
      this.goto(S.idx + 1, true);
      this.schedule();
    }, delay);
  }

  scrubStrip(ev) {
    if (!this.S.locked) return;
    const rect = this.strip.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
    this.stopPlay();
    this.goto(nearestIndex(frac * T_MAX), false);
  }

  pulseFor(e) {
    const entry = this.laneRows[e.wire];
    if (!entry) return;
    const track = entry.track;
    const target = track.querySelector(`[data-seq="${e.seq}"]`);
    if (!target) return;
    const dot = el("span", { class: "pulse", "aria-hidden": "true" });
    dot.style.background = WIRE_COLORS[e.wire];
    track.append(dot);
    const trackRect = track.getBoundingClientRect();
    const x = 15 + (trackRect.width - 30) * (xPct(e.t) / 100);
    const duration = 200 + Math.min(200, (x / Math.max(1, trackRect.width)) * 200);
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / duration);
      dot.style.left = `${x * k}px`;
      if (k < 1) window.requestAnimationFrame(step);
      else dot.remove();
    };
    window.requestAnimationFrame(step);
  }

  blinkFor(e) {
    const entry = this.laneRows[e.wire];
    if (!entry) return;
    entry.led.classList.remove("blink");
    void entry.led.offsetWidth;
    entry.led.classList.add("blink");
  }

  onEnd() {
    const S = this.S;
    this.stopPlay();
    if (!S.revealed) {
      S.revealed = true;
      announce(`Run ended. ${outcomeLine()}`);
    }
    this.refresh(false);
  }

  announceTurn(e) {
    const S = this.S;
    if (S.announced.has(e.turn)) return;
    S.announced.add(e.turn);
    announce(`Turn ${e.turn}: ${friendly(e)}`);
  }

  // ---------- render ----------
  refresh(fromLock) {
    const S = this.S;
    const e = TRACE[S.idx];
    const st = stateAt(S.idx);

    // Prediction
    for (const b of this.predictButtons) {
      const on = Number(b.dataset.option) === S.pick;
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.classList.toggle("on", on);
      b.disabled = S.locked && !on;
    }
    this.lockButton.disabled = S.pick === null || S.locked;
    if (S.locked) {
      this.pickLine.textContent = `Your pick: “${PREDICT.options[S.pick]}”. Locked in.`;
    } else if (S.pick !== null) {
      this.pickLine.textContent = `Your pick so far: “${PREDICT.options[S.pick]}”. Press Lock in to commit.`;
    } else {
      this.pickLine.textContent = "Pick one option, then lock it in.";
    }
    this.lockHint.hidden = S.locked;

    // Transport
    const locked = S.locked;
    for (const b of [this.backBtn, this.playBtn, this.fwdBtn, this.startBtn, this.minus, this.plus, this.fader]) {
      b.disabled = !locked || (b === this.backBtn && S.idx === 0) || (b === this.minus && S.idx === 0) || (b === this.fwdBtn && S.idx >= LAST) || (b === this.plus && S.idx >= LAST);
    }
    this.fader.value = String(S.idx);
    this.posRead.textContent = `Event ${S.idx + 1} of ${TRACE.length} · turn ${e.turn} · t ${e.t.toFixed(1)} s`;
    for (const b of this.speedButtons) b.setAttribute("aria-checked", Number(b.dataset.speed) === S.speed ? "true" : "false");
    this.turnRead.querySelector("[data-turn]").textContent = `${e.turn} / ${RUN_END.turns}`;
    this.costRead.querySelector("[data-cost]").textContent = `≈ ${units(st.cost)} units`;

    // Context VU
    const lit = Math.round(st.pct * 20);
    [...this.vu.children].forEach((seg, k) => {
      const on = k < lit;
      seg.classList.toggle("lit", on);
      seg.classList.toggle("warn", on && st.pct >= 0.7 && st.pct < 0.9);
      seg.classList.toggle("hot", on && st.pct >= 0.9);
    });
    const pctText = `${Math.round(st.pct * 100)}%`;
    this.ctxText.textContent = `${pctText} · ${fmt(st.tokens)} of ${fmt(CONTEXT_WINDOW)} tokens`;
    this.vu.setAttribute("aria-label", `Context window: ${pctText} used`);

    // Strip and lanes
    const cursorX = xPct(e.t);
    this.stripCursor.style.left = `${cursorX}%`;
    this.strip.setAttribute("aria-valuenow", String(S.idx));
    this.stripRead.innerHTML = "";
    this.stripRead.append(el("span", { text: `event ${S.idx + 1}` }), el("span", { text: `t ${e.t.toFixed(1)} s` }));
    for (const mark of this.strip.querySelectorAll("[data-strip-seq]")) {
      const seq = Number(mark.dataset.stripSeq);
      mark.classList.toggle("dim", S.filter !== null && TRACE[seq].wire !== S.filter);
    }

    for (const w of WIRES) {
      const entry = this.laneRows[w.id];
      const hidden = S.filter !== null && S.filter !== w.id;
      entry.row.hidden = hidden;
      entry.label.setAttribute("aria-pressed", S.filter === w.id ? "true" : "false");
      const litLane = TRACE.some((ev, k) => k <= S.idx && ev.wire === w.id);
      entry.led.classList.toggle("on", litLane);
      entry.playhead.style.left = xCss(e.t);
    }
    for (const n of this.noteButtons) {
      n.node.classList.toggle("past", n.seq < S.idx);
      n.node.classList.toggle("future", n.seq > S.idx);
      n.node.classList.toggle("cur", n.seq === S.idx);
      if (n.seq === S.idx) n.node.setAttribute("aria-current", "step"); else n.node.removeAttribute("aria-current");
    }
    for (const r of this.logRows) {
      const hiddenRow = S.filter !== null && r.wire !== S.filter;
      r.node.hidden = hiddenRow;
      r.node.classList.toggle("dim", S.filter !== null && r.wire !== S.filter);
      const cursor = r.node.querySelector(".cursor");
      cursor.textContent = r.seq === S.idx ? "▸" : "";
      if (r.seq === S.idx) r.node.setAttribute("aria-current", "step"); else r.node.removeAttribute("aria-current");
    }
    this.renderInline();
    this.filterText(S.filter);
    this.renderDetail(e, st);
    this.renderCallout(e);
    this.placeCallout();

    // Turn announcement: at most once per turn
    if (!fromLock && S.locked) this.announceTurn(e);

    // Reveal, find, fixes
    const atEnd = S.idx === LAST;
    this.revealPanel.hidden = !(S.locked && atEnd);
    if (!this.revealPanel.hidden) this.renderReveal();
    this.findPanel.hidden = !(S.locked && atEnd);
    if (!this.findPanel.hidden) this.renderFind();
    this.fixPanel.hidden = !(S.found && S.locked && atEnd);
    if (!this.fixPanel.hidden) this.renderFix();
    this.classList.toggle("finding", S.finding && !S.found);
  }

  filterText(filter) {
    const text = this.lanesWrap.querySelector("[data-filter-text]");
    const showAll = this.lanesWrap.querySelector("[data-show-all]");
    if (filter) {
      text.textContent = `Showing: ${WIRE_BY_ID[filter].short}`;
      showAll.hidden = false;
    } else {
      text.textContent = "Showing: all wires";
      showAll.hidden = true;
    }
    this.phoneFilter.querySelectorAll("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.filter === filter ? "true" : "false"));
    this.lanes.querySelectorAll("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.filter === filter ? "true" : "false"));
  }

  renderInline() {
    const S = this.S;
    for (const r of this.logRows) {
      const existing = r.node.nextElementSibling;
      if (existing && existing.classList.contains("inline-explain")) existing.remove();
    }
    const cur = this.logRows.find((r) => r.seq === S.idx);
    if (!cur || cur.node.hidden) return;
    const e = TRACE[S.idx];
    const box = el("div", { class: "inline-explain", role: "note" });
    if (S.view === "wire") box.append(el("pre", { text: JSON.stringify(e, null, 2) }));
    else box.append(el("p", { text: friendly(e) }));
    const cue = repeatCue(e);
    if (cue) box.append(el("span", { class: "repeat-cue", text: cue }));
    cur.node.after(box);
  }

  renderCallout(e) {
    const S = this.S;
    if (S.finding && !S.found) { this.callout.hidden = true; return; }
    const hidden = S.filter !== null && e.wire !== S.filter;
    this.callout.hidden = hidden;
    this.callout.replaceChildren(el("span", { text: friendly(e) }));
    const cue = repeatCue(e);
    if (cue) this.callout.append(el("span", { class: "repeat-cue", text: cue }));
  }

  placeCallout() {
    if (this.callout.hidden || !this.lanesWrap) return;
    const e = TRACE[this.S.idx];
    const track = this.laneRows[e.wire] && this.laneRows[e.wire].track;
    if (!track || track.offsetParent === null) { this.callout.hidden = true; return; }
    const wrap = this.lanesWrap.getBoundingClientRect();
    const tr = track.getBoundingClientRect();
    const x = tr.left - wrap.left + 15 + (tr.width - 30) * (xPct(e.t) / 100);
    const width = Math.min(360, wrap.width * 0.9);
    const left = Math.max(0, Math.min(wrap.width - width, x - width / 2));
    this.callout.style.width = `${width}px`;
    this.callout.style.left = `${left}px`;
    this.callout.style.setProperty("--px", `${Math.max(12, Math.min(width - 12, x - left))}px`);
    this.callout.style.top = `${wrap.height + 10}px`;
  }

  renderDetail(e, st) {
    const S = this.S;
    this.viewFriendly.setAttribute("aria-pressed", S.view === "friendly" ? "true" : "false");
    this.viewWire.setAttribute("aria-pressed", S.view === "wire" ? "true" : "false");
    this.detailBody.replaceChildren();
    if (S.view === "wire") {
      this.detailBody.append(el("pre", { text: JSON.stringify(e, null, 2) }));
    } else {
      this.detailBody.append(el("p", { class: "result-line", text: friendly(e) }));
    }
    const fields = el("dl", { class: "fields" });
    const rows = [["event", `${e.seq + 1} of ${TRACE.length}`], ["wire", WIRE_BY_ID[e.wire].name], ["turn", String(e.turn)], ["t", `${e.t.toFixed(1)} s`], ["kind", e.kind]];
    if (e.kind === "model_reply" && e.usage) rows.push(["tokens out", fmt(e.usage.output_tokens)], ["cost", `≈ ${units(e.cost)} units`]);
    if (e.kind === "tool_call") rows.push(["ok", String(e.ok)]);
    if (e.kind === "permission") rows.push(["decision", e.decision]);
    if (e.kind === "run_end") rows.push(["status", e.status]);
    const cue = repeatCue(e);
    if (cue) rows.push(["repeat", cue]);
    rows.push(["context", `${Math.round(st.pct * 100)}%`]);
    for (const [k, v] of rows) fields.append(el("dt", { text: k }), el("dd", { text: v }));
    this.detailBody.append(fields);
    this.detailBody.append(el("p", { class: "hint", text: "Cost and context are readings up to this event. Units are illustrative." }));
  }

  renderReveal() {
    const S = this.S;
    const right = S.pick === INCIDENT.prediction.answer;
    const verdict = right ? "Your prediction was right." : `Your prediction was not right. The answer was: “${PREDICT.options[PREDICT.answer]}”.`;
    const list = el("ul", { class: "why-list", "aria-label": "Why each option is tempting" });
    PREDICT.options.forEach((text, i) => {
      const isRight = i === PREDICT.answer;
      list.append(el("li", { class: isRight ? "right" : "" }, [
        el("span", { class: "mark", "aria-hidden": "true", text: isRight ? "✓" : "·" }),
        el("span", {}, [el("strong", { text: `${text} ` }), el("span", { text: WHY_TEMPTING[i] })]),
      ]));
    });
    this.revealPanel.replaceChildren(
      el("header", {}, [el("p", { class: "label small-ink", text: "Reveal" }), el("h2", { id: "reveal-h", text: "The run is over" })]),
      el("p", { class: "result-line", text: outcomeLine() }),
      el("p", { class: "prediction-verdict", text: verdict }),
      el("p", { class: "hint", text: "Why each option is tempting:" }),
      list,
    );
    const pickText = this.S.pick === null ? "" : PREDICT.options[this.S.pick];
    if (pickText) this.revealPanel.append(el("p", { class: "hint", text: `You picked: ${pickText}` }));
  }

  renderFind() {
    const S = this.S;
    if (!this.findPanel.dataset.built) {
      this.findPanel.dataset.built = "1";
      this.findPanel.replaceChildren(
        el("header", {}, [el("p", { class: "label small-ink", text: "Mini incident room" }), el("h2", { id: "find-h", text: "Find the first bad moment" })]),
        el("p", { text: "Tap the first event where things went wrong. Tap any event in the lanes (or the log on a phone)." }),
        el("p", { class: "guess-hint", "aria-live": "polite", "data-guess": "" }),
        el("div", { class: "find-tools" }, [
          el("button", { type: "button", class: "key", "data-start-find": "", text: S.finding ? "Looking for it…" : "Start looking" }),
        ]),
        el("div", { class: "result-slot", "data-found-body": "" }),
      );
      this.findPanel.querySelector("[data-start-find]").addEventListener("click", () => {
        if (S.finding) return;
        S.finding = true;
        S.findStart = performance.now();
        click("key");
        this.refresh(false);
        announce("Find the first bad moment. Tap the event where things went wrong.");
      });
    }
    const start = this.findPanel.querySelector("[data-start-find]");
    start.textContent = S.found ? "Found it" : S.finding ? "Looking for it…" : "Start looking";
    start.disabled = S.found;
    const hint = this.findPanel.querySelector("[data-guess]");
    if (S.found) {
      this.findPanel.dataset.state = "found";
      hint.className = "guess-hint good";
      hint.textContent = `Found it in ${S.findSeconds} s. Par is 60 s.`;
      const body = this.findPanel.querySelector("[data-found-body]");
      body.replaceChildren(
        el("p", { class: "result-line", text: "Yes: that's the moment." }),
        el("p", { text: INCIDENT.why }),
      );
    } else {
      delete this.findPanel.dataset.state;
    }
  }

  renderFix() {
    const S = this.S;
    if (!this.fixPanel.dataset.built) {
      this.fixPanel.dataset.built = "1";
      this.fixPanel.replaceChildren(
        el("header", {}, [el("p", { class: "label small-ink", text: "Fix" }), el("h2", { id: "fix-h", text: "Which change stops the spiral?" })]),
        el("div", { class: "fix-grid" }, INCIDENT.fixes.map((text, i) => el("div", {}, [
          el("button", { type: "button", class: "key", "data-fix": String(i), "aria-describedby": `fix-why-${i}` }, [el("span", { text })]),
          el("p", { class: "fix-why", id: `fix-why-${i}`, text: FIX_REASONS[i] }),
        ]))),
        el("p", { class: "guess-hint", "aria-live": "polite", "data-fix-result": "" }),
      );
    }
    const result = this.fixPanel.querySelector("[data-fix-result]");
    this.fixPanel.querySelectorAll("[data-fix]").forEach((b) => {
      const i = Number(b.dataset.fix);
      const chosen = S.fix === i;
      b.setAttribute("aria-pressed", chosen ? "true" : "false");
      b.disabled = S.fix !== null;
      b.classList.toggle("on", chosen);
      b.querySelector("span").textContent = `${chosen ? (i === INCIDENT.correct_fix ? "✓ " : "✕ ") : ""}${INCIDENT.fixes[i]}`;
    });
    if (S.fix === null) {
      result.className = "guess-hint";
      result.textContent = "Pick one. Each option shows its reason.";
    } else if (S.fix === INCIDENT.correct_fix) {
      result.className = "guess-hint good";
      result.textContent = "Right. The loop gets an exit by rule. Fix it → Prove shows what that does to the numbers.";
      this.fixPanel.dataset.state = "fixed";
    } else {
      result.className = "guess-hint bad";
      result.textContent = "Not that one. Read the reason under each option.";
      this.fixPanel.dataset.state = "wrong";
    }
  }

  guess(seq) {
    const S = this.S;
    if (!S.finding || S.found) return;
    S.guesses += 1;
    const hint = this.findPanel.querySelector("[data-guess]");
    if (seq === INCIDENT.first_bad_seq) {
      S.found = true;
      S.findSeconds = Math.max(1, Math.round((performance.now() - S.findStart) / 1000));
      click("detent");
      this.refresh(false);
      announce(`Found it: ${INCIDENT.why}`);
      return;
    }
    hint.className = "guess-hint bad";
    hint.textContent = seq < INCIDENT.first_bad_seq
      ? "Too early: that step was reasonable."
      : "Too late: the loop was already repeating.";
  }

  check() {
    const S = this.S;
    this.predictButtons[2].click();
    this.lockButton.click();
    let guard = 0;
    while (S.idx < LAST && guard < 200) {
      this.fwdBtn.click();
      guard += 1;
    }
    if (!S.locked || this.revealPanel.hidden || !this.revealPanel.textContent.includes("never stopped on its own")) return false;
    const start = this.findPanel.querySelector("[data-start-find]");
    if (!start) return false;
    start.click();
    const target = visible(this.querySelectorAll(`[data-seq="${INCIDENT.first_bad_seq}"]`));
    if (!target) return false;
    target.click();
    return S.found === true && this.findPanel.dataset.state === "found";
  }
}

customElements.define("hx-proto-break", BreakElement);
