// hx-placement (BP-3.1b §1): "where should I start?" A placement check that suggests a starting point. It is not a
// test: it never shows a fail, and every module stays open. src is a module id (site/data/placement/<id>.json,
// compiled from content/<id>/placement.yaml by tools/gen_data.py) or, on demo pages, a path to a .json file
// (COMPONENTS.md §11). One question at a time; right and wrong show only at the end.
import { HxElement } from "./lib/hx-element.js";
import { getContent, getCourseCore } from "./lib/data.js";
import { plural } from "./lib/format.js";
import { localToday } from "./lib/leitner.js";
import { tally, suggestStart, skippable } from "./lib/placement.js";

const NOT_A_TEST = "This is not a test you can fail. It only suggests where to start, and every module stays open.";
const DONT_KNOW = "dk";

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "text") node.textContent = String(value);
    else if (key === "checked") node.checked = value === true;
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  node.append(...children.filter((child) => child !== undefined && child !== null && child !== false));
  return node;
}

/** The content must have the shape tools/gen_data.py checks; anything else leaves the fallback in place. */
function checkContent(content) {
  const bad = () => new Error("placement content is not valid");
  if (!content || !Array.isArray(content.questions) || content.questions.length === 0) throw bad();
  if (!Array.isArray(content.rules) || typeof content.start !== "string") throw bad();
  for (const q of content.questions) {
    if (typeof q.id !== "string" || typeof q.part !== "string" || typeof q.question !== "string") throw bad();
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.filter((o) => o.right === true).length !== 1) throw bad();
  }
}

class HxPlacement extends HxElement {
  static styles = new URL("./hx-placement.css", import.meta.url).href;
  static observedAttributes = ["src"];

  async setup() {
    const [content, course] = await Promise.all([getContent("placement", this.getAttribute("src")), getCourseCore()]);
    checkContent(content);
    this.content = content;
    this.course = course;
    this.state = { index: 0, answers: {}, result: null };
  }

  answered() {
    return Object.prototype.hasOwnProperty.call(this.state.answers, this.content.questions[this.state.index].id);
  }

  go(index) {
    this.setState({ index });
  }

  choose(question, value) {
    this.setState((s) => ({ answers: { ...s.answers, [question.id]: value } }));
  }

  finish() {
    const { questions } = this.content;
    const results = tally(questions, this.state.answers);
    const right = results.reduce((sum, row) => sum + row.right, 0);
    const total = questions.length;
    const start = suggestStart(this.content, results);
    const skip = skippable(this.course, this.content, results, start);
    this.setState({ result: { results, right, total, start, skip } });
    try {
      this.store?.update((doc) => {
        doc.placement = { start, at: localToday(), right };
      });
    } catch {
      // A store that cannot save leaves the suggestion on screen; the learner can still read it.
    }
    this.evidence("placement", { start, right, total });
    this.dispatchEvent(new CustomEvent("hx-change", { bubbles: true, detail: { name: "right", value: right } }));
    this.live(`Suggested start: ${this.moduleTitle(start)}.`);
  }

  again() {
    this.setState({ index: 0, answers: {}, result: null });
  }

  moduleTitle(id) {
    return this.course?.modules?.find((m) => m.id === id)?.title ?? id;
  }

  /** The link to the start module when the page's course map says it is built; plain text otherwise. */
  startLink(start) {
    const item = document.querySelector(`[data-module-id="${CSS.escape(start)}"]`);
    const href = item?.querySelector("a")?.getAttribute("href");
    return href ? el("a", { href, text: this.moduleTitle(start) }) : el("span", { text: this.moduleTitle(start) });
  }

  render() {
    const ui = this.ui;
    ui.replaceChildren(el("p", { class: "placement-note", text: NOT_A_TEST }));
    if (this.state.result) this.renderResult(ui, this.state.result);
    else this.renderQuestion(ui);
  }

