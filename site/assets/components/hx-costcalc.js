// hx-costcalc (BP-3.2 §3, A6, F4): cost per completed task. Every price is read from the facts registry. A model
// family has one flat price or tiers (Haiku: prompts up to a threshold, and over it); the tier is picked from the input
// tokens per call. Each price line carries its tier's fact chip, mounted on this component's own UI (as hx-check does).
// Costs are nano-units (ENGINE §8; 1 USD = 1e9 nano-units).
//   <hx-costcalc src="data/costcalc-demo.json"></hx-costcalc>
// Values: cost_per_task, cost_per_completed (read-only, nano-units).
import { HxElement } from "./lib/hx-element.js";
import { getFacts } from "./lib/data.js";
import { formatCost, formatInt, plural } from "./lib/format.js";
import { mountFacts } from "../core/shell/facts.js";

const FIELDS = {
  turns: { min: 1, max: 50, step: 1, label: "Turns per task" },
  input: { min: 0, max: 200000, step: 1000, label: "Input tokens per turn" },
  output: { min: 0, max: 20000, step: 100, label: "Output tokens per turn" },
  cache: { min: 0, max: 90, step: 5, label: "Cache hit rate (%)" },
  success: { min: 1, max: 100, step: 1, label: "Success rate (%)" },
};

/** The family of a price fact: "models.haiku-5-5-price-up-to-100k" is "haiku-5-5". */
export const familyOf = (id) => id.replace(/^models\./, "").split("-price")[0];

/** A family's label from its id: "haiku-5-5" is "Haiku 5.5". */
export function familyLabel(family) {
  const m = /^([a-z]+)-(\d+)-(\d+)$/.exec(family);
  if (!m) return family;
  return `${m[1].charAt(0).toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}`;
}

/** The priced families: each with its tiers (one for a flat price). Facts without numeric prices are left out. */
export function familiesOf(facts) {
  const groups = new Map();
  for (const id of Object.keys(facts)) {
    if (!id.startsWith("models.") || !id.includes("-price")) continue;
    const value = facts[id].value ?? {};
    if (typeof value.input_usd_per_mtok !== "number" || typeof value.output_usd_per_mtok !== "number") continue;
    const family = familyOf(id);
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family).push({ id, value });
  }
  return [...groups].map(([family, tiers]) => ({ family, label: familyLabel(family), tiers }));
}

/** The tier that prices a call with `input` tokens: the tier up to its threshold, or the tier over it. */
export function tierFor(family, input) {
  const up = family.tiers.find((t) => typeof t.value.max_prompt_tokens === "number");
  const over = family.tiers.find((t) => typeof t.value.over_prompt_tokens === "number");
  if (!up || !over) return family.tiers[0];
  return input <= up.value.max_prompt_tokens ? up : over;
}

/**
 * A price in USD per million tokens, never rounded: "$2" when whole, else at least two decimals and as many more as
 * the number needs ("$0.10", "$2.50", "$0.025").
 */
export function priceUsd(n) {
  if (Number.isInteger(n)) return `$${n}`;
  const [whole, frac = ""] = String(n).split(".");
  return `$${whole}.${frac.padEnd(2, "0")}`;
}

/** The price line for a tier: the family, the tier's range when it has one, and its prices. */
export function priceText(family, tier) {
  const v = tier.value;
  let range = "";
  if (typeof v.max_prompt_tokens === "number") range = `, prompts up to ${formatInt(v.max_prompt_tokens)} tokens`;
  else if (typeof v.over_prompt_tokens === "number") range = `, prompts over ${formatInt(v.over_prompt_tokens)} tokens`;
  return `${family.label}${range}: ${priceUsd(v.input_usd_per_mtok)} in, ${priceUsd(v.output_usd_per_mtok)} out per million tokens, ${priceUsd(v.cache_hit_usd_per_mtok)} cache hit.`;
}

