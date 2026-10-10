// Break (DESIGN §7.2–§7.4): the cold open of B2. Predict, lock in, replay the run (transcript-first on
// phones, lanes beside the transcript on desktop), read the reveal, find the first bad moment with
// escalating hints, then choose a fix. Event numbers are 1-based everywhere.
import { FIXTURE } from "../shared/fixture.js";
import { WIRES } from "./data.js";
import { el, glyph, svgEl, makeAnnouncer, clamp, fmtInt, fmtCost, shorten, reduceMotion } from "./common.js";
import { WIRE_BY_ID, friendly, eventIcon, repeatMap } from "./events.js";

const TRACE = FIXTURE.trace;
const LAST = TRACE.length - 1;
const END = TRACE[LAST];
const MAX_T = END.t;
const MAX_TURN = Math.max(...TRACE.map((e) => e.turn));
const WINDOW = 8000;
const PAR_SECONDS = 60;
const SPEEDS = [1, 2, 4];
const STEP_MS = { 1: 1100, 2: 550, 4: 275 };
const PX_PER_STEP = 16;
const INCIDENT = FIXTURE.incident;
const PRED = INCIDENT.prediction;
const FIRST_BAD = TRACE.findIndex((e) => e.seq === INCIDENT.first_bad_seq);
const DECISION = { allow: "Allowed", ask: "Asked", deny: "Denied" };
const TEMPTING = [
  "The first edit is the right one, so the early turns look like progress.",
  "The model keeps writing “Almost done”, which sounds like it is wrapping up.",
  "Nothing in the loop ends it: the only exit is the model saying it is done, and it never does.",
  "The test output shows failures, but the harness hands them back to the model as results. Nothing crashes.",
];
const FIX_WHY = [
  "Right: the loop gets exits that do not depend on the model.",
  "Tempting, but the model is already trying. The loop still has no exit.",
  "Costs more, and the loop still has no exit.",
  "Repeats the same spiral with a new seed. The loop is unchanged.",
];

// Derived once: the latest prompt size and the latest reply cost (cumulative in the fixture).
const PROMPT_AT = [];
const COST_AT = [];
{
  let prompt = 0;
  let cost = 0;
  TRACE.forEach((e, i) => {
    if (e.kind === "prompt_built") prompt = e.tokens;
    if (e.kind === "model_reply") cost = e.cost;
    PROMPT_AT[i] = prompt;
    COST_AT[i] = cost;
  });
}

const firstIndexOfTurn = (n) => Math.max(0, TRACE.findIndex((e) => e.turn === n));
const eventNo = (i) => TRACE[i].seq + 1;

function nearestIndex(t, lane = null) {
  let best = 0;
  let gap = Infinity;
  TRACE.forEach((e, i) => {
    if (lane && e.wire !== lane) return;
    const d = Math.abs(e.t - t);
    if (d < gap) {
      gap = d;
      best = i;
    }
  });
  return best;
}

function toolLabel(e) {
  const args = Object.values(e.input || {}).map((v) => JSON.stringify(shorten(String(v), 40))).join(", ");
  return `${e.tool}(${args})`;
}

function story(e) {
  switch (e.kind) {
    case "run_start":
      return [el("span", { class: "ev-text quote", text: `“${e.task}”` })];
    case "prompt_built":
      return [el("span", { class: "ev-meta", text: `Prompt of ${fmtInt(e.tokens)} tokens, built from ${e.layers.join(", ")}.` })];
    case "model_call":
      return [el("span", { class: "ev-meta", text: `Sent ${fmtInt(e.tokens_in)} input tokens to the model.` })];
    case "model_reply":
      return [
        e.text ? el("span", { class: "ev-text quote", text: `“${e.text}”` }) : el("span", { class: "ev-meta", text: "No words in this reply." }),
        e.tool_use ? el("span", { class: "ev-meta", text: `Asks to use ${e.tool_use.name}.` }) : null,
      ];
    case "permission":
      return [el("span", { class: "ev-meta", text: `${e.tool}: ${DECISION[e.decision] || e.decision}. Rule: “${e.rule}”.` })];
    case "tool_call":
      return [el("span", { class: "ev-card" },
        el("span", { class: "label", text: e.ok ? "Tool ran" : "Tool failed" }),
        `${toolLabel(e)}\n→ ${shorten(e.output, 120)}`)];
    case "interrupt":
      return [el("span", { class: "ev-text", text: "A person pressed stop." })];
    case "run_end":
      return [el("span", { class: "ev-text", text: `The run ends: ${e.status} after ${e.turns} turns.` })];
    default:
      return [el("span", { class: "ev-meta", text: e.kind })];
  }
}

// Margin note on desktop, tap-to-open note on phones. Both sit in the row; CSS shows one of them.
function notes(term, text) {
  return [
    el("p", { class: "mnote" }, el("strong", { text: term }), text),
    el("details", { class: "inote" }, el("summary", {}, glyph("info"), term), el("div", { class: "inote-body", text })),
  ];
}

function drawDeskBar(share) {
  return el("span", { class: "bar-fill", style: `width:${clamp(share, 0, 100)}%` });
}

