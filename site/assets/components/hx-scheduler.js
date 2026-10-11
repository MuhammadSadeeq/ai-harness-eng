// hx-scheduler (BP-3.4 §1, C7.o5): batch tool calls into safe rounds. Calls in one round run in parallel; rounds run in
// order. Two calls conflict when one writes a resource the other reads or writes, and a conflict in a round is marked on
// both calls with the reason in words. The plan uses the real reads and writes; the annotations are hints (the fact cited
// on the page), shown as badges and never used to decide.
//   <hx-scheduler src="data/scheduler-demo.json"></hx-scheduler>
// Evidence: "scheduler" on each Check my plan, {safe, saved_ms, rounds}. Values: saved_ms, conflicts (read-only).
import { HxElement } from "./lib/hx-element.js";
import { getFactsCore } from "./lib/data.js";
import { formatInt, formatMs, plural } from "./lib/format.js";
import { mountFacts } from "../core/shell/facts.js";

const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const HINTS = [["readOnlyHint", "read-only"], ["destructiveHint", "destructive"], ["idempotentHint", "idempotent"], ["openWorldHint", "open world"]];
let uidCount = 0;

/** The shape the component needs. Throws with the first problem. */
export function validSchedule(src) {
  if (!src || !Array.isArray(src.calls) || src.calls.length < 2) throw new Error("hx-scheduler: needs at least two calls");
  const ids = new Set();
  for (const c of src.calls) {
    if (typeof c?.id !== "string" || ids.has(c.id)) throw new Error(`hx-scheduler: bad or repeated call id ${String(c?.id)}`);
    if (typeof c.tool !== "string" || typeof c.label !== "string") throw new Error(`hx-scheduler: ${c.id} needs a tool and a label`);
    if (!Array.isArray(c.reads) || !Array.isArray(c.writes) || !c.reads.every((r) => typeof r === "string") || !c.writes.every((w) => typeof w === "string")) {
      throw new Error(`hx-scheduler: ${c.id} needs reads and writes as lists of resources`);
    }
    if (!Number.isInteger(c.ms) || c.ms < 1) throw new Error(`hx-scheduler: ${c.id} needs whole milliseconds`);
    ids.add(c.id);
  }
  if (src.note !== undefined && typeof src.note !== "string") throw new Error("hx-scheduler: note must be text");
  return src;
}

/**
 * The conflicting pairs inside each round, with the reasons in words. A pair conflicts when one writes a resource the
 * other reads or writes. Two reads never conflict.
 */
export function conflictsOf(calls, assign) {
  const out = [];
  for (let i = 0; i < calls.length; i += 1) {
    for (let j = i + 1; j < calls.length; j += 1) {
      const a = calls[i];
      const b = calls[j];
      if (assign[a.id] !== assign[b.id]) continue;
      const reasons = [];
      for (const x of a.writes) {
        if (b.reads.includes(x)) reasons.push(`${a.tool} writes ${x} while ${b.tool} reads it: the read may see the file before or after the write.`);
        if (b.writes.includes(x)) reasons.push(`${a.tool} and ${b.tool} both write ${x}: they may finish in either order.`);
      }
      for (const x of b.writes) {
        if (a.reads.includes(x)) reasons.push(`${b.tool} writes ${x} while ${a.tool} reads it: the read may see the file before or after the write.`);
      }
      if (reasons.length > 0) out.push({ a: a.id, b: b.id, reasons });
    }
  }
  return out;
}

