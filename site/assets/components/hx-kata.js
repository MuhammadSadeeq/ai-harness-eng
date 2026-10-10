// hx-kata: a Python kata in the page (BP-1.6 §2; AUTHORING §8; D-014, D-015, D-016).
//   <hx-kata kata="lab-turn-limit" mode="practice">…no-JS fallback…</hx-kata>
// mode="memory" needs a kata with from_memory: true, and has no hints. Python (about 13 MB, the first time
// only) starts when the kata comes near the viewport or its editor gets focus. One Python per page
// (lib/py-host.js): a load that fails shows the failure and keeps the code, and a slow load says so with Try again; a run
// that takes more than 10 s is stopped. Evidence: "kata" on every run (COMPONENTS §5). Drafts live under
// drafts[<kata id>] (drafts[<kata id>:memory] in memory mode, with the elapsed time), and are flushed at once
// on pagehide, when the page becomes hidden, and when the editor loses focus.
import { HxElement } from "./lib/hx-element.js";
import { mountEditor } from "./lib/editor.js";
import { sharedPython } from "./lib/py-host.js";
import { getKata, getCourse } from "./lib/data.js";
import { isKataId } from "./lib/kata-id.js";

const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const DRAFT_DELAY_MS = 500;
const HINT_COUNT = 3;

const TIMEOUT_MESSAGE = "Your code ran for more than 10 seconds and was stopped. Is there a loop without an exit?";
const LOADING_COPY = "Loading Python (about 13 MB, the first time only)…";
const SLOW_COPY = "Still loading Python. A slow connection can take a minute or two.";
const FAILED_COPY = "Python could not load. Check your connection and try again.";
const RETRY_COPY = "Try again";
const RUNNING_COPY = "Running…";
const TIMER_IDLE_COPY = "The timer starts when you type.";
const UNSAVED_COPY = "Your code is not saved in this browser. Copy it before you leave.";
const SOLUTION_NOTE = "Compare it with yours; the tests are the judge, not the text.";
const MEMORY_BLANK = "# Write it from memory.\n";
const WORDS = { passed: "pass", failed: "fail", error: "error" };

const python = sharedPython();

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

/** m:ss for a duration in milliseconds. */
export function formatClock(ms) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

let uidCount = 0;

export class HxKata extends HxElement {
  static styles = new URL("./hx-kata.css", import.meta.url).href;

