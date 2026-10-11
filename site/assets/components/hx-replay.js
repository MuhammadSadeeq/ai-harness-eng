// hx-replay: the Replay Deck (BP-1.4 §3, DESIGN §7.2). It steps a real simulator run; every state the
// learner sees is derived from the run's events and the UI state in render(). Step, scrub and play only
// move the playhead and the readouts; the transcript is rebuilt only when detail, filter or expansion change.
// BP-4.0 §4: with accept-trace and no tape, the deck opens a learner's own JSONL trace (checked against
// scenarios/trace.schema.json, lib/trace-check.js) or the one a hx-step on the page wrote. The trace never leaves the
// page. Views that need a tape (the Wire view's payloads) are off for a trace.
import { HxElement } from "./lib/hx-element.js";
import { getTape, getBoard, getFactsCore } from "./lib/data.js";
import { runTrial } from "../sim/index.js";
import { checkTrace } from "./lib/trace-check.js";
import { explain, turnSummary } from "./lib/explain.js";
import { replayCredit } from "./lib/credit.js";
import { formatCost, formatMs } from "./lib/format.js";
import { pricedOn } from "./hx-bench.js";
import {
  el, glyph, WIRES, visibleIndexes, repeats, transcriptList, laneStrip, setPlayhead, setCurrentRow,
  nearestIndex, sortedJson, ensureSprite, fitAxis,
} from "./lib/transcript.js";

