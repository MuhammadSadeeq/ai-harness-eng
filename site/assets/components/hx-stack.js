// hx-stack (BP-3.3 §1, C1): the instruction layers a request carries, and the conflicts between them. The learner taps
// the layer they think wins; the component marks the winner and says why. "Enforce it in code" shows the lock a
// pre-tool hook gives a rule; the component does not simulate the hook.
//   <hx-stack src="data/stack-demo.json"></hx-stack>
// Evidence: "stack" on each pick, {src, conflict, right} (right: this pick named the winner).
// Values: right (picks right so far), tokens (the stack's estimate before the task); both read-only.
import { HxElement } from "./lib/hx-element.js";
import { getFactsCore } from "./lib/data.js";
import { formatInt, plural } from "./lib/format.js";
import { tokens } from "../sim/tokens.js";
import { mountFacts } from "../core/shell/facts.js";

const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const SOURCES = ["operator", "project", "user", "tool"];
let uidCount = 0;

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

const lockIcon = () => {
  const icon = document.createElementNS(SVG_NS, "svg");
  icon.setAttribute("class", "stk-lock-icon");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M5 10h14v11H5z M8 10V7a4 4 0 0 1 8 0v3h-2V7a2 2 0 0 0-4 0v3z");
  path.setAttribute("fill", "currentColor");
  icon.append(path);
  return icon;
};

/** The shape the component needs (the blueprint's src). Throws with the first problem. */
export function validStack(src) {
  if (!src || !Array.isArray(src.layers) || src.layers.length === 0) throw new Error("hx-stack: needs layers");
  if (!Array.isArray(src.conflicts) || src.conflicts.length === 0) throw new Error("hx-stack: needs conflicts");
  const ids = new Set();
  for (const layer of src.layers) {
    if (typeof layer?.id !== "string" || ids.has(layer.id)) throw new Error(`hx-stack: bad or repeated layer id ${String(layer?.id)}`);
    if (!SOURCES.includes(layer.source)) throw new Error(`hx-stack: ${layer.id} has an unknown source`);
    if (typeof layer.label !== "string" || typeof layer.text !== "string") throw new Error(`hx-stack: ${layer.id} needs a label and text`);
    ids.add(layer.id);
  }
  for (const conflict of src.conflicts) {
    if (typeof conflict?.id !== "string" || typeof conflict.question !== "string" || typeof conflict.why !== "string") {
      throw new Error("hx-stack: a conflict needs an id, a question and a why");
    }
    if (!Array.isArray(conflict.says) || conflict.says.length < 2) throw new Error(`hx-stack: ${conflict.id} needs two layers that disagree`);
    const said = new Set();
    for (const says of conflict.says) {
      if (!ids.has(says?.layer) || said.has(says.layer) || typeof says.text !== "string") throw new Error(`hx-stack: ${conflict.id} has a bad says entry`);
      said.add(says.layer);
    }
    if (!said.has(conflict.winner)) throw new Error(`hx-stack: ${conflict.id} winner is not one of its layers`);
    if (conflict.fact !== undefined && typeof conflict.fact !== "string") throw new Error(`hx-stack: ${conflict.id} has a fact that is not an id`);
  }
  if (src.note !== undefined && typeof src.note !== "string") throw new Error("hx-stack: note must be text");
  return src;
}

/** A layer's course token estimate: the simulator's rule (ENGINE §4) on its text. */
export const layerTokens = (layer) => tokens(layer.text);

/** The stack's total: the tokens in the prompt before the task. */
export const stackTokens = (layers) => layers.reduce((sum, layer) => sum + layerTokens(layer), 0);

/** Picks right so far: a conflict counts when the learner's pick is its winner. */
export function rightCount(conflicts, picks) {
  return conflicts.filter((conflict) => picks[conflict.id] === conflict.winner).length;
}

export class HxStack extends HxElement {
  static observedAttributes = ["src"];
  static styles = new URL("./hx-stack.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    if (!src) throw new Error("hx-stack needs src");
    const response = await fetch(new URL(src, document.baseURI));
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
    this.data = validStack(await response.json());
    this.srcName = src;
    this.facts = this.data.conflicts.some((conflict) => typeof conflict.fact === "string") ? await getFactsCore() : null;
    this.uid = `hxs${++uidCount}`;
    this.total = stackTokens(this.data.layers);
    this.state = { current: 0, picks: {}, enforce: {}, expanded: [] };
  }

