// hx-design: the Design Room (BP-5.1, SPEC §6.3 and Appendix D). A system-design prompt, a timer you run yourself, an
// eight-wire checklist (a toggle and a note per wire), clarifying questions, cheating risks, cost and rollout. Then the
// model answer beside the learner's text, the points as checkboxes, and a self-grade stored as evidence.
//   <hx-design src="data/design-demo.json"></hx-design>   a demo page: a .json path (COMPONENTS §11)
//   <hx-design src="B2"></hx-design>                       site/data/design/<id>.json (a module id)
// Evidence: "design" {item, ticked, total, wires_in, seconds}. The prompt's objectives are credited only at half the
// points or more (creditOf); under half, the evidence carries no objectives.
// Drafts live in the store under drafts["design:<id>"], saved as the learner types (debounced); restoring them emits
// no evidence (COMPONENTS §5). Once revealed, the canvas is read-only until Try again.
import { HxElement } from "./lib/hx-element.js";
import { getContent, getCourseCore } from "./lib/data.js";
import { formatInt } from "./lib/format.js";

export const WIRE_IDS = Object.freeze(["control", "context", "loop", "errors", "tools", "permissions", "verify", "observe"]);
const PARTS = ["risks", "cost", "rollout"];
const MINUTES = { min: 10, max: 45 };
const CLARIFY = { min: 3, max: 6 };
const POINTS = { min: 2, max: 4 };
const WORDS = { min: 40, max: 90 };
const SAVE_MS = 400;
const TICK_MS = 250;
const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";

