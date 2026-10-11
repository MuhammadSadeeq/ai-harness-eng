// hx-check: a prediction gate (mode="predict") or a check item (mode="check"). DESIGN §7.3; AUTHORING §10 items.
//   <hx-check src="data/checks-demo.json" item="b2-predict-turn-limit" for="bench1">…no-JS fallback…</hx-check>
// predict + for: committing removes `locked` from the target; the target's hx-result reveals the outcome.
// predict without for: the reveal comes right after the commit. check: the reveal comes right after the commit.
// Evidence: "check" on a check commit; "prediction" when a prediction is revealed (COMPONENTS §5).
import { HxElement } from "./lib/hx-element.js";
import { getContent, getFactsCore } from "./lib/data.js";
import { mountFacts } from "../core/shell/facts.js";
import { validAnswer } from "./lib/restore.js";

const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
let uidCount = 0;

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

/** The parts of an option's why: its text, and the fact id whose chip the text carries (or null). */
export function whyParts(option) {
  return { text: option.why, fact: typeof option.fact === "string" ? option.fact : null };
}

/** Checks that an item has the AUTHORING §10 shape. Throws with the first problem. */
export function validItem(item, mode) {
  if (!item || typeof item.id !== "string") throw new Error("hx-check: item has no id");
  if (typeof item.question !== "string") throw new Error(`hx-check: ${item.id} has no question`);
  if (!Array.isArray(item.options) || item.options.length < 2 || item.options.length > 5) {
    throw new Error(`hx-check: ${item.id} needs 2 to 5 options`);
  }
  for (const option of item.options) {
    if (typeof option?.text !== "string" || typeof option?.why !== "string") {
      throw new Error(`hx-check: ${item.id} has an option without text or why`);
    }
    if (option.fact !== undefined && typeof option.fact !== "string") throw new Error(`hx-check: ${item.id} has a fact that is not an id`);
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
    this.facts = item.options.some((o) => typeof o.fact === "string") ? await getFactsCore() : null;
    this.uid = `hxc${++uidCount}`;
    this.targetEl = null;
    const forId = this.getAttribute("for");
    if (forId && mode === "predict") {
      const target = document.getElementById(forId);
      if (!target) throw new Error(`hx-check: no element with id ${forId}`);
      // A component target may still be upgrading; any other element is a plain target.
      if (target.localName.includes("-") && !customElements.get(target.localName)) await customElements.whenDefined(target.localName);
      if (target.ready && (await target.ready) === false) throw new Error(`hx-check: ${forId} failed to load`);
      this.targetEl = target;
      target.addEventListener("hx-result", () => this.onResult());
    }
    // B2 round 2: a committed answer is restored from the store (COMPONENTS §5). A restored reveal was already
    // credited, so it is not credited again; a restored prediction unlocks its target again.
    const saved = validAnswer(this.store?.state?.answers?.[item.id], item.options.length);
    this.state = {
      choice: saved?.choice ?? null,
      committed: saved?.choice ?? null,
      resultSeen: saved?.revealed === true,
      evidenced: saved?.revealed === true,
      nudge: false,
    };
    if (saved && mode === "predict" && this.targetEl) {
      this.targetEl.removeAttribute("locked");
      if (this.targetEl.huntStage && this.targetEl.huntStage() !== "none") this.state.resultSeen = true;
    }
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
    // Tapping the key with nothing picked says so in the result line; the key stays focusable.
    const nudge = s.nudge && s.choice === null && !d.committedNow;
    const lockLine = nudge ? "Pick an answer first."
      : mode === "predict" && d.committedNow && !d.revealed
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
      input.addEventListener("change", () => this.setState({ choice: i, nudge: false }));
      const mark = el("span", { class: "choice-mark" });
      const parts = whyParts(option);
      const why = el("span", { class: "why" }, parts.fact
        ? el("span", { class: "fact", "data-fact": parts.fact, text: parts.text })
        : parts.text);
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
    // The shell mounts chips once at load; a component's own UI needs its fact chips mounted here.
    if (this.facts) mountFacts(this.facts, document);
  }

  commit() {
    const choice = this.state.choice;
    if (this.state.committed !== null) return;
    if (choice === null) {
      this.setState({ nudge: true });
      return;
    }
    this.setState({ committed: choice });
    if (this.mode === "check") {
      this.saveAnswer({ choice, revealed: true });
      this.evidence("check", { item: this.item.id, choice, correct: choice === this.item.answer }, choice === this.item.answer ? null : []); // a wrong answer credits no objective
      return;
    }
    this.saveAnswer({ choice, revealed: false });
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
    this.saveAnswer({ choice, revealed: true });
    // A prediction is recorded, never credited: it shows the learner committed, not that they know (COMPONENTS §5).
    this.evidence("prediction", { item: this.item.id, choice, correct: choice === this.item.answer }, []);
  }

  /** Writes this item's answer to the store (the learner's own UI state). Skipped while a self-test runs. */
  saveAnswer(record) {
    if (this.testing) return;
    try {
      this.store?.update((doc) => {
        doc.answers ??= {};
        doc.answers[this.item.id] = record;
      });
    } catch {
      // The store refused the write (for example, an invalid document). The answer still shows.
    }
  }

  // Self-test for any target: commit, check the target lost `locked`, send a synthetic result, check the reveal,
  // then restore the check to unanswered.
  async selfTest() {
    this.testing = true;
    try {
      return await this.runSelfTest();
    } finally {
      this.testing = false;
    }
  }

  runSelfTest() {
    const { dom } = this;
    dom.inputs[0].click();
    if (this.state.choice !== 0) return false;
    dom.commit.click();
    if (this.state.committed !== 0) return false;
    if (this.targetEl) {
      if (this.targetEl.hasAttribute("locked")) return false;
      this.targetEl.dispatchEvent(new CustomEvent("hx-result", { bubbles: true, detail: { source: "selftest" } }));
    }
    const shown = this.shownAfterReveal();
    this.setState({ choice: null, committed: null, resultSeen: false, evidenced: false, nudge: false });
    return shown;
  }

  shownAfterReveal() {
    const { dom } = this;
    if (dom.verdict.hidden) return false;
    if (this.mode === "predict" && dom.outcome.hidden) return false;
    return dom.options.every(({ why }) => !why.hidden);
  }

}

customElements.define("hx-check", HxCheck);
