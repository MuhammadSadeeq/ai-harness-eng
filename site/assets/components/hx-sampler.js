// hx-sampler (BP-3.1 §1, A1): the next word. Each candidate's probability is softmax(logit / T); at temperature 0 the
// top candidate always wins. Every draw uses the simulator's PRNG, so a seed repeats exactly.
//   <hx-sampler src="data/sampler-demo.json" seed="1"></hx-sampler>
// Values: temperature (tenths of a unit, 0 to 20, settable with hxRange), top_probability (percent, read-only).
import { HxElement } from "./lib/hx-element.js";
import { createPrng } from "../sim/prng.js";
import { formatInt, plural } from "./lib/format.js";

const TENTHS = { min: 0, max: 20, step: 1 };
const DRAWS = 20;
const TWO32 = 4294967296;
const WRONG_LINE = "The most likely word is wrong here. Fluent is not the same as true.";

/** The index of the most likely candidate (the first one on a tie). */
export function topIndex(candidates) {
  let best = 0;
  candidates.forEach((c, i) => {
    if (c.logit > candidates[best].logit) best = i;
  });
  return best;
}

/** Probabilities at a temperature in tenths: softmax(logit / T), or the top candidate alone at 0. */
export function probabilities(candidates, tenths) {
  if (tenths === 0) return candidates.map((_, i) => (i === topIndex(candidates) ? 1 : 0));
  const T = tenths / 10;
  const scaled = candidates.map((c) => c.logit / T);
  const m = Math.max(...scaled);
  const e = scaled.map((s) => Math.exp(s - m));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / sum);
}