  derive() {
    const conflict = this.data.conflicts[this.state.current];
    const pick = this.state.picks[conflict.id] ?? null;
    return {
      conflict,
      pick,
      revealed: pick !== null,
      right: pick === conflict.winner,
      enforced: this.state.enforce[conflict.id] === true,
    };
  }

  pick(layerId) {
    const conflict = this.data.conflicts[this.state.current];
    if (this.state.picks[conflict.id] !== undefined) return;
    this.setState({ picks: { ...this.state.picks, [conflict.id]: layerId } });
    this.evidence("stack", { src: this.srcName, conflict: conflict.id, right: layerId === conflict.winner });
  }

  toggleEnforce() {
    const conflict = this.data.conflicts[this.state.current];
    this.setState({ enforce: { ...this.state.enforce, [conflict.id]: this.state.enforce[conflict.id] !== true } });
  }

  toggleLayer(id) {
    const open = this.state.expanded.includes(id);
    this.setState({ expanded: open ? this.state.expanded.filter((x) => x !== id) : [...this.state.expanded, id] });
  }

  next() {
    if (this.state.current + 1 < this.data.conflicts.length) {
      this.setState({ current: this.state.current + 1 });
    } else {
      this.setState({ current: 0, picks: {} });
    }
  }

  build() {
    const dom = { layers: [] };
    this.dom = dom;
    dom.layers = this.data.layers.map((layer) => {
      const text = el("p", { class: "stk-text is-clamped", text: layer.text });
      const more = el("button", { class: "btn stk-more", type: "button", "aria-expanded": "false", "data-key": `show-${layer.id}`, text: "Show all" });
      more.addEventListener("click", () => this.toggleLayer(layer.id));
      const item = el("li", { class: "stk-layer" },
        el("div", { class: "stk-head" },
          el("h3", { class: "stk-label", text: layer.label }),
          el("p", { class: "stk-meta" },
            el("span", { text: `Source: ${layer.source}` }),
            el("span", { text: `≈ ${formatInt(layerTokens(layer))} tokens` }))),
        text, more);
      return { id: layer.id, text, more, item, overflow: false };
    });
    dom.total = el("p", { class: "stk-total", text: `≈ ${formatInt(this.total)} tokens in the prompt before the task.` });
    dom.count = el("p", { class: "stk-count" });
    dom.question = el("legend", { class: "stk-question" });
    dom.list = el("ul", { class: "choices" });
    dom.verdict = el("p", { class: "verdict" });
    dom.why = el("p", { class: "stk-why" });
    dom.switchState = el("span", { class: "stk-switch-state" });
    dom.switch = el("button", { class: "stk-switch", type: "button", role: "switch", "aria-checked": "false", "data-key": "enforce" },
      el("span", { class: "stk-track", "aria-hidden": "true" }),
      el("span", { class: "stk-switch-text", text: "Enforce it in code" }),
      dom.switchState);
    dom.switch.addEventListener("click", () => this.toggleEnforce());
    dom.next = el("button", { class: "btn btn-primary", type: "button", "data-key": "next" });
    dom.next.addEventListener("click", () => this.next());
    dom.summary = el("p", { class: "stk-summary" });
    this.ui.append(el("section", { class: "stk" },
      el("ol", { class: "stk-layers" }, ...dom.layers.map((view) => view.item)),
      dom.total,
      ...(this.data.note ? [el("p", { class: "note stk-note", text: this.data.note })] : []),
      el("div", { class: "stk-conflict" },
        dom.count,
        el("fieldset", { class: "stk-set" }, dom.question, dom.list),
        dom.verdict,
        dom.why,
        el("div", { class: "stk-actions" }, dom.switch, dom.next),
        dom.summary)));
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(this.ui);
  }

  optionRow(conflict, says, d) {
    const layer = this.data.layers.find((item) => item.id === says.layer);
    const winner = says.layer === conflict.winner;
    const mine = d.pick === says.layer;
    const input = el("input", { type: "radio", name: `${this.uid}-choice`, value: says.layer, "data-key": `pick-${says.layer}` });
    input.checked = mine;
    input.addEventListener("change", () => this.pick(says.layer));
    const mark = el("span", { class: "choice-mark" });
    if (d.revealed && winner) mark.append(glyph("check"), mine ? "Your pick, this one wins" : "This one wins");
    else if (d.revealed && mine) mark.append(glyph("cross"), "Your pick");
    const lock = el("span", { class: "stk-lock" }, lockIcon(), "Enforced by a pre-tool hook: it holds whatever the prompt says.");
    lock.hidden = !(d.revealed && winner && d.enforced);
    return el("li", {}, el("label", { class: "choice" }, input,
      el("span", { class: "choice-text" },
        el("span", { class: "stk-who", text: `${layer.label}, source: ${layer.source}` }),
        el("span", { class: "stk-says", text: `“${says.text}”` }),
        lock),
      mark));
  }