  #clock = { started: false, banked: 0, since: null, paused: false };
  #tick = 0;
  #draftTimer = 0;
  #pending = false;
  #lastRun = null;
  #editor = null;
  #editorReady = null;
  #unsubscribe = () => {};
  #observer = null;
  #testCount = null;
  #saveFailed = false;
  #onPageHide = () => this.flushDraft();
  #onVisibility = () => {
    if (document.visibilityState === "hidden") this.flushDraft();
  };

  async setup() {
    const id = this.getAttribute("kata") ?? "";
    if (!isKataId(id)) throw new Error(`hx-kata needs a kata id, got ${id}`);
    const mode = this.getAttribute("mode") ?? "practice";
    if (mode !== "practice" && mode !== "memory") throw new Error("hx-kata: mode must be practice or memory");
    const kata = await getKata(id);
    if (!kata || typeof kata.starter !== "string" || typeof kata.solution !== "string" || typeof kata.tests !== "string") {
      throw new Error(`hx-kata: katas/${id} is incomplete`);
    }
    if (mode === "memory" && kata.from_memory !== true) throw new Error(`hx-kata: ${id} is not a from_memory kata`);
    const course = kata.module ? await getCourse() : null;
    const texts = new Map();
    for (const module of course?.modules ?? []) {
      if (module.id !== kata.module) continue;
      for (const objective of module.objectives ?? []) texts.set(objective.id, objective.text);
    }
    this.kata = kata;
    this.mode = mode;
    this.draftKey = mode === "memory" ? `${id}:memory` : id;
    this.objectives = kata.objectives.map((objectiveId) => texts.get(objectiveId) ?? objectiveId);
    this.uid = `hxk${++uidCount}`;
    const draft = this.readDraft();
    this.startCode = draft?.code ?? (mode === "memory" ? MEMORY_BLANK : kata.starter);
    if (mode === "memory" && Number.isFinite(draft?.elapsed_ms)) {
      // The timer resumes at the stored time; it runs again from the next keystroke.
      this.#clock = { started: false, banked: draft.elapsed_ms, since: null, paused: false };
    }
    this.state = {
      running: false,
      results: null,
      ran: 0,
      hintsShown: 0,
      solutionShown: false,
      confirmReset: false,
      passedMs: null,
      unsaved: !this.storageOk(),
    };
    this.#unsubscribe = python.subscribe(() => this.patch({}));
    this.addEventListener("focusin", (event) => {
      const target = event.target;
      if (target instanceof Element && (target.matches("textarea") || target.closest(".cm-editor"))) this.startPython();
    });
    window.addEventListener("pagehide", this.#onPageHide);
    document.addEventListener("visibilitychange", this.#onVisibility);
    // Python starts when the kata nears the viewport, or when its editor gets focus, whichever comes first.
    if (typeof IntersectionObserver === "function") {
      this.#observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) this.startPython();
      }, { rootMargin: "200px" });
      this.#observer.observe(this);
    } else {
      this.startPython();
    }
  }

  startPython() {
    python.start();
    this.#observer?.disconnect();
    this.#observer = null;
  }

  disconnectedCallback() {
    this.flushDraft();
    this.#unsubscribe();
    this.#observer?.disconnect();
    clearInterval(this.#tick);
    window.removeEventListener("pagehide", this.#onPageHide);
    document.removeEventListener("visibilitychange", this.#onVisibility);
  }

  /** Merges a patch and re-renders once the UI exists (state set before the first render is kept). */
  patch(patch) {
    this.state = { ...this.state, ...patch };
    if (this.dom) this.setState({});
  }

  get store() {
    try {
      return super.store ?? null;
    } catch {
      return null;
    }
  }

  /** The stored draft record for this kata and mode, or null. */
  readDraft() {
    const draft = this.store?.state?.drafts?.[this.draftKey];
    return draft && typeof draft.code === "string" ? draft : null;
  }

  /** False when the store cannot persist (blocked or unavailable) or a save has failed. */
  storageOk() {
    const store = this.store;
    if (!store || store.persistent === false || store.blocked || this.#saveFailed) return false;
    return true;
  }

  saveDraft(code) {
    const record = { code, at: new Date().toISOString() };
    if (this.mode === "memory") record.elapsed_ms = Math.round(this.elapsedMs());
    try {
      this.store?.update((doc) => {
        doc.drafts ??= {};
        doc.drafts[this.draftKey] = record;
      });
    } catch {
      this.#saveFailed = true;
    }
    this.patch({ unsaved: !this.storageOk() });
  }

  dropDraft() {
    try {
      this.store?.update((doc) => {
        if (doc.drafts) delete doc.drafts[this.draftKey];
      });
    } catch {
      this.#saveFailed = true;
    }
    this.patch({ unsaved: !this.storageOk() });
  }

  /** Saves at once what is pending: a keystroke not yet saved, or a memory timer that is running. */
  flushDraft() {
    if (!this.dom) return;
    const running = this.mode === "memory" && this.clockStarted() && !this.#clock.paused;
    if (!this.#pending && !running) return;
    clearTimeout(this.#draftTimer);
    this.#pending = false;
    this.saveDraft(this.code());
  }

  /** typed is true for keystrokes: the first one starts the clock, and every one schedules the draft. */
  onCode(code, typed = false) {
    if (typed) this.startClock();
    this.#pending = true;
    clearTimeout(this.#draftTimer);
    this.#draftTimer = setTimeout(() => {
      this.#pending = false;
      this.saveDraft(code);
    }, DRAFT_DELAY_MS);
  }

  code() {
    return this.#editor ? this.#editor.getValue() : this.dom.textarea.value;
  }

  setCode(text, typed = false) {
    if (this.#editor) this.#editor.setValue(text, { typed });
    else this.dom.textarea.value = text;
  }

  clockStarted() {
    return this.#clock.started;
  }

  startClock() {
    if (this.#clock.started) return;
    this.#clock.started = true;
    this.#clock.since = Date.now();
    this.patch({});
  }

  elapsedMs() {
    const clock = this.#clock;
    return clock.banked + (clock.started && !clock.paused ? Date.now() - clock.since : 0);
  }

  togglePause() {
    const clock = this.#clock;
    if (!clock.started) return;
    if (clock.paused) {
      clock.since = Date.now();
      clock.paused = false;
    } else {
      clock.banked = this.elapsedMs();
      clock.paused = true;
    }
    this.patch({});
  }

  paintClock() {
    if (this.dom) this.dom.clockValue.textContent = formatClock(this.elapsedMs());
  }

  totalTests() {
    this.#testCount ??= [...this.kata.tests.matchAll(/^def (test_\w*)\s*\(/gm)].length;
    return this.#testCount;
  }

  build() {
    const { kata, uid } = this;
    const memory = this.mode === "memory";
    const dom = {};
    this.dom = dom;
    dom.title = el("h3", { class: "kata-title", text: kata.title });
    dom.meta = el("p", { class: "kata-meta", text: `${kata.minutes} minutes` });
    dom.objectives = el("ul", { class: "kata-objectives" },
      ...this.objectives.map((text) => el("li", { text })));
    dom.objectives.hidden = this.objectives.length === 0;
    dom.loading = el("div", { class: "kata-loading" });
    dom.loadingText = el("p", { class: "kata-loading-line" });
    dom.progress = el("progress", { class: "kata-progress", "aria-hidden": "true" });
    dom.retry = el("button", { class: "key", type: "button", "data-key": "retry", text: RETRY_COPY });
    dom.retry.addEventListener("click", () => python.restart());
    dom.loading.append(dom.loadingText, dom.progress, dom.retry);
    dom.label = el("p", { class: "kata-label", id: `${uid}-label`, text: "Your code" });
    dom.textarea = el("textarea", {
      class: "kata-code", id: `${uid}-code`, rows: "12", spellcheck: "false", autocapitalize: "off",
      autocomplete: "off", wrap: "off", "aria-labelledby": `${uid}-label`,
    });
    dom.textarea.value = this.startCode;
    dom.textarea.addEventListener("input", () => this.onCode(dom.textarea.value, true));
    dom.host = el("div", { class: "kata-editor" }, dom.textarea);
    dom.host.addEventListener("focusout", () => this.flushDraft());
    dom.clockValue = el("span", { class: "readout-value", text: formatClock(this.elapsedMs()) });
    dom.timerNote = el("p", { class: "kata-clock-note", text: TIMER_IDLE_COPY });
    dom.pause = el("button", { class: "key", type: "button", "data-key": "pause", text: "Pause" });
    dom.clock = el("div", { class: "kata-clock" },
      el("p", { class: "readout kata-timer" }, el("span", { class: "readout-label", text: "Time" }), dom.clockValue),
      dom.pause);
    dom.clockBlock = el("div", { class: "kata-clock-block" }, dom.clock, dom.timerNote);
    dom.unsaved = el("p", { class: "kata-unsaved status-warn", text: UNSAVED_COPY });
    dom.run = el("button", { class: "key key-primary", type: "button", "data-key": "run", text: "Run the tests" });
    dom.reset = el("button", { class: "key", type: "button", "data-key": "reset", text: memory ? "Clear the file" : "Reset to starter" });
    dom.keys = el("div", { class: "kata-keys" }, dom.run, dom.reset);
    dom.confirm = el("div", { class: "kata-confirm" },
      el("p", { text: memory ? "Clear your code? Your draft will be lost." : "Replace your code with the starter? Your draft will be lost." }),
      el("div", { class: "kata-keys" },
        el("button", { class: "key key-primary", type: "button", "data-key": "reset-yes", text: memory ? "Clear my code" : "Replace my code" }),
        el("button", { class: "key", type: "button", "data-key": "reset-no", text: "Keep my code" })));
    dom.status = el("p", { class: "kata-status" });
    dom.count = el("p", { class: "kata-count" });
    dom.error = el("p", { class: "kata-error" });
    dom.rows = el("ul", { class: "kata-rows" });
    dom.message = el("pre", { class: "kata-message" });
    dom.passed = el("p", { class: "kata-passed" });
    dom.results = el("div", { class: "kata-results" }, dom.count, dom.error, dom.rows, dom.message, dom.passed);
    dom.hintList = el("ol", { class: "kata-hints", tabindex: "-1" });
    dom.hint = el("button", { class: "key", type: "button", "data-key": "hint" });
    dom.solutionButton = el("button", { class: "key", type: "button", "data-key": "solution", text: "Show the solution" });
    dom.solutionNote = el("p", { class: "kata-note", tabindex: "-1", text: SOLUTION_NOTE });
    dom.solutionCode = el("pre", { class: "kata-code-view" }, el("code", { text: kata.solution }));
    dom.solutionBlock = el("div", { class: "kata-solution" }, dom.solutionNote, dom.solutionCode);

    dom.run.addEventListener("click", () => this.run());
    dom.reset.addEventListener("click", () => {
      if (this.state.running) return;
      this.patch({ confirmReset: true });
      this.ui.querySelector('[data-key="reset-yes"]')?.focus();
    });
    dom.confirm.querySelector('[data-key="reset-yes"]').addEventListener("click", () => this.replaceWithStarter());
    dom.confirm.querySelector('[data-key="reset-no"]').addEventListener("click", () => {
      this.patch({ confirmReset: false });
      this.ui.querySelector('[data-key="reset"]')?.focus();
    });
    dom.pause.addEventListener("click", () => this.togglePause());
    dom.hint.addEventListener("click", () => {
      this.patch({ hintsShown: Math.min(HINT_COUNT, this.state.hintsShown + 1) });
      if (this.state.hintsShown >= HINT_COUNT) dom.hintList.focus({ preventScroll: true });
    });
    dom.solutionButton.addEventListener("click", () => {
      this.patch({ solutionShown: true });
      dom.solutionNote.focus({ preventScroll: true });
    });

    dom.hintList.hidden = true;
    dom.solutionBlock.hidden = true;
    dom.confirm.hidden = true;
    dom.results.hidden = true;
    dom.error.hidden = true;
    dom.message.hidden = true;
    dom.passed.hidden = true;
    dom.clockBlock.hidden = !memory;
    dom.status.hidden = true;
    this.ui.append(el("div", { class: "kata" },
      el("header", { class: "kata-head" }, dom.title, dom.meta, dom.objectives),
      dom.loading,
      dom.label,
      dom.host,
      dom.unsaved,
      dom.clockBlock,
      dom.keys,
      dom.status,
      dom.confirm,
      dom.results,
      dom.hintList,
      dom.hint,
      dom.solutionButton,
      dom.solutionBlock));

    this.#editorReady = mountEditor(dom.host, {
      doc: this.startCode,
      label: "Your code",
      onChange: (text, typed) => this.onCode(text, typed),
    }).then((editor) => {
      if (!editor) return null;
      this.#editor = editor;
      dom.textarea.hidden = true;
      dom.textarea.disabled = true;
      return editor;
    }).catch(() => null);
    if (memory) {
      this.#tick = setInterval(() => this.paintClock(), 1000);
    }
  }

  render() {
    if (!this.dom) this.build();
    const { dom, kata, state: s } = this;
    const memory = this.mode === "memory";
    const py = python.state;
    dom.loading.hidden = py === "ready";
    const failed = py === "failed";
    const slow = !failed && python.slow;
    dom.loadingText.textContent = failed ? FAILED_COPY : slow ? SLOW_COPY : LOADING_COPY;
    dom.progress.hidden = failed;
    dom.retry.hidden = !(failed || slow);
    dom.run.disabled = py !== "ready";
    dom.run.setAttribute("aria-disabled", String(s.running));
    dom.status.textContent = s.running ? RUNNING_COPY : "";
    dom.status.hidden = !s.running;
    dom.results.setAttribute("aria-busy", String(s.running));
    dom.confirm.hidden = !s.confirmReset;
    dom.unsaved.hidden = !s.unsaved;
    dom.pause.textContent = this.#clock.paused ? "Resume" : "Pause";
    dom.pause.hidden = s.passedMs !== null || !this.clockStarted();
    dom.timerNote.hidden = this.clockStarted();
    dom.clockBlock.hidden = !memory;
    this.paintClock();

    const r = s.results;
    dom.results.hidden = r === null;
    if (r !== null) {
      dom.count.textContent = `${r.passed} of ${r.total} tests pass`;
      dom.error.textContent = r.error ?? "";
      dom.error.hidden = !r.error;
      dom.rows.replaceChildren(...r.rows.map((row) => el("li", { class: "kata-row", "data-outcome": row.outcome },
        el("span", { class: "kata-mark" }, glyph(row.outcome === "passed" ? "check" : "cross")),
        // A zero-width space after each underscore lets a long test name wrap between words.
        el("span", { class: "kata-name", text: row.name.replace(/_/g, "_​") }),
        el("span", { class: "kata-word", text: row.word }))));
      dom.rows.hidden = r.rows.length === 0;
      dom.message.textContent = r.message ?? "";
      dom.message.hidden = !r.message;
      dom.passed.textContent = s.passedMs === null ? "" : `Passed from memory in ${formatClock(s.passedMs)}.`;
      dom.passed.hidden = s.passedMs === null;
    }

    // From memory there are no hints.
    dom.hintList.replaceChildren(...kata.hints.slice(0, s.hintsShown).map((text) => el("li", { text })));
    dom.hintList.hidden = memory || s.hintsShown === 0;
    dom.hint.hidden = memory || s.hintsShown >= HINT_COUNT;
    dom.hint.textContent = `Show hint ${s.hintsShown + 1}`;
    dom.solutionButton.hidden = s.ran === 0 || s.solutionShown;
    dom.solutionBlock.hidden = !s.solutionShown;
  }

  replaceWithStarter() {
    const text = this.mode === "memory" ? MEMORY_BLANK : this.kata.starter;
    this.setCode(text);
    clearTimeout(this.#draftTimer);
    this.#pending = false;
    this.dropDraft();
    if (this.mode === "memory") {
      this.#clock = { started: false, banked: 0, since: null, paused: false };
    }
    this.patch({ confirmReset: false, results: null, passedMs: null });
    this.ui.querySelector('[data-key="run"]')?.focus({ preventScroll: true });
  }

  /** Runs the tests once. Resolves to the results shown, or null when Python is not ready. */
  run() {
    if (python.state !== "ready" || this.state.running) return null;
    this.patch({ running: true });
    const job = python.run(this.code(), this.kata.tests).then((outcome) => this.finish(outcome));
    this.#lastRun = job;
    return job;
  }

  finish(outcome) {
    const s = this.state;
    const total = this.totalTests();
    let results;
    if (outcome.timedOut || outcome.error) {
      results = { rows: [], total, passed: 0, error: outcome.timedOut ? TIMEOUT_MESSAGE : outcome.error, message: null };
    } else {
      const tests = outcome.result.tests;
      const collection = tests.find((test) => test.name === "<collection>");
      if (collection) {
        results = { rows: [], total, passed: 0, error: null, message: collection.message };
      } else {
        const rows = tests.map((test) => ({
          name: test.name,
          outcome: test.outcome,
          word: WORDS[test.outcome] ?? test.outcome,
        }));
        const failing = tests.find((test) => test.outcome !== "passed");
        results = {
          rows,
          total: tests.length,
          passed: tests.filter((test) => test.outcome === "passed").length,
          error: null,
          message: failing ? failing.message || null : null,
        };
      }
    }
    const allPass = results.total > 0 && results.passed === results.total;
    let passedMs = s.passedMs;
    if (allPass && this.mode === "memory" && passedMs === null) {
      passedMs = this.elapsedMs();
      this.#clock.banked = passedMs;
      this.#clock.paused = true;
    }
    this.patch({ running: false, results, ran: s.ran + 1, passedMs });
    this.evidence("kata", {
      id: this.kata.id,
      passed: allPass,
      tests_passed: results.passed,
      tests_total: results.total,
      hints_shown: s.hintsShown,
      solution_shown: s.solutionShown,
      mode: this.mode,
      seconds: Math.round(this.elapsedMs() / 1000),
    });
    const count = `${results.passed} of ${results.total} tests pass`;
    this.live(allPass && this.mode === "memory" ? `${count}. Passed from memory in ${formatClock(passedMs)}.` : count);
    return results;
  }

  /**
   * Answers through the real UI: starts Python, runs the starter (it must fail), puts the solution into the
   * editor as typing would (it must pass), and in practice reveals hint 1. The learner's draft and visible
   * state are restored afterwards, so a QA run leaves nothing of the solution behind.
   */
  async selfTest() {
    this.startPython();
    if (!(await python.whenReady())) return false;
    await this.#editorReady;
    const codeBefore = this.code();
    const draftBefore = this.readDraft();
    const shown = { results: this.state.results, passedMs: this.state.passedMs, hintsShown: this.state.hintsShown, ran: this.state.ran };
    const clockBefore = { ...this.#clock };
    try {
      const starter = await this.runAndWait();
      if (!starter || starter.total === 0 || starter.passed === starter.total) return false;
      this.setCode(this.kata.solution, true);
      const solved = await this.runAndWait();
      if (!solved || solved.total === 0 || solved.passed !== solved.total) return false;
      if (this.mode === "memory") return true;
      this.dom.hint.click();
      return this.state.hintsShown === 1;
    } finally {
      this.setCode(codeBefore);
      clearTimeout(this.#draftTimer);
      this.#pending = false;
      if (draftBefore === null) this.dropDraft();
      else this.saveDraft(codeBefore);
      this.#clock = clockBefore;
      this.patch({ ...shown, running: false });
    }
  }

  /** Clicks Run through the real control and waits for the run it started. */
  runAndWait() {
    const before = this.#lastRun;
    this.dom.run.click();
    return this.#lastRun !== before ? this.#lastRun : Promise.resolve(null);
  }
}

customElements.define("hx-kata", HxKata);
