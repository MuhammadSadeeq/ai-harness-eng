// hx-bugcatch (BP-3.4 §3, C11): which checks catch which bugs. Predict first: mark the cells you think catch each bug,
// then Reveal the real answers. Then choose checks within a budget and see which bugs stay uncaught. Guides steer before
// the work; sensors check after it (C11.o3). The bugs, checks and catches are illustrative: they are the course's example.
//   <hx-bugcatch src="data/bugcatch-demo.json"></hx-bugcatch>
// Evidence: "bugcatch" on Reveal, {right, total}; on each budget choice, {caught, budget}. Values: caught (read-only).
import { HxElement } from "./lib/hx-element.js";
import { formatInt, plural } from "./lib/format.js";

const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const KIND_WORD = { guide: "guide: steers before the work", sensor: "sensor: checks after it" };
let uidCount = 0;

/** The shape the component needs. Throws with the first problem. */
export function validBugcatch(src) {
  if (!Array.isArray(src?.bugs) || src.bugs.length === 0) throw new Error("hx-bugcatch: needs bugs");
  if (!Array.isArray(src.checks) || src.checks.length === 0) throw new Error("hx-bugcatch: needs checks");
  const bugIds = new Set(src.bugs.map((b) => b.id));
  const checkIds = new Set();
  for (const c of src.checks) {
    if (typeof c?.id !== "string" || checkIds.has(c.id) || typeof c.label !== "string") throw new Error(`hx-bugcatch: bad check ${String(c?.id)}`);
    if (c.kind !== "guide" && c.kind !== "sensor") throw new Error(`hx-bugcatch: ${c.id} must be a guide or a sensor`);
    if (!Number.isInteger(c.cost) || c.cost < 0) throw new Error(`hx-bugcatch: ${c.id} needs a whole cost`);
    checkIds.add(c.id);
  }
  for (const b of src.bugs) {
    if (typeof b?.id !== "string" || typeof b.label !== "string" || typeof b.detail !== "string") throw new Error(`hx-bugcatch: bad bug ${String(b?.id)}`);
  }
  for (const [bug, ids] of Object.entries(src.catches ?? {})) {
    if (!bugIds.has(bug)) throw new Error(`hx-bugcatch: catches names an unknown bug ${bug}`);
    for (const id of ids) if (!checkIds.has(id)) throw new Error(`hx-bugcatch: catches names an unknown check ${id}`);
  }
  if (!Number.isInteger(src.budget) || src.budget < 0) throw new Error("hx-bugcatch: budget must be a whole number");
  return src;
}

/** Predictions scored against the real catches: right cells, and the number of cells. */
export function scorePredictions(bugs, checks, catches, predicted) {
  let right = 0;
  for (const bug of bugs) {
    for (const check of checks) {
      const truth = (catches[bug.id] ?? []).includes(check.id);
      if ((predicted[bug.id]?.[check.id] === true) === truth) right += 1;
    }
  }
  return { right, total: bugs.length * checks.length };
}

/** The bugs no chosen check catches. */
export function uncaughtBy(bugs, catches, chosen) {
  return bugs.filter((bug) => !(catches[bug.id] ?? []).some((id) => chosen.includes(id)));
}

