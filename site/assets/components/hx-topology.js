// hx-topology (BP-3.6 §3, F1): five shapes for one task, and what each costs. One select chooses the shape; its diagram,
// its failure modes and two ratios (against one agent, the course's model, labelled) follow. A toggle runs the demo
// sub-agent tape (ENGINE A14.1) on the isolated and the forked boards and reads the sub-agent's input tokens from the run.
//   <hx-topology src="data/topology-demo.json"></hx-topology>
// Evidence: "topology", {topology, context}. Values: cost_ratio, time_ratio (the chosen shape's ratios).
import { HxElement } from "./lib/hx-element.js";
import { formatInt, plural } from "./lib/format.js";
import { runTrial } from "../sim/index.js";
import { getFactsCore } from "./lib/data.js";

const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const MODEL_LINE = "The ratios are the course's model: one agent is 1. They are illustrative, not measured on any model.";
const CONTEXTS = ["isolated", "forked"];
let uidCount = 0;

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (name === "text") node.textContent = value;
    else if (name === "class") node.className = value;
    else if (name === "dataset") Object.assign(node.dataset, value);
    else if (name.startsWith("aria-")) node.setAttribute(name, String(value));
    else node.setAttribute(name, value === true ? "" : String(value));
  }
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
};

const svgNode = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
};

/** The shape the component needs. Throws with the first problem. */
export function validTopology(src) {
  if (!src?.task || typeof src.task.name !== "string") throw new Error("hx-topology: needs task with a name");
  if (typeof src.subagent_tape !== "string" || typeof src.boards?.isolated !== "string" || typeof src.boards?.forked !== "string") {
    throw new Error("hx-topology: needs subagent_tape and boards isolated and forked");
  }
  if (!Array.isArray(src.topologies) || src.topologies.length !== 5) throw new Error("hx-topology: needs five topologies");
  const ids = new Set();
  for (const t of src.topologies) {
    if (typeof t?.id !== "string" || typeof t.name !== "string") throw new Error("hx-topology: each topology needs id and name");
    if (ids.has(t.id)) throw new Error(`hx-topology: duplicate topology ${t.id}`);
    ids.add(t.id);
    if (typeof t.cost !== "number" || typeof t.wall_clock !== "number" || t.cost <= 0 || t.wall_clock <= 0) {
      throw new Error(`hx-topology: ${t.id} needs positive cost and wall_clock ratios`);
    }
    const nodes = t.diagram?.nodes ?? [];
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const [from, to] of t.diagram?.edges ?? []) {
      if (!nodeIds.has(from) || !nodeIds.has(to)) throw new Error(`hx-topology: ${t.id} has an edge to an unknown node`);
    }
    if (!Array.isArray(t.failure_modes) || t.failure_modes.length === 0) throw new Error(`hx-topology: ${t.id} needs failure modes`);
  }
  if (src.note !== undefined && typeof src.note !== "string") throw new Error("hx-topology: note must be text");
  return src;
}

/** The sub-agent's input tokens in a run: its model calls' prompt sizes, summed over its turns. */
export function subagentInputTokens(events, label = "reader#1") {
  return events.filter((e) => e.agent === label && e.kind === "model_call").reduce((sum, e) => sum + e.tokens_in, 0);
}