/** Cost per call, per task and per completed task, in nano-units, from one configuration and one tier's prices. */
export function costs(price, cfg, efforts) {
  const h = cfg.cache / 100;
  const multiplier = efforts[cfg.effort] ?? 1;
  const inCost = cfg.input * (h * price.cache_hit_usd_per_mtok + (1 - h) * price.input_usd_per_mtok) * 1000;
  const outCost = cfg.output * multiplier * price.output_usd_per_mtok * 1000;
  const perCall = Math.round(inCost + outCost);
  const perTask = perCall * cfg.turns;
  const perCompleted = Math.round(perTask / (cfg.success / 100));
  return { perCall, perTask, perCompleted };
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

export class HxCostcalc extends HxElement {
  static observedAttributes = ["src"];
  static styles = new URL("./hx-costcalc.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    if (!src) throw new Error("hx-costcalc needs src");
    const response = await fetch(new URL(src, document.baseURI));
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
    const data = await response.json();
    if (!data.efforts || !data.defaults) throw new Error("hx-costcalc: bad data");
    this.facts = await getFacts();
    this.models = familiesOf(this.facts);
    if (this.models.length === 0) throw new Error("hx-costcalc: no priced models in the facts");
    this.data = data;
    const d = data.defaults;
    const model = this.models.some((f) => f.family === d.model) ? d.model : this.models[0].family;
    this.state = {
      model,
      effort: d.effort in data.efforts ? d.effort : Object.keys(data.efforts)[0],
      turns: d.turns, input: d.input_tokens, output: d.output_tokens, cache: d.cache_hit_percent, success: d.success_percent,
      pins: [],
    };
  }

  family() {
    return this.models.find((f) => f.family === this.state.model);
  }

  /** The family and the tier that prices the current input tokens per call. */
  priceNow() {
    const family = this.family();
    return { family, tier: tierFor(family, this.state.input) };
  }

  cfg() {
    const { model, effort, turns, input, output, cache, success } = this.state;
    return { model, effort, turns, input, output, cache, success };
  }

  current() {
    return costs(this.priceNow().tier.value, this.cfg(), this.data.efforts);
  }

  hxValue(name) {
    if (name === "cost_per_task") return this.current().perTask;
    if (name === "cost_per_completed") return this.current().perCompleted;
    return null;
  }

  hxRange() {
    return null;
  }

  setField(key, value) {
    const f = FIELDS[key];
    const next = Math.min(f.max, Math.max(f.min, value));
    if (next === this.state[key]) return;
    this.setState({ [key]: next });
  }

  pin() {
    if (this.state.pins.length >= 2) return;
    const c = this.current();
    const pin = { ...this.cfg(), cost_per_completed: c.perCompleted };
    this.setState({ pins: [...this.state.pins, pin] });
    this.evidence("costcalc", { model: this.state.model, cost_per_completed_task: c.perCompleted });
  }

  build() {
    const dom = {};
    this.dom = dom;
    dom.model = el("select", { "aria-label": "Model", "data-key": "model" });
    dom.model.addEventListener("change", () => this.setState({ model: dom.model.value }));
    dom.effort = el("select", { "aria-label": "Effort", "data-key": "effort" });
    dom.effort.addEventListener("change", () => this.setState({ effort: dom.effort.value }));
    dom.effort.replaceChildren(...Object.keys(this.data.efforts).map((name) =>
      el("option", { value: name, text: `${name} (×${this.data.efforts[name]} output)` })));
    dom.steppers = {};
    const rows = Object.entries(FIELDS).map(([key, f]) => {
      const value = el("span", { class: "readout-value" });
      const minus = el("button", { class: "key key-icon", type: "button", "aria-label": `Lower ${f.label}`, "data-key": `${key}-minus`, text: "−" });
      const plus = el("button", { class: "key key-icon", type: "button", "aria-label": `Raise ${f.label}`, "data-key": `${key}-plus`, text: "+" });
      minus.addEventListener("click", () => this.setField(key, this.state[key] - f.step));
      plus.addEventListener("click", () => this.setField(key, this.state[key] + f.step));
      dom.steppers[key] = { value, minus, plus };
      return el("div", { class: "cc-row" }, el("p", { class: "cc-label", text: f.label }),
        el("div", { class: "cc-stepper" }, minus, el("span", { class: "readout cc-readout" }, value), plus));
    });
    dom.prices = el("p", { class: "cc-prices" });
    dom.perCall = el("span", { class: "readout-value" });
    dom.perTask = el("span", { class: "readout-value" });
    dom.perCompleted = el("span", { class: "readout-value" });
    dom.pin = el("button", { class: "key key-primary", type: "button", "data-key": "pin", text: "Pin this" });
    dom.pin.addEventListener("click", () => this.pin());
    dom.pins = el("ol", { class: "cc-pins" });
    dom.compare = el("p", { class: "cc-compare" });
    dom.illustrative = el("p", { class: "cc-illustrative", text: "Illustrative numbers, not from a real model. Prices are dated facts." });
    this.ui.append(el("section", { class: "cc" },
      el("label", { class: "cc-field" }, el("span", { text: "Model" }), dom.model),
      el("label", { class: "cc-field" }, el("span", { text: "Effort" }), dom.effort),
      el("p", { class: "cc-note", text: "The course's illustration: effort multiplies output tokens." }),
      ...rows,
      dom.prices,
      el("div", { class: "cc-readouts" },
        el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Cost per call" }), dom.perCall),
        el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Cost per task" }), dom.perTask),
        el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Cost per completed task" }), dom.perCompleted)),
      el("div", { class: "cc-actions" }, dom.pin),
      dom.pins,
      dom.compare,
      dom.illustrative));
  }

  render() {
    if (!this.dom) this.build();
    const { dom, state: s } = this;
    dom.model.replaceChildren(...this.models.map((f) => el("option", { value: f.family, text: f.label })));
    dom.model.value = s.model;
    dom.effort.value = s.effort;
    for (const [key, f] of Object.entries(FIELDS)) {
      const view = dom.steppers[key];
      view.value.textContent = key === "input" || key === "output" ? formatInt(s[key]) : String(s[key]);
      view.minus.disabled = s[key] <= f.min;
      view.plus.disabled = s[key] >= f.max;
    }
    const { family, tier } = this.priceNow();
    dom.prices.replaceChildren(
      el("span", { text: `${priceText(family, tier)} ` }),
      el("span", { class: "fact", "data-fact": tier.id, text: "Prices as listed." }));
    mountFacts(this.facts, document);
    const c = this.current();
    dom.perCall.textContent = formatCost(c.perCall);
    dom.perTask.textContent = formatCost(c.perTask);
    dom.perCompleted.textContent = formatCost(c.perCompleted);
    dom.pin.setAttribute("aria-disabled", String(s.pins.length >= 2));
    dom.pins.replaceChildren(...s.pins.map((pin, i) => el("li", { class: "cc-pin" },
      `${"AB"[i]}: ${familyLabel(pin.model)}, ${pin.effort} effort, ${plural(pin.turns, "turn")} per task, ${pin.success}% success: ${formatCost(pin.cost_per_completed)} per completed task`)));
    if (s.pins.length === 2) {
      const [a, b] = s.pins;
      const pct = a.cost_per_completed === 0 ? 0 : Math.round((Math.abs(b.cost_per_completed - a.cost_per_completed) * 100) / a.cost_per_completed);
      const word = b.cost_per_completed <= a.cost_per_completed ? "less" : "more";
      dom.compare.textContent = `B costs ${formatInt(pct)}% ${word} per completed task than A.`;
    } else {
      dom.compare.textContent = "";
    }
  }

  async selfTest() {
    const { dom } = this;
    const before = this.state.turns;
    dom.steppers.turns.plus.click();
    if (this.state.turns !== before + 1) return false;
    if (this.current().perTask !== this.current().perCall * this.state.turns) return false;
    dom.pin.click();
    if (this.state.pins.length !== 1) return false;
    dom.steppers.turns.minus.click();
    this.setState({ turns: before, pins: [] });
    return this.hxValue("cost_per_task") === costs(this.priceNow().tier.value, this.cfg(), this.data.efforts).perTask;
  }
}

customElements.define("hx-costcalc", HxCostcalc);