  render() {
    if (!this.dom) this.build();
    const { dom, state: s, data } = this;
    const d = this.derive();
    const conflict = d.conflict;
    const n = data.conflicts.length;
    for (const view of dom.layers) {
      const open = s.expanded.includes(view.id);
      view.text.classList.toggle("is-clamped", !open);
      view.more.textContent = open ? "Show less" : "Show all";
      view.more.setAttribute("aria-expanded", String(open));
    }
    dom.count.textContent = `Conflict ${formatInt(s.current + 1)} of ${formatInt(n)}`;
    dom.question.textContent = conflict.question;
    dom.list.replaceChildren(...conflict.says.map((says) => this.optionRow(conflict, says, d)));
    let verdict = "";
    if (d.revealed) verdict = d.right ? "You picked the winner." : "Not this one. This one wins.";
    dom.verdict.className = `verdict${verdict === "" ? "" : d.right ? " is-pass" : " is-fail"}`;
    dom.verdict.replaceChildren(...(verdict === "" ? [] : [glyph(d.right ? "check" : "cross"), verdict]));
    dom.verdict.hidden = verdict === "";
    dom.why.replaceChildren(...(d.revealed
      ? [conflict.fact ? el("span", { class: "fact", "data-fact": conflict.fact, text: conflict.why }) : conflict.why]
      : []));
    dom.why.hidden = !d.revealed;
    dom.switch.setAttribute("aria-checked", String(d.enforced));
    dom.switchState.textContent = d.enforced ? "On" : "Off";
    const last = s.current + 1 >= n;
    dom.next.textContent = last ? "Start again" : "Next conflict";
    dom.next.hidden = !d.revealed;
    const summary = d.revealed && last
      ? `No more conflicts. You picked the winner in ${formatInt(rightCount(data.conflicts, s.picks))} of ${plural(n, "conflict")}.`
      : "";
    dom.summary.textContent = summary;
    dom.summary.hidden = summary === "";
    this.live(verdict ? `${verdict} ${conflict.why}` : "");
    this.fit();
    if (this.facts) mountFacts(this.facts, document);
  }

  /** Long layer texts show two lines and a "Show all" key only when they overflow (measured after layout). */
  fit() {
    if (!this.dom) return;
    for (const view of this.dom.layers) {
      if (view.text.classList.contains("is-clamped")) {
        view.overflow = view.text.scrollHeight > view.text.clientHeight + 1;
      }
      view.more.hidden = !(view.overflow || this.state.expanded.includes(view.id));
    }
  }

  hxValue(name) {
    if (name === "right") return rightCount(this.data.conflicts, this.state.picks);
    if (name === "tokens") return this.total;
    return null;
  }

  hxRange() {
    return null;
  }

  async selfTest() {
    const saved = this.state;
    const { dom, data } = this;
    let evidence = 0;
    const count = (event) => {
      if (event.detail.kind === "stack") evidence += 1;
    };
    this.addEventListener("hx-evidence", count);
    try {
      this.setState({ current: 0, picks: {}, enforce: {}, expanded: [] });
      const conflict = data.conflicts[0];
      const choice = this.ui.querySelector(".stk-set input[type=radio]");
      choice.click();
      if (this.state.picks[conflict.id] !== choice.value) return false;
      if (evidence !== 1) return false;
      if (dom.why.hidden || dom.verdict.hidden || dom.next.hidden) return false;
      dom.switch.click();
      if (dom.switch.getAttribute("aria-checked") !== "true") return false;
      const locks = [...this.ui.querySelectorAll(".stk-lock")].filter((lock) => !lock.hidden);
      if (locks.length !== 1) return false;
      if (data.conflicts.length > 1) {
        dom.next.click();
        if (this.state.current !== 1) return false;
      }
      return true;
    } finally {
      this.removeEventListener("hx-evidence", count);
      this.setState(saved);
    }
  }
}

customElements.define("hx-stack", HxStack);