export function wordCount(text) {
  return String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

function checkPart(part, label, id) {
  const words = wordCount(part?.answer);
  if (typeof part?.answer !== "string" || words < WORDS.min || words > WORDS.max) {
    throw new Error(`hx-design: ${id} ${label} needs an answer of ${WORDS.min} to ${WORDS.max} words (it has ${words})`);
  }
  if (!Array.isArray(part.points) || part.points.length < POINTS.min || part.points.length > POINTS.max
    || part.points.some((p) => typeof p !== "string" || p.trim() === "")) {
    throw new Error(`hx-design: ${id} ${label} needs ${POINTS.min} to ${POINTS.max} points`);
  }
}

/** Throws with the first problem in a prompt (BP-5.1: the eight wires, risks, cost, rollout, clarifying questions). */
export function checkDesign(item) {
  if (typeof item?.id !== "string") throw new Error("hx-design: a prompt has no id");
  const id = item.id;
  if (!Array.isArray(item.objectives)) throw new Error(`hx-design: ${id} needs an objectives list`);
  if (typeof item.title !== "string" || typeof item.prompt !== "string") throw new Error(`hx-design: ${id} needs a title and a prompt`);
  if (!Number.isInteger(item.minutes) || item.minutes < MINUTES.min || item.minutes > MINUTES.max) {
    throw new Error(`hx-design: ${id} needs minutes from ${MINUTES.min} to ${MINUTES.max}`);
  }
  if (!Array.isArray(item.clarify) || item.clarify.length < CLARIFY.min || item.clarify.length > CLARIFY.max
    || item.clarify.some((q) => typeof q !== "string" || q.trim() === "")) {
    throw new Error(`hx-design: ${id} needs ${CLARIFY.min} to ${CLARIFY.max} clarifying questions`);
  }
  if (!item.wires || typeof item.wires !== "object") throw new Error(`hx-design: ${id} needs a wires object`);
  for (const wire of WIRE_IDS) {
    if (!item.wires[wire]) throw new Error(`hx-design: ${id} has no answer for wire ${wire}`);
    checkPart(item.wires[wire], `wire ${wire}`, id);
  }
  const extra = Object.keys(item.wires).find((wire) => !WIRE_IDS.includes(wire));
  if (extra) throw new Error(`hx-design: ${id} has a wire that is not one of the eight: ${extra}`);
  for (const part of PARTS) checkPart(item[part], part, id);
}

/** The timer readout: m:ss. */
export function clockText(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Time is up once the prompt's minutes have passed. Nothing stops or locks. */
export const timeIsUp = (seconds, minutes) => seconds >= minutes * 60;
/** The result line; while the learner is under half (so no credit yet), it says what would count. */
export function resultLine(ticked, total, objective = null) {
  const base = `You covered ${formatInt(ticked)} of ${formatInt(total)}.`;
  return objective && ticked * 2 < total ? `${base} Cover half the points to count this answer.` : base;
}

/** Every point of a prompt counts toward the total: the clarifying questions, and the points of all eight wires and of risks, cost and rollout. */
export function pointCount(item) {
  return item.clarify.length + WIRE_IDS.reduce((n, id) => n + item.wires[id].points.length, 0)
    + PARTS.reduce((n, part) => n + item[part].points.length, 0);
}

/** Success-only credit: the prompt's objectives at half the points or more, otherwise none. */
export function creditOf(ticked, total, objectives) {
  return ticked * 2 >= total ? [...objectives] : [];
}

/** The keys of the checkboxes the reveal draws: every clarifying question, the points of wires switched on, and every part
 *  point. A wire left out has no checkboxes (its points are a plain list), so these keys plus its points make pointCount. */
export function checkboxKeys(item, draft) {
  const keys = item.clarify.map((_, i) => `clarify-${i}`);
  for (const id of WIRE_IDS) {
    if (draft.wires[id].on) keys.push(...item.wires[id].points.map((_, i) => `wire-${id}-${i}`));
  }
  for (const part of PARTS) keys.push(...item[part].points.map((_, i) => `${part}-${i}`));
  return keys;
}
export const lastLine = (last) => `Last time: ${formatInt(last.ticked)} of ${formatInt(last.total)}`;

/** The index after a move of `delta`, kept inside the prompts. */
export function stepIndex(index, delta, count) {
  return Math.min(count - 1, Math.max(0, index + delta));
}

export function blankDraft() {
  return {
    clarify: "",
    wires: Object.fromEntries(WIRE_IDS.map((wire) => [wire, { on: false, note: "" }])),
    risks: "",
    cost: "",
    rollout: "",
  };
}

/** A saved draft, when it has the shape blankDraft() gives; anything else is ignored (COMPONENTS §5). */
export function validDraft(record) {
  if (!record || typeof record !== "object" || !record.wires || typeof record.wires !== "object") return null;
  const texts = ["clarify", "risks", "cost", "rollout"].map((key) => record[key]);
  if (texts.some((text) => typeof text !== "string")) return null;
  const draft = blankDraft();
  [draft.clarify, draft.risks, draft.cost, draft.rollout] = texts;
  for (const wire of WIRE_IDS) {
    const saved = record.wires[wire];
    draft.wires[wire] = { on: saved?.on === true, note: typeof saved?.note === "string" ? saved.note : "" };
  }
  return draft;
}

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key === "text") node.textContent = value;
    else node.setAttribute(key, String(value));
  }
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
};

/** The miss mark: the shared cross glyph in the fail colour. It always comes with its word (a mark and a word, never colour alone). */
function missGlyph() {
  const icon = document.createElementNS(SVG_NS, "svg");
  icon.setAttribute("class", "glyph");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `${SPRITE}#g-cross`);
  icon.append(use);
  return icon;
}

/** A labelled text area: the visible label, the area, and the handler for each change. */
function field(label, name, onInput) {
  const area = el("textarea", { rows: "3", "data-key": `field-${name}` });
  area.addEventListener("input", () => onInput(area.value));
  const node = el("label", { class: "design-field" }, el("span", { class: "design-label", text: label }), area);
  return { area, node };
}

