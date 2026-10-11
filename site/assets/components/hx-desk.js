// hx-desk (BP-3.3 §3, C2 and C3): the context budget, the four levers on each item, the recall that follows from the
// fill, and compaction. The summary text is the simulator's (ENGINE A6.3, sim/compaction.js); nothing here copies it.
//   <hx-desk src="data/desk-demo.json" seed="1"></hx-desk>
// The recall curve is illustrative: the numbers come from the data, not from a real model. Evidence: "desk" on each
// Ask 20, {fill_percent, recall_percent, levers}. Values: fill_percent and recall_percent (read-only), window (settable).
import { HxElement } from "./lib/hx-element.js";
import { formatInt, plural } from "./lib/format.js";
import { createPrng } from "../sim/prng.js";
import { compactionSummary } from "../sim/compaction.js";

const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const LEVERS = [
  { key: "dont", label: "Don't load it", word: "removed" },
  { key: "shrink", label: "Shrink it", word: "capped" },
  { key: "move", label: "Move it out", word: "pointer" },
  { key: "summary", label: "Summarize it", word: "summarized" },
];
const KINDS = ["goal", "constraint", "decision", "progress", "file"];
const WINDOW_RANGE = { min: 4000, max: 200000, step: 1000 };
let uidCount = 0;

/** The tokens an item takes under a lever (null: loaded as it is). */
export function leverTokens(item, lever) {
  if (lever === null) return item.tokens;
  if (lever === "dont") return 0;
  if (lever === "shrink") return Math.ceil(item.tokens / 4);
  if (lever === "move") return item.pointer_tokens ?? 20;
  return item.summary_tokens ?? Math.ceil(item.tokens / 5);
}

/** The loaded tokens of the desk, as a share of the window (rounded). */
export function fillPercent(items, levers, window) {
  const total = items.reduce((n, item) => n + leverTokens(item, levers[item.id] ?? null), 0);
  return Math.round((100 * total) / window);
}

/** Recall at a fill: linear between the curve's points (fill_percent, recall_percent), held at the ends. */
export function recallAt(curve, fill) {
  const points = [...curve].sort((a, b) => a[0] - b[0]);
  if (fill <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (fill <= x1) return Math.round(y0 + ((fill - x0) * (y1 - y0)) / (x1 - x0));
  }
  return points[points.length - 1][1];
}

/**
 * One question about a needed item. A removed item answers wrong; a pointer answers right with one extra fetch; a
 * summarized item answers right only when a kept note covers it. A loaded item (as it is, or capped) answers right when
 * the PRNG's draw (0-99) is below the recall share at the current fill.
 */
export function answer(lever, recall, covered, draw) {
  if (lever === "dont") return { right: false, how: "not loaded" };
  if (lever === "move") return { right: true, how: "one extra fetch" };
  if (lever === "summary") return covered ? { right: true, how: "a kept note covers it" } : { right: false, how: "its note was dropped" };
  const right = draw < recall;
  return { right, how: right ? "from the context" : "lost in the long context" };
}

/** Ask the questions: they cycle over the needed items. The PRNG is drawn only for loaded items. */
export function askQuestions(items, levers, { recall, keep, notes, seed, questions }) {
  const needed = items.filter((item) => item.needed);
  const prng = createPrng(seed);
  const results = [];
  for (let q = 0; q < questions; q += 1) {
    const item = needed[q % needed.length];
    const lever = levers[item.id] ?? null;
    const covered = notes.some((note) => note.item === item.id && keep.includes(note.kind));
    const loaded = lever === null || lever === "shrink";
    const draw = loaded ? prng.percent() : 0;
    results.push({ item: item.id, label: item.label, ...answer(lever, recall, covered, draw) });
  }
  return {
    results,
    right: results.filter((r) => r.right).length,
    fetches: results.filter((r) => r.how === "one extra fetch").length,
  };
}

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

const glyph = (name) => {
  const icon = document.createElementNS(SVG_NS, "svg");
  icon.setAttribute("class", "glyph");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `${SPRITE}#g-${name}`);
  icon.append(use);
  return icon;
};

