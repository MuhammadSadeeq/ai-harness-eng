// hx-say: say it out loud (BP-2.2). A prompt, a timer you run yourself, the model answer, a rubric self-grade.
//   <hx-say src="B2"></hx-say>                        site/data/say/B2.json (COMPONENTS §11: demo pages use a .json path)
// Evidence: "say" {item, ticked, total, seconds} with the item's objectives from the YAML (not data-objective).
// "Last time" is the result the store held when the page loaded, or the one saved in this visit.
import { HxElement } from "./lib/hx-element.js";
import { getContent } from "./lib/data.js";
import { formatInt } from "./lib/format.js";

const AMBER_AT = 60;
const PLENTY_AT = 90;
const TICK_MS = 250;
const RUBRIC_MIN = 4;
const RUBRIC_MAX = 6;

/** The timer readout for `seconds`: text, amber from 60 s, and the "plenty" line from 90 s. */
export function timerView(seconds) {
  return { text: `${formatInt(seconds)} s`, amber: seconds >= AMBER_AT, plenty: seconds >= PLENTY_AT };
}

export const resultLine = (ticked, total) => `You covered ${ticked} of ${total}. Try it again tomorrow.`;
export const lastLine = (result) => `Last time: ${result.ticked} of ${result.total}`;

/** The index after a move of `delta`, kept inside the prompts. */
export function stepIndex(index, delta, count) {
  return Math.min(count - 1, Math.max(0, index + delta));
}