const DELAY_MS = { 1: 700, 2: 350, 4: 175 };
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const TRACE_SCHEMA = new URL("../../data/trace.schema.json", import.meta.url).href;
let traceSchema = null;
// A one-line trace (its run_start, seq 0): the self-test's valid trace, and the smallest one the checker accepts.
const SELF_TEST_TRACE = JSON.stringify({
  v: 1, run: "self-test:self-test:1", seq: 0, t: 0, turn: 0, agent: "main", kind: "run_start", wire: "loop",
  task: "Self-test", board: "self-test", seed: 1, model_id: "self-test",
}) + "\n";
function loadTraceSchema() {
  if (!traceSchema) {
    traceSchema = fetch(TRACE_SCHEMA).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status} for trace.schema.json`);
      return response.json();
    });
  }
  return traceSchema;
}

/** The desk and cost readouts at each event: the latest context percent and model cost at or before it. */
export function readoutArrays(events) {
  const n = events.length;
  const desk = new Array(n);
  const cost = new Array(n);
  let d = 0;
  let c = 0;
  events.forEach((e, i) => {
    if (e.kind === "context_check") d = e.percent;
    if (e.kind === "model_reply" && Number.isFinite(e.cost)) c = e.cost;
    desk[i] = d;
    cost[i] = c;
  });
  return { desk, cost };
}

/**
 * The cost tile's words. A trace's costs are relative units, written as a tape run with relative units writes them;
 * when every cost in the trace is 0 the tile says "0" instead of four decimals (BP-4.3 fix: no clipped tile).
 */
export function costLabel(nano, { usd = true, allZero = false } = {}) {
  return allZero ? "0" : formatCost(nano, { usd });
}

/** True when every cost the trace records (model replies and its end) is 0, or it records none. */
export function allCostsZero(events) {
  return events
    .filter((e) => e.kind === "model_reply" || e.kind === "run_end")
    .map((e) => e.cost)
    .filter((cost) => Number.isFinite(cost))
    .every((cost) => cost === 0);
}

/** The deck's model for a learner's trace: no tape, no board; the run's end is its run_end line, if it has one. */
export function modelOfTrace(events) {
  const { desk, cost } = readoutArrays(events);
  const end = [...events].reverse().find((e) => e.kind === "run_end");
  return {
    tape: null, board: null, seed: null, events,
    result: end ? { status: end.status, passed: end.passed, turns: end.turns, cost: end.cost } : null,
    desk, cost, repeatMap: repeats(events), priced: false, tapeId: null, boardId: null,
    byWire: indexByWire(events), run: events[0].run, allZero: allCostsZero(events),
  };
}
/** event indexes per wire, in step order */
function indexByWire(events) {
  const byWire = new Map();
  events.forEach((e, i) => {
    if (!byWire.has(e.wire)) byWire.set(e.wire, []);
    byWire.get(e.wire).push(i);
  });
  return byWire;
}

export class HxReplay extends HxElement {
  static observedAttributes = ["tape", "board", "seed", "start", "detail", "wire", "locked", "accept-trace"];
  static styles = new URL("./hx-replay.css", import.meta.url).href;

  async setup() {
    const tapeId = this.getAttribute("tape");
    if (!tapeId && this.hasAttribute("accept-trace")) {
      // A deck with no tape: it waits for a trace (accept-trace) and shows nothing else until one is accepted.
      this.model = null;
      this.built = null;
      this.refs = null;
      this.traceResult = null;
      this.traceBox = null;
      this.stepTraces = this.stepTraces ?? new Map();
      this.state = {
        index: 0, detail: "story", wire: null, view: "friendly", speed: 1, playing: false,
        finished: false, announcedTurn: null, expanded: new Set(), ver: 0,
      };
      this.lastValues = {};
      await loadTraceSchema();
      this.listenForSteps();
      return;
    }
    if (!tapeId) throw new Error("hx-replay needs a tape attribute");
    await ensureSprite();
    const tape = await getTape(tapeId);
    const boardId = this.getAttribute("board") ?? tape.boards[0];
    const seed = Number(this.getAttribute("seed") ?? tape.golden_seeds[0]);
    const board = await getBoard(boardId);
    const facts = await getFactsCore();
    const run = runTrial(tape, board, seed, { facts });
    const events = run.events;
    const n = events.length;
    // Readout sources, computed once: the latest desk % and cost at or before each event.
    const { desk, cost } = readoutArrays(events);
    this.model = {
      tape, board, seed, events, result: run.result, desk, cost,
      repeatMap: repeats(events), priced: pricedOn(tape, board), tapeId, boardId,
      byWire: indexByWire(events),
    };
    const start = clamp(Number(this.getAttribute("start") ?? 0) || 0, 0, Math.max(0, n - 1));
    const wire = WIRES.some((w) => w.id === this.getAttribute("wire")) ? this.getAttribute("wire") : null;
    this.state = {
      index: start,
      detail: this.getAttribute("detail") === "full" ? "full" : "story",
      wire,
      view: "friendly",
      speed: 1,
      playing: false,
      finished: false,
      announcedTurn: null,
      expanded: new Set(),
      ver: 0,
    };
    // With a filter, the playhead starts on an event of that wire (item 5).
    const onWire = this.snap(start, 0, wire);
    if (onWire >= 0) this.state.index = onWire;
    this.lastValues = {};
    this.built = null;
  }

  // ---------- derived values (pure reads of this.model and this.state) ----------

  get events() {
    return this.model.events;
  }

  visible() {
    const key = `${this.state.detail}|${this.state.wire}`;
    if (this.visCache?.key !== key) {
      this.visCache = { key, list: visibleIndexes(this.events, { detail: this.state.detail, wire: this.state.wire }) };
    }
    return this.visCache.list;
  }

  /** The visible row at or before the playhead (the one the transcript highlights), or -1. */
  rowOf(index) {
    let row = -1;
    for (const i of this.visible()) {
      if (i <= index) row = i;
      else break;
    }
    return row;
  }

  costText() {
    return costLabel(this.model.cost[this.state.index], { usd: this.model.priced, allZero: this.model.allZero === true });
  }

  // ---------- movement ----------

  move(dir) {
    const vis = this.visible();
    if (dir > 0) {
      const next = vis.find((i) => i > this.state.index);
      if (next !== undefined) this.go(next, { dir: 1 });
    } else {
      const row = this.rowOf(this.state.index);
      const prev = vis.filter((i) => i < (row >= 0 ? row : this.state.index)).pop();
      if (prev !== undefined) this.go(prev, { dir: -1 });
    }
  }

  /**
   * The event the playhead may stand on: the index itself, or with a filter the nearest event of that wire
   * (in the direction of the key when there is one). -1 when the wire has no events in this run.
   */
  snap(index, dir = 0, wire = this.state.wire) {
    if (wire === null || this.events[index]?.wire === wire) return index;
    const list = this.model.byWire.get(wire) ?? [];
    let prev;
    let next;
    for (const i of list) {
      if (i < index) prev = i;
      else if (i > index) { next = i; break; }
    }
    if (dir > 0) return next ?? prev ?? -1;
    if (dir < 0) return prev ?? next ?? -1;
    if (prev === undefined) return next ?? -1;
    if (next === undefined) return prev;
    return index - prev <= next - index ? prev : next;
  }

  go(index, { moved = true, dir = 0 } = {}) {
    const last = this.events.length - 1;
    const i = this.snap(clamp(index, 0, last), dir);
    if (i < 0) return;
    this.setState({ index: i, moved });
    if (i === last && !this.state.finished) this.finish();
  }

  finish() {
    const { status = null, passed = null, turns = null, cost = null } = this.model.result ?? {};
    this.setState({ finished: true });
    this.dispatchEvent(new CustomEvent("hx-result", {
      bubbles: true,
      detail: { source: "replay", status, passed, turns, cost },
    }));
    // D-061: watching to the end proves nothing, so the record is kept and no objective is credited.
    this.evidence("replay", { tape: this.model.tapeId, board: this.model.boardId, seed: this.model.seed, status, passed }, replayCredit());
    this.live(explain(this.events[this.events.length - 1]).text);
  }

  play() {
    if (this.state.playing || this.hasAttribute("locked")) return;
    this.setState({ playing: true });
    this.schedule();
  }

  pause() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.state.playing) this.setState({ playing: false });
  }

  schedule() {
    this.timer = setTimeout(() => {
      if (!this.state.playing) return;
      const last = this.events.length - 1;
      if (this.state.index >= last) return this.pause();
      this.move(1);
      if (this.state.index >= last) return this.pause();
      this.schedule();
    }, DELAY_MS[this.state.speed]);
  }

  disconnectedCallback() {
    clearTimeout(this.timer);
    this.resizeObserver?.disconnect();
    if (this.stepListener) document.removeEventListener("hx-step-files", this.stepListener);
    this.stepListener = null;
  }

  /** Keeps the .jsonl file each hx-step on the page last wrote, for "Use the trace from step N". */
  listenForSteps() {
    if (this.stepListener) return;
    this.stepListener = (event) => {
      const { step, files = {} } = event.detail ?? {};
      const name = Object.keys(files).find((file) => file.endsWith(".jsonl"));
      if (name === undefined) this.stepTraces.delete(step);
      else this.stepTraces.set(step, { name, text: files[name] });
      if (this.hasAttribute("accept-trace")) this.setState({});
    };
    document.addEventListener("hx-step-files", this.stepListener);
  }

  /** Reads a trace: accepted when every line checks, else the first bad line is named. */
  async acceptTrace(text, label) {
    const schema = await loadTraceSchema();
    const { events, error } = checkTrace(text, schema);
    if (!error && events.length === 0) {
      this.traceResult = { ok: false, message: "The trace is empty: it has no lines to replay.", label };
    } else if (error) {
      this.traceResult = { ok: false, message: error.message, label };
    } else {
      this.traceResult = { ok: true, count: events.length, run: events[0].run, label };
      this.model = modelOfTrace(events);
      this.refs = null;
      this.built = null;
      // A trace has no Wire view: the deck opens on the Friendly view, and the Wire choice stays off.
      this.state = { ...this.state, index: 0, playing: false, finished: false, announcedTurn: null, expanded: new Set(), view: "friendly" };
      this.lastValues = {};
    }
    this.setState({});
  }

  /** The picker: a file input, the trace of each step on the page, and what the last read said. */
  renderTrace() {
    if (!this.traceBox) {
      const file = el("input", { type: "file", accept: ".jsonl,application/x-ndjson", "data-key": "trace-file", "aria-label": "Your trace file (.jsonl)" });
      file.addEventListener("change", async () => {
        const chosen = file.files?.[0];
        if (chosen) await this.acceptTrace(await chosen.text(), chosen.name);
      });
      this.traceFile = file;
      this.traceSteps = el("div", { class: "trace-steps" });
      this.traceStatus = el("p", { class: "trace-status", "aria-live": "polite" });
      this.traceBox = el("section", { class: "trace-open", "aria-label": "Open a trace" },
        el("h4", { class: "trace-title", text: "Open a trace" }),
        el("p", { class: "trace-line", text: "The trace never leaves this page: it is read here and sent nowhere." }),
        el("label", { class: "trace-pick" }, el("span", { text: "Your trace (a .jsonl file)" }), file),
        this.traceSteps, this.traceStatus);
    }
    this.traceSteps.replaceChildren(...[...this.stepTraces].map(([step, saved]) => {
      const use = el("button", { class: "key", type: "button", "data-key": `use-trace-${step}`, text: `Use the trace from step ${step}` });
      use.addEventListener("click", () => this.acceptTrace(saved.text, saved.name));
      return use;
    }));
    // Without a model the picker is the whole component; with one, build() places it above the deck.
    if (!this.model && this.traceBox.parentNode !== this.ui) this.ui.replaceChildren(this.traceBox);
    const result = this.traceResult;
    if (!result) {
      this.traceStatus.textContent = "";
    } else if (result.ok) {
      this.traceStatus.replaceChildren(glyph("check"), ` ${result.label}: ${result.count} events from run ${result.run}.`);
      this.traceStatus.className = "trace-status is-pass";
    } else {
      this.traceStatus.replaceChildren(glyph("cross"), ` ${result.label}: ${result.message}`);
      this.traceStatus.className = "trace-status is-fail";
    }
  }

  attributeChanged(name) {
    if (name === "tape" || name === "board" || name === "seed") {
      this.pause();
      this.reload();
      return;
    }
    if (name === "detail") this.setState({ detail: this.getAttribute("detail") === "full" ? "full" : "story" });
    else if (name === "wire") this.setState({ wire: this.getAttribute("wire") });
    else if (name === "locked" && this.hasAttribute("locked")) this.pause();
    else this.setState({});
  }

  async reload() {
    await this.setup();
    this.built = null;
    this.render();
  }

  // ---------- UI (built once, then updated by render) ----------

  build() {
    const r = {};
    r.bar = el("p", { class: "bar", "aria-hidden": "true" });
    r.readouts = el("div", { class: "readouts" });
    r.readoutValues = {};
    for (const [name, label] of [["turn", "Turn"], ["desk", "Window used"], ["cost", "Cost"]]) {
      const value = el("p", { class: "readout-value", "data-readout": name });
      r.readoutValues[name] = value;
      r.readouts.append(el("div", { class: "readout" }, el("p", { class: "readout-label", text: label }), value));
    }
    r.gate = el("p", { class: "gate", text: "Make your prediction above to unlock the run." });
    const lanes = laneStrip({ events: this.events, labels: true, onWire: (id) => this.toggleWire(id) });
    r.strip = lanes.strip;
    r.labelsCol = lanes.labelsCol;
    r.strip.classList.add("scrub-strip");
    r.strip.tabIndex = 0;
    r.strip.setAttribute("role", "slider");
    r.strip.setAttribute("aria-label", "Run position");
    r.strip.setAttribute("aria-valuemin", "0");
    r.strip.setAttribute("aria-valuemax", String(this.events.length - 1));
    r.strip.addEventListener("keydown", (e) => this.onScrubKey(e));
    r.strip.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      r.strip.setPointerCapture?.(e.pointerId);
      this.go(nearestIndex(r.strip, e.clientX, this.events.length));
    });
    r.strip.addEventListener("pointermove", (e) => {
      if (this.dragging) this.go(nearestIndex(r.strip, e.clientX, this.events.length));
    });
    const stop = () => { this.dragging = false; };
    r.strip.addEventListener("pointerup", stop);
    r.strip.addEventListener("pointercancel", stop);
    r.minus = el("button", { class: "key key-icon", type: "button", "data-key": "minus", "aria-label": "Back one event", text: "−" });
    r.plus = el("button", { class: "key key-icon", type: "button", "data-key": "plus", "aria-label": "Forward one event", text: "+" });
    r.minus.addEventListener("click", () => this.go(this.state.index - 1));
    r.plus.addEventListener("click", () => this.go(this.state.index + 1));
    r.scrubRow = el("div", { class: "scrub-row" }, r.minus, lanes, r.plus);
    // Phones: one native select labelled "Wire" (BP-1.4 notes, item 2). Desktop uses the lane labels.
    r.wireSelect = el("select", { class: "wire-select-input", "data-key": "wire-select" }, el("option", { value: "", text: "All wires" }),
      ...WIRES.map((w) => el("option", { value: w.id, text: w.name })));
    r.wireSelect.addEventListener("change", () => this.setWire(r.wireSelect.value || null));
    r.wireLabel = el("label", { class: "wire-select" }, el("span", { text: "Wire" }), r.wireSelect);
    r.filterLine = el("p", { class: "filter-state", "aria-live": "off" });
    r.showAll = el("button", { class: "btn btn-quiet", type: "button", "data-key": "show-all", text: "Show all" });
    r.showAll.addEventListener("click", () => this.toggleWire(null));
    r.transcriptWrap = el("div", { class: "transcript-wrap", tabindex: "0", role: "region", "aria-label": "Transcript" });
    r.empty = el("p", { class: "empty", text: "Nothing on this wire in this run." });
    r.viewFriendly = el("button", { type: "button", "data-key": "view-friendly", "aria-pressed": "true", text: "Friendly" });
    r.viewWire = el("button", { type: "button", "data-key": "view-wire", "aria-pressed": "false", text: "Wire" });
    r.viewFriendly.addEventListener("click", () => this.setState({ view: "friendly" }));
    r.viewWire.addEventListener("click", () => this.setState({ view: "wire" }));
    r.detail = el("div", { class: "detail" }, el("div", { class: "seg view-seg", role: "group", "aria-label": "Event detail" }, r.viewFriendly, r.viewWire), el("p", { class: "sentence" }), el("pre", { class: "wire-json", hidden: true }));
    r.back = el("button", { class: "key", type: "button", "data-key": "back", text: "Back" });
    r.step = el("button", { class: "key key-primary", type: "button", "data-key": "step", text: "Step" });
    r.play = el("button", { class: "key", type: "button", "data-key": "play", text: "Play" });
    r.back.addEventListener("click", () => this.move(-1));
    r.step.addEventListener("click", () => this.move(1));
    r.play.addEventListener("click", () => (this.state.playing ? this.pause() : this.play()));
    r.speedButtons = new Map();
    const speeds = el("div", { class: "seg speed", role: "group", "aria-label": "Playback speed" });
    for (const s of [1, 2, 4]) {
      const b = el("button", { type: "button", "data-key": `speed-${s}`, "aria-pressed": "false", text: `${s}×` });
      b.addEventListener("click", () => this.setState({ speed: s }));
      r.speedButtons.set(s, b);
      speeds.append(b);
    }
    r.counter = el("span", { class: "counter", "aria-hidden": "true" });
    r.counterSr = el("span", { class: "sr-only" });
    r.transport = el("div", { class: "transport", role: "group", "aria-label": "Replay controls" },
      el("div", { class: "transport-row" }, r.back, r.step, r.play),
      el("div", { class: "transport-row" }, speeds, el("span", { class: "counter-wrap" }, r.counter, r.counterSr)));
    r.transcriptRegion = el("div", { class: "transcript-area" }, r.transcriptWrap, r.empty, r.detail);
    r.traceNote = el("p", { class: "trace-note", text: "The Wire view needs a tape: a trace has no payloads for it, so the Wire view is off." });
    this.refs = r;
    // Row offsets are read once per transcript build and again after a resize (not on every step).
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => { this.offsets = null; fitAxis(r.strip); });
    this.resizeObserver.observe(r.transcriptWrap);
    this.resizeObserver.observe(r.strip);
    this.ui.replaceChildren(
      ...(this.traceBox ? [this.traceBox] : []),
      el("div", { class: "replay" },
        r.bar,
        r.readouts,
        r.gate,
        r.scrubRow,
        el("p", { class: "strip-caption" }, el("span", { class: "cap-phone", text: "Tap or drag to jump" }), el("span", { class: "cap-desk", text: "Click or drag to jump. Arrow keys step." })),
        el("div", { class: "filter-bar" }, r.wireLabel, el("p", { class: "filter-line" }, r.filterLine, " ", r.showAll)),
        r.transcriptRegion,
        r.traceNote,
        r.transport),
    );
  }

  buildTranscript() {
    const { refs } = this;
    const s = this.state;
    this.offsets = null;
    const list = transcriptList({
      events: this.events,
      detail: s.detail,
      wire: s.wire,
      expanded: s.expanded,
      repeatMap: this.model.repeatMap,
      callouts: true,
      onExpand: (i) => this.toggleExpand(i),
    });
    refs.list = list;
    refs.transcriptWrap.replaceChildren(list);
  }

  toggleExpand(index) {
    const next = new Set(this.state.expanded);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    this.setState({ expanded: next, ver: this.state.ver + 1 });
  }

  toggleWire(id) {
    this.setWire(this.state.wire === id ? null : id);
  }

  /** Sets the wire filter, and moves the playhead to the nearest event of that wire (item 5). */
  setWire(id) {
    const wire = id ?? null;
    const index = wire === null ? this.state.index : this.snap(this.state.index, 0, wire);
    this.setState({ wire, index: index >= 0 ? index : this.state.index });
  }

  onScrubKey(e) {
    const last = this.events.length - 1;
    const map = {
      ArrowRight: () => this.state.index + 1, ArrowUp: () => this.state.index + 1,
      ArrowLeft: () => this.state.index - 1, ArrowDown: () => this.state.index - 1,
      PageUp: () => this.state.index + 10, PageDown: () => this.state.index - 10,
      Home: () => 0, End: () => last,
    };
    const next = map[e.key];
    if (!next) return;
    e.preventDefault();
    this.go(next());
  }

  // ---------- render ----------

  render() {
    if (this.hasAttribute("accept-trace")) this.renderTrace();
    if (!this.model) return;
    if (!this.refs) {
      this.build();
      fitAxis(this.refs.strip);
    }
    const { refs: r, state: s, model: m } = this;
    const events = this.events;
    const last = events.length - 1;
    const i = s.index;
    const turn = events[i].turn;
    const locked = this.hasAttribute("locked");

    if (locked && s.playing) this.pause();
    const key = `${s.detail}|${s.wire}|${s.ver}`;
    if (this.built !== key) {
      this.buildTranscript();
      this.built = key;
    }
    const row = this.rowOf(i);
    setCurrentRow(r.list, row);
    this.scrollToRow(row);
    setPlayhead(r.strip, i);
    r.empty.hidden = this.visible().length > 0;

    // A trace with no run_end line has no turn total: the turns are shown without one.
    const total = m.result ? m.result.turns : "?";
    r.bar.textContent = `Turn ${turn}/${total} · Window ${m.desk[i]}% · ${this.costText()}`;
    r.readoutValues.turn.textContent = `${turn} / ${total}`;
    r.readoutValues.desk.textContent = `${m.desk[i]}%`;
    r.readoutValues.cost.textContent = this.costText();
    r.gate.hidden = !locked;
    r.gate.dataset.visible = locked ? "true" : "false";

    r.strip.setAttribute("aria-valuenow", String(i));
    r.strip.setAttribute("aria-valuetext", `Event ${i + 1} of ${events.length}, turn ${turn}: ${explain(events[i]).text}`);
    r.strip.setAttribute("aria-disabled", locked ? "true" : "false");
    r.strip.tabIndex = locked ? -1 : 0;
    r.minus.disabled = locked;
    r.plus.disabled = locked;
    for (const b of [r.back, r.step, r.play, ...r.speedButtons.values()]) b.disabled = locked;
    r.play.textContent = s.playing ? "Pause" : "Play";
    for (const [sp, b] of r.speedButtons) b.setAttribute("aria-pressed", String(sp === s.speed));
    const counterText = `${i + 1} / ${events.length}`;
    r.counter.textContent = counterText;
    r.counterSr.textContent = `Event ${i + 1} of ${events.length}`;

    r.wireSelect.value = s.wire ?? "";
    r.strip.classList.toggle("has-filter", s.wire !== null);
    for (const [id, lane] of r.strip.lanes) lane.classList.toggle("is-off", s.wire !== null && s.wire !== id);
    r.labelsCol.querySelectorAll("button.lane-label").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.wire === s.wire)));
    const shown = WIRES.find((w) => w.id === s.wire);
    r.filterLine.textContent = shown ? `Showing: ${shown.short} only` : "Showing: all eight wires.";
    r.showAll.hidden = !shown;

    r.viewFriendly.setAttribute("aria-pressed", String(s.view === "friendly"));
    r.viewWire.setAttribute("aria-pressed", String(s.view === "wire"));
    // A trace has no tape, so its Wire view has no payloads: the view is off and says why.
    r.viewWire.disabled = !this.model.tapeId;
    r.viewWire.setAttribute("aria-disabled", String(!this.model.tapeId));
    r.traceNote.hidden = Boolean(this.model.tapeId);
    const sentence = r.detail.querySelector(".sentence");
    const json = r.detail.querySelector(".wire-json");
    sentence.hidden = s.view !== "friendly";
    json.hidden = s.view !== "wire";
    // Friendly: the inline callout already has the sentence, so the detail adds the time and the wire.
    const wireShort = WIRES.find((w) => w.id === events[i].wire)?.short ?? events[i].wire;
    sentence.textContent = s.wire !== null && events[i].wire !== s.wire
      ? `No ${shown.short} events in this run.`
      : `t = ${formatMs(events[i].t)} · ${wireShort}`;
    json.textContent = sortedJson(events[i]);

    if (s.moved) {
      if (turn !== s.announcedTurn) {
        this.live(turnSummary(events, turn, m.result ? m.result.turns : turn));
        s.announcedTurn = turn;
      }
      s.moved = false;
    }
    this.publishValues({ seq: i, turn });
  }

  /** The row of an event in the transcript is kept in view by moving the transcript's own scroll. */
  scrollToRow(row) {
    const wrap = this.refs.transcriptWrap;
    const list = this.refs.list;
    if (!list || !wrap || row < 0) return;
    if (!this.offsets) {
      this.offsets = new Map([...list.rowsByIndex].map(([i, li]) => [i, [li.offsetTop, li.offsetHeight]]));
    }
    const [top, height] = this.offsets.get(row) ?? [0, 0];
    const bottom = top + height;
    if (top < wrap.scrollTop) wrap.scrollTop = top;
    else if (bottom > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = bottom - wrap.clientHeight;
  }

  publishValues(values) {
    for (const [name, value] of Object.entries(values)) {
      if (this.lastValues[name] === value) continue;
      this.lastValues[name] = value;
      this.dispatchEvent(new CustomEvent("hx-change", { bubbles: true, detail: { name, value } }));
    }
  }

  // ---------- values (COMPONENTS §10): read-only ----------

  hxValue(name) {
    if (!this.model) return null;
    if (name === "seq") return this.state.index;
    if (name === "turn") return this.events[this.state.index].turn;
    return null;
  }

  hxSetValue() {
    // read-only: the replay's position is driven by its own controls
  }

  hxRange() {
    return null;
  }

  // ---------- self test (COMPONENTS §7): drives the real UI ----------

  /**
   * A deck with no tape. A line that is not JSON is refused and named, and no model is made from it. A one-line trace
   * (its run_start) is accepted: its cost reads "0", no readout or bar is cut at this width, and the Wire view is off.
   * Then the picker is put back on its own.
   */
  async selfTestTrace() {
    const saved = this.traceResult;
    await this.acceptTrace("{not json\n", "self-test");
    const named = this.traceResult?.ok === false && String(this.traceResult.message).startsWith("line 1: not JSON");
    const picker = Boolean(this.traceBox?.isConnected && this.traceBox.querySelector('input[type="file"]'));
    const noModel = this.model === null;
    await this.acceptTrace(SELF_TEST_TRACE, "self-test");
    const refs = this.refs;
    const cut = [...this.ui.querySelectorAll(".readout-value, .bar")].filter((node) => node.scrollWidth > node.clientWidth + 1);
    const costZero = refs?.readoutValues?.cost?.textContent === "0";
    const wireOff = Boolean(refs?.viewWire?.disabled && refs.viewWire.getAttribute("aria-disabled") === "true");
    const accepted = this.model !== null;
    this.model = null;
    this.refs = null;
    this.built = null;
    this.traceResult = saved;
    this.ui.replaceChildren(this.traceBox);
    this.setState({});
    return named && picker && noModel && accepted && cut.length === 0 && costZero && wireOff;
  }

  async selfTest() {
    if (!this.model && this.hasAttribute("accept-trace")) return this.selfTestTrace();
    const r = this.refs;
    if (this.hasAttribute("locked")) {
      // A locked replay can't be stepped: the test checks that the lock holds (DESIGN §7.3, COMPONENTS §10).
      return r.step.disabled && r.strip.getAttribute("aria-disabled") === "true" && !r.gate.hidden;
    }
    // The check walks the whole run, so it clears any wire filter and restores it after: with a filter, End
    // stops on the last event of that wire, and the run's result only fires at the true end.
    const wire = this.state.wire;
    this.setWire(null);
    this.state.finished = false;
    this.go(0);
    const start = this.state.index;
    for (let k = 0; k < 3; k += 1) r.step.click();
    const moved = this.state.index > start;
    const readoutOk = r.readoutValues.turn.textContent.startsWith(`${this.events[this.state.index].turn} /`);
    const counterOk = r.counter.textContent === `${this.state.index + 1} / ${this.events.length}`;
    let fired = null;
    const onResult = (e) => { fired = e.detail; };
    this.addEventListener("hx-result", onResult);
    r.strip.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    this.removeEventListener("hx-result", onResult);
    const last = this.events[this.events.length - 1];
    const liveOk = this.liveRegion.textContent === explain(last).text;
    const ok = moved && readoutOk && counterOk && fired?.source === "replay" && this.state.index === this.events.length - 1 && liveOk;
    this.setWire(wire);
    return ok;
  }
}

customElements.define("hx-replay", HxReplay);