export class HxDesign extends HxElement {
  static observedAttributes = ["src"];
  static styles = new URL("./hx-design.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    if (!src) throw new Error("hx-design needs src");
    const [data, course] = await Promise.all([getContent("design", src), getCourseCore()]);
    const prompts = data?.prompts;
    if (!Array.isArray(prompts) || prompts.length === 0) throw new Error("hx-design: no prompts");
    prompts.forEach(checkDesign);
    if (WIRE_IDS.some((wire) => !course.wires.some((w) => w.id === wire))) throw new Error("hx-design: the course has no eight wires");
    this.items = prompts;
    this.wires = WIRE_IDS.map((id) => course.wires.find((w) => w.id === id));
    this.drafts = {};
    for (const item of prompts) this.drafts[item.id] = validDraft(this.store?.state?.drafts?.[`design:${item.id}`]) ?? blankDraft();
    this.prior = {};
    for (const entry of this.store?.state?.evidence ?? []) {
      if (entry.kind === "design" && entry.detail?.item) this.prior[entry.detail.item] = { ticked: entry.detail.ticked, total: entry.detail.total };
    }
    this.saveTimers = {};
    this.visibleKeys = [];
    this.announced = { ticked: null, total: null };
    this.state = {
      index: 0, timer: { running: false, base: 0, startedAt: 0 }, revealed: false, seconds: null,
      ticks: {}, saved: {}, cleared: {}, shown: 0,
    };
  }

  current() {
    return this.items[this.state.index];
  }

  seconds() {
    const t = this.state.timer;
    return t.base + (t.running ? Math.floor((performance.now() - t.startedAt) / 1000) : 0);
  }

  startTimer() {
    if (this.state.timer.running || this.state.revealed) return;
    this.timerHandle = setInterval(() => this.onTick(), TICK_MS);
    this.setState({ timer: { running: true, base: this.state.timer.base, startedAt: performance.now() } });
  }

  onTick() {
    const shown = this.seconds();
    if (shown !== this.state.shown) this.setState({ shown });
  }

  pauseTimer() {
    if (!this.state.timer.running) return;
    clearInterval(this.timerHandle);
    this.timerHandle = null;
    this.setState({ timer: { running: false, base: this.seconds(), startedAt: 0 } });
  }

  onTimerKey() {
    if (this.dom.timerKey.getAttribute("aria-disabled") === "true") return;
    if (this.state.timer.running) this.pauseTimer();
    else this.startTimer();
  }

  // Drafts: the text areas and toggles write the draft at once in memory, and the store a moment later.
  edit(item, mutate) {
    mutate(this.drafts[item.id]);
    this.scheduleSave(item.id);
  }

  scheduleSave(id) {
    clearTimeout(this.saveTimers[id]);
    this.saveTimers[id] = setTimeout(() => this.flush(id), SAVE_MS);
  }

  flush(id) {
    clearTimeout(this.saveTimers[id]);
    delete this.saveTimers[id];
    const record = structuredClone(this.drafts[id]);
    try {
      this.store?.update((doc) => {
        doc.drafts ??= {};
        doc.drafts[`design:${id}`] = record;
      });
    } catch {
      // A store that cannot save keeps the draft on this page; the learner can still write and reveal.
    }
  }

  toggleWire(wire) {
    if (this.state.revealed) return;
    this.edit(this.current(), (draft) => {
      draft.wires[wire].on = !draft.wires[wire].on;
    });
    this.setState({});
  }

  go(index) {
    this.pauseTimer();
    this.flush(this.current().id);
    this.setState({ index, timer: { running: false, base: 0, startedAt: 0 }, revealed: false, seconds: null, ticks: {} });
  }

  // Reveal stops the timer, records its seconds, and builds the model answers beside the learner's text.
  reveal() {
    if (this.state.revealed) return;
    const seconds = this.seconds();
    this.pauseTimer();
    this.buildReveal(this.current());
    this.setState({ revealed: true, seconds, ticks: {} });
  }

  setTick(key, on) {
    if (!this.state.revealed || this.state.saved[this.current().id]) return;
    this.setState({ ticks: { ...this.state.ticks, [key]: on } });
  }

