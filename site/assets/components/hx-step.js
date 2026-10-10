// hx-step: one step of the Rein build (BP-2.3; SPEC §6.3). <hx-step step="H1"> loads site/data/steps/H1.json,
// compiled by tools/gen_data.py from steps/H1/. It shows the goal, each chunk with its diff and a Copy key, the
// script, the checkpoint with Run it here and Check my file, What just happened, Break it on purpose (each break is a
// toggle that runs the changed version), and the whole file. Python is the page's shared one (lib/py-host.js).
// Evidence: "step" {step, match: true} when a pasted rein.py gives the expected output (COMPONENTS §5).
import { HxElement } from "./lib/hx-element.js";
import { mountEditor } from "./lib/editor.js";
import { sharedPython } from "./lib/py-host.js";
import { addedLines, diffRows, expectedError, matches, firstDifference, prettyScript } from "./lib/step-logic.js";

const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const stepUrl = (id) => new URL(`../../data/steps/${id}.json`, import.meta.url).href;
const python = sharedPython();

const LOADING_COPY = "Loading Python (about 13 MB, the first time only)…";
const SLOW_COPY = "Still loading Python. A slow connection can take a minute or two.";
const FAILED_COPY = "Python could not load. Check your connection and try again.";
const RETRY_COPY = "Try again";
const COPIED = "Copied";
const COPY_NEW = "Copy new lines";
const COPY_FILE = "Copy rein.py";
const RUN_HERE = "Run it here";
const CHECK_MINE = "Check my file";
const RUN_MINE = "Run my file";
const MATCH_COPY = "This matches the book's output.";
const MISMATCH_COPY = "This does not match the book's output.";
const RUNNING_COPY = "Running…";
const CHECK_HINT = "Paste your rein.py here. Run my file runs it with the same script and command.";
const NORMAL = "Normal";
const BROKEN = "Broken";
const YOUR_FILE_OUTPUT = "Your output";
const COPY_CONFIRM_MS = 2000;

