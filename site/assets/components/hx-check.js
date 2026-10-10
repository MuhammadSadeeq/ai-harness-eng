// hx-check: a prediction gate (mode="predict") or a check item (mode="check"). DESIGN §7.3; AUTHORING §10 items.
//   <hx-check src="data/checks-demo.json" item="b2-predict-turn-limit" for="bench1">…no-JS fallback…</hx-check>
// predict + for: committing removes `locked` from the target; the target's hx-result reveals the outcome.
// predict without for: the reveal comes right after the commit. check: the reveal comes right after the commit.
// Evidence: "check" on a check commit; "prediction" when a prediction is revealed (COMPONENTS §5).
import { HxElement } from "./lib/hx-element.js";
import { getContent } from "./lib/data.js";

const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const RESULT_TIMEOUT_MS = 60000;
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

/** Checks that an item has the AUTHORING §10 shape. Throws with the first problem. */
function validItem(item, mode) {
  if (!item || typeof item.id !== "string") throw new Error("hx-check: item has no id");
  if (typeof item.question !== "string") throw new Error(`hx-check: ${item.id} has no question`);
  if (!Array.isArray(item.options) || item.options.length < 2 || item.options.length > 5) {
    throw new Error(`hx-check: ${item.id} needs 2 to 5 options`);
  }
  for (const option of item.options) {
    if (typeof option?.text !== "string" || typeof option?.why !== "string") {
      throw new Error(`hx-check: ${item.id} has an option without text or why`);
    }
  }
  if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer >= item.options.length) {
    throw new Error(`hx-check: ${item.id} has no valid answer index`);
  }
  if (mode === "predict" && typeof item.outcome !== "string") throw new Error(`hx-check: predict item ${item.id} needs an outcome`);
}

export class HxCheck extends HxElement {
  static observedAttributes = ["src", "item", "mode", "for"];
  static styles = new URL("./hx-check.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    const id = this.getAttribute("item");
    if (!src || !id) throw new Error("hx-check needs src and item");
    const items = await getContent("checks", src);
    const item = Array.isArray(items) ? items.find((entry) => entry.id === id) : undefined;
    if (!item) throw new Error(`hx-check: no item ${id}`);
    const mode = this.getAttribute("mode") ?? item.mode;
    if (mode !== "predict" && mode !== "check") throw new Error("hx-check: mode must be predict or check");
    validItem(item, mode);
    this.item = item;
    this.mode = mode;
    this.uid = `hxc${++uidCount}`;
    this.targetEl = null;
    const forId = this.getAttribute("for");
    if (forId && mode === "predict") {
      const target = document.getElementById(forId);
      if (!target) throw new Error(`hx-check: no element with id ${forId}`);
      if (typeof target.hxValue !== "function") await customElements.whenDefined(target.localName);
      if (target.ready && (await target.ready) === false) throw new Error(`hx-check: ${forId} failed to load`);
      this.targetEl = target;
      target.addEventListener("hx-result", () => this.onResult());
    }
    this.state = { choice: null, committed: null, resultSeen: false, evidenced: false };
  }

  derive() {
    const { committed, resultSeen } = this.state;
    const committedNow = committed !== null;
    const revealed = committedNow && (this.mode === "check" || this.targetEl === null || resultSeen);
    return { committedNow, revealed, correct: committedNow && committed === this.item.answer };
  }

  render() {
    if (!this.dom) this.build();
    const { item, mode, dom } = this;
    const s = this.state;
    const d = this.derive();
    dom.inputs.forEach((input, i) => {
      input.checked = s.choice === i;
      input.disabled = d.committedNow;
    });
    dom.options.forEach(({ mark, why }, i) => {
      const right = i === item.answer;
      const word = d.revealed ? (right ? "right" : "tempting") : null;
      const pick = s.committed === i;
      mark.replaceChildren();
      if (word) mark.append(glyph(right ? "check" : "cross"));
      mark.append([pick ? "your pick" : null, word].filter(Boolean).join(", "));
      why.hidden = !d.revealed;
    });
    dom.commit.setAttribute("aria-disabled", String(s.choice === null || d.committedNow));
    const lockLine = mode === "predict" && d.committedNow && !d.revealed
      ? `Locked in: "${item.options[s.committed].text}". Now run it.`
      : "";
    dom.line.textContent = lockLine;
    dom.line.hidden = lockLine === "";
    let verdict = "";
    if (d.revealed) {
      if (mode === "predict") verdict = d.correct ? "You called it." : "Not this time.";
      else verdict = d.correct ? "Right." : "Not quite.";
    }
    dom.verdict.className = `verdict${verdict === "" ? "" : d.correct ? " is-pass" : " is-fail"}`;
    dom.verdict.replaceChildren(...(verdict === "" ? [] : [glyph(d.correct ? "check" : "cross"), verdict]));
    dom.verdict.hidden = verdict === "";
    const outcome = mode === "predict" && d.revealed ? item.outcome : "";
    dom.outcome.textContent = outcome;
    dom.outcome.hidden = outcome === "";
    this.live(lockLine || [verdict, outcome].filter(Boolean).join(" "));
  }