  save() {
    const item = this.current();
    if (!this.state.revealed || this.state.saved[item.id]) return;
    const ticked = this.visibleKeys.filter((key) => this.state.ticks[key]).length;
    const total = pointCount(item);
    const wiresIn = WIRE_IDS.filter((wire) => this.drafts[item.id].wires[wire].on).length;
    const credited = creditOf(ticked, total, item.objectives);
    this.evidence("design", { item: item.id, ticked, total, wires_in: wiresIn, seconds: this.state.seconds }, credited);
    const cleared = { ...this.state.cleared };
    delete cleared[item.id];
    this.setState({ saved: { ...this.state.saved, [item.id]: { ticked, total } }, cleared });
    this.live(resultLine(ticked, total, item.objectives[0] ?? null));
  }

  // "Try again": the ticks and the reveal go, the drafts stay, and the timer starts over.
  tryAgain() {
    if (!this.state.revealed) return;
    const id = this.current().id;
    const saved = { ...this.state.saved };
    delete saved[id];
    this.setState({
      revealed: false, seconds: null, ticks: {}, saved,
      cleared: { ...this.state.cleared, [id]: true }, timer: { running: false, base: 0, startedAt: 0 },
    });
  }

  onNav(delta) {
    const button = delta < 0 ? this.dom.prev : this.dom.next;
    if (button.getAttribute("aria-disabled") === "true") return;
    this.go(stepIndex(this.state.index, delta, this.items.length));
  }

  onSave() {
    if (this.dom.save.getAttribute("aria-disabled") === "true") return;
    this.save();
  }

  // The last self-grade of this prompt: this visit's, else the one the store held when the page loaded.
  lastResult(item) {
    if (this.state.cleared[item.id]) return null;
    return this.state.saved[item.id] ?? this.prior[item.id] ?? null;
  }

  hxValue(name) {
    if (name === "total") return this.state.revealed ? pointCount(this.current()) : null;
    if (name === "ticked") return this.state.revealed ? this.visibleKeys.filter((key) => this.state.ticks[key]).length : null;
    return null;
  }

  hxSetValue() {
    // Both values are read-only.
  }

  hxRange() {
    return null;
  }

  hxLabel(name) {
    return { ticked: "Points covered", total: "Points in the answer" }[name] ?? null;
  }

  render() {
    if (!this.dom) this.build();
    const { dom, state: s } = this;
    const item = this.current();
    const draft = this.drafts[item.id];
    const n = this.items.length;
    dom.count.textContent = `${formatInt(s.index + 1)} of ${formatInt(n)}`;
    dom.prev.setAttribute("aria-disabled", String(s.index === 0));
    dom.next.setAttribute("aria-disabled", String(s.index === n - 1));
    if (dom.sig !== s.index) this.showPrompt(item, draft);
    const seconds = this.seconds();
    dom.time.textContent = clockText(seconds);
    dom.limit.hidden = !timeIsUp(seconds, item.minutes);
    dom.dot.hidden = !s.timer.running || this.reducedMotion;
    dom.timerKey.textContent = s.timer.running ? "Pause" : "Start";
    dom.timerKey.className = s.timer.running ? "key" : "key key-primary";
    dom.timerKey.setAttribute("aria-disabled", String(s.revealed));
    for (const f of dom.fields) f.area.readOnly = s.revealed;
    dom.wireRows.forEach((row) => {
      const on = draft.wires[row.wire].on;
      row.toggle.setAttribute("aria-pressed", String(on));
      row.toggle.setAttribute("aria-disabled", String(s.revealed));
      row.mark.hidden = !on;
      row.noteNode.hidden = !on;
      row.note.readOnly = s.revealed;
    });
    dom.reveal.hidden = s.revealed;
    dom.panel.hidden = !s.revealed;
    dom.save.hidden = !s.revealed;
    dom.again.hidden = !s.revealed;
    const saved = s.saved[item.id] ?? null;
    dom.save.setAttribute("aria-disabled", String(Boolean(saved)));
    for (const { key, box } of dom.boxes) {
      box.checked = Boolean(s.ticks[key]);
      box.disabled = Boolean(saved);
    }
    const last = this.lastResult(item);
    const line = saved ? resultLine(saved.ticked, saved.total, item.objectives[0] ?? null) : !s.revealed && last ? lastLine(last) : "";
    dom.result.textContent = line;
    dom.result.hidden = line === "";
    for (const name of ["ticked", "total"]) {
      const value = this.hxValue(name);
      if (value === this.announced[name]) continue;
      this.announced[name] = value;
      this.dispatchEvent(new CustomEvent("hx-change", { bubbles: true, detail: { name, value } }));
    }
  }

