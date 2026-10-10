// hx-kata: a Python kata in the page (BP-1.6 §2; AUTHORING §8; D-014, D-015, D-016).
//   <hx-kata kata="lab-turn-limit" mode="practice">…no-JS fallback…</hx-kata>
// mode="memory" needs a kata with from_memory: true. The code runs in one Web Worker per page
// (lib/py-worker.js), one run at a time; a run that takes more than 10 s stops the worker, which
// restarts. Evidence: "kata" on every run (COMPONENTS §5). Drafts live under drafts[<kata id>]
// (drafts[<kata id>:memory] in memory mode, so the two modes do not overwrite each other).
import { HxElement } from "./lib/hx-element.js";
import { mountEditor } from "./lib/editor.js";

const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const WORKER_URL = new URL("./lib/py-worker.js", import.meta.url).href;
const PYODIDE_BASE = new URL("../../vendor/pyodide/", import.meta.url).href;
const HXTEST_URL = new URL("../py/hxtest.py", import.meta.url).href;
const SW_URL = new URL("../../sw.js", import.meta.url).href;
const COURSE_URL = new URL("../../data/course.json", import.meta.url).href;
const kataUrl = (id) => new URL(`../../data/katas/${id}.json`, import.meta.url).href;
const RUN_LIMIT_MS = 10000;
const DRAFT_DELAY_MS = 500;
const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;
const HINT_COUNT = 3;

const TIMEOUT_MESSAGE = "Your code ran for more than 10 seconds and was stopped. Is there a loop without an exit?";
const LOADING_COPY = "Loading Python (about 8 MB, once)…";
const FAILED_COPY = "Python could not load in this browser. Your code is still here, but the tests cannot run.";
const CRASH_COPY = "Python could not run this code.";
const RUNNING_COPY = "Running…";
const SOLUTION_NOTE = "Compare it with yours; the tests are the judge, not the text.";
const RESET_ASK = "Replace your code with the starter? Your draft will be lost.";
const MEMORY_BLANK = "# Write it from memory.\n";
const WORDS = { passed: "pass", failed: "fail", error: "error" };

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

/** m:ss for a duration in milliseconds. */
export function formatClock(ms) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// ---- one Python per page: a shared worker and a queue of runs (runs are sequential in the worker) ----
const python = {
  worker: null,
  state: "idle", // idle | loading | ready | failed
  waiters: [],
  listeners: new Set(),
  queue: [],
  current: null,
  seq: 0,
  registered: false,
};

function announce(state) {
  python.state = state;
  for (const listener of python.listeners) listener(state);
}

function settle(state) {
  announce(state);
  const waiters = python.waiters;
  python.waiters = [];
  for (const wake of waiters) wake(state === "ready");
  if (state === "ready") pump();
  if (state === "failed") {
    for (const job of python.queue.splice(0)) job.resolve({ error: CRASH_COPY });
  }
}

function pump() {
  if (python.current || python.state !== "ready" || python.queue.length === 0) return;
  const job = python.queue.shift();
  python.current = job;
  job.timer = setTimeout(() => {
    if (python.current !== job) return;
    python.current = null;
    job.resolve({ timedOut: true });
    startWorker();
  }, RUN_LIMIT_MS);
  python.worker.postMessage({ type: "run", id: job.id, code: job.code, tests: job.tests });
}

function onWorkerMessage(worker, message) {
  if (worker !== python.worker) return;
  if (message.type === "ready") {
    settle("ready");
    return;
  }
  if (message.type === "error") {
    settle("failed");
    return;
  }
  const job = python.current;
  if (!job || job.id !== message.id) return;
  clearTimeout(job.timer);
  python.current = null;
  job.resolve(message.type === "result" ? { result: message.result } : { error: message.message });
  pump();
}

function startWorker() {
  python.worker?.terminate();
  if (!python.registered) {
    python.registered = true;
    navigator.serviceWorker?.register(SW_URL, { scope: "/" })?.catch(() => {});
  }
  const worker = new Worker(WORKER_URL, { type: "module" });
  python.worker = worker;
  worker.onmessage = (event) => onWorkerMessage(worker, event.data);
  worker.onerror = (event) => {
    if (python.worker !== worker) return;
    event.preventDefault();
    const job = python.current;
    if (job) {
      clearTimeout(job.timer);
      python.current = null;
      job.resolve({ error: CRASH_COPY });
    }
    settle("failed");
  };
  announce("loading");
  worker.postMessage({ type: "init", base: PYODIDE_BASE, hxtest: HXTEST_URL });
}

function ensurePython() {
  if (python.state === "idle") startWorker();
}

function whenPython() {
  if (python.state === "ready") return Promise.resolve(true);
  if (python.state === "failed") return Promise.resolve(false);
  return new Promise((resolve) => python.waiters.push(resolve));
}

function runKata(code, tests) {
  return new Promise((resolve) => {
    if (python.state === "failed") {
      resolve({ error: CRASH_COPY });
      return;
    }
    python.queue.push({ id: ++python.seq, code, tests, resolve, timer: 0 });
    ensurePython();
    pump();
  });
}