export class HxDesk extends HxElement {
  static observedAttributes = ["src", "seed"];
  static styles = new URL("./hx-desk.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    if (!src) throw new Error("hx-desk needs src");
    const response = await fetch(new URL(src, document.baseURI));
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
    const data = await response.json();
    if (!Array.isArray(data.items) || data.items.length === 0) throw new Error("hx-desk: needs items");
    if (!Array.isArray(data.recall) || data.recall.length < 2) throw new Error("hx-desk: needs a recall curve of two or more points");
    if (!Number.isInteger(data.window) || data.window < WINDOW_RANGE.min) throw new Error("hx-desk: window must be a whole number of tokens");
    for (const item of data.items) {
      if (typeof item.id !== "string" || !Number.isInteger(item.tokens) || typeof item.label !== "string") {
        throw new Error(`hx-desk: item ${String(item?.id)} needs an id, a label and whole tokens`);
      }
    }
    this.data = data;
    this.data.notes = data.notes ?? [];
    this.data.questions = data.questions ?? 20;
    this.data.turn = data.turn ?? Math.max(0, ...this.data.notes.map((n) => n.turn)) + 1;
    this.uid = `hxd${++uidCount}`;
    const seed = Number(this.getAttribute("seed") ?? 1);
    this.state = {
      window: data.window,
      seed: Number.isInteger(seed) && seed >= 1 && seed <= 999 ? seed : 1,
      levers: {},
      keep: data.keep ?? ["goal", "constraint", "decision"],
      asked: null,
      compaction: null,
    };
  }

  fill() {
    return fillPercent(this.data.items, this.state.levers, this.state.window);
  }

  recall() {
    return recallAt(this.data.recall, this.fill());
  }

  /** One lever per item: "As is" clears it; choosing a lever sets it. */
  setLever(itemId, value) {
    const levers = { ...this.state.levers };
    if (value === "as-is") delete levers[itemId];
    else levers[itemId] = value;
    this.setState({ levers });
  }

  setWindow(value) {
    const next = Math.min(WINDOW_RANGE.max, Math.max(WINDOW_RANGE.min, value));
    if (next === this.state.window) return;
    this.setState({ window: next });
    this.dispatchEvent(new CustomEvent("hx-change", { bubbles: true, detail: { name: "window", value: next } }));
  }

  ask() {
    const s = this.state;
    const asked = askQuestions(this.data.items, s.levers, {
      recall: this.recall(), keep: s.keep, notes: this.data.notes, seed: s.seed, questions: this.data.questions,
    });
    this.setState({ asked });
    this.evidence("desk", { fill_percent: this.fill(), recall_percent: this.recall(), levers: { ...s.levers } });
  }

  newSeed() {
    const seed = this.state.seed >= 999 ? 1 : this.state.seed + 1;
    this.setState({ seed });
    if (this.state.asked) this.ask();
  }

  compact() {
    this.setState({ compaction: compactionSummary(this.data.notes, this.state.keep, this.data.turn) });
  }

  toggleKeep(kind) {
    const keep = this.state.keep.includes(kind) ? this.state.keep.filter((k) => k !== kind) : [...this.state.keep, kind];
    this.setState({ keep });
  }