  // The prompt's own text, written when the prompt changes (the drafts are kept in this.drafts, not here).
  showPrompt(item, draft) {
    const { dom } = this;
    dom.sig = this.state.index;
    dom.title.textContent = item.title;
    dom.prompt.textContent = item.prompt;
    dom.minutes.textContent = `About ${formatInt(item.minutes)} minutes`;
    dom.fields.forEach((f) => { f.area.value = draft[f.key]; });
    dom.wireRows.forEach((row) => { row.note.value = draft.wires[row.wire].note; });
    dom.panel.replaceChildren();
    dom.boxes = [];
    this.visibleKeys = [];
  }

  // The reveal. A wire switched on has its points as checkboxes. A wire left out shows its model answer, "You left this
  // wire out.", and its points as a plain list, each marked "not covered" (no boxes). Every point counts toward the total.
  buildReveal(item) {
    const { dom } = this;
    const draft = this.drafts[item.id];
    dom.boxes = [];
    this.visibleKeys = [];
    const tick = (text, key) => {
      const box = el("input", { type: "checkbox", "data-key": `tick-${key}` });
      box.addEventListener("change", () => this.setTick(key, box.checked));
      dom.boxes.push({ key, box });
      this.visibleKeys.push(key);
      return el("li", {}, el("label", { class: "choice" }, box,
        el("span", { class: "choice-text" }, el("span", { class: "design-cover", text: "I covered this" }), el("span", { class: "design-point", text }))));
    };
    const points = (list, prefix) => el("ul", { class: "choices design-points" }, ...list.map((text, i) => tick(text, `${prefix}-${i}`)));
    const misses = (list) => el("ul", { class: "design-misses" }, ...list.map((text) => el("li", {},
      el("span", { class: "design-miss" }, missGlyph(), el("span", { text: "not covered" })),
      el("span", { class: "design-point", text }))));
    const pair = (label, yours, model, list, prefix) => el("section", { class: "design-pair" },
      el("h4", { class: "design-part", text: label }),
      el("div", { class: "design-cols" },
        el("div", { class: "design-yours" }, el("p", { class: "design-label", text: "Your answer" }), el("p", { class: "design-text", text: yours.trim() || "(nothing written)" })),
        el("div", { class: "design-model" }, el("p", { class: "design-label", text: "Model answer" }), el("p", { class: "design-text", text: model }))),
      points(list, prefix));
    const blocks = [el("section", { class: "design-pair" },
      el("h4", { class: "design-part", text: "Clarifying questions" }),
      el("p", { class: "design-label", text: "Your questions" }),
      el("p", { class: "design-text", text: draft.clarify.trim() || "(nothing written)" }),
      points(item.clarify, "clarify"))];
    for (const wire of this.wires) {
      const part = item.wires[wire.id];
      const row = draft.wires[wire.id];
      if (!row.on) {
        blocks.push(el("section", { class: "design-pair is-left-out" },
          el("h4", { class: "design-part", text: wire.short }),
          el("p", { class: "design-left", text: "You left this wire out." }),
          el("div", { class: "design-model" }, el("p", { class: "design-label", text: "Model answer" }), el("p", { class: "design-text", text: part.answer })),
          misses(part.points)));
      } else {
        blocks.push(pair(wire.short, row.note, part.answer, part.points, `wire-${wire.id}`));
      }
    }
    for (const part of PARTS) blocks.push(pair(part[0].toUpperCase() + part.slice(1), draft[part], item[part].answer, item[part].points, part));
    dom.panel.replaceChildren(el("h3", { class: "design-part", tabindex: "-1", "data-key": "model-answer", text: "The model answer" }), ...blocks);
  }