  build() {
    const { item, mode } = this;
    const dom = { inputs: [], options: [] };
    this.dom = dom;
    const name = `${this.uid}-choice`;
    const rows = item.options.map((option, i) => {
      const input = el("input", { type: "radio", name, value: String(i), "data-key": `choice-${i}` });
      input.addEventListener("change", () => this.setState({ choice: i }));
      const mark = el("span", { class: "choice-mark" });
      const why = el("span", { class: "why", text: option.why });
      dom.inputs.push(input);
      dom.options.push({ mark, why });
      return el("li", {}, el("label", { class: "choice" }, input,
        el("span", { class: "choice-text" }, el("span", { class: "opt-text", text: option.text }), why),
        mark));
    });
    dom.commit = el("button", {
      class: "btn btn-primary", type: "button", "data-key": "commit",
      text: mode === "predict" ? "Lock in my prediction" : "Check",
    });
    dom.commit.addEventListener("click", () => this.commit());
    dom.line = el("p", { class: "check-line" });
    dom.verdict = el("p", { class: "verdict" });
    dom.outcome = el("p", { class: "check-outcome" });
    this.ui.append(el("fieldset", { class: "check" },
      el("legend", { class: "check-question", text: item.question }),
      el("ul", { class: "choices" }, ...rows),
      el("div", { class: "check-actions" }, dom.commit),
      dom.line,
      dom.verdict,
      dom.outcome));
  }

  commit() {
    const choice = this.state.choice;
    if (choice === null || this.state.committed !== null) return;
    this.setState({ committed: choice });
    if (this.mode === "check") {
      this.evidence("check", { item: this.item.id, choice, correct: choice === this.item.answer });
      return;
    }
    if (this.targetEl) {
      this.targetEl.removeAttribute("locked");
      if (this.state.resultSeen) this.revealPrediction();
    } else {
      this.revealPrediction();
    }
  }

  onResult() {
    this.setState({ resultSeen: true });
    if (this.state.committed !== null) this.revealPrediction();
  }

  revealPrediction() {
    if (this.state.evidenced) return;
    const choice = this.state.committed;
    this.setState({ evidenced: true });
    this.evidence("prediction", { item: this.item.id, choice, correct: choice === this.item.answer });
  }

  async selfTest() {
    const { dom } = this;
    dom.inputs[0].click();
    if (this.state.choice !== 0) return false;
    dom.commit.click();
    if (this.state.committed !== 0) return false;
    if (this.mode === "check") return this.shownAfterReveal();
    if (!this.targetEl) return this.shownAfterReveal();
    if (this.targetEl.hasAttribute("locked")) return false;
    // Drive the target's own Run control, then wait for the result it reports.
    const run = this.targetEl.querySelector("[data-run]");
    if (!run) return false;
    const finished = new Promise((resolve) => this.targetEl.addEventListener("hx-result", resolve, { once: true }));
    const timeout = new Promise((resolve) => setTimeout(() => resolve("timeout"), RESULT_TIMEOUT_MS));
    run.click();
    if ((await Promise.race([finished, timeout])) === "timeout") return false;
    return this.shownAfterReveal();
  }

  shownAfterReveal() {
    const { dom } = this;
    if (dom.verdict.hidden) return false;
    if (this.mode === "predict" && dom.outcome.hidden) return false;
    return dom.options.every(({ why }) => !why.hidden);
  }

}

customElements.define("hx-check", HxCheck);