/** The plan's time: each round takes its longest call, rounds run in order; one call at a time is the sum. */
export function planTimes(calls, assign) {
  const longest = new Map();
  for (const c of calls) longest.set(assign[c.id], Math.max(longest.get(assign[c.id]) ?? 0, c.ms));
  const plan = [...longest.values()].reduce((n, ms) => n + ms, 0);
  const serial = calls.reduce((n, c) => n + c.ms, 0);
  return { plan, serial, saved: serial - plan, rounds: longest.size };
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

export class HxScheduler extends HxElement {
  static observedAttributes = ["src"];
  static styles = new URL("./hx-scheduler.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    if (!src) throw new Error("hx-scheduler needs src");
    const response = await fetch(new URL(src, document.baseURI));
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
    this.data = validSchedule(await response.json());
    this.srcName = src;
    this.facts = await getFactsCore();
    if (!this.facts["mcp.annotations-hints"]) throw new Error("hx-scheduler: the annotations fact is missing");
    this.uid = `hxs${++uidCount}`;
    // Every call starts in round 1: the learner sees every conflict and works them out.
    const assign = Object.fromEntries(this.data.calls.map((c) => [c.id, 1]));
    this.state = { assign, roundCount: 1, checked: null };
  }

  setRound(id, round) {
    if (this.state.assign[id] === round) return;
    this.setState({ assign: { ...this.state.assign, [id]: round }, checked: null });
  }

  newRound() {
    this.setState({ roundCount: this.state.roundCount + 1, checked: null });
  }

  check() {
    const { plan, serial, saved, rounds } = planTimes(this.data.calls, this.state.assign);
    const conflicts = conflictsOf(this.data.calls, this.state.assign).length;
    const result = { safe: conflicts === 0, saved_ms: saved, rounds, plan, serial, conflicts };
    this.setState({ checked: result });
    this.evidence("scheduler", { safe: result.safe, saved_ms: saved, rounds });
  }

  build() {
    const dom = { rows: [] };
    this.dom = dom;
    dom.line = el("p", { class: "sc-hint" },
      el("span", { class: "fact", "data-fact": "mcp.annotations-hints", text: "Annotations are hints from the server. The plan uses the real reads and writes, not the badges." }));
    dom.rows = this.data.calls.map((call) => {
      const select = el("select", { class: "sc-select", "data-key": `round-${call.id}`, "aria-label": `Round for ${call.label}` });
      select.addEventListener("change", () => this.setRound(call.id, Number(select.value)));
      const badges = el("p", { class: "sc-badges" });
      const conflict = el("ul", { class: "sc-conflicts" });
      const row = el("li", { class: "sc-call" },
        el("div", { class: "sc-head" },
          el("p", { class: "sc-name", text: call.label }),
          el("p", { class: "sc-tool", text: call.tool })),
        el("p", { class: "sc-io", text: `reads ${call.reads.length ? call.reads.join(", ") : "nothing"} · writes ${call.writes.length ? call.writes.join(", ") : "nothing"} · ${formatMs(call.ms)}` }),
        badges,
        el("label", { class: "sc-round" }, el("span", { class: "sc-round-label", text: "Round" }), select),
        conflict);
      return { call, row, select, badges, conflict };
    });
    dom.list = el("ol", { class: "sc-calls" }, ...dom.rows.map((v) => v.row));
    dom.plan = el("p", { class: "readout-value" });
    dom.serial = el("p", { class: "readout-value" });
    dom.left = el("p", { class: "readout-value" });
    dom.newRound = el("button", { class: "key", type: "button", "data-key": "new-round", text: "New round" });
    dom.newRound.addEventListener("click", () => this.newRound());
    dom.check = el("button", { class: "key key-primary", type: "button", "data-key": "check", text: "Check my plan" });
    dom.check.addEventListener("click", () => this.check());
    dom.result = el("p", { class: "sc-result" });
    this.ui.append(el("section", { class: "sc" },
      el("figure", { class: "plate instrument sc-plate" },
        el("figcaption", { class: "fig-label", text: "The calls, in the model's order" }),
        dom.list),
      dom.line,
      el("div", { class: "sc-readouts" },
        el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Time for the plan" }), dom.plan),
        el("div", { class: "readout" }, el("p", { class: "readout-label", text: "One call at a time" }), dom.serial),
        el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Conflicts left" }), dom.left)),
      el("div", { class: "sc-actions" }, dom.check, dom.newRound),
      dom.result));
  }

  render() {
    if (!this.dom) this.build();
    const { dom, state: s, data } = this;
    const conflicts = conflictsOf(data.calls, s.assign);
    const { plan, serial } = planTimes(data.calls, s.assign);
    // A conflict is marked on both of its calls, with its reasons.
    const marked = new Map();
    for (const c of conflicts) {
      for (const id of [c.a, c.b]) marked.set(id, [...(marked.get(id) ?? []), ...c.reasons]);
    }
    for (const view of dom.rows) {
      const { call } = view;
      view.select.replaceChildren(...Array.from({ length: s.roundCount }, (_, i) => el("option", { value: String(i + 1), text: `Round ${i + 1}` })));
      view.select.value = String(s.assign[call.id]);
      const badges = HINTS.filter(([key]) => call.annotations?.[key] === true).map(([, word]) => el("span", { class: "sc-badge", text: word }));
      view.badges.replaceChildren(...(badges.length ? badges : [el("span", { class: "sc-badge is-none", text: "no hints" })]));
      const reasons = marked.get(call.id) ?? [];
      view.row.classList.toggle("is-conflict", reasons.length > 0);
      view.conflict.replaceChildren(...reasons.map((r) => el("li", { class: "sc-conflict" }, glyph("bang"), r)));
      view.conflict.hidden = reasons.length === 0;
    }
    dom.plan.textContent = formatMs(plan);
    dom.serial.textContent = formatMs(serial);
    dom.left.textContent = formatInt(conflicts.length);
    const r = s.checked;
    if (r) {
      dom.result.className = `sc-result ${r.safe ? "is-pass" : "is-fail"}`;
      dom.result.replaceChildren(glyph(r.safe ? "check" : "cross"), r.safe
        ? `Safe. The plan takes ${formatMs(r.plan)} instead of ${formatMs(r.serial)}: it saves ${formatMs(r.saved_ms)}.`
        : `Not safe: ${plural(r.conflicts, "conflict")} left. Move one call of each conflicting pair to another round.`);
      this.live(dom.result.textContent);
    } else {
      dom.result.className = "sc-result";
      dom.result.replaceChildren();
    }
    mountFacts(this.facts, document);
  }

  hxValue(name) {
    const { plan, serial } = planTimes(this.data.calls, this.state.assign);
    if (name === "saved_ms") return serial - plan;
    if (name === "conflicts") return conflictsOf(this.data.calls, this.state.assign).length;
    return null;
  }

  hxRange() {
    return null;
  }

  async selfTest() {
    const saved = this.state;
    const { data, dom } = this;
    let evidence = 0;
    const count = (event) => {
      if (event.detail.kind === "scheduler") evidence += 1;
    };
    this.addEventListener("hx-evidence", count);
    try {
      this.setState({ assign: Object.fromEntries(data.calls.map((c) => [c.id, 1])), roundCount: 1, checked: null });
      const before = this.hxValue("conflicts");
      if (before === 0) return false;
      // Split every call into its own round: no conflicts, and the plan is the serial time.
      data.calls.forEach((call, i) => {
        const view = dom.rows.find((v) => v.call.id === call.id);
        this.newRound();
        view.select.value = String(i + 1);
        view.select.dispatchEvent(new Event("change"));
      });
      if (this.hxValue("conflicts") !== 0 || this.hxValue("saved_ms") !== 0) return false;
      dom.check.click();
      if (!this.state.checked?.safe || evidence !== 1) return false;
      return true;
    } finally {
      this.removeEventListener("hx-evidence", count);
      this.restoreAfterTest(saved);
    }
  }
}

customElements.define("hx-scheduler", HxScheduler);