  build() {
    const dom = { sig: null, boxes: [], fields: [], wireRows: [] };
    this.dom = dom;
    dom.count = el("p", { class: "design-count" });
    dom.prev = el("button", { class: "key", type: "button", "data-key": "prev", text: "Previous" });
    dom.next = el("button", { class: "key", type: "button", "data-key": "next", text: "Next" });
    dom.prev.addEventListener("click", () => this.onNav(-1));
    dom.next.addEventListener("click", () => this.onNav(1));
    dom.title = el("h3", { class: "design-title" });
    dom.prompt = el("p", { class: "design-prompt" });
    dom.minutes = el("p", { class: "design-minutes" });
    dom.dot = el("span", { class: "design-dot is-pulse", hidden: "" });
    dom.time = el("span", { class: "readout-value design-time" });
    dom.readout = el("div", { class: "readout design-readout" }, dom.dot, dom.time);
    dom.limit = el("p", { class: "design-limit", text: "Time is up. Finish your thought, then reveal.", hidden: "" });
    dom.timerKey = el("button", { class: "key key-primary", type: "button", "data-key": "timer" });
    dom.timerKey.addEventListener("click", () => this.onTimerKey());
    const textField = (key, label) => {
      const f = field(label, key, (value) => this.edit(this.current(), (draft) => { draft[key] = value; }));
      dom.fields.push({ key, area: f.area });
      return f.node;
    };
    const clarify = field("What would you ask before you design?", "clarify", (value) => this.edit(this.current(), (draft) => { draft.clarify = value; }));
    dom.fields.push({ key: "clarify", area: clarify.area });
    dom.wireRows = this.wires.map((wire) => {
      const toggle = el("button", { class: "design-wire", type: "button", "data-key": `wire-${wire.id}` },
        el("span", { class: "design-wire-name", text: wire.short }),
        el("span", { class: "design-wire-question", text: wire.question }),
        el("span", { class: "design-mark", text: "in the design" }));
      toggle.addEventListener("click", () => this.toggleWire(wire.id));
      const note = field("What does this wire do in this system?", `note-${wire.id}`, (value) => this.edit(this.current(), (draft) => { draft.wires[wire.id].note = value; }));
      return { wire: wire.id, toggle, mark: toggle.querySelector(".design-mark"), note: note.area, noteNode: note.node, node: el("li", { class: "design-wire-row" }, toggle, note.node) };
    });
    dom.reveal = el("button", { class: "key key-primary", type: "button", "data-key": "reveal", "data-focus-next": "model-answer", text: "Show the model answer" });
    dom.reveal.addEventListener("click", () => this.reveal());
    dom.panel = el("div", { class: "design-reveal", hidden: "" });
    dom.save = el("button", { class: "key key-primary", type: "button", "data-key": "save", text: "Save my grade" });
    dom.save.addEventListener("click", () => this.onSave());
    dom.again = el("button", { class: "key", type: "button", "data-key": "again", "data-focus-next": "field-clarify", text: "Try again" });
    dom.again.addEventListener("click", () => this.tryAgain());
    dom.result = el("p", { class: "design-result", hidden: "" });
    this.ui.append(el("section", { class: "design" },
      el("div", { class: "design-head" }, dom.count, el("div", { class: "design-nav" }, dom.prev, dom.next)),
      el("div", { class: "design-block" }, dom.title, dom.prompt, dom.minutes),
      el("fieldset", { class: "design-set design-timer" },
        el("legend", { text: "Timer" }),
        dom.readout, dom.limit,
        el("div", { class: "design-timer-keys" }, dom.timerKey),
        el("p", { class: "design-note", text: "Start it when you are ready. Nothing stops or locks." })),
      el("fieldset", { class: "design-set" }, el("legend", { text: "Clarify" }), clarify.node),
      el("fieldset", { class: "design-set" },
        el("legend", { text: "The design: switch on each wire you use" }),
        el("ul", { class: "design-wires" }, ...dom.wireRows.map((row) => row.node))),
      el("fieldset", { class: "design-set" },
        el("legend", { text: "Failure, cost and rollout" }),
        textField("risks", "Risks: how could it cheat or fail?"),
        textField("cost", "Cost"),
        textField("rollout", "Rollout")),
      el("div", { class: "design-actions" }, dom.reveal, dom.save, dom.again),
      dom.panel,
      dom.result));
  }