  renderQuestion(ui) {
    const { questions } = this.content;
    const { index, answers } = this.state;
    const question = questions[index];
    const picked = answers[question.id];
    const rows = question.options.map((option, i) => el("li", {}, el("label", { class: "placement-choice" },
      el("input", {
        type: "radio", name: `pl-${question.id}`, value: String(i), "data-key": `opt-${i}`,
        checked: picked === i,
      }),
      el("span", { text: option.text }))));
    rows.push(el("li", {}, el("label", { class: "placement-choice" },
      el("input", { type: "radio", name: `pl-${question.id}`, value: DONT_KNOW, "data-key": "opt-dk", checked: picked === DONT_KNOW }),
      el("span", { text: "I don't know" }))));
    const list = el("ul", { class: "placement-options" }, ...rows);
    list.addEventListener("change", (event) => {
      const value = event.target.value;
      this.choose(question, value === DONT_KNOW ? DONT_KNOW : Number(value));
    });
    const back = el("button", { type: "button", class: "placement-back", "data-key": "back", "aria-disabled": index === 0 ? "true" : "false", text: "Back" });
    back.addEventListener("click", () => {
      if (index > 0) this.go(index - 1);
    });
    const next = el("button", { type: "button", class: "placement-next", "data-key": "next", "aria-disabled": this.answered() ? "false" : "true", text: "Next" });
    next.addEventListener("click", () => {
      if (!this.answered()) return;
      if (index < questions.length - 1) this.go(index + 1);
      else this.finish();
    });
    ui.append(
      el("p", { class: "placement-count", text: `Question ${index + 1} of ${questions.length}` }),
      el("fieldset", { class: "placement-question" }, el("legend", { text: question.question }), list),
      el("div", { class: "placement-actions" }, back, next),
    );
  }

  renderResult(ui, result) {
    const partTitle = (id) => this.course?.parts?.find((p) => p.id === id)?.title ?? id;
    const parts = result.results.map((row) => el("div", { class: "placement-part" },
      el("p", { class: "placement-part-line", text: `${partTitle(row.part)}: ${row.right} right of ${plural(row.of, "question")}` }),
      el("div", { class: "placement-bar", "aria-hidden": "true" }, el("span", { style: `width: ${Math.round((100 * row.right) / row.of)}%` })),
    ));
    const why = this.content.questions.map((q, i) => {
      const pick = this.state.answers[q.id];
      const verdict = pick === DONT_KNOW ? "I don't know" : q.options[pick]?.right === true ? "right" : "not right";
      return el("details", { class: "placement-why" },
        el("summary", { text: `Question ${i + 1}: ${verdict}` }),
        el("p", { text: q.question }),
        el("p", { text: q.why ?? "" }));
    });
    const skip = result.skip.length
      ? el("div", { class: "placement-skip" },
        el("p", { text: "You may skip these; their checks are still there if you want proof." }),
        el("ul", {}, ...result.skip.map((id) => el("li", { text: this.moduleTitle(id) }))))
      : null;
    const again = el("button", { type: "button", class: "placement-again", "data-key": "again", text: "Take it again" });
    again.addEventListener("click", () => this.again());
    ui.append(
      el("h3", { class: "placement-title", text: "Where to start" }),
      el("p", { class: "placement-suggest" }, el("span", { text: "Suggested start: " }), this.startLink(result.start)),
      el("div", { class: "placement-parts" }, ...parts),
      el("div", { class: "placement-whys" }, ...why),
      ...(skip ? [skip] : []),
      el("div", { class: "placement-actions" }, again),
    );
  }

  hxValue(name) {
    if (name === "total") return this.content?.questions?.length ?? null;
    if (name === "right") return this.state.result?.right ?? null;
    return null;
  }

  hxSetValue() {
    // Both values are read-only.
  }

  hxRange() {
    return null;
  }

  hxLabel(name) {
    return { right: "Right answers", total: "Questions" }[name] ?? null;
  }

  async selfTest() {
    const { questions } = this.content;
    // Drive the real UI: the right answer to each question, Next to the end, then the result.
    for (const q of questions) {
      const right = q.options.findIndex((o) => o.right === true);
      this.ui.querySelector(`input[name="pl-${q.id}"][value="${right}"]`)?.click();
      this.ui.querySelector('[data-key="next"]')?.click();
    }
    const result = this.state.result;
    if (!result || result.right !== questions.length) return false;
    if (!this.ui.querySelector(".placement-suggest")) return false;
    if (this.store?.state?.placement?.start !== result.start) return false;
    this.ui.querySelector('[data-key="again"]')?.click();
    return this.state.result === null && this.state.index === 0;
  }
}

customElements.define("hx-placement", HxPlacement);
export { HxPlacement };