/** A ratio, one decimal at most, as the readout writes it: "3.2 ×", "1 ×". */
export function ratioText(value) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ×`;
}

const DIAGRAM = { w: 280, h: 130 };
const NODE_H = 30;

/** A box's width: its word, a mark and the padding. Twelve-unit type, so a word of n letters is about 6.6n units. */
const boxWidth = (label) => Math.max(56, Math.round(label.length * 6.6 + 26));

/** Where an arrow from a to b starts and ends: on the edge of each box, not under it. */
function edgeEnds(a, b, wa, wb) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const reach = (w) => Math.min(dx ? w / 2 / Math.abs(dx) : Infinity, dy ? NODE_H / 2 / Math.abs(dy) : Infinity);
  const sa = reach(wa);
  const sb = reach(wb);
  return { x1: a.x + dx * sa, y1: a.y + dy * sa, x2: b.x - dx * sb, y2: b.y - dy * sb };
}

export class HxTopology extends HxElement {
  static observedAttributes = ["src"];
  static styles = new URL("./hx-topology.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    if (!src) throw new Error("hx-topology needs src");
    const srcUrl = new URL(src, document.baseURI);
    const response = await fetch(srcUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
    this.data = validTopology(await response.json());
    this.tape = await fetchJson(new URL(this.data.subagent_tape, srcUrl));
    this.boards = {
      isolated: await fetchJson(new URL(this.data.boards.isolated, srcUrl)),
      forked: await fetchJson(new URL(this.data.boards.forked, srcUrl)),
    };
    this.uid = `hxt${++uidCount}`;
    this.state = { topology: this.data.topologies[0].id, context: "isolated" };
    this.facts = await getFactsCore();
    // Both boards run once, through runTrial with the same seed, so the two numbers are one run each.
    this.contextRuns = {};
    for (const name of CONTEXTS) {
      const { events, result } = runTrial(this.tape, this.boards[name], 20261010, { facts: this.facts });
      this.contextRuns[name] = { tokens: subagentInputTokens(events), status: result.status, passed: result.passed };
    }
  }

  shape() {
    return this.data.topologies.find((t) => t.id === this.state.topology);
  }

  hxValue(name) {
    const t = this.shape();
    if (!t) return null;
    if (name === "cost_ratio") return t.cost;
    if (name === "time_ratio") return t.wall_clock;
    return null;
  }

  hxRange() {
    return null;
  }

  hxLabel(name) {
    if (name === "cost_ratio") return "Cost against one agent (the course's model)";
    if (name === "time_ratio") return "Wall clock against one agent (the course's model)";
    return null;
  }

  wire() {
    if (this.wired) return;
    this.wired = true;
    this.ui.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || button.disabled) return;
      if (button.dataset.context) this.choose({ context: button.dataset.context });
    });
    this.ui.addEventListener("change", (event) => {
      if (event.target.matches("select.tp-select")) this.choose({ topology: event.target.value });
    });
  }

  /** One learner choice: a shape or a context. Each counts as evidence of looking at the choice. */
  choose(patch) {
    this.setState(patch);
    this.evidence("topology", { topology: this.state.topology, context: this.state.context });
    this.live(`${this.shape().name}: cost ${ratioText(this.shape().cost)}, wall clock ${ratioText(this.shape().wall_clock)}.`);
    for (const name of ["cost_ratio", "time_ratio"]) {
      this.dispatchEvent(new CustomEvent("hx-change", { bubbles: true, detail: { name, value: this.hxValue(name) } }));
    }
  }

  /** The diagram: boxes sized to their word, a mark inside each, arrows clipped to the box edges. Same shape for every choice. */
  diagram(t) {
    const svg = svgNode("svg", { class: "tp-diagram", viewBox: `0 0 ${DIAGRAM.w} ${DIAGRAM.h}`, role: "img", "aria-label": `${t.name}: ${t.diagram.nodes.map((n) => n.label).join(", ")}` });
    const defs = svgNode("defs");
    const marker = svgNode("marker", { id: `${this.uid}-arrow`, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, markerUnits: "userSpaceOnUse", orient: "auto-start-reverse" });
    marker.append(svgNode("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "tp-arrow" }));
    defs.append(marker);
    svg.append(defs);
    const at = new Map(t.diagram.nodes.map((n) => [n.id, n]));
    for (const [from, to] of t.diagram.edges) {
      const a = at.get(from);
      const b = at.get(to);
      const ends = edgeEnds(a, b, boxWidth(a.label), boxWidth(b.label));
      svg.append(svgNode("line", { x1: ends.x1, y1: ends.y1, x2: ends.x2, y2: ends.y2, class: "tp-edge", "marker-end": `url(#${this.uid}-arrow)` }));
    }
    for (const n of t.diagram.nodes) {
      const w = boxWidth(n.label);
      const g = svgNode("g", { class: "tp-node" });
      g.append(svgNode("rect", { x: n.x - w / 2, y: n.y - NODE_H / 2, width: w, height: NODE_H, rx: 6, class: "tp-box" }));
      g.append(svgNode("use", { href: `${SPRITE}#g-${n.mark ?? "box"}`, x: n.x - w / 2 + 6, y: n.y - 6, width: 12, height: 12, class: "tp-mark" }));
      const text = svgNode("text", { x: n.x + 8, y: n.y + 4, "text-anchor": "middle", class: "tp-label" });
      text.textContent = n.label;
      g.append(text);
      svg.append(g);
    }
    return svg;
  }

  render() {
    if (!this.ui.dataset.wired) {
      this.wire();
      this.ui.dataset.wired = "";
    }
    const { data, state: s } = this;
    const t = this.shape();
    const children = [];
    children.push(el("h3", { class: "tp-title", text: "Five shapes for one task" }));
    children.push(el("p", { class: "tp-note", text: data.task.name }));
    if (data.note) children.push(el("p", { class: "tp-hint", text: data.note }));
    children.push(el("div", { class: "tp-choose" },
      el("label", { class: "tp-label-line", for: `${this.uid}-shape`, text: "Shape" }),
      el("select", { class: "tp-select", id: `${this.uid}-shape` },
        ...data.topologies.map((x) => el("option", { value: x.id, selected: x.id === s.topology, text: x.name }))),
      el("p", { class: "tp-task", text: data.task.note ?? "" })));
    children.push(this.diagram(t));
    children.push(el("div", { class: "readouts tp-readouts" },
      el("div", { class: "readout tp-readout" },
        el("p", { class: "readout-label", text: "Cost" }),
        el("p", { class: "readout-value", text: ratioText(t.cost) }),
        el("p", { class: "readout-note", text: "against one agent" })),
      el("div", { class: "readout tp-readout" },
        el("p", { class: "readout-label", text: "Wall clock" }),
        el("p", { class: "readout-value", text: ratioText(t.wall_clock) }),
        el("p", { class: "readout-note", text: "against one agent" }))));
    children.push(el("p", { class: "tp-hint", text: MODEL_LINE }));
    children.push(el("h4", { class: "tp-sub", text: "How it fails" }));
    children.push(el("ul", { class: "tp-modes" }, ...t.failure_modes.map((m) => el("li", { text: m }))));

    // The sub-agent: the same run on the isolated and forked boards, its input tokens from the run.
    children.push(el("h4", { class: "tp-sub", text: "Isolated or forked: the sub-agent's input" }));
    children.push(el("div", { class: "seg tp-seg", role: "group", "aria-label": "Sub-agent context" },
      ...CONTEXTS.map((c) => el("button", { type: "button", "aria-pressed": s.context === c, "data-context": c, text: c === "isolated" ? "Isolated" : "Forked" }))));
    const counts = this.contextRuns;
    const chosen = counts[s.context];
    const other = counts[CONTEXTS.find((c) => c !== s.context)];
    children.push(el("div", { class: "readouts tp-readouts" },
      el("div", { class: "readout tp-readout" },
        el("p", { class: "readout-label", text: `${s.context === "isolated" ? "Isolated" : "Forked"} context` }),
        el("p", { class: "readout-value", text: `${formatInt(chosen.tokens)} tokens` }),
        el("p", { class: "readout-note", text: `the sub-agent's input over its turns (${chosen.status}, ${chosen.passed ? "checks pass" : "checks fail"})` })),
      el("div", { class: "readout tp-readout" },
        el("p", { class: "readout-label", text: "The other context" }),
        el("p", { class: "readout-value", text: `${formatInt(other.tokens)} tokens` }),
        el("p", { class: "readout-note", text: `${other.tokens > chosen.tokens ? "more" : other.tokens < chosen.tokens ? "fewer" : "as many"} than the ${s.context} run: ${formatInt(Math.abs(other.tokens - chosen.tokens))}` }))));
    children.push(el("p", { class: "tp-hint", text: "Both runs are the demo sub-agent tape (ENGINE A14.1): one reader, one brief. A forked sub-agent starts from the parent's messages, so its first request is larger." }));
    this.ui.replaceChildren(...children);
  }

  async selfTest() {
    const saved = this.state;
    let evidence = 0;
    const count = (event) => {
      if (event.detail.kind === "topology") evidence += 1;
    };
    this.addEventListener("hx-evidence", count);
    try {
      const select = this.ui.querySelector("select.tp-select");
      select.value = "loop";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      if (this.state.topology !== "loop") return false;
      if (!this.ui.querySelector(".tp-readout .readout-value")?.textContent.includes(ratioText(this.shape().cost))) return false;
      this.ui.querySelector("[data-context='forked']").click();
      if (this.state.context !== "forked") return false;
      const counts = this.contextRuns;
      if (counts.forked.tokens <= counts.isolated.tokens) return false;
      return evidence >= 2;
    } finally {
      this.removeEventListener("hx-evidence", count);
      this.restoreAfterTest(saved);
    }
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url.pathname}`);
  return response.json();
}

if (!customElements.get("hx-topology")) customElements.define("hx-topology", HxTopology);