  build() {
    const dom = { items: [], keeps: {} };
    this.dom = dom;
    dom.bar = el("div", { class: "desk-bar", role: "img" });
    dom.fill = el("p", { class: "desk-fill" });
    dom.recall = el("p", { class: "readout-value" });
    dom.items = this.data.items.map((item, index) => {
      const number = index + 1;
      const select = el("select", { class: "desk-select", "data-key": `lever-${item.id}`, "aria-label": `Lever for ${item.label}` },
        el("option", { value: "as-is", text: "As is" }),
        ...LEVERS.map((lever) => el("option", { value: lever.key, text: lever.label })));
      select.addEventListener("change", () => this.setLever(item.id, select.value));
      const mark = el("p", { class: `desk-mark ${item.needed ? "is-needed" : "is-not-needed"}`,
        text: item.needed ? "■ needed for a question" : "□ not needed" });
      const state = el("p", { class: "desk-item-state" });
      const row = el("li", { class: "desk-item" },
        el("div", { class: "desk-item-head" },
          el("span", { class: "desk-num", "aria-hidden": "true", text: String(number) }),
          el("div", { class: "desk-item-text" },
            el("p", { class: "desk-item-name", text: item.label }),
            mark)),
        el("div", { class: "desk-item-control" },
          el("label", { class: "desk-lever" }, el("span", { class: "desk-lever-label", text: "Lever" }), select),
          state));
      return { item, number, row, select, state };
    });
    dom.windowValue = el("span", { class: "readout-value" });
    const minus = el("button", { class: "key key-icon", type: "button", "aria-label": "Lower the window", "data-key": "window-minus", text: "−" });
    const plus = el("button", { class: "key key-icon", type: "button", "aria-label": "Raise the window", "data-key": "window-plus", text: "+" });
    minus.addEventListener("click", () => this.setWindow(this.state.window - WINDOW_RANGE.step));
    plus.addEventListener("click", () => this.setWindow(this.state.window + WINDOW_RANGE.step));
    dom.windowMinus = minus;
    dom.windowPlus = plus;
    dom.ask = el("button", { class: "key key-primary", type: "button", "data-key": "ask", text: "Ask 20" });
    dom.ask.addEventListener("click", () => this.ask());
    dom.newSeed = el("button", { class: "key", type: "button", "data-key": "new-seed", text: "New seed" });
    dom.newSeed.addEventListener("click", () => this.newSeed());
    dom.seed = el("span", { class: "desk-seed" });
    dom.results = el("ol", { class: "desk-results" });
    dom.summary = el("p", { class: "desk-summary-line" });
    dom.compactKey = el("button", { class: "key", type: "button", "data-key": "compact", text: "Compact now" });
    dom.compactKey.addEventListener("click", () => this.compact());
    dom.undoCompact = el("button", { class: "key", type: "button", "data-key": "undo-compact", text: "Undo compaction" });
    dom.undoCompact.addEventListener("click", () => this.setState({ compaction: null }));
    dom.kept = el("p", { class: "desk-kept" });
    dom.compacted = el("div", { class: "desk-compacted" });
    const keepBoxes = KINDS.map((kind) => {
      const box = el("input", { type: "checkbox", value: kind, "data-key": `keep-${kind}` });
      box.addEventListener("change", () => this.toggleKeep(kind));
      dom.keeps[kind] = box;
      return el("label", { class: "desk-keep" }, box, el("span", { text: kind }));
    });
    this.ui.append(el("section", { class: "desk" },
      el("figure", { class: "plate instrument desk-plate" },
        el("figcaption", { class: "fig-label", text: "The context window" }),
        dom.bar,
        dom.fill),
      el("ol", { class: "desk-items" }, ...dom.items.map((v) => v.row)),
      el("div", { class: "desk-window" },
        el("p", { class: "desk-label", text: "Window, in tokens" }),
        el("div", { class: "desk-stepper" }, minus, el("span", { class: "readout desk-readout" }, dom.windowValue), plus)),
      el("div", { class: "readout desk-recall" },
        el("p", { class: "readout-label", text: "Recall at this fill" }), dom.recall),
      el("p", { class: "desk-note", text: "Illustrative numbers, not from a real model." }),
      el("div", { class: "desk-actions" }, dom.ask, dom.newSeed, dom.seed),
      dom.summary,
      dom.results,
      el("fieldset", { class: "desk-compact" },
        el("legend", { class: "desk-label", text: "Compaction" }),
        el("div", { class: "desk-keeps" }, ...keepBoxes),
        el("div", { class: "desk-actions" }, dom.compactKey, dom.undoCompact),
        dom.kept,
        dom.compacted)));
  }