// ---- kata data: one fetch per id per page (lib/data.js has no kata accessor) ----
const kataCache = new Map();
function loadKata(id) {
  if (!kataCache.has(id)) {
    kataCache.set(id, fetch(kataUrl(id)).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status} for katas/${id}`);
      return response.json();
    }));
  }
  return kataCache.get(id);
}

let courseCache = null;
const loadCourse = () => {
  courseCache ??= fetch(COURSE_URL).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status} for course.json`);
    return response.json();
  });
  return courseCache;
};

let uidCount = 0;

export class HxKata extends HxElement {
  static styles = new URL("./hx-kata.css", import.meta.url).href;

  #clock = { banked: 0, since: 0, paused: false };
  #tick = 0;
  #draftTimer = 0;
  #lastRun = null;
  #editor = null;
  #editorReady = null;
  #unsubscribe = () => {};
  #testCount = null;

  async setup() {
    const id = this.getAttribute("kata") ?? "";
    if (!SAFE_ID.test(id)) throw new Error(`hx-kata needs a kata id, got ${id}`);
    const mode = this.getAttribute("mode") ?? "practice";
    if (mode !== "practice" && mode !== "memory") throw new Error("hx-kata: mode must be practice or memory");
    const kata = await loadKata(id);
    if (!kata || typeof kata.starter !== "string" || typeof kata.solution !== "string" || typeof kata.tests !== "string") {
      throw new Error(`hx-kata: katas/${id} is incomplete`);
    }
    if (mode === "memory" && kata.from_memory !== true) throw new Error(`hx-kata: ${id} is not a from_memory kata`);
    const course = kata.module ? await loadCourse() : null;
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
    this.startCode = this.readDraft() ?? (mode === "memory" ? MEMORY_BLANK : kata.starter);
    this.#clock = { banked: 0, since: Date.now(), paused: false };
    this.state = {
      running: false,
      results: null,
      ran: 0,
      hintsShown: 0,
      solutionShown: false,
      confirmReset: false,
      passedMs: null,
    };
    this.#unsubscribe = subscribePython((py) => this.patch({ py }));
    ensurePython();
  }