const cache = new Map();
function loadStep(id) {
  if (!cache.has(id)) {
    cache.set(id, fetch(stepUrl(id)).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status} for steps/${id}`);
      return response.json();
    }));
  }
  return cache.get(id);
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

/** What an output block shows: stdout, then the error name as the book prints it. */
function showOutput(outcome) {
  return outcome.stdout + (outcome.error ? `error: ${outcome.error}\n` : "");
}

let uidCount = 0;

export class HxStep extends HxElement {
  static styles = new URL("./hx-step.css", import.meta.url).href;

  #observer = null;
  #unsubscribe = () => {};
  #last = null;
  #editor = null;
  #editorReady = null;
  #copyTimer = 0;

  async setup() {
    const id = this.getAttribute("step") ?? "";
    if (!SAFE_ID.test(id)) throw new Error(`hx-step needs a step id, got ${id}`);
    const step = await loadStep(id);
    if (!step || !step.checkpoint || !Array.isArray(step.chunks) || !Array.isArray(step.breaks)) {
      throw new Error(`hx-step: steps/${id} is incomplete`);
    }
    this.step = step;
    this.stepId = id;
    this.uid = `hxs${++uidCount}`;
    this.lastCopy = null;
    this.normal = null;
    this.breakOutputs = new Map();
    this.state = { running: false, ran: false, verdict: null, copied: null, breaksOn: [], check: false, checkOutcome: null };
    this.#unsubscribe = python.subscribe(() => this.patch({}));
    this.addEventListener("focusin", (event) => {
      const target = event.target;
      if (target instanceof Element && (target.matches("textarea") || target.closest(".cm-editor"))) this.startPython();
    });
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
    this.#unsubscribe();
    this.#observer?.disconnect();
    clearTimeout(this.#copyTimer);
  }

  patch(patch) {
    this.state = { ...this.state, ...patch };
    if (this.dom) this.setState({});
  }

  /** The files a run needs besides rein.py: the scenario scripts and the setup scripts. */
  sharedFiles(extra) {
    const shared = {};
    for (const name of this.step.checkpoint.setup ?? []) shared[`${name}.py`] = this.step.shared[name];
    return { ...shared, ...extra };
  }

  /** Runs rein.py with the given files and argv in Pyodide. Resolves an outcome, or null when Python is not ready. */
  async execute(files, argv) {
    if (python.state !== "ready") return null;
    const setup = this.step.checkpoint.setup ?? [];
    const reply = await python.exec(this.sharedFiles(files), setup, argv);
    if (reply.result) return reply.result;
    return { stdout: "", error: reply.timedOut ? "timed out" : reply.error ?? "no result" };
  }

  // ---- copy ----
  copyText(text, key) {
    this.lastCopy = text;
    this.copyJob = navigator.clipboard?.writeText(text).catch(() => {}) ?? Promise.resolve();
    this.live(COPIED);
    clearTimeout(this.#copyTimer);
    this.patch({ copied: key });
    this.#copyTimer = setTimeout(() => this.patch({ copied: null }), COPY_CONFIRM_MS);
  }

  // ---- the reference run ----
  runHere() {
    if (python.state !== "ready" || this.state.running) return null;
    this.patch({ running: true });
    const argv = this.step.checkpoint.argv;
    const job = this.execute(this.step.checkpoint.run.files, argv).then((outcome) => {
      this.normal = outcome;
      const verdict = matches(outcome, this.step.checkpoint.expected);
      this.patch({ running: false, ran: true, verdict });
      this.live(verdict ? MATCH_COPY : MISMATCH_COPY);
      return { outcome, match: verdict };
    });
    this.#last = job;
    return job;
  }

  async ensureNormal() {
    if (this.normal) return this.normal;
    const result = await this.runHere();
    return result ? result.outcome : null;
  }

  toggleBreak(brk) {
    const on = this.state.breaksOn.includes(brk.id);
    if (on) {
      this.patch({ breaksOn: this.state.breaksOn.filter((id) => id !== brk.id) });
      return null;
    }
    this.patch({ breaksOn: [...this.state.breaksOn, brk.id] });
    const job = (async () => {
      await this.ensureNormal();
      const outcome = await this.execute(brk.run.files, brk.run.argv);
      if (outcome) this.breakOutputs.set(brk.id, outcome);
      this.patch({});
      return outcome;
    })();
    this.#last = job;
    return job;
  }

  // ---- Check my file ----
  openCheck() {
    this.patch({ check: true });
    this.ui.querySelector('[data-key="run-mine"]')?.focus({ preventScroll: true });
  }

  checkMine() {
    if (python.state !== "ready" || this.state.running) return null;
    this.patch({ running: true });
    const files = { ...this.step.checkpoint.run.files, "rein.py": this.code() };
    const job = this.execute(files, this.step.checkpoint.argv).then((outcome) => {
      const expected = this.step.checkpoint.expected;
      const match = matches(outcome, expected);
      this.patch({ running: false, checkOutcome: { outcome, match } });
      if (match) this.evidence("step", { step: this.stepId, match: true });
      this.live(match ? MATCH_COPY : MISMATCH_COPY);
      return { outcome, match };
    });
    this.#last = job;
    return job;
  }

  code() {
    return this.#editor ? this.#editor.getValue() : this.dom.textarea.value;
  }

  setCode(text) {
    if (this.#editor) this.#editor.setValue(text, { typed: true });
    else this.dom.textarea.value = text;
  }

  build() {
    const { step, uid } = this;
    const dom = { chunks: [], breaks: [] };
    this.dom = dom;
    dom.title = el("h3", { class: "step-title" }, el("span", { class: "step-number", text: String(step.number) }), ` ${step.title}`);
    dom.goal = el("p", { class: "step-goal" }, el("b", { text: "Goal " }), step.goal);
    dom.theory = el("p", { class: "step-theory" }, el("b", { text: "Theory " }), step.theory);
    dom.size = el("p", { class: "step-size", text: step.size });
    dom.loading = el("div", { class: "step-loading" });
    dom.loadingText = el("p", { class: "step-loading-line" });
    dom.progress = el("progress", { class: "step-progress", "aria-hidden": "true" });
    dom.retry = el("button", { class: "key", type: "button", "data-key": "retry", text: RETRY_COPY });
    dom.retry.addEventListener("click", () => python.restart());
    dom.loading.append(dom.loadingText, dom.progress, dom.retry);

    for (const chunk of step.chunks) {
      const key = `copy-${chunk.id}`;
      const copy = el("button", { class: "key", type: "button", "data-key": key, text: COPY_NEW });
      copy.addEventListener("click", () => this.copyText(addedLines(chunk).join("\n") + "\n", key));
      const hunks = chunk.hunks.map((hunk) => el("div", { class: "hunk" },
        el("p", { class: "hunk-where", text: hunk.where }),
        el("ol", { class: "diff", "aria-label": hunk.where },
          ...diffRows(hunk.diff).map((row) => el("li", { class: `dl dl-${row.kind}` },
            el("span", { class: "dl-mark", "aria-hidden": "true", text: row.mark }),
            el("span", { class: "dl-text", text: row.text }))))));
      const explain = el("div", { class: "chunk-explain" },
        ...chunk.explain.split("\n\n").map((para) => para.startsWith("- ")
          ? el("ul", {}, ...para.split("\n").map((line) => el("li", { text: line.replace(/^- /, "") })))
          : el("p", { text: para })));
      dom.chunks.push(el("article", { class: "chunk" },
        el("h4", { class: "chunk-title" }, el("span", { class: "chunk-id", text: chunk.id }), ` ${chunk.title}`),
        explain, ...hunks, el("div", { class: "keys" }, copy)));
    }

    const scriptNames = Object.keys(step.scenarios ?? {});
    dom.script = el("details", { class: "step-script" },
      el("summary", { text: "The script for this step" }),
      ...scriptNames.map((name) => el("pre", { class: "code", "aria-label": name, tabindex: "0" },
        el("code", { text: prettyScript(step.scenarios[name]) }))));

    dom.command = el("pre", { class: "code step-command", tabindex: "0", "aria-label": "The command" },
      el("code", { text: step.checkpoint.command }));
    dom.expected = el("pre", { class: "code term", tabindex: "0", "aria-label": "The expected output" },
      el("code", { text: step.checkpoint.expected }));
    dom.setupNote = el("p", { class: "step-note", text: (step.checkpoint.setup ?? []).length ? "This checkpoint starts with reset_demo.py, so the practice project is ready." : "" });
    dom.run = el("button", { class: "key key-primary", type: "button", "data-key": "run-here", text: RUN_HERE });
    dom.run.addEventListener("click", () => this.runHere());
    dom.check = el("button", { class: "key", type: "button", "data-key": "check", text: CHECK_MINE });
    dom.check.addEventListener("click", () => this.openCheck());
    dom.runVerdict = el("p", { class: "step-verdict" });
    dom.output = el("pre", { class: "code step-output", tabindex: "0", "aria-label": `Output of the reference run` });
    dom.explain = el("div", { class: "step-explain" },
      el("h5", { text: "What just happened" }),
      ...step.checkpoint.explain.split("\n\n").map((para) => el("p", { text: para })));

    dom.checkBlock = el("div", { class: "step-check" });
    dom.checkHint = el("p", { class: "step-note", text: CHECK_HINT });
    dom.textarea = el("textarea", {
      class: "code step-code", id: `${uid}-code`, rows: "12", spellcheck: "false", autocapitalize: "off",
      autocomplete: "off", wrap: "off", "aria-label": "Your rein.py", "data-key": "mine",
    });
    dom.host = el("div", { class: "step-editor" }, dom.textarea);
    dom.runMine = el("button", { class: "key key-primary", type: "button", "data-key": "run-mine", text: RUN_MINE });
    dom.runMine.addEventListener("click", () => this.checkMine());
    dom.mineVerdict = el("p", { class: "step-verdict" });
    dom.mineFirst = el("p", { class: "step-note" });
    dom.mineOutput = el("pre", { class: "code step-output", tabindex: "0", "aria-label": "Your output" });
    dom.expectedOutput = el("pre", { class: "code step-output", tabindex: "0", "aria-label": "The expected output" });
    dom.checkBlock.append(dom.checkHint, dom.host, el("div", { class: "keys" }, dom.runMine), dom.mineVerdict,
      dom.mineFirst, el("div", { class: "step-pair" },
        el("div", {}, el("p", { class: "step-label", text: YOUR_FILE_OUTPUT }), dom.mineOutput),
        el("div", {}, el("p", { class: "step-label", text: "You should see exactly this" }), dom.expectedOutput)));

    for (const brk of step.breaks) {
      const toggle = el("button", { class: "key step-toggle", type: "button", "data-key": `break-${brk.id}`, text: brk.title, "aria-pressed": "false" });
      toggle.addEventListener("click", () => this.toggleBreak(brk));
      const outputs = el("div", { class: "step-pair", hidden: "" },
        el("div", {}, el("p", { class: "step-label", text: NORMAL }), el("pre", { class: "code step-output", tabindex: "0", "aria-label": `Normal output for ${brk.title}` })),
        el("div", {}, el("p", { class: "step-label", text: BROKEN }), el("pre", { class: "code step-output", tabindex: "0", "aria-label": `Broken output for ${brk.title}` })));
      dom.breaks.push({ brk, toggle, outputs, explain: el("p", { class: "step-note", text: brk.explain }) });
    }

    dom.fullTitle = el("summary", { text: `The whole rein.py after step ${step.number} (${step.lines_after} lines)` });
    dom.fullCode = el("pre", { class: "code step-file", tabindex: "0", "aria-label": "The whole rein.py" }, el("code", { text: step.rein }));
    dom.copyFile = el("button", { class: "key", type: "button", "data-key": "copy-file", text: COPY_FILE });
    dom.copyFile.addEventListener("click", () => this.copyText(step.rein, "copy-file"));
    dom.fullfile = el("details", { class: "step-fullfile" }, dom.fullTitle, dom.fullCode, el("div", { class: "keys" }, dom.copyFile));

    dom.checkBlock.hidden = true;
    dom.explain.hidden = true;
    dom.runVerdict.hidden = true;
    dom.output.hidden = true;
    dom.mineVerdict.hidden = true;
    dom.mineFirst.hidden = true;
    dom.loading.hidden = false;
    this.ui.append(el("div", { class: "step" },
      el("header", { class: "step-head" }, dom.title, dom.goal, dom.theory, dom.size),
      dom.loading,
      el("section", { class: "step-chunks", "aria-label": "Chunks" }, ...dom.chunks),
      dom.script,
      el("section", { class: "step-checkpoint", "aria-label": "Checkpoint" },
        el("h4", { text: `Checkpoint: step ${step.number}` }),
        dom.command, dom.setupNote,
        el("p", { class: "step-label", text: "You should see exactly this" }),
        dom.expected,
        el("div", { class: "keys" }, dom.run, dom.check),
        dom.runVerdict, dom.output, dom.explain, dom.checkBlock),
      el("section", { class: "step-breaks", "aria-label": "Break it on purpose" },
        el("h4", { text: "Break it on purpose" }),
        ...dom.breaks.map((item) => el("div", { class: "step-break" }, el("div", { class: "keys" }, item.toggle), item.explain, item.outputs))),
      dom.fullfile));

    this.#editorReady = null;
  }

  mountCheckEditor() {
    if (this.#editorReady) return this.#editorReady;
    this.#editorReady = mountEditor(this.dom.host, {
      doc: this.dom.textarea.value,
      label: "Your rein.py",
      onChange: () => {},
    }).then((editor) => {
      if (!editor) return null;
      this.#editor = editor;
      this.dom.textarea.hidden = true;
      this.dom.textarea.disabled = true;
      return editor;
    }).catch(() => null);
    return this.#editorReady;
  }

  render() {
    if (!this.dom) this.build();
    const { dom, step, state: s } = this;
    const py = python.state;
    const failed = py === "failed";
    const slow = !failed && python.slow;
    dom.loading.hidden = py === "ready";
    dom.loadingText.textContent = failed ? FAILED_COPY : slow ? SLOW_COPY : LOADING_COPY;
    dom.progress.hidden = failed;
    dom.retry.hidden = !(failed || slow);
    dom.run.disabled = py !== "ready";
    dom.run.setAttribute("aria-disabled", String(s.running));
    dom.run.textContent = s.running ? RUNNING_COPY : RUN_HERE;
    dom.runMine.disabled = py !== "ready";
    dom.runMine.textContent = s.running ? RUNNING_COPY : RUN_MINE;

    for (const chunk of step.chunks) {
      const copy = this.ui.querySelector(`[data-key="copy-${chunk.id}"]`);
      if (copy) copy.textContent = s.copied === `copy-${chunk.id}` ? COPIED : COPY_NEW;
    }
    const fileCopy = this.ui.querySelector('[data-key="copy-file"]');
    if (fileCopy) fileCopy.textContent = s.copied === "copy-file" ? COPIED : COPY_FILE;

    dom.runVerdict.hidden = !s.ran;
    if (s.ran) {
      dom.runVerdict.replaceChildren(glyph(s.verdict ? "check" : "cross"), s.verdict ? MATCH_COPY : MISMATCH_COPY);
      dom.runVerdict.className = `step-verdict ${s.verdict ? "is-pass" : "is-fail"}`;
      dom.output.textContent = this.normal ? showOutput(this.normal) : "";
      dom.output.hidden = !this.normal;
      dom.explain.hidden = false;
    }
    dom.checkBlock.hidden = !s.check;
    if (s.check && s.checkOutcome) {
      const { outcome, match } = s.checkOutcome;
      dom.mineVerdict.hidden = false;
      dom.mineVerdict.replaceChildren(glyph(match ? "check" : "cross"), match ? MATCH_COPY : MISMATCH_COPY);
      dom.mineVerdict.className = `step-verdict ${match ? "is-pass" : "is-fail"}`;
      const diff = firstDifference(showOutput(outcome), step.checkpoint.expected);
      dom.mineFirst.hidden = match || !diff;
      dom.mineFirst.textContent = diff ? `First difference, line ${diff.line}: your output has ${JSON.stringify(diff.got)}, expected ${JSON.stringify(diff.expected)}.` : "";
      dom.mineOutput.textContent = showOutput(outcome);
      dom.expectedOutput.textContent = step.checkpoint.expected;
    }
    if (s.check && !this.#editorReady) this.mountCheckEditor();

    for (const item of dom.breaks) {
      const on = s.breaksOn.includes(item.brk.id);
      item.toggle.setAttribute("aria-pressed", String(on));
      item.outputs.hidden = !on;
      if (on) {
        const [normal, broken] = item.outputs.querySelectorAll("pre");
        normal.textContent = this.normal ? showOutput(this.normal) : "…";
        const outcome = this.breakOutputs.get(item.brk.id);
        broken.textContent = outcome ? showOutput(outcome) : "…";
      }
    }
  }

  /** Clicks a control through the real UI and returns the job it started (or null). */
  clickForJob(selector) {
    const before = this.#last;
    this.ui.querySelector(selector)?.click();
    return this.#last !== before ? this.#last : null;
  }

  /**
   * Copies a chunk (the copy must be exactly its added lines), runs the reference (it must match the book), turns
   * a break on (its output must be the break's expected output), then pastes the reference into Check my file (it
   * must match). Then it restores: the break goes off, the pasted file is cleared, and the check closes.
   */
  async selfTest() {
    this.startPython();
    if (!(await python.whenReady())) return false;
    const chunk = this.step.chunks[0];
    const copied = addedLines(chunk).join("\n") + "\n";
    this.ui.querySelector(`[data-key="copy-${chunk.id}"]`)?.click();
    if (this.lastCopy !== copied) return false;
    try {
      await this.copyJob;
      if ((await navigator.clipboard.readText()) !== copied) return false;
    } catch {
      // The browser does not let the page read the clipboard here: the copied text was checked above.
    }
    const reference = await this.clickForJob('[data-key="run-here"]');
    if (!reference || !reference.match) return false;
    const brk = this.step.breaks[0];
    if (brk) {
      const job = this.clickForJob(`[data-key="break-${brk.id}"]`);
      const outcome = job ? await job : null;
      if (!outcome || !matches(outcome, brk.expected)) return false;
      this.ui.querySelector(`[data-key="break-${brk.id}"]`)?.click();
    }
    this.openCheck();
    await this.mountCheckEditor();
    this.setCode(this.step.rein);
    const mine = this.clickForJob('[data-key="run-mine"]');
    const checked = mine ? await mine : null;
    const ok = Boolean(checked && checked.match);
    this.setCode("");
    this.patch({ check: false, checkOutcome: null });
    return ok;
  }
}

customElements.define("hx-step", HxStep);