/** The total cost of the chosen checks. */
export function spentOf(checks, chosen) {
  return checks.filter((c) => chosen.includes(c.id)).reduce((n, c) => n + c.cost, 0);
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

export class HxBugcatch extends HxElement {
  static observedAttributes = ["src"];
  static styles = new URL("./hx-bugcatch.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    if (!src) throw new Error("hx-bugcatch needs src");
    const response = await fetch(new URL(src, document.baseURI));
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
    this.data = validBugcatch(await response.json());
    this.uid = `hxb${++uidCount}`;
    this.state = { predicted: {}, revealed: false, chosen: [], note: "" };
  }

  /** Mark or unmark one cell: "catches" or "misses". */
  toggleCell(bugId, checkId) {
    const current = this.state.predicted[bugId]?.[checkId] === true;
    const predicted = { ...this.state.predicted, [bugId]: { ...(this.state.predicted[bugId] ?? {}), [checkId]: !current } };
    this.setState({ predicted, revealed: false });
  }

  reveal() {
    const { right, total } = scorePredictions(this.data.bugs, this.data.checks, this.data.catches, this.state.predicted);
    this.setState({ revealed: true });
    this.evidence("bugcatch", { right, total });
  }

  /** A check on or off; the budget is kept: a check that would take the total over it does not turn on. */
  toggleCheck(checkId) {
    const chosen = this.state.chosen;
    if (chosen.includes(checkId)) {
      this.setState({ chosen: chosen.filter((id) => id !== checkId), note: "" });
      this.budgetEvidence(chosen.filter((id) => id !== checkId));
      return;
    }
    const next = [...chosen, checkId];
    if (spentOf(this.data.checks, next) > this.data.budget) {
      this.setState({ note: "That check would take the budget over." });
      return;
    }
    this.setState({ chosen: next, note: "" });
    this.budgetEvidence(next);
  }

  budgetEvidence(chosen) {
    const caught = this.data.bugs.length - uncaughtBy(this.data.bugs, this.data.catches, chosen).length;
    this.evidence("bugcatch", { caught, budget: this.data.budget });
  }

  build() {
    const dom = { cells: [], checks: [] };
    this.dom = dom;
    dom.head = el("tr", {}, el("th", { scope: "col", text: "Bug" }),
      ...this.data.checks.map((check) => el("th", { scope: "col", class: "bc-check-head" },
        el("span", { text: check.label }),
        el("span", { class: "bc-kind", text: KIND_WORD[check.kind] }))));
    dom.body = this.data.bugs.map((bug) => {
      const detail = el("p", { class: "bc-detail" });
      const cells = this.data.checks.map((check) => {
        const button = el("button", { class: "bc-cell", type: "button", "aria-pressed": "false", "data-key": `${bug.id}-${check.id}` });
        button.addEventListener("click", () => this.toggleCell(bug.id, check.id));
        const mark = el("span", { class: "bc-mark" });
        const td = el("td", { class: "bc-td" }, el("span", { class: "bc-cell-name", text: check.label }), button, mark);
        return { check, td, button, mark };
      });
      const row = el("tr", {}, el("th", { scope: "row", class: "bc-bug" },
        el("span", { class: "bc-bug-label", text: bug.label }), detail), ...cells.map((c) => c.td));
      return { bug, row, detail, cells };
    });
    dom.table = el("table", { class: "bc-grid" },
      el("thead", {}, dom.head),
      el("tbody", {}, ...dom.body.map((b) => b.row)));
    dom.reveal = el("button", { class: "key key-primary", type: "button", "data-key": "reveal", text: "Reveal" });
    dom.reveal.addEventListener("click", () => this.reveal());
    dom.result = el("p", { class: "bc-result" });
    dom.checks = this.data.checks.map((check) => {
      const box = el("input", { type: "checkbox", "data-key": `use-${check.id}` });
      box.addEventListener("change", () => this.toggleCheck(check.id));
      const row = el("label", { class: "bc-use" }, box,
        el("span", { class: "bc-use-text" },
          el("span", { class: "bc-use-label", text: check.label }),
          el("span", { class: "bc-use-kind", text: `${KIND_WORD[check.kind]}, cost ${formatInt(check.cost)}` })));
      return { check, box, row };
    });
    dom.spent = el("p", { class: "readout-value" });
    dom.caught = el("p", { class: "readout-value" });
    dom.uncaught = el("p", { class: "bc-uncaught" });
    dom.note = el("p", { class: "bc-note" });
    this.ui.append(el("section", { class: "bc" },
      el("div", { class: "bc-part" },
        el("h3", { class: "bc-part-title", text: "Predict" }),
        el("p", { class: "bc-hint", text: "Tap a cell to mark it: catches or misses. Then reveal the real answers." }),
        el("div", { class: "table-wrap", tabindex: "0", role: "region", "aria-label": "Predictions: bugs by checks" }, dom.table),
        el("div", { class: "bc-actions" }, dom.reveal),
        dom.result),
      el("div", { class: "bc-part" },
        el("h3", { class: "bc-part-title", text: `Choose under a budget of ${formatInt(this.data.budget)}` }),
        el("div", { class: "bc-uses" }, ...dom.checks.map((c) => c.row)),
        el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Spent" }), dom.spent),
        el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Bugs caught" }), dom.caught),
        dom.uncaught,
        dom.note),
      el("p", { class: "bc-illustrative", text: "Illustrative: the bugs and which checks catch them are the course's example, not a measurement." })));
  }

  render() {
    if (!this.dom) this.build();
    const { dom, state: s, data } = this;
    for (const row of dom.body) {
      const { bug } = row;
      for (const cell of row.cells) {
        const on = s.predicted[bug.id]?.[cell.check.id] === true;
        const truth = (data.catches[bug.id] ?? []).includes(cell.check.id);
        cell.button.setAttribute("aria-pressed", String(on));
        cell.button.textContent = on ? "catches" : "misses";
        cell.mark.replaceChildren();
        if (s.revealed) {
          cell.mark.append(glyph(on === truth ? "check" : "cross"), `${on === truth ? "right" : "wrong"}; the real answer is ${truth ? "catches" : "misses"}`);
        }
        cell.mark.hidden = !s.revealed;
      }
      row.detail.replaceChildren(...(s.revealed
        ? [el("span", { text: bug.detail }), el("span", { class: "bc-real", text: `Caught by: ${(data.catches[bug.id] ?? []).map((id) => data.checks.find((c) => c.id === id).label).join("; ") || "nothing"}` })]
        : []));
    }
    if (s.revealed) {
      const { right, total } = scorePredictions(data.bugs, data.checks, data.catches, s.predicted);
      dom.result.textContent = `Right on ${formatInt(right)} of ${formatInt(total)} cells.`;
      dom.result.hidden = false;
      this.live(dom.result.textContent);
    } else {
      dom.result.textContent = "";
      dom.result.hidden = true;
    }
    const spent = spentOf(data.checks, s.chosen);
    const uncaught = uncaughtBy(data.bugs, data.catches, s.chosen);
    dom.spent.textContent = `${formatInt(spent)} of ${formatInt(data.budget)}`;
    dom.caught.textContent = `${formatInt(data.bugs.length - uncaught.length)} of ${plural(data.bugs.length, "bug")}`;
    dom.uncaught.textContent = uncaught.length === 0 ? "Every bug is caught." : `Still uncaught: ${uncaught.map((b) => b.label).join("; ")}.`;
    dom.note.textContent = s.note;
    dom.note.hidden = s.note === "";
    for (const c of dom.checks) {
      c.box.checked = s.chosen.includes(c.check.id);
    }
  }

  hxValue(name) {
    if (name === "caught") return this.data.bugs.length - uncaughtBy(this.data.bugs, this.data.catches, this.state.chosen).length;
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
      if (event.detail.kind === "bugcatch") evidence += 1;
    };
    this.addEventListener("hx-evidence", count);
    try {
      this.setState({ predicted: {}, revealed: false, chosen: [], note: "" });
      const cell = dom.body[0].cells[0];
      cell.button.click();
      if (this.state.predicted[dom.body[0].bug.id]?.[cell.check.id] !== true) return false;
      cell.button.click();
      if (this.state.predicted[dom.body[0].bug.id]?.[cell.check.id] !== false) return false;
      dom.reveal.click();
      if (!this.state.revealed || evidence !== 1) return false;
      const first = dom.checks.find((c) => c.check.cost <= data.budget);
      first.box.click();
      if (!this.state.chosen.includes(first.check.id) || evidence !== 2) return false;
      return true;
    } finally {
      this.removeEventListener("hx-evidence", count);
      this.restoreAfterTest(saved);
    }
  }
}

customElements.define("hx-bugcatch", HxBugcatch);