/** The candidate a draw u in [0, 1) lands on, given probabilities. */
export function pick(probs, u) {
  let acc = 0;
  for (let i = 0; i < probs.length; i += 1) {
    acc += probs[i];
    if (u < acc) return i;
  }
  return probs.length - 1;
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

export class HxSampler extends HxElement {
  static observedAttributes = ["src", "seed"];
  static styles = new URL("./hx-sampler.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    if (!src) throw new Error("hx-sampler needs src");
    const response = await fetch(new URL(src, document.baseURI));
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
    const data = await response.json();
    if (typeof data.prompt !== "string" || !Array.isArray(data.candidates)) throw new Error("hx-sampler: bad data");
    const n = data.candidates.length;
    if (n < 2 || n > 8) throw new Error("hx-sampler: 2 to 8 candidates");
    for (const c of data.candidates) {
      if (typeof c.text !== "string" || !Number.isFinite(c.logit)) throw new Error("hx-sampler: bad candidate");
    }
    this.data = data;
    this.seed = this.intAttr("seed", 1);
    this.state = { tenths: 10, seed: this.seed, prng: createPrng(this.seed), text: data.prompt, counts: null, last: null };
  }

  intAttr(name, fallback) {
    const raw = this.getAttribute(name);
    if (raw === null) return fallback;
    if (!/^-?\d+$/.test(raw.trim())) throw new Error(`hx-sampler: ${name} must be an integer`);
    return Number(raw);
  }

  probs() {
    return probabilities(this.data.candidates, this.state.tenths);
  }

  hxValue(name) {
    if (name === "temperature") return this.state.tenths;
    if (name === "top_probability") return Math.round(this.probs()[topIndex(this.data.candidates)] * 100);
    return null;
  }

  hxSetValue(name, value) {
    if (name === "temperature" && Number.isInteger(value)) this.setTenths(value);
  }

  hxRange(name) {
    return name === "temperature" ? { ...TENTHS } : null;
  }

  setTenths(value) {
    const next = Math.min(TENTHS.max, Math.max(TENTHS.min, value));
    if (next === this.state.tenths) return;
    this.setState({ tenths: next });
    this.dispatchEvent(new CustomEvent("hx-change", { bubbles: true, detail: { name: "temperature", value: next } }));
  }

  // Draws one word with the PRNG: appended to the prompt line.
  pickOne() {
    const { prng } = this.state;
    const index = pick(this.probs(), prng.next() / TWO32);
    const word = this.data.candidates[index].text;
    this.setState({ text: `${this.state.text} ${word}`.trim(), last: word });
    return word;
  }

  // Draws DRAWS words: counts beside the bars.
  pickMany() {
    const counts = this.data.candidates.map(() => 0);
    const probs = this.probs();
    for (let i = 0; i < DRAWS; i += 1) counts[pick(probs, this.state.prng.next() / TWO32)] += 1;
    this.setState({ counts });
  }

  newSeed() {
    const seed = this.state.seed + 1;
    this.setState({ seed, prng: createPrng(seed), text: this.data.prompt, counts: null, last: null });
  }

  build() {
    const { candidates } = this.data;
    const top = topIndex(candidates);
    const dom = { rows: [] };
    this.dom = dom;
    dom.prompt = el("p", { class: "sampler-prompt" });
    dom.range = el("input", { type: "range", min: TENTHS.min, max: TENTHS.max, step: TENTHS.step, "aria-label": "Temperature", "data-key": "temp" });
    dom.range.addEventListener("input", () => this.setTenths(Number(dom.range.value)));
    dom.minus = el("button", { class: "key key-icon", type: "button", "aria-label": "Lower temperature", "data-key": "minus", text: "−" });
    dom.plus = el("button", { class: "key key-icon", type: "button", "aria-label": "Raise temperature", "data-key": "plus", text: "+" });
    dom.minus.addEventListener("click", () => this.setTenths(this.state.tenths - 1));
    dom.plus.addEventListener("click", () => this.setTenths(this.state.tenths + 1));
    dom.tempValue = el("span", { class: "readout-value" });
    dom.zero = el("p", { class: "sampler-zero", text: "At temperature 0 the choice is always the top candidate." });
    dom.rows = candidates.map((c, i) => {
      const bar = el("span", { class: "bar-fill" });
      const row = {
        label: el("span", { class: "cand-text", text: c.text }),
        pct: el("span", { class: "cand-pct" }),
        count: el("span", { class: "cand-count", hidden: "" }),
        mark: el("span", { class: "cand-mark", text: "most likely", hidden: top !== i ? "" : null }),
        bar,
      };
      row.node = el("li", { class: "cand" },
        el("div", { class: "cand-head" }, row.label, row.mark),
        el("div", { class: "cand-line" }, el("span", { class: "bar" }, bar), row.pct, row.count));
      return row;
    });
    dom.warn = el("p", { class: "sampler-warn", text: WRONG_LINE, hidden: candidates[top].correct === false ? null : "" });
    dom.pickOne = el("button", { class: "key key-primary", type: "button", "data-key": "pick", text: "Pick a word" });
    dom.pickMany = el("button", { class: "key", type: "button", "data-key": "pickx", text: `Pick ×${DRAWS}` });
    dom.newSeed = el("button", { class: "key", type: "button", "data-key": "seed", text: "New seed" });
    dom.pickOne.addEventListener("click", () => this.pickOne());
    dom.pickMany.addEventListener("click", () => this.pickMany());
    dom.newSeed.addEventListener("click", () => this.newSeed());
    dom.seedLabel = el("span", { class: "seed-label" });
    dom.live = el("p", { class: "sampler-last" });
    this.ui.append(el("section", { class: "sampler" },
      el("p", { class: "fig-label", text: "Next word" }),
      dom.prompt,
      el("div", { class: "sampler-temp" },
        el("p", { class: "sampler-label", text: "Temperature" }),
        el("div", { class: "sampler-temp-row" }, dom.minus, dom.range, dom.plus, el("span", { class: "readout" }, dom.tempValue))),
      dom.zero,
      el("ol", { class: "cands", role: "list" }, ...dom.rows.map((r) => r.node)),
      dom.warn,
      el("p", { class: "illustrative", text: "Illustrative numbers, not from a real model." }),
      el("div", { class: "sampler-keys" }, dom.pickOne, dom.pickMany, dom.newSeed, dom.seedLabel),
      dom.live));
  }

  render() {
    if (!this.dom) this.build();
    const { dom, state: s } = this;
    const probs = this.probs();
    const top = topIndex(this.data.candidates);
    dom.prompt.textContent = s.text;
    dom.range.value = String(s.tenths);
    dom.minus.disabled = s.tenths <= TENTHS.min;
    dom.plus.disabled = s.tenths >= TENTHS.max;
    dom.tempValue.textContent = (s.tenths / 10).toFixed(1);
    dom.zero.hidden = s.tenths !== 0;
    dom.rows.forEach((row, i) => {
      const pct = Math.round(probs[i] * 100);
      row.bar.style.width = `${probs[i] * 100}%`;
      row.pct.textContent = `${pct}%`;
      row.node.classList.toggle("is-top", i === top);
      row.count.hidden = s.counts === null;
      row.count.textContent = s.counts ? plural(s.counts[i], "pick") : "";
    });
    dom.seedLabel.textContent = `Seed ${formatInt(s.seed)}`;
    dom.live.textContent = s.last ? `Picked "${s.last}".` : "";
    this.live(s.last ? `Picked "${s.last}".` : "");
  }

  async selfTest() {
    const { dom, data } = this;
    dom.range.value = "0";
    dom.range.dispatchEvent(new Event("input"));
    if (this.state.tenths !== 0 || dom.zero.hidden) return false;
    dom.pickMany.click();
    const idx = topIndex(data.candidates);
    if (this.state.counts[idx] !== DRAWS) return false;
    dom.plus.click();
    if (this.state.tenths !== 1) return false;
    const before = this.state.text;
    dom.pickOne.click();
    return this.state.text !== before && this.state.text.endsWith(this.state.last) && data.candidates.length > 0;
  }
}

customElements.define("hx-sampler", HxSampler);