  disconnectedCallback() {
    this.#unsubscribe();
    clearInterval(this.#tick);
    clearTimeout(this.#draftTimer);
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

  readDraft() {
    const draft = this.store?.state?.drafts?.[this.draftKey];
    return typeof draft?.code === "string" ? draft.code : null;
  }

  saveDraft(code) {
    try {
      this.store?.update((doc) => {
        doc.drafts ??= {};
        doc.drafts[this.draftKey] = { code, at: new Date().toISOString() };
      });
    } catch {
      // Storage is blocked: the draft lives in this page only, and the code still runs.
    }
  }

  dropDraft() {
    try {
      this.store?.update((doc) => {
        if (doc.drafts) delete doc.drafts[this.draftKey];
      });
    } catch {
      // Nothing was saved, so there is nothing to drop.
    }
  }

  onCode(code) {
    clearTimeout(this.#draftTimer);
    this.#draftTimer = setTimeout(() => this.saveDraft(code), DRAFT_DELAY_MS);
  }

  code() {
    return this.#editor ? this.#editor.getValue() : this.dom.textarea.value;
  }

  setCode(text) {
    if (this.#editor) this.#editor.setValue(text);
    else this.dom.textarea.value = text;
  }

  elapsedMs() {
    const clock = this.#clock;
    return clock.banked + (clock.paused ? 0 : Date.now() - clock.since);
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
    dom.loading.append(dom.loadingText, dom.progress);
    dom.label = el("p", { class: "kata-label", id: `${uid}-label`, text: "Your code" });
    dom.textarea = el("textarea", {
      class: "kata-code", id: `${uid}-code`, rows: "12", spellcheck: "false", autocapitalize: "off",
      autocomplete: "off", wrap: "off", "aria-labelledby": `${uid}-label`,
    });
    dom.textarea.value = this.startCode;
    dom.textarea.addEventListener("input", () => this.onCode(dom.textarea.value));
    dom.host = el("div", { class: "kata-editor" }, dom.textarea);
    dom.clockValue = el("span", { class: "readout-value", text: formatClock(this.elapsedMs()) });
    dom.clock = el("div", { class: "kata-clock" },
      el("p", { class: "readout kata-timer" }, el("span", { class: "readout-label", text: "Time" }), dom.clockValue),
      el("button", { class: "key", type: "button", "data-key": "pause", text: "Pause" }));
    dom.pause = dom.clock.querySelector("button");
    dom.run = el("button", { class: "key key-primary", type: "button", "data-key": "run", text: "Run the tests" });
    dom.reset = el("button", { class: "key", type: "button", "data-key": "reset", text: "Reset to starter" });
    dom.keys = el("div", { class: "kata-keys" }, dom.run, dom.reset);
    dom.confirm = el("div", { class: "kata-confirm" },
      el("p", { text: RESET_ASK }),
      el("div", { class: "kata-keys" },
        el("button", { class: "key key-primary", type: "button", "data-key": "reset-yes", text: "Replace my code" }),
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
    dom.clock.hidden = this.mode !== "memory";
    dom.status.hidden = true;
    this.ui.append(el("div", { class: "kata" },
      el("header", { class: "kata-head" }, dom.title, dom.meta, dom.objectives),
      dom.loading,
      dom.label,
      dom.host,
      dom.clock,
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
      onChange: (text) => this.onCode(text),
    }).then((editor) => {
      if (!editor) return null;
      this.#editor = editor;
      dom.textarea.hidden = true;
      dom.textarea.disabled = true;
      return editor;
    }).catch(() => null);
    if (this.mode === "memory") {
      this.#tick = setInterval(() => this.paintClock(), 1000);
    }
  }

  render() {
    if (!this.dom) this.build();
    const { dom, kata, state: s } = this;
    const py = python.state;
    dom.loading.hidden = py === "ready";
    dom.loadingText.textContent = py === "failed" ? FAILED_COPY : LOADING_COPY;
    dom.progress.hidden = py === "failed";
    dom.run.disabled = py !== "ready";
    dom.run.setAttribute("aria-disabled", String(s.running));
    dom.status.textContent = s.running ? RUNNING_COPY : "";
    dom.status.hidden = !s.running;
    dom.results.setAttribute("aria-busy", String(s.running));
    dom.confirm.hidden = !s.confirmReset;
    dom.pause.textContent = this.#clock.paused ? "Resume" : "Pause";
    dom.pause.hidden = s.passedMs !== null;
    dom.clock.hidden = this.mode !== "memory";
    this.paintClock();

    const r = s.results;
    dom.results.hidden = r === null;
    if (r !== null) {
      dom.count.textContent = `${r.passed} of ${r.total} tests pass`;
      dom.error.textContent = r.error ?? "";
      dom.error.hidden = !r.error;
      dom.rows.replaceChildren(...r.rows.map((row) => el("li", { class: "kata-row", "data-outcome": row.outcome },
        el("span", { class: "kata-mark" }, glyph(row.outcome === "passed" ? "check" : "cross")),
        el("span", { class: "kata-name", text: row.name }),
        el("span", { class: "kata-word", text: row.word }))));
      dom.rows.hidden = r.rows.length === 0;
      dom.message.textContent = r.message ?? "";
      dom.message.hidden = !r.message;
      dom.passed.textContent = s.passedMs === null ? "" : `Passed from memory in ${formatClock(s.passedMs)}.`;
      dom.passed.hidden = s.passedMs === null;
    }

    dom.hintList.replaceChildren(...kata.hints.slice(0, s.hintsShown).map((text) => el("li", { text })));
    dom.hintList.hidden = s.hintsShown === 0;
    dom.hint.hidden = s.hintsShown >= HINT_COUNT;
    dom.hint.textContent = `Show hint ${s.hintsShown + 1}`;
    dom.solutionButton.hidden = s.ran === 0 || s.solutionShown;
    dom.solutionBlock.hidden = !s.solutionShown;
  }

  togglePause() {
    const clock = this.#clock;
    if (clock.paused) {
      clock.since = Date.now();
      clock.paused = false;
    } else {
      clock.banked = this.elapsedMs();
      clock.paused = true;
    }
    this.patch({});
  }

  replaceWithStarter() {
    const text = this.mode === "memory" ? MEMORY_BLANK : this.kata.starter;
    this.setCode(text);
    clearTimeout(this.#draftTimer);
    this.dropDraft();
    if (this.mode === "memory") {
      this.#clock = { banked: 0, since: Date.now(), paused: false };
    }
    this.patch({ confirmReset: false, results: null, passedMs: null });
    this.ui.querySelector('[data-key="run"]')?.focus({ preventScroll: true });
  }

  /** Runs the tests once. Resolves to the results shown, or null when Python is not ready. */
  run() {
    if (python.state !== "ready" || this.state.running) return null;
    this.patch({ running: true });
    const job = runKata(this.code(), this.kata.tests).then((outcome) => this.finish(outcome));
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
      this.#clock = { banked: passedMs, since: Date.now(), paused: true };
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

  async selfTest() {
    if (!(await whenPython())) return false;
    const starter = await this.runAndWait();
    if (!starter || starter.total === 0 || starter.passed === starter.total) return false;
    const editor = await this.#editorReady;
    if (editor) editor.setValue(this.kata.solution);
    else {
      this.dom.textarea.value = this.kata.solution;
      this.onCode(this.kata.solution);
    }
    const solved = await this.runAndWait();
    if (!solved || solved.total === 0 || solved.passed !== solved.total) return false;
    this.dom.hint.click();
    return this.state.hintsShown === 1;
  }

  /** Clicks Run through the real control and waits for the run it started. */
  runAndWait() {
    const before = this.#lastRun;
    this.dom.run.click();
    return this.#lastRun !== before ? this.#lastRun : Promise.resolve(null);
  }
}

/** Calls back with the Python state now and on every change. Returns the unsubscribe. */
function subscribePython(listener) {
  python.listeners.add(listener);
  listener(python.state === "idle" ? "loading" : python.state);
  return () => python.listeners.delete(listener);
}

customElements.define("hx-kata", HxKata);