export class BreakElement extends HTMLElement {
  connectedCallback() {
    if (this.built) return;
    this.built = true;
    this.say = makeAnnouncer();
    this.article = this.querySelector(".article") || this;
    this.state = {
      pick: null, locked: false, reachedEnd: false, idx: 0, speed: 2, playing: false,
      filter: null, view: "friendly", hunt: "idle", wrong: new Set(), wrongTaps: 0,
      hint: "", notice: "", huntStart: 0, huntSeconds: 0, fix: null,
    };
    this.timer = null;
    this.lastTurnSaid = TRACE[0].turn;
    this.mq = window.matchMedia("(min-width: 700px)");
    this.compact = !this.mq.matches;
    this.mq.addEventListener("change", () => this.relayLanes());
    this.seen = repeatMap(TRACE);
    this.buildPredict();
    this.buildReplay();
    this.buildLive();
    this.buildReveal();
    this.buildFix();
    this.buildCta();
    this.article.append(this.predictRow, this.plate, this.liveRow, this.revealRow, this.fixRow, this.ctaRow);
    this.paint();
    this.__test = { run: () => this.selfTest() };
  }

  disconnectedCallback() {
    if (this.built) this.stop();
  }

  // ---------- prediction gate ----------
  buildPredict() {
    this.inputs = PRED.options.map((text, i) => {
      const input = el("input", { type: "radio", name: "prediction", value: String(i) });
      input.addEventListener("change", () => this.pickPrediction(i));
      const mark = el("span", { class: "choice-mark" });
      const label = el("label", { class: "choice" }, input, el("span", { class: "choice-text", text }), mark);
      return { input, mark, label };
    });
    this.lockBtn = el("button", { class: "btn btn-primary", type: "button", disabled: true, text: "Lock in" });
    this.lockBtn.addEventListener("click", () => this.lock());
    this.pickNote = el("p", { class: "pick-note", text: "Pick one answer to open the replay." });
    this.predictRow = el("section", { class: "row", "aria-labelledby": "predict-h" },
      el("h2", { id: "predict-h", text: "Predict first" }),
      el("p", { class: "lede", text: "Make a call before you press anything. The replay stays closed until you lock it in." }),
      el("fieldset", { class: "prediction" },
        el("legend", { class: "prediction-head", text: PRED.question }),
        el("ol", { class: "choices" }, this.inputs.map(({ label }) => el("li", {}, label)))),
      el("div", { class: "lock-row" }, this.lockBtn, this.pickNote),
      notes("Turn", "One turn is one model call and the tool calls it asks for."));
  }

  pickPrediction(i) {
    if (this.state.locked) return;
    this.state.pick = i;
    this.lockBtn.disabled = false;
    this.pickNote.textContent = `Your pick: “${PRED.options[i]}”. Lock it in to open the replay.`;
    this.paint();
  }

  lock() {
    const s = this.state;
    if (s.pick === null || s.locked) return;
    s.locked = true;
    const picked = PRED.options[s.pick];
    this.inputs.forEach(({ input }) => { input.disabled = true; });
    this.lockBtn.disabled = true;
    this.lockBtn.textContent = "Locked in";
    this.pickNote.textContent = `Locked in: “${picked}”. Your pick stays here.`;
    const right = s.pick === PRED.answer;
    this.verdict.className = `verdict ${right ? "is-pass" : "is-fail"}`;
    this.verdict.replaceChildren(
      glyph(right ? "check" : "cross"),
      right ? " Right. You called it." : ` Not quite. The answer is “${PRED.options[PRED.answer]}”.`);
    this.pickTags.forEach((tag, i) => { tag.hidden = i !== s.pick; });
    this.say(`Locked in: ${picked}. The replay is open.`);
    this.paint();
  }

  // ---------- the replay figure ----------
  buildReplay() {
    this.lanesHost = this.buildLanes();
    this.buildTranscript();
    this.filterText = el("p", { class: "filter-state", text: "Showing: all eight wires." });
    this.chips = this.buildChips();
    this.readouts = this.buildReadouts();
    this.transport = this.buildTransport();
    this.detail = this.buildDetail();
    this.bannerText = el("p", { class: "hint" });
    this.banner = el("div", { class: "hunt-banner", tabindex: "-1", hidden: true },
      el("p", { class: "banner-title", text: "Find the first bad moment" }), this.bannerText);
    this.transcriptCol = el("div", { class: "transcript-col area-transcript" }, this.banner, this.list);
    this.filterBar = el("div", { class: "filter-bar area-filter" }, this.chips, this.filterText);
    this.speedBtns = SPEEDS.map((n) => {
      const btn = el("button", { type: "button", "aria-pressed": n === 2 ? "true" : "false", text: `${n}×` });
      btn.addEventListener("click", () => this.setSpeed(n));
      return btn;
    });
    this.gate = el("p", { class: "hint gate", text: "Lock in a prediction above to open the replay." });
    this.plateState = el("p", { class: "plate-state" });
    this.stripCol = el("div", { class: "strip-col area-strip" }, this.lanesHost);
    this.replayBody = el("div", { class: "replay-body" },
      this.stripCol, this.filterBar, this.readouts, this.transcriptCol, this.detail, this.transport);
    this.plate = el("figure", { class: "plate instrument replay-plate", "aria-labelledby": "fig-b2-1" },
      el("div", { class: "plate-head" },
        el("span", { class: "fig-label", id: "fig-b2-1", text: "FIG B2.1 · REPLAY" }),
        el("div", { class: "seg speed", role: "group", "aria-label": "Playback speed" }, this.speedBtns),
        this.plateState),
      this.gate,
      this.replayBody,
      el("figcaption", { class: "caption", text: "Try this: press Step and watch the marks move. Tap a wire name to see only its events, or drag along a lane to scrub." }));
  }

