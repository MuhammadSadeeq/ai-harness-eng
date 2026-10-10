// hx-workbench (BP-3.2 §2, B1, C7): a tool is a user interface for a model. The learner edits a tool's name,
// description and schema; each course rule that holds lowers the scripted model's misuse rate. Run ×20 runs a bench
// whose tape branches on that rate (the rate is written into a copy of the tape's first branch step).
//   <hx-workbench src="data/workbench-demo.json"></hx-workbench>
// Values: misuse_percent (read-only), rules_held (read-only).
import { HxElement } from "./lib/hx-element.js";
import { getTape, getBoard, getFactsCore } from "./lib/data.js";
import { runBench } from "../sim/index.js";
import { summarize } from "./lib/stats.js";
import { plural } from "./lib/format.js";

const N = 20;
const FLOOR = 2;
const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const DISCLAIMER = "The scripted model misuses a tool more when its definition breaks these rules. The rates are the course's model, not a measurement.";

/** Whether one course rule holds for a tool definition. */
export function ruleHolds(test, tool) {
  if (test.kind === "contains") {
    return String(tool[test.field] ?? "").toLowerCase().includes(String(test.text).toLowerCase());
  }
  if (test.kind === "min_length") return String(tool[test.field] ?? "").length >= test.length;
  if (test.kind === "has_description_for_every_property") {
    const props = tool.schema?.properties;
    if (!props || typeof props !== "object") return false;
    const names = Object.keys(props);
    return names.length > 0 && names.every((n) => typeof props[n]?.description === "string" && props[n].description.trim() !== "");
  }
  return false;
}

/** The misuse rate: the base minus the weights of the rules that hold, never below the floor. */
export function misuseOf(base, rules, tool) {
  let held = 0;
  let weight = 0;
  for (const rule of rules) {
    if (ruleHolds(rule.test, tool)) {
      held += 1;
      weight += rule.weight;
    }
  }
  return { percent: Math.max(FLOOR, base - weight), held };
}

/** The target of a JSON pointer (RFC 6901) in `root`. Throws when the pointer does not resolve. */
export function resolvePointer(root, pointer) {
  if (typeof pointer !== "string" || (pointer !== "" && !pointer.startsWith("/"))) throw new Error(`hx-workbench: bad pointer ${pointer}`);
  let node = root;
  for (const raw of pointer.split("/").slice(1)) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (node === null || typeof node !== "object" || !(key in node)) throw new Error(`hx-workbench: ${pointer} is not in the tape`);
    node = node[key];
  }
  return node;
}

/**
 * A copy of the tape in which the branch step at `pointer` gives `percent` to `option`. The remainder goes to the
 * other options in proportion to their own percents (largest remainders first, so the total is exactly 100).
 */