  render() {
    if (!this.dom) this.build();
    const { dom, state: s, data } = this;
    const fill = this.fill();
    const recall = this.recall();
    dom.windowValue.textContent = formatInt(s.window);
    dom.windowMinus.setAttribute("aria-disabled", String(s.window <= WINDOW_RANGE.min));
    dom.windowPlus.setAttribute("aria-disabled", String(s.window >= WINDOW_RANGE.max));
    const segments = [];
    for (const view of dom.items) {
      const lever = s.levers[view.item.id] ?? null;
      const tokens = leverTokens(view.item, lever);
      const word = lever ? LEVERS.find((l) => l.key === lever).word : "loaded";
      view.state.textContent = `${word}, ${formatInt(tokens)} tokens`;
      view.select.value = lever ?? "as-is";
      if (tokens > 0) {
        const seg = el("div", { class: `desk-seg ${view.item.needed ? "is-needed" : "is-not-needed"}`, "aria-hidden": "true" },
          el("span", { class: "desk-seg-num", text: String(view.number) }));
        seg.style.width = `${Math.min(100, (100 * tokens) / s.window)}%`;
        segments.push(seg);
      }
    }
    dom.bar.replaceChildren(...segments);
    dom.bar.setAttribute("aria-label", `Loaded context: ${fill}% of a ${formatInt(s.window)}-token window. Numbers match the list.`);
    dom.fill.textContent = `${fill}% of a ${formatInt(s.window)}-token window${fill > 100 ? ", over the window" : ""}.`;
    dom.recall.textContent = `${recall}%`;
    dom.seed.textContent = `Seed ${formatInt(s.seed)}`;
    const a = s.asked;
    dom.results.replaceChildren(...(a ? a.results.map((r, i) => el("li", { class: `desk-q ${r.right ? "is-pass" : "is-fail"}` },
      glyph(r.right ? "check" : "cross"),
      `Question ${i + 1}, ${r.label}: ${r.right ? "right" : "wrong"}, ${r.how}.`)) : []));
    dom.summary.textContent = a
      ? `${formatInt(a.right)} of ${formatInt(data.questions)} right${a.fetches > 0 ? `, with ${plural(a.fetches, "extra fetch", "extra fetches")}` : ""}.`
      : "";
    dom.summary.hidden = !a;
    for (const kind of KINDS) dom.keeps[kind].checked = s.keep.includes(kind);
    const c = s.compaction;
    if (c) {
      const kindOf = (id) => data.notes.find((n) => n.id === id)?.kind ?? "";
      dom.kept.textContent = `Kept: ${c.kept.length ? c.kept.map((id) => `${id} (${kindOf(id)})`).join(", ") : "none"}. Dropped: ${c.dropped.length ? c.dropped.map((id) => `${id} (${kindOf(id)})`).join(", ") : "none"}.`;
      dom.compacted.replaceChildren(el("p", { class: "desk-label", text: "New first message" }), el("p", { class: "desk-summary-text", text: c.text }));
    } else {
      dom.kept.textContent = "";
      dom.compacted.replaceChildren();
    }
    this.live(a ? dom.summary.textContent : "");
  }

  hxValue(name) {
    if (name === "fill_percent") return this.fill();
    if (name === "recall_percent") return this.recall();
    if (name === "window") return this.state.window;
    return null;
  }

  hxRange(name) {
    return name === "window" ? { ...WINDOW_RANGE } : null;
  }

  hxSetValue(name, value) {
    if (name === "window") this.setWindow(Math.round(value));
  }

  attributeChanged(name) {
    if (name !== "seed" || !this.data) return;
    const seed = Number(this.getAttribute("seed"));
    if (Number.isInteger(seed) && seed >= 1 && seed <= 999) {
      this.setState({ seed });
      if (this.state.asked) this.ask();
    }
  }

  async selfTest() {
    const saved = this.state;
    const { dom, data } = this;
    let evidence = 0;
    const count = (event) => {
      if (event.detail.kind === "desk") evidence += 1;
    };
    this.addEventListener("hx-evidence", count);
    try {
      this.setState({ levers: {}, asked: null, compaction: null });
      const first = data.items[0].id;
      const before = this.hxValue("fill_percent");
      const view = dom.items[0];
      view.select.value = "dont";
      view.select.dispatchEvent(new Event("change"));
      if (!(this.hxValue("fill_percent") < before)) return false;
      if (this.state.levers[first] !== "dont") return false;
      view.select.value = "as-is";
      view.select.dispatchEvent(new Event("change"));
      if (this.hxValue("fill_percent") !== before || this.state.levers[first] !== undefined) return false;
      dom.ask.click();
      if (!this.state.asked || this.state.asked.results.length !== data.questions || evidence !== 1) return false;
      dom.compactKey.click();
      if (!this.state.compaction || !this.state.compaction.text.startsWith("Summary of the work so far:")) return false;
      return true;
    } finally {
      this.removeEventListener("hx-evidence", count);
      this.restoreAfterTest(saved);
    }
  }
}

customElements.define("hx-desk", HxDesk);