  // The 8-lane strip: 24 px rows on phones, 44 px rows on desktop. A tap or drag in a row picks the nearest
  // event of that wire, so each mark is reachable through its whole row.
  buildLanes() {
    const compact = this.compact;
    const lanes = el("div", { class: `lanes ${compact ? "lanes-compact" : "lanes-full"}`, role: "group", "aria-label": "Eight lanes, one per wire, in turn order" });
    this.laneBtn = {};
    this.playheads = [];
    this.markNodes = new Array(TRACE.length);
    if (!compact) {
      const ticks = [0, 15, 30, 45, 60].map((t) => el("span", { style: `left:${(t / MAX_T) * 100}%`, text: `${t} s` }));
      lanes.append(el("div", { class: "lane-axis", "aria-hidden": "true" }, ticks));
    }
    for (const wire of WIRES) {
      const used = TRACE.some((e) => e.wire === wire.id);
      let label;
      if (compact) {
        label = el("span", { class: `lane-label w-${wire.id}`, title: wire.name }, glyph(wire.glyph));
      } else {
        label = el("button", { class: `lane-label w-${wire.id}`, type: "button", "aria-pressed": "false", title: wire.name }, glyph(wire.glyph), wire.short);
        label.addEventListener("click", () => this.toggleFilter(wire.id));
        this.laneBtn[wire.id] = label;
      }
      const track = el("div", { class: `lane-track w-${wire.id}${used ? "" : " is-empty"}`, "data-lane": wire.id });
      const playhead = el("span", { class: "playhead", "aria-hidden": "true" });
      this.playheads.push(playhead);
      track.append(playhead);
      TRACE.forEach((e, i) => {
        if (e.wire !== wire.id) return;
        const icon = eventIcon(e);
        const mark = el("span", { class: "mark", "aria-hidden": "true" }, glyph(icon.names, { fill: Boolean(icon.fill) }));
        mark.style.left = `${(e.t / MAX_T) * 100}%`;
        this.markNodes[i] = mark;
        track.append(mark);
      });
      if (!compact) {
        track.addEventListener("pointerdown", (ev) => this.laneDown(ev, wire.id));
        track.addEventListener("pointermove", (ev) => { if (this.laneDrag === wire.id) this.setIndex(this.laneIndex(ev, wire.id)); });
        track.addEventListener("pointerup", () => { this.laneDrag = null; });
        track.addEventListener("pointercancel", () => { this.laneDrag = null; });
      }
      lanes.append(el("div", { class: `lane w-${wire.id}` }, label, track));
    }
    lanes.setAttribute("tabindex", "0");
    if (compact) {
      // The whole strip is one scrubber: tap or drag anywhere on it, arrow keys step through events.
      lanes.setAttribute("role", "slider");
      lanes.setAttribute("aria-label", "Event strip: all eight lanes, one scrubber");
      lanes.setAttribute("aria-valuemin", "1");
      lanes.setAttribute("aria-valuemax", String(TRACE.length));
      lanes.addEventListener("pointerdown", (ev) => this.stripDown(ev));
      lanes.addEventListener("pointermove", (ev) => { if (this.stripDrag) this.setIndex(this.stripIndex(ev)); });
      const endStrip = () => { this.stripDrag = false; };
      lanes.addEventListener("pointerup", endStrip);
      lanes.addEventListener("pointercancel", endStrip);
    } else {
      lanes.setAttribute("role", "group");
      lanes.setAttribute("aria-label", "Eight lanes, one per wire, in turn order");
    }
    lanes.addEventListener("keydown", (ev) => this.onStripKey(ev));
    return lanes;
  }

  // Tap = the nearest event: the row under the pointer picks the wire, the x position picks the time.
  stripIndex(ev) {
    const rows = [...this.lanesHost.querySelectorAll(".lane")];
    const box = this.lanesHost.getBoundingClientRect();
    const row = clamp(Math.floor(((ev.clientY - box.top) / box.height) * rows.length), 0, rows.length - 1);
    const track = rows[row].querySelector(".lane-track").getBoundingClientRect();
    const frac = clamp((ev.clientX - track.left) / track.width, 0, 1);
    const wire = WIRES[row].id;
    const hasLane = TRACE.some((e) => e.wire === wire);
    return nearestIndex(frac * MAX_T, hasLane ? wire : null);
  }

  stripDown(ev) {
    if (ev.button !== 0) return;
    this.stripDrag = true;
    this.lanesHost.setPointerCapture(ev.pointerId);
    this.stop();
    this.activate(this.stripIndex(ev));
  }

  laneIndex(ev, wire) {
    const track = this.lanesHost.querySelector(`[data-lane="${wire}"]`);
    const box = track.getBoundingClientRect();
    return nearestIndex(clamp((ev.clientX - box.left) / box.width, 0, 1) * MAX_T, wire);
  }

