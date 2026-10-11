// hx-dice (BP-3.1 §4, A7 and D2): pass@k and pass^k. Each try works with probability p. pass@k = 1 - (1 - p)^k is
// "at least one of k tries works"; pass^k = p^k is "all k tries work". Roll draws tasks of k tries with the PRNG.
//   <hx-dice p="90" k="3" tasks="20" seed="1"></hx-dice>
// Values: p (50 to 99, settable with hxRange), k (1 to 10, settable with hxRange), pass_at_k and pass_hat_k (percent,
// read-only, the formulas).
import { HxElement } from "./lib/hx-element.js";
import { createPrng } from "../sim/prng.js";
import { formatInt, plural } from "./lib/format.js";

const P = { min: 50, max: 99, step: 1 };
const K = { min: 1, max: 10, step: 1 };
const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";

/** pass@k and pass^k as fractions, from p as a percent and k. */
export function formulas(p, k) {
  const q = p / 100;
  return { atLeastOne: 1 - (1 - q) ** k, all: q ** k };
}

/** One roll: `tasks` rows of `k` tries; a try works when a draw below p (percent) lands. */
export function roll(prng, p, k, tasks) {
  const rows = [];
  for (let t = 0; t < tasks; t += 1) {
    const outcomes = [];
    for (let i = 0; i < k; i += 1) outcomes.push(prng.percent() < p);
    rows.push(outcomes);
  }
  return rows;
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

export class HxDice extends HxElement {
  static observedAttributes = ["p", "k", "tasks", "seed"];
  static styles = new URL("./hx-dice.css", import.meta.url).href;

  intAttr(name, fallback, min, max) {
    const raw = this.getAttribute(name);
    if (raw === null) return fallback;
    if (!/^-?\d+$/.test(raw.trim())) throw new Error(`hx-dice: ${name} must be an integer`);
    const value = Number(raw);
    if (value < min || value > max) throw new Error(`hx-dice: ${name} must be ${min} to ${max}`);
    return value;
  }

  setup() {
    const seed = this.intAttr("seed", 1, 0, 2147483647);
    this.state = {
      p: this.intAttr("p", 90, P.min, P.max),
      k: this.intAttr("k", 3, K.min, K.max),
      tasks: this.intAttr("tasks", 20, 1, 50),
      seed,
      prng: createPrng(seed),
      rows: null,
    };
  }

  hxValue(name) {
    const f = formulas(this.state.p, this.state.k);
    if (name === "p") return this.state.p;
    if (name === "k") return this.state.k;
    if (name === "pass_at_k") return Math.round(f.atLeastOne * 100);
    if (name === "pass_hat_k") return Math.round(f.all * 100);
    return null;
  }

  hxSetValue(name, value) {
    if (name === "p" && Number.isInteger(value)) this.setValue("p", P, value);
    if (name === "k" && Number.isInteger(value)) this.setValue("k", K, value);
  }

  hxRange(name) {
    if (name === "p") return { ...P };
    if (name === "k") return { ...K };
    return null;
  }

  setValue(name, range, value) {
    const next = Math.min(range.max, Math.max(range.min, value));
    if (next === this.state[name]) return;
    this.setState({ [name]: next });
    this.dispatchEvent(new CustomEvent("hx-change", { bubbles: true, detail: { name, value: next } }));
  }

  rollNow() {
    const { p, k, tasks, prng } = this.state;
    this.setState({ rows: roll(prng, p, k, tasks) });
  }

  newSeed() {
    const seed = this.state.seed + 1;
    this.setState({ seed, prng: createPrng(seed), rows: null });
  }

  build() {
    const dom = {};
    this.dom = dom;
    const slider = (name, range, label) => {
      const input = el("input", { type: "range", min: range.min, max: range.max, step: range.step, "aria-label": label, "data-key": name });
      input.addEventListener("input", () => this.setValue(name, range, Number(input.value)));
      const minus = el("button", { class: "key key-icon", type: "button", "aria-label": `Lower ${label}`, "data-key": `${name}-minus`, text: "−" });
      const plus = el("button", { class: "key key-icon", type: "button", "aria-label": `Raise ${label}`, "data-key": `${name}-plus`, text: "+" });
      minus.addEventListener("click", () => this.setValue(name, range, this.state[name] - 1));
      plus.addEventListener("click", () => this.setValue(name, range, this.state[name] + 1));
      const value = el("span", { class: "readout-value" });
      return { input, minus, plus, value, node: el("div", { class: "dice-slider" },
        el("p", { class: "dice-label", text: label }),
        el("div", { class: "dice-slider-row" }, minus, input, plus, el("span", { class: "readout" }, value))) };
    };
    dom.p = slider("p", P, "Chance one try works (%)");
    dom.k = slider("k", K, "Tries per task");
    dom.pAt = el("span", { class: "readout-value" });
    dom.pAtText = el("p", { class: "dice-sentence" });
    dom.pHat = el("span", { class: "readout-value" });
    dom.pHatText = el("p", { class: "dice-sentence" });
    dom.chain = el("p", { class: "dice-chain" });
    dom.roll = el("button", { class: "key key-primary", type: "button", "data-key": "roll", text: "Roll" });
    dom.roll.addEventListener("click", () => this.rollNow());
    dom.seed = el("button", { class: "key", type: "button", "data-key": "seed", text: "New seed" });
    dom.seed.addEventListener("click", () => this.newSeed());
    dom.seedLabel = el("span", { class: "seed-label" });
    dom.observed = el("p", { class: "dice-observed" });
    dom.grid = el("ol", { class: "dice-grid", role: "list", "aria-label": "Rolled tasks" });
    dom.legend = el("p", { class: "dice-legend" }, glyph("check"), " works · ", glyph("cross"), " fails");
    this.ui.append(el("section", { class: "dice" },
      el("div", { class: "dice-sliders" }, dom.p.node, dom.k.node),
      el("div", { class: "dice-formulas" },
        el("div", { class: "readout dice-formula" },
          el("p", { class: "readout-label", text: "pass@k = 1 − (1 − p)^k" }), dom.pAt, dom.pAtText),
        el("div", { class: "readout dice-formula" },
          el("p", { class: "readout-label", text: "pass^k = p^k" }), dom.pHat, dom.pHatText)),
      dom.chain,
      el("div", { class: "dice-keys" }, dom.roll, dom.seed, dom.seedLabel),
      dom.observed,
      dom.legend,
      dom.grid,
      el("p", { class: "illustrative", text: "Illustrative numbers, not from a real model." })));
  }

  render() {
    if (!this.dom) this.build();
    const { dom, state: s } = this;
    const f = formulas(s.p, s.k);
    dom.p.input.value = String(s.p);
    dom.p.value.textContent = `${s.p}%`;
    dom.p.minus.disabled = s.p <= P.min;
    dom.p.plus.disabled = s.p >= P.max;
    dom.k.input.value = String(s.k);
    dom.k.value.textContent = String(s.k);
    dom.k.minus.disabled = s.k <= K.min;
    dom.k.plus.disabled = s.k >= K.max;
    dom.pAt.textContent = `${Math.round(f.atLeastOne * 100)}%`;
    dom.pAtText.textContent = `At least one of ${plural(s.k, "try", "tries")} works.`;
    dom.pHat.textContent = `${Math.round(f.all * 100)}%`;
    dom.pHatText.textContent = `All ${plural(s.k, "try", "tries")} work.`;
    dom.chain.textContent = `A 20-step task at ${s.p}% per step finishes cleanly ${Math.round(100 * (s.p / 100) ** 20)}% of the time.`;
    dom.seedLabel.textContent = `Seed ${formatInt(s.seed)}`;
    if (s.rows === null) {
      dom.observed.textContent = "";
      dom.grid.replaceChildren();
      dom.legend.hidden = true;
      return;
    }
    const total = s.rows.length;
    const anyWorks = s.rows.filter((r) => r.some(Boolean)).length;
    const allWork = s.rows.filter((r) => r.every(Boolean)).length;
    dom.observed.textContent = `Observed: at least one works in ${formatInt(anyWorks)} of ${formatInt(total)} tasks (${Math.round((anyWorks * 100) / total)}%); all work in ${formatInt(allWork)} (${Math.round((allWork * 100) / total)}%).`;
    dom.legend.hidden = false;
    dom.grid.replaceChildren(...s.rows.map((row, t) => el("li", { class: "dice-row" },
      el("span", { class: "dice-task", text: `Task ${formatInt(t + 1)}` }),
      el("span", { class: "dice-tries" }, ...row.map((ok, i) => {
        const die = el("span", { class: `die ${ok ? "is-ok" : "is-bad"}`, role: "img", "aria-label": `Try ${i + 1} ${ok ? "works" : "fails"}` });
        die.append(glyph(ok ? "check" : "cross"));
        return die;
      })))));
  }

  async selfTest() {
    const { dom } = this;
    const before = this.state.p;
    dom.roll.click();
    if (this.state.rows.length !== this.state.tasks) return false;
    const anyWorks = this.state.rows.filter((r) => r.some(Boolean)).length;
    if (!dom.observed.textContent.includes(`${formatInt(anyWorks)} of ${formatInt(this.state.tasks)}`)) return false;
    dom.p.plus.click();
    const formula = Math.round(formulas(before + 1, this.state.k).all * 100);
    const ok = this.state.p === before + 1 && this.hxValue("pass_hat_k") === formula && dom.pHat.textContent === `${formula}%`;
    dom.p.minus.click();
    return ok && this.state.p === before;
  }
}

customElements.define("hx-dice", HxDice);