export function writeMisuse(tape, pointer, option, percent) {
  const copy = JSON.parse(JSON.stringify(tape));
  const step = resolvePointer(copy, pointer);
  if (!step || !Array.isArray(step.branch) || step.branch.length < 2) throw new Error(`hx-workbench: ${pointer} is not a branch step`);
  if (!Number.isInteger(option) || option < 0 || option >= step.branch.length) throw new Error(`hx-workbench: option ${option} is not in ${pointer}`);
  const others = step.branch.map((_, k) => k).filter((k) => k !== option);
  const rest = 100 - percent;
  const weights = others.map((k) => step.branch[k].percent);
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = others.map((_, i) => (sum > 0 ? (weights[i] * rest) / sum : rest / others.length));
  const floors = exact.map(Math.floor);
  let leftover = rest - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((_, i) => i).sort((a, b) => (exact[b] - floors[b]) - (exact[a] - floors[a]) || a - b);
  for (const i of order) {
    if (leftover <= 0) break;
    floors[i] += 1;
    leftover -= 1;
  }
  step.branch[option].percent = percent;
  others.forEach((k, i) => {
    step.branch[k].percent = floors[i];
  });
  return copy;
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

export class HxWorkbench extends HxElement {
  static observedAttributes = ["src"];
  static styles = new URL("./hx-workbench.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    if (!src) throw new Error("hx-workbench needs src");
    const response = await fetch(new URL(src, document.baseURI));
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
    const data = await response.json();
    if (!data.tool || !Array.isArray(data.checks) || typeof data.base_misuse_percent !== "number") throw new Error("hx-workbench: bad data");
    const misuse = data.misuse;
    if (!misuse || typeof misuse.branch !== "string" || !Number.isInteger(misuse.option)) throw new Error("hx-workbench: misuse needs a branch pointer and an option");
    const [tape, board, facts] = await Promise.all([getTape(data.tape), getBoard(data.board), getFactsCore()]);
    writeMisuse(tape, misuse.branch, misuse.option, data.base_misuse_percent);
    this.data = data;
    this.tape = tape;
    this.board = board;
    this.facts = facts;
    const tool = { name: data.tool.name, description: data.tool.description, schema: data.tool.input_schema };
    this.state = {
      tool,
      schemaText: JSON.stringify(tool.schema, null, 2),
      schemaError: null,
      runs: null,
      running: false,
    };
  }

  misuse() {
    return misuseOf(this.data.base_misuse_percent, this.data.checks, this.state.tool);
  }

  hxValue(name) {
    if (name === "misuse_percent") return this.misuse().percent;
    if (name === "rules_held") return this.misuse().held;
    return null;
  }

  hxRange() {
    return null;
  }

  edit(field, value) {
    this.setState({ tool: { ...this.state.tool, [field]: value } });
  }

  editSchema(text) {
    try {
      const schema = JSON.parse(text);
      this.setState({ schemaText: text, schemaError: null, tool: { ...this.state.tool, schema } });
    } catch {
      this.setState({ schemaText: text, schemaError: "The schema is not valid JSON." });
    }
  }

  run() {
    if (this.state.running) return;
    const misuse = this.misuse().percent;
    const { held } = this.misuse();
    this.setState({ running: true });
    const { branch, option } = this.data.misuse;
    const before = runBench(writeMisuse(this.tape, branch, option, this.data.base_misuse_percent), this.board, N, { facts: this.facts }).trials;
    const after = runBench(writeMisuse(this.tape, branch, option, misuse), this.board, N, { facts: this.facts }).trials;
    const runs = { misuse, before: summarize(before), after: summarize(after), base: this.data.base_misuse_percent };
    this.setState({ running: false, runs });
    this.evidence("workbench", { rules_held: held, misuse_percent: misuse, passed: runs.after.passed });
  }

  build() {
    const dom = {};
    this.dom = dom;
    const { checks } = this.data;
    dom.name = el("input", { type: "text", "aria-label": "Tool name", "data-key": "name", maxlength: "64" });
    dom.description = el("textarea", { "aria-label": "Tool description", rows: "3", "data-key": "description" });
    dom.schema = el("textarea", { "aria-label": "Input schema (JSON)", rows: "8", "data-key": "schema" });
    dom.schemaError = el("p", { class: "wb-error" });
    dom.name.addEventListener("input", () => this.edit("name", dom.name.value));
    dom.description.addEventListener("input", () => this.edit("description", dom.description.value));
    dom.schema.addEventListener("input", () => this.editSchema(dom.schema.value));
    dom.rules = checks.map((rule) => ({ rule, li: el("li", { class: "wb-rule" }), mark: el("span", { class: "wb-mark" }) }));
    dom.misuse = el("p", { class: "wb-misuse" });
    dom.formula = el("p", { class: "wb-formula" });
    dom.run = el("button", { class: "key key-primary", type: "button", "data-key": "run", text: `Run ×${N}` });
    dom.run.addEventListener("click", () => this.run());
    dom.stale = el("p", { class: "wb-stale" });
    dom.result = el("div", { class: "wb-result", hidden: "" });
    dom.disclaimer = el("p", { class: "wb-disclaimer", text: DISCLAIMER });
    this.ui.append(el("section", { class: "wb" },
      el("label", { class: "wb-field" }, el("span", { text: "Name" }), dom.name),
      el("label", { class: "wb-field" }, el("span", { text: "Description" }), dom.description),
      el("label", { class: "wb-field" }, el("span", { text: "Input schema" }), dom.schema),
      dom.schemaError,
      el("h3", { class: "wb-h", text: "Rules that hold" }),
      el("ul", { class: "wb-rules" }, ...dom.rules.map((r) => { r.li.append(r.mark, el("span", { class: "wb-label", text: r.rule.label })); return r.li; })),
      dom.misuse, dom.formula,
      el("div", { class: "wb-actions" }, dom.run),
      dom.stale,
      dom.result,
      dom.disclaimer));
  }

  render() {
    if (!this.dom) this.build();
    const { dom, state: s } = this;
    if (dom.name.value !== s.tool.name) dom.name.value = s.tool.name;
    if (dom.description.value !== s.tool.description) dom.description.value = s.tool.description;
    if (dom.schema.value !== s.schemaText) dom.schema.value = s.schemaText;
    dom.schemaError.textContent = s.schemaError ?? "";
    dom.schemaError.hidden = !s.schemaError;
    const { percent, held } = this.misuse();
    dom.rules.forEach(({ rule, li, mark }) => {
      const ok = ruleHolds(rule.test, s.tool);
      li.classList.toggle("is-held", ok);
      mark.replaceChildren(glyph(ok ? "check" : "cross"), ok ? "holds" : "does not hold", ` (−${rule.weight} points)`);
    });
    dom.misuse.textContent = `Misuse rate: ${percent}%`;
    dom.formula.textContent = `${this.data.base_misuse_percent}% minus the weights of the ${plural(held, "rule")} that hold, at least ${FLOOR}%.`;
    dom.run.setAttribute("aria-disabled", String(s.running));
    const stale = s.runs && s.runs.misuse !== percent;
    dom.stale.textContent = stale ? `Results are for a misuse rate of ${s.runs.misuse}%. Run again.` : "";
    dom.stale.hidden = !stale;
    dom.result.hidden = !s.runs;
    if (s.runs) {
      const a = s.runs.after;
      const b = s.runs.before;
      dom.result.replaceChildren(
        el("p", { class: "wb-honest", text: `On the same ${plural(N, "seed")} and the same board, the tool as you edited it passes ${plural(a.passed, "run")} and the starting tool passes ${plural(b.passed, "run")}.` }),
        el("p", { class: "wb-counts", text: `Worst case: ${plural(a.worst_turns, "turn")} after, ${plural(b.worst_turns, "turn")} before.` }));
    }
    this.live(s.runs && !stale ? dom.result.textContent : "");
  }

  async selfTest() {
    const { dom } = this;
    const before = this.state.tool.name;
    dom.name.value = `${before}-x`;
    dom.name.dispatchEvent(new Event("input"));
    if (this.state.tool.name !== `${before}-x`) return false;
    dom.run.click();
    const runs = this.state.runs;
    if (!runs || runs.misuse !== this.misuse().percent) return false;
    const text = dom.result.textContent;
    const ok = text.includes(`${plural(runs.after.passed, "run")}`) && text.includes(`${plural(runs.before.passed, "run")}`);
    this.edit("name", before);
    dom.name.value = before;
    this.setState({ runs: null });
    return ok;
  }
}

customElements.define("hx-workbench", HxWorkbench);