  laneDown(ev, wire) {
    if (ev.button !== 0) return;
    this.laneDrag = wire;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    this.stop();
    this.activate(this.laneIndex(ev, wire));
  }

  onStripKey(ev) {
    const keys = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: 1, ArrowUp: -1 };
    if (!(ev.key in keys) && ev.key !== "Home" && ev.key !== "End") return;
    ev.preventDefault();
    this.stop();
    if (ev.key === "Home") this.setIndex(0);
    else if (ev.key === "End") this.setIndex(LAST);
    else this.moveBy(keys[ev.key]);
  }

  relayLanes() {
    const compact = !this.mq.matches;
    if (compact === this.compact) return;
    this.compact = compact;
    const fresh = this.buildLanes();
    this.lanesHost.replaceWith(fresh);
    this.lanesHost = fresh;
    this.stripCol.prepend(fresh);
    this.paint();
  }

  buildChips() {
    this.chipBtns = {};
    return el("ul", { class: "chips filter-chips", "aria-label": "Show one wire" }, WIRES.map((w) => {
      const btn = el("button", { class: `chip w-${w.id}`, type: "button", "aria-pressed": "false" }, glyph(w.glyph), w.short);
      btn.addEventListener("click", () => this.toggleFilter(w.id));
      this.chipBtns[w.id] = btn;
      return el("li", {}, btn);
    }));
  }

  buildTranscript() {
    this.tags = [];
    this.rowNodes = TRACE.map((e, i) => this.buildRow(e, i));
    this.list = el("ol", { class: "transcript", "aria-label": "The run, one event per row" }, this.rowNodes);
    this.list.addEventListener("keydown", (ev) => this.onListKey(ev));
  }

  buildRow(e, i) {
    const wire = WIRE_BY_ID[e.wire];
    const icon = eventIcon(e);
    const tag = el("span", { class: "ev-tag", hidden: true });
    this.tags[i] = tag;
    const seenTurn = this.seen.get(i);
    const line = el("span", { class: "ev-line" },
      el("span", { class: `ev-chip w-${wire.id}` }, glyph(wire.glyph), wire.name),
      el("span", { class: "ev-meta" }, el("span", { text: `event ${eventNo(i)} · turn ${e.turn}` }), el("span", { class: "ev-time", text: ` · ${e.t.toFixed(1)} s` })),
      seenTurn === undefined ? null : el("span", { class: "ev-seen", text: `seen at turn ${seenTurn}` }),
      tag);
    const main = el("button", { class: `ev-main w-${wire.id}`, type: "button", tabindex: "-1" },
      glyph(icon.names, { fill: Boolean(icon.fill) }),
      el("span", { class: "ev-body" }, line, story(e)));
    main.addEventListener("click", () => this.activate(i));
    return el("li", { class: "ev", dataset: { i: String(i) } }, main, el("span", { class: "ev-callout", text: friendly(e) }));
  }

  onListKey(ev) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(ev.key)) return;
    ev.preventDefault();
    let target;
    if (ev.key === "Home") target = this.nextMatch(-1, 1);
    else if (ev.key === "End") target = this.nextMatch(LAST + 1, -1);
    else target = this.nextMatch(this.state.idx, ev.key === "ArrowDown" ? 1 : -1);
    if (target === null) return;
    this.stop();
    this.setIndex(target);
    this.rowNodes[target].querySelector(".ev-main").focus();
  }

  buildReadouts() {
    this.roTurn = el("p", { class: "readout-value num" });
    this.roTurnNote = el("p", { class: "readout-note num" });
    this.roDesk = el("p", { class: "readout-value num" });
    this.roDeskNote = el("p", { class: "readout-note num" });
    this.roDeskBar = drawDeskBar(0);
    this.roCost = el("p", { class: "readout-value num" });
    this.roCostNote = el("p", { class: "readout-note" }, "units, relative");
    const window_ = (label, valueNode, extra = []) => el("div", { class: "readout" },
      el("p", { class: "readout-label", text: label }), valueNode, ...extra);
    this.deskBarTrack = el("span", { class: "bar" }, this.roDeskBar);
    this.rbTurn = el("span", { class: "rb-value num" });
    this.rbDesk = el("span", { class: "rb-value num" });
    this.rbCost = el("span", { class: "rb-value num" });
    // Phones: one compact instrument bar in one row. From 700 px: three readout windows.
    this.readoutBar = el("p", { class: "readout-bar", "aria-live": "off" },
      el("span", { class: "rb-label", text: "Turn" }), this.rbTurn,
      el("span", { class: "rb-sep", text: "·" }),
      el("span", { class: "rb-label", text: "Desk" }), this.rbDesk,
      el("span", { class: "rb-sep", text: "·" }), this.rbCost);
    return el("div", { class: "readouts-wrap area-readouts" },
      this.readoutBar,
      el("div", { class: "readouts" },
        window_("Turn", this.roTurn, [this.roTurnNote]),
        window_("Desk (context)", this.roDesk, [this.deskBarTrack, this.roDeskNote]),
        window_("Cost so far", this.roCost, [this.roCostNote])));
  }

  buildTransport() {
    this.backBtn = el("button", { class: "key", type: "button" }, glyph("stepBack"), "Back");
    this.backBtn.addEventListener("click", () => this.moveBy(-1));
    this.stepBtn = el("button", { class: "key key-primary", type: "button" }, "Step", glyph("stepFwd"));
    this.stepBtn.addEventListener("click", () => this.moveBy(1));
    this.playBtn = el("button", { class: "key", type: "button", "aria-pressed": "false" });
    this.playBtn.addEventListener("click", () => this.togglePlay());
    this.range = el("input", { type: "range", min: "0", max: String(LAST), step: "1", value: "0", "aria-label": "Event" });
    this.range.addEventListener("input", () => this.stepTo(Number(this.range.value)));
    this.rangeMinus = el("button", { class: "key key-icon", type: "button", "aria-label": "One event earlier" }, glyph("minus"));
    this.rangeMinus.addEventListener("click", () => this.stepTo(this.state.idx - 1));
    this.rangePlus = el("button", { class: "key key-icon", type: "button", "aria-label": "One event later" }, glyph("plus"));
    this.rangePlus.addEventListener("click", () => this.stepTo(this.state.idx + 1));
    this.counter = el("span", { class: "counter" });
    return el("div", { class: "transport area-transport is-sticky", role: "group", "aria-label": "Replay controls" },
      el("div", { class: "transport-row" }, this.backBtn, this.stepBtn, this.playBtn),
      el("div", { class: "range-row" }, this.rangeMinus, this.range, this.rangePlus, this.counter));
  }

  buildDetail() {
    this.detailLabel = el("p", { class: "ev-meta detail-label" });
    this.viewFriendly = el("button", { type: "button", "aria-pressed": "true", text: "Friendly" });
    this.viewFriendly.addEventListener("click", () => this.setView("friendly"));
    this.viewJson = el("button", { type: "button", "aria-pressed": "false", text: "Wire" });
    this.viewJson.addEventListener("click", () => this.setView("json"));
    this.detailBody = el("div", { class: "detail-body" });
    return el("section", { class: "detail area-detail", "aria-label": "Event detail" },
      el("div", { class: "detail-head" },
        this.detailLabel,
        el("div", { class: "seg", role: "group", "aria-label": "Detail view" }, this.viewFriendly, this.viewJson)),
      this.detailBody);
  }

  // ---------- the reactive sentence under the figure ----------
  buildLive() {
    this.scrubEl = el("span", {
      class: "scrub", role: "slider", tabindex: "0", "aria-label": "Turn number",
      "aria-valuemin": "0", "aria-valuemax": String(MAX_TURN),
    });
    this.bindTurnScrub(this.scrubEl);
    this.livePrompt = el("strong");
    this.liveCost = el("strong");
    const minus = el("button", { class: "key key-icon", type: "button", "aria-label": "Earlier turn" }, glyph("minus"));
    minus.addEventListener("click", () => this.setTurn(this.turnNow() - 1));
    const plus = el("button", { class: "key key-icon", type: "button", "aria-label": "Later turn" }, glyph("plus"));
    plus.addEventListener("click", () => this.setTurn(this.turnNow() + 1));
    this.liveRow = el("section", { class: "row live-row", "aria-label": "Live readout" },
      el("p", { class: "live-sentence" },
        "At turn ", this.scrubEl, ", the prompt is ", this.livePrompt, " and the run has cost ", this.liveCost, "."),
      el("div", { class: "stepper" }, el("span", { class: "ev-meta", text: "Turn" }), minus, plus),
      notes("Desk", "The desk is the model's context window: at most 8,000 tokens in one call. The bar shows how full it is."));
  }

  bindTurnScrub(node) {
    let drag = null;
    node.addEventListener("pointerdown", (ev) => {
      drag = { x: ev.clientX, v: this.turnNow() };
      node.setPointerCapture(ev.pointerId);
      node.classList.add("is-active");
    });
    node.addEventListener("pointermove", (ev) => {
      if (drag) this.setTurn(drag.v + Math.round((ev.clientX - drag.x) / PX_PER_STEP));
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
        this.setTurn(this.turnNow() + keys[ev.key]);
      } else if (ev.key === "Home") {
        ev.preventDefault();
        this.setTurn(0);
      } else if (ev.key === "End") {
        ev.preventDefault();
        this.setTurn(MAX_TURN);
      }
    });
  }

  // ---------- reveal and the hunt ----------
  buildReveal() {
    this.pickTags = [];
    this.outcome = el("p", { class: "outcome", text: `It never stopped on its own: ${END.turns} turns, ${fmtCost(END.cost)}, until a person pressed stop.` });
    this.verdict = el("p", { class: "verdict" });
    this.huntBtn = el("button", { class: "btn btn-primary", type: "button", text: "Find the first bad moment" });
    this.huntBtn.addEventListener("click", () => this.startHunt());
    this.huntNote = el("p", { class: "hint", "aria-live": "off" });
    this.revealRow = el("section", { class: "row reveal", hidden: true, "aria-labelledby": "reveal-h" },
      el("h2", { id: "reveal-h", text: "What the run did" }),
      this.outcome,
      this.verdict,
      el("p", { class: "wry", text: "The model is very sure it's almost done. It isn't." }),
      el("p", { class: "hint", text: "Why each option is tempting:" }),
      el("ol", { class: "options-why" }, PRED.options.map((text, i) => this.optionItem(text, i))),
      el("div", { class: "lock-row" }, this.huntBtn),
      this.huntNote,
      notes("Exit", "An exit is the rule that ends a loop. Here the only exit is the model saying it is done."));
  }

  optionItem(text, i) {
    const right = i === PRED.answer;
    const tag = el("span", { class: "ev-seen", text: "Your pick", hidden: true });
    this.pickTags[i] = tag;
    return el("li", {}, glyph(right ? "check" : "cross"),
      el("div", {}, el("span", { text }), " ", tag, el("span", { class: "why", text: TEMPTING[i] })));
  }

  startHunt() {
    const s = this.state;
    if (s.hunt !== "idle") return;
    s.hunt = "on";
    s.hint = "";
    s.huntStart = performance.now();
    this.say("Find the first bad moment. Tap the event where things went wrong.");
    this.paint();
    this.banner.scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" });
    this.banner.focus({ preventScroll: true });
  }

  // Wrong taps escalate and never hide or reset the hunt. Taps before the hunt is started do not count.
  guess(i) {
    const s = this.state;
    if (i === FIRST_BAD) {
      s.hunt = "done";
      s.hint = "";
      s.huntSeconds = Math.max(1, Math.round((performance.now() - s.huntStart) / 1000));
      this.say(`Found it: event ${eventNo(i)}, turn ${TRACE[i].turn}. Found in ${s.huntSeconds} seconds.`);
      this.paint();
      return;
    }
    s.wrong.add(i);
    s.wrongTaps += 1;
    const late = i > FIRST_BAD;
    let hint = late ? "Too late: the loop was already repeating." : "Too early: that step was reasonable.";
    if (s.wrongTaps >= 2) hint += " Look at the edits to calc.py around turns 4 and 6.";
    if (s.wrongTaps >= 3) hint += ` The edit at event ${eventNo(FIRST_BAD)} undid the turn-4 fix. That is the first bad moment.`;
    s.hint = hint;
    this.say(hint);
    this.paint();
  }

  buildFix() {
    this.fixInputs = INCIDENT.fixes.map((text, i) => {
      const input = el("input", { type: "radio", name: "fix", value: String(i) });
      input.addEventListener("change", () => this.pickFix(i));
      const why = el("span", { class: "why", text: FIX_WHY[i], hidden: true });
      const mark = el("span", { class: "choice-mark" });
      const label = el("label", { class: "choice" }, input, el("span", { class: "choice-text" }, el("span", { text }), why), mark);
      return { input, why, mark, label };
    });
    this.fixVerdict = el("p", { class: "verdict" });
    this.fixRow = el("section", { class: "row fix-panel", hidden: true, "aria-labelledby": "fix-h" },
      el("h2", { id: "fix-h", text: "Why it spiralled, and the fix" }),
      el("p", { class: "lede", text: INCIDENT.why }),
      el("fieldset", { class: "fix-set" },
        el("legend", { class: "prediction-head", text: "Which change would stop this spiral?" }),
        el("ol", { class: "choices" }, this.fixInputs.map(({ label }) => el("li", {}, label)))),
      this.fixVerdict);
  }

  pickFix(i) {
    this.state.fix = i;
    this.fixInputs.forEach(({ why, mark }, k) => {
      why.hidden = false;
      mark.textContent = k === i ? "Your pick" : "";
    });
    const right = i === INCIDENT.correct_fix;
    this.fixVerdict.className = `verdict ${right ? "is-pass" : "is-fail"}`;
    this.fixVerdict.replaceChildren(
      glyph(right ? "check" : "cross"),
      right ? " Right. Next, measure it on Prove." : " Not this one. Try another, or measure the one you think works on Prove.");
    this.say(right ? "Right fix." : "Not this fix.");
  }

  buildCta() {
    this.ctaRow = el("section", { class: "cta", "aria-label": "Next page" },
      el("p", { text: "Fix it, then measure it on the same 20 seeds." }),
      el("a", { class: "btn btn-primary", href: "prove.html", text: "Fix it → Prove" }));
  }

  // ---------- state ----------
  turnNow() {
    return TRACE[this.state.idx].turn;
  }

  nextMatch(from, dir) {
    const f = this.state.filter;
    for (let i = from + dir; i >= 0 && i <= LAST; i += dir) {
      if (!f || TRACE[i].wire === f) return i;
    }
    return null;
  }

  setIndex(i) {
    const s = this.state;
    const before = s.idx;
    s.idx = clamp(i, 0, LAST);
    if (s.idx === LAST) s.reachedEnd = true;
    this.paint();
    this.followRow();
    if (s.idx !== before) this.announceTurn(s.idx);
  }

  // Keep the current event in view. Phones scroll the page (the sticky transport sits below the row);
  // desktop scrolls the transcript column only, so the page does not jump.
  followRow() {
    const row = this.rowNodes[this.state.idx];
    const col = this.transcriptCol;
    const smooth = reduceMotion() ? "auto" : "smooth";
    if (getComputedStyle(col).overflowY === "auto") {
      const rr = row.getBoundingClientRect();
      const cr = col.getBoundingClientRect();
      if (rr.top < cr.top) col.scrollBy({ top: rr.top - cr.top - 8, behavior: smooth });
      else if (rr.bottom > cr.bottom) col.scrollBy({ top: rr.bottom - cr.bottom + 8, behavior: smooth });
    } else {
      row.scrollIntoView({ block: "nearest", behavior: smooth });
    }
  }

  // The live message always says what the screen shows now: the turn, or the end of the run.
  // The region de-duplicates, so a turn is announced once.
  announceTurn(i) {
    this.say(i === LAST ? `The run ends: ${END.status} after ${END.turns} turns.` : `Turn ${TRACE[i].turn} of ${MAX_TURN}.`);
  }

  // The strip is one slider: its value text names the event, the turn, the wire and the tool.
  stripText(i) {
    const e = TRACE[i];
    const detail = e.tool ? `: ${e.tool}` : e.tool_use ? `: ${e.tool_use.name}` : "";
    return `Event ${eventNo(i)} of ${TRACE.length}, turn ${e.turn}, ${WIRE_BY_ID[e.wire].name}${detail}`;
  }

  activate(i) {
    const s = this.state;
    if (s.hunt === "on") {
      this.guess(i);
      return;
    }
    if (s.hunt === "idle" && s.reachedEnd) {
      s.notice = "Taps count once you press Find the first bad moment.";
    }
    this.stop();
    this.setIndex(i);
  }

  stepTo(i) {
    this.stop();
    this.setIndex(clamp(i, 0, LAST));
  }

  setTurn(n) {
    this.stop();
    this.setIndex(firstIndexOfTurn(clamp(n, 0, MAX_TURN)));
  }

  moveBy(dir) {
    this.stop();
    const j = this.nextMatch(this.state.idx, dir);
    if (j !== null) {
      this.setIndex(j);
      this.rowNodes[j].scrollIntoView({ block: "nearest" });
    }
  }

  toggleFilter(id) {
    this.state.filter = this.state.filter === id ? null : id;
    this.say(this.state.filter ? `Showing ${WIRE_BY_ID[id].name} only.` : "Showing all wires.");
    this.paint();
  }

  setView(view) {
    this.state.view = view;
    this.paint();
  }

  setSpeed(n) {
    this.state.speed = n;
    if (this.state.playing) {
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.tick(), STEP_MS[n]);
    }
    this.paint();
  }

  togglePlay() {
    if (this.state.playing) {
      this.stop();
      return;
    }
    if (this.state.idx === LAST) this.setIndex(0);
    this.state.playing = true;
    this.tick();
  }

  tick() {
    const j = this.nextMatch(this.state.idx, 1);
    if (j === null) {
      this.stop();
      return;
    }
    this.setIndex(j);
    this.rowNodes[j].scrollIntoView({ block: "nearest" });
    this.timer = window.setTimeout(() => this.tick(), STEP_MS[this.state.speed]);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.state.playing) return;
    this.state.playing = false;
    this.paint();
  }

  // Every readout, status and label is derived from state in paint(), so no line can go stale.
  paint() {
    const s = this.state;
    const e = TRACE[s.idx];
    const open = s.locked;
    const tokens = PROMPT_AT[s.idx];
    const cost = COST_AT[s.idx];
    const pctDesk = Math.min(100, (tokens / WINDOW) * 100);
    const n = eventNo(s.idx);

    this.replayBody.inert = !open;
    this.liveRow.inert = !open;
    this.gate.hidden = open;
    this.transport.classList.toggle("is-locked", !open);
    this.inputs.forEach(({ mark }, i) => { mark.textContent = i === s.pick ? "Your pick" : ""; });
    this.speedBtns.forEach((btn, k) => btn.setAttribute("aria-pressed", String(SPEEDS[k] === s.speed)));

    this.plateState.replaceChildren(
      "Event ", el("strong", { text: String(n) }), ` of ${TRACE.length} · turn `,
      el("strong", { text: String(e.turn) }), ` of ${MAX_TURN}`);

    const pct = `${(e.t / MAX_T) * 100}%`;
    for (const ph of this.playheads) ph.style.left = pct;
    if (this.compact) {
      this.lanesHost.setAttribute("aria-valuenow", String(n));
      this.lanesHost.setAttribute("aria-valuetext", this.stripText(s.idx));
    }
    this.markNodes.forEach((node, i) => {
      if (!node) return;
      node.classList.toggle("is-dim", Boolean(s.filter) && TRACE[i].wire !== s.filter);
      node.classList.toggle("is-current", i === s.idx);
    });
    for (const [id, btn] of Object.entries(this.laneBtn)) btn.setAttribute("aria-pressed", String(s.filter === id));
    for (const [id, btn] of Object.entries(this.chipBtns)) btn.setAttribute("aria-pressed", String(s.filter === id));
    this.filterText.textContent = s.filter
      ? `Showing: ${WIRE_BY_ID[s.filter].name}. Step and Back move between its events.`
      : "Showing: all eight wires.";

    this.list.classList.toggle("hunt", s.hunt === "on");
    this.rowNodes.forEach((li, i) => {
      li.classList.toggle("is-hidden", Boolean(s.filter) && TRACE[i].wire !== s.filter);
      li.classList.toggle("is-current", i === s.idx);
      li.classList.toggle("is-wrong", s.wrong.has(i));
      li.classList.toggle("is-right", s.hunt === "done" && i === FIRST_BAD);
      const main = li.querySelector(".ev-main");
      main.tabIndex = i === s.idx ? 0 : -1;
      if (i === s.idx) main.setAttribute("aria-current", "step");
      else main.removeAttribute("aria-current");
      const tag = this.tags[i];
      const show = s.hunt !== "idle" && (s.wrong.has(i) || (s.hunt === "done" && i === FIRST_BAD));
      tag.hidden = !show;
      if (show) {
        const good = i === FIRST_BAD;
        tag.replaceChildren(glyph(good ? "check" : "cross"), good ? "Found it" : "Not this");
      }
    });

    const deskPct = `${Math.round(pctDesk)}%`;
    const costText = Number(cost).toFixed(3);
    this.roTurn.textContent = `${e.turn} of ${MAX_TURN}`;
    this.roTurnNote.textContent = `event ${n} of ${TRACE.length}`;
    this.roDesk.textContent = tokens ? deskPct : "none yet";
    this.roDeskNote.textContent = tokens ? `${fmtInt(tokens)} of ${fmtInt(WINDOW)} tokens` : "no prompt yet";
    this.roDeskBar.style.width = `${pctDesk}%`;
    this.roCost.textContent = `≈ ${costText}`;
    this.rbTurn.textContent = `${e.turn}/${MAX_TURN}`;
    this.rbDesk.textContent = tokens ? deskPct : "–";
    this.rbCost.textContent = `≈ ${costText}`;

    this.range.value = String(s.idx);
    this.range.setAttribute("aria-valuetext", `Event ${n} of ${TRACE.length}`);
    this.counter.textContent = `${n} / ${TRACE.length}`;
    this.rangeMinus.disabled = s.idx === 0;
    this.rangePlus.disabled = s.idx === LAST;
    this.playBtn.setAttribute("aria-pressed", String(s.playing));
    this.playBtn.replaceChildren(glyph(s.playing ? "pause" : "play"), s.playing ? "Pause" : "Play");
    this.backBtn.disabled = this.nextMatch(s.idx, -1) === null;
    this.stepBtn.disabled = this.nextMatch(s.idx, 1) === null;
    this.renderDetail(e, n);

    this.scrubEl.textContent = String(e.turn);
    this.scrubEl.setAttribute("aria-valuenow", String(e.turn));
    this.scrubEl.setAttribute("aria-valuetext", `Turn ${e.turn} of ${MAX_TURN}`);
    this.livePrompt.textContent = tokens ? `${fmtInt(tokens)} tokens` : "not built yet";
    this.liveCost.textContent = fmtCost(cost);

    this.revealRow.hidden = !s.reachedEnd;
    this.huntBtn.hidden = s.hunt !== "idle";
    this.huntNote.textContent = s.hunt === "idle" ? s.notice : "";
    this.huntNote.hidden = s.hunt !== "idle" || !s.notice;
    this.banner.hidden = s.hunt === "idle";
    this.bannerText.textContent = s.hunt === "done"
      ? `Found it in ${s.huntSeconds} s. Par is ${PAR_SECONDS} s.`
      : (s.hint || "Tap the event where things went wrong. Taps count from here on.");
    this.fixRow.hidden = s.hunt !== "done";
  }

  renderDetail(e, n) {
    const s = this.state;
    const wire = WIRE_BY_ID[e.wire];
    this.viewFriendly.setAttribute("aria-pressed", String(s.view === "friendly"));
    this.viewJson.setAttribute("aria-pressed", String(s.view === "json"));
    this.detailLabel.textContent = `Event ${n} of ${TRACE.length} · ${e.kind} · ${wire.name}`;
    if (s.view === "json") {
      this.detailBody.replaceChildren(el("pre", { class: "code", text: JSON.stringify(e, null, 2) }));
      return;
    }
    this.detailBody.replaceChildren(
      el("p", { class: "detail-friendly", text: friendly(e) }),
      el("p", { class: "ev-meta", text: `Turn ${e.turn} · ${e.t.toFixed(1)} s on the virtual clock` }));
  }

  // ---------- test hook: drives the real UI through the prediction, the replay, the hunt and a fix ----------
  async selfTest() {
    try {
      this.inputs[2].input.click();
      this.lockBtn.click();
      if (!this.state.locked) return false;
      let guard = 0;
      while (this.state.idx < LAST && guard++ < 200) this.stepBtn.click();
      if (this.state.idx !== LAST || this.revealRow.hidden) return false;
      if (!this.outcome.textContent.includes("It never stopped on its own")) return false;
      this.huntBtn.click();
      this.rowNodes[5].querySelector(".ev-main").click();
      if (this.state.hunt !== "on") return false;
      this.rowNodes[FIRST_BAD].querySelector(".ev-main").click();
      const row = this.list.querySelector(`li[data-i="${FIRST_BAD}"]`);
      return this.state.hunt === "done" && !this.fixRow.hidden && row.classList.contains("is-right");
    } catch (error) {
      console.error(error);
      return false;
    }
  }
}