/** Throws with the first problem in a prompt (AUTHORING §10, SPEC Appendix C: 4 to 6 rubric points). */
export function checkSay(item) {
  if (typeof item?.id !== "string") throw new Error("hx-say: a prompt has no id");
  if (!Array.isArray(item.objectives)) throw new Error(`hx-say: ${item.id} needs an objectives list`);
  if (typeof item.prompt !== "string" || typeof item.model_answer !== "string") throw new Error(`hx-say: ${item.id} needs a prompt and a model answer`);
  if (!Array.isArray(item.rubric) || item.rubric.length < RUBRIC_MIN || item.rubric.length > RUBRIC_MAX
    || item.rubric.some((line) => typeof line !== "string")) {
    throw new Error(`hx-say: ${item.id} needs ${RUBRIC_MIN} to ${RUBRIC_MAX} rubric lines`);
  }
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

const blank = (item) => item.rubric.map(() => false);

export class HxSay extends HxElement {
  static observedAttributes = ["src"];
  static styles = new URL("./hx-say.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    if (!src) throw new Error("hx-say needs src");
    const prompts = await getContent("say", src);
    if (!Array.isArray(prompts) || prompts.length === 0) throw new Error("hx-say: no prompts");
    prompts.forEach(checkSay);
    this.prompts = prompts;
    this.prior = {};
    for (const entry of this.store?.state?.evidence ?? []) {
      if (entry.kind === "say" && entry.detail) this.prior[entry.detail.item] = { ticked: entry.detail.ticked, total: entry.detail.total };
    }
    this.state = { index: 0, phase: "ready", now: 0, elapsed: null, ticks: blank(prompts[0]), saved: {}, cleared: {} };
  }

  // phases: ready -> timing -> timed (stopped or skipped) -> revealed -> saved
  current() {
    return this.prompts[this.state.index];
  }

  toggleTimer() {
    if (this.state.phase === "timing") this.stopTimer();
    else if (this.state.phase === "saved") {
      this.tryAgain();
      this.startTimer();
    } else if (this.state.phase === "ready") this.startTimer();
  }

  startTimer() {
    this.startedAt = performance.now();
    this.timer = setInterval(() => this.onTimerTick(), TICK_MS);
    this.setState({ phase: "timing", now: 0 });
  }

  onTimerTick() {
    const now = Math.floor((performance.now() - this.startedAt) / 1000);
    if (now !== this.state.now) this.setState({ now });
  }

  stopTimer() {
    clearInterval(this.timer);
    this.timer = null;
    const elapsed = Math.floor((performance.now() - this.startedAt) / 1000);
    this.setState({ phase: "timed", elapsed, now: elapsed });
  }

  skip() {
    if (this.state.phase === "ready") this.setState({ phase: "timed", elapsed: null, now: 0 });
  }

  reveal() {
    if (this.state.phase === "timed") this.setState({ phase: "revealed" });
  }

  setTick(i, on) {
    if (this.state.phase !== "revealed") return;
    const ticks = [...this.state.ticks];
    ticks[i] = on;
    this.setState({ ticks });
  }

  save() {
    if (this.state.phase !== "revealed") return;
    const item = this.current();
    const ticked = this.state.ticks.filter(Boolean).length;
    const total = item.rubric.length;
    const detail = { item: item.id, ticked, total, seconds: this.state.elapsed };
    this.evidence("say", detail, item.objectives);
    const cleared = { ...this.state.cleared };
    delete cleared[item.id];
    this.setState({ phase: "saved", saved: { ...this.state.saved, [item.id]: { ticked, total } }, cleared });
  }

  // Moves to another prompt; the timer and the self-grade of the prompt left behind are not kept.
  go(index) {
    clearInterval(this.timer);
    this.timer = null;
    this.setState({ index, phase: "ready", now: 0, elapsed: null, ticks: blank(this.prompts[index]) });
  }

  lastResult(item) {
    if (this.state.cleared[item.id]) return null;
    return this.state.saved[item.id] ?? this.prior[item.id] ?? null;
  }

  // "Try again" after a save: a fresh attempt, with the timer, the ticks and the result line reset.
  tryAgain() {
    if (this.state.phase !== "saved") return;
    const item = this.current();
    const saved = { ...this.state.saved };
    delete saved[item.id];
    this.setState({
      phase: "ready", now: 0, elapsed: null, ticks: blank(item), saved,
      cleared: { ...this.state.cleared, [item.id]: true },
    });
  }

  render() {
    if (!this.dom) this.build();
    const { dom, state: s } = this;
    const n = this.prompts.length;
    const item = this.current();
    const phase = s.phase;
    dom.count.textContent = `${formatInt(s.index + 1)} of ${formatInt(n)}`;
    dom.prev.setAttribute("aria-disabled", String(s.index === 0));
    dom.next.setAttribute("aria-disabled", String(s.index === n - 1));
    dom.prompt.textContent = item.prompt;
    const view = timerView(phase === "timing" ? s.now : (s.elapsed ?? s.now));
    dom.time.textContent = view.text;
    dom.readout.classList.toggle("is-amber", view.amber);
    dom.plenty.hidden = !view.plenty;
    dom.dot.hidden = phase !== "timing" || this.reducedMotion;
    dom.timerKey.textContent = phase === "timing" ? "Stop" : "Start";
    dom.timerKey.className = phase === "timing" ? "key" : "key key-primary";
    dom.timerKey.setAttribute("aria-disabled", String(phase === "timed" || phase === "revealed"));
    dom.skip.hidden = phase !== "ready";
    dom.after.hidden = phase !== "timed";
    if (dom.sig !== s.index) this.buildReveal(item);
    dom.revealPanel.hidden = phase !== "revealed" && phase !== "saved";
    dom.boxes.forEach((box, i) => {
      box.checked = Boolean(s.ticks[i]);
      box.disabled = phase === "saved";
    });
    dom.save.setAttribute("aria-disabled", String(phase === "saved"));
    dom.again.hidden = phase !== "saved";
    const last = this.lastResult(item);
    const saved = phase === "saved";
    const line = saved ? resultLine(s.ticks.filter(Boolean).length, item.rubric.length)
      : phase === "ready" && last ? lastLine(last) : "";
    dom.result.textContent = line;
    dom.result.hidden = line === "";
    this.live(saved ? line : "");
  }

  buildReveal(item) {
    const { dom } = this;
    dom.sig = this.state.index;
    dom.model.textContent = item.model_answer;
    dom.boxes = item.rubric.map((text, i) => {
      const box = el("input", { type: "checkbox", "data-key": `rub-${i}` });
      box.addEventListener("change", () => this.setTick(i, box.checked));
      return box;
    });
    dom.rubric.replaceChildren(...dom.boxes.map((box, i) => el("li", {},
      el("label", { class: "choice" }, box, el("span", { class: "choice-text", text: item.rubric[i] })))));
  }

  build() {
    const dom = { sig: null, boxes: [] };
    this.dom = dom;
    dom.count = el("p", { class: "say-count" });
    dom.prev = el("button", { class: "key", type: "button", "data-key": "prev", text: "Previous" });
    dom.next = el("button", { class: "key", type: "button", "data-key": "next", text: "Next" });
    dom.prev.addEventListener("click", () => this.onNav(-1));
    dom.next.addEventListener("click", () => this.onNav(1));
    dom.prompt = el("p", { class: "say-prompt" });
    dom.dot = el("span", { class: "say-dot is-pulse", hidden: "" });
    dom.time = el("span", { class: "readout-value say-time" });
    dom.readout = el("div", { class: "readout say-readout" }, dom.dot, dom.time);
    dom.plenty = el("p", { class: "say-plenty", text: "90 s is plenty", hidden: "" });
    dom.timerKey = el("button", { class: "key key-primary", type: "button", "data-key": "timer" });
    dom.timerKey.addEventListener("click", () => this.onTimerKey());
    dom.skip = el("button", { class: "say-skip", type: "button", "data-key": "skip", text: "Skip the timer" });
    dom.skip.addEventListener("click", () => this.skip());
    dom.after = el("div", { class: "say-after", hidden: "" });
    dom.reveal = el("button", { class: "key key-primary", type: "button", "data-key": "reveal", text: "Show the model answer" });
    dom.reveal.addEventListener("click", () => this.reveal());
    dom.after.append(dom.reveal);
    dom.model = el("p", { class: "say-model" });
    dom.rubric = el("ul", { class: "choices" });
    dom.save = el("button", { class: "key key-primary", type: "button", "data-key": "save", text: "Save my self-grade" });
    dom.save.addEventListener("click", () => this.onSave());
    dom.again = el("button", { class: "key", type: "button", "data-key": "again", text: "Try again" });
    dom.again.addEventListener("click", () => this.tryAgain());
    dom.revealPanel = el("div", { class: "say-reveal", hidden: "" },
      el("p", { class: "say-label", text: "Model answer" }),
      dom.model,
      el("fieldset", { class: "say-set" }, el("legend", { text: "What did your answer include?" }), dom.rubric),
      el("div", { class: "say-actions" }, dom.save, dom.again));
    dom.result = el("p", { class: "say-result", hidden: "" });
    this.ui.append(el("section", { class: "say" },
      el("div", { class: "say-head" }, dom.count, el("div", { class: "say-nav" }, dom.prev, dom.next)),
      dom.prompt,
      el("p", { class: "say-instruction", text: "Say your answer out loud, as if in an interview. Aim for 60 to 90 seconds." }),
      el("div", { class: "say-timer" }, dom.readout, dom.plenty,
        el("div", { class: "say-timer-keys" }, dom.timerKey, dom.skip),
        el("p", { class: "say-note", text: "Nothing is recorded; this is just for you." })),
      dom.after,
      dom.revealPanel,
      dom.result));
  }

  onNav(delta) {
    const button = delta < 0 ? this.dom.prev : this.dom.next;
    if (button.getAttribute("aria-disabled") === "true") return;
    this.go(stepIndex(this.state.index, delta, this.prompts.length));
  }

  onTimerKey() {
    if (this.dom.timerKey.getAttribute("aria-disabled") === "true") return;
    this.toggleTimer();
  }

  onSave() {
    if (this.dom.save.getAttribute("aria-disabled") === "true") return;
    this.save();
  }

  // Self-test: Start, Stop, reveal, tick two, save, check the line and the evidence, then restore.
  async selfTest() {
    while (this.state.index > 0) this.dom.prev.click();
    if (this.state.phase !== "ready") return false;
    this.dom.timerKey.click();
    if (this.state.phase !== "timing") return false;
    this.dom.timerKey.click();
    if (typeof this.state.elapsed !== "number") return false;
    this.dom.reveal.click();
    if (this.state.phase !== "revealed" || this.dom.boxes.length < 2) return false;
    this.dom.boxes[0].click();
    this.dom.boxes[1].click();
    if (this.state.ticks.filter(Boolean).length !== 2) return false;
    let heard = null;
    const listen = (event) => {
      if (event.detail?.kind === "say") heard = event.detail;
    };
    document.addEventListener("hx-evidence", listen);
    this.dom.save.click();
    document.removeEventListener("hx-evidence", listen);
    const item = this.current();
    const expected = resultLine(2, item.rubric.length);
    if (this.dom.result.textContent !== expected) return false;
    const { detail } = heard ?? {};
    if (!detail || detail.item !== item.id || detail.ticked !== 2 || detail.total !== item.rubric.length) return false;
    if (JSON.stringify(heard.objectives) !== JSON.stringify(item.objectives)) return false;
    // Restore through the learner's own Try again: no result line is left behind.
    this.dom.again.click();
    return this.state.phase === "ready" && this.dom.result.hidden && this.state.saved[item.id] === undefined;
  }

  disconnectedCallback() {
    clearInterval(this.timer);
  }
}

customElements.define("hx-say", HxSay);