  // Self-test: Start, Pause, a wire on with a note (saved to the store), reveal, two ticks, save (the line and the
  // evidence checked), then Try again, which keeps the note. The learner's draft, timer and grade are put back after
  // the check; the one evidence entry it writes stays in the store, as hx-say's does.
  async selfTest() {
    while (this.state.index > 0) this.dom.prev.click();
    if (this.state.revealed || this.state.timer.running) return false;
    const item = this.current();
    const keep = structuredClone(this.drafts[item.id]);
    const before = { saved: this.state.saved[item.id], cleared: this.state.cleared[item.id] };
    try {
      return this.exercise(item);
    } finally {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
      this.drafts[item.id] = keep;
      this.flush(item.id);
      const saved = { ...this.state.saved };
      const cleared = { ...this.state.cleared };
      if (before.saved) saved[item.id] = before.saved;
      else delete saved[item.id];
      if (before.cleared) cleared[item.id] = true;
      else delete cleared[item.id];
      this.setState({ revealed: false, seconds: null, ticks: {}, saved, cleared, timer: { running: false, base: 0, startedAt: 0 }, shown: 0 });
      this.showPrompt(item, keep);
      this.setState({});
    }
  }

  // The steps of the self-test in the learner's order; returns false at the first step that does not hold.
  exercise(item) {
    const row = this.dom.wireRows[0];
    const note = "The control wire holds the rules.";
    this.dom.timerKey.click();
    if (!this.state.timer.running) return false;
    this.dom.timerKey.click();
    if (this.state.timer.running) return false;
    row.toggle.click();
    if (!this.drafts[item.id].wires[row.wire].on) return false;
    row.note.value = note;
    row.note.dispatchEvent(new Event("input"));
    this.flush(item.id);
    if (this.store?.state?.drafts?.[`design:${item.id}`]?.wires?.[row.wire]?.note !== note) return false;
    this.dom.reveal.click();
    if (!this.state.revealed || this.dom.boxes.length < 2) return false;
    // A wire left out renders no checkbox; its points are marked "not covered"; the total is every point either way.
    const live = checkboxKeys(item, this.drafts[item.id]);
    if (this.dom.panel.querySelectorAll("input[type=checkbox]").length !== live.length) return false;
    if (this.dom.panel.querySelectorAll(".design-pair.is-left-out input").length !== 0) return false;
    if (this.dom.panel.querySelectorAll(".design-miss").length !== pointCount(item) - live.length) return false;
    if (this.hxValue("total") !== pointCount(item)) return false;
    this.dom.boxes[0].box.click();
    this.dom.boxes[1].box.click();
    if (this.hxValue("ticked") !== 2) return false;
    let heard = null;
    const listen = (event) => {
      if (event.detail?.kind === "design") heard = event.detail;
    };
    document.addEventListener("hx-evidence", listen);
    this.dom.save.click();
    document.removeEventListener("hx-evidence", listen);
    const total = this.hxValue("total");
    if (this.dom.result.textContent !== resultLine(2, total, item.objectives[0] ?? null)) return false;
    const d = heard?.detail;
    if (!d || d.item !== item.id || d.ticked !== 2 || d.total !== total || d.wires_in !== 1) return false;
    if (JSON.stringify(heard.objectives) !== JSON.stringify(creditOf(2, total, item.objectives))) return false;
    this.dom.again.click();
    return !this.state.revealed && this.dom.result.hidden && row.note.value === note;
  }

  disconnectedCallback() {
    clearInterval(this.timerHandle);
    for (const id of Object.keys(this.saveTimers ?? {})) this.flush(id);
  }
}

customElements.define("hx-design", HxDesign);
