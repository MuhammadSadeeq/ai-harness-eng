// hx-step: one step of the Rein build (BP-2.3; SPEC §6.3). <hx-step step="H1"> loads site/data/steps/H1.json,
// compiled by tools/gen_data.py from steps/H1/. It shows the goal, each chunk with its diff and a Copy key, the
// script, the checkpoint with Run it here and Check my file, What just happened, Break it on purpose (each break is a
// toggle that runs the changed version), and the whole file. Python is the page's shared one (lib/py-host.js).
// Evidence: "step" {step, match: true} when a pasted rein.py gives the expected output (COMPONENTS §5).
// BP-4.0: the runs go through the browser stand-in for subprocess.run (site/assets/py/hxshell.py) and take the
// learner's typed answers (stdin). A checkpoint or break marked local has no Run key: it shows the command to run on
// the learner's machine, with a copy key, the answers and the expected output. After each run the files it wrote are
// kept and announced: hx-step-files, {step, files}, bubbling.
import { HxElement } from "./lib/hx-element.js";
import { mountEditor } from "./lib/editor.js";
import { sharedPython } from "./lib/py-host.js";
import {
  addedLines, diffRows, expectedError, matches, firstDifference, prettyScript,
  commandOf, answersText, usesSubprocess,
} from "./lib/step-logic.js";

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
const MATCH_COPY = "This matches the expected output.";
const MISMATCH_COPY = "This does not match the expected output.";
const RUNNING_COPY = "Running…";
const CHECK_HINT = "Paste your rein.py here. Run my file runs it with the same script and command.";
const NORMAL = "Normal";
const BROKEN = "Broken";
const YOUR_FILE_OUTPUT = "Your output";
const SCROLL_HINT = "Long lines scroll sideways.";
const COPY_CONFIRM_MS = 2000;
const COPY_COMMAND = "Copy command";
const LOCAL_TITLE = "Run this on your machine";
const LOCAL_NOTE = "This command needs your own machine. It is shown here, not run: run it in your project folder.";
const CHECK_LOCAL_NOTE = "This checkpoint runs on your machine, so Check my file compares your rein.py with the reference text.";
const BROWSER_NOTE = "In the browser, Rein's commands run in a stand-in that can only run Python files. On your machine they run for real.";
const KEEP_EVENT = "hx-step-files";
let browserNoteShown = false;

const cache = new Map();
function loadStep(id) {
  return loadStepFrom(stepUrl(id), `steps/${id}`);
}

/** A compiled step from a URL (the page's own data: the lab's fixture). Cached per URL. */
function loadStepFrom(url, label) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${label}`);
      return response.json();
    }));
  }
  return cache.get(url);
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

/** What an output block shows: stdout, then the error name as the reference prints it. */
/** The panel for a run the learner makes on their own machine: the command (copy key), the answers, the expected output. */
function localPanel(uid, command, answers, expected, onCopy) {
  const key = `copy-command-${uid}`;
  const copy = el("button", { class: "key", type: "button", "data-key": key, "data-copy-label": COPY_COMMAND, text: COPY_COMMAND });
  copy.addEventListener("click", () => onCopy(command, key));
  return el("div", { class: "step-local" },
    el("p", { class: "step-local-title", text: LOCAL_TITLE }),
    el("p", { class: "step-note", text: LOCAL_NOTE }),
    el("pre", { class: "code step-local-command", role: "region", tabindex: "0", "aria-label": "The command" }, el("code", { text: command })),
    el("div", { class: "keys" }, copy),
    answersText(answers) ? el("p", { class: "step-answers", text: answersText(answers) }) : null,
    el("p", { class: "step-label", text: "You should see exactly this" }),
    el("pre", { class: "code term", role: "region", tabindex: "0", "aria-label": "The expected output" }, el("code", { text: expected })));
}

/** What an output block shows: stdout, then the error name as the reference prints it. */
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
    // step="H1" loads the compiled step; src="data/x.json" loads one compiled step from the page (a lab's fixture).
    const src = this.getAttribute("src");
    const id = this.getAttribute("step") ?? "";
    if (!src && !SAFE_ID.test(id)) throw new Error(`hx-step needs a step id, got ${id}`);
    const step = src ? await loadStepFrom(new URL(src, document.baseURI).href, src) : await loadStep(id);
    const label = src ? src : `steps/${id}`;
    if (!step || !step.checkpoint || !Array.isArray(step.chunks) || !Array.isArray(step.breaks)) {
      throw new Error(`hx-step: ${label} is incomplete`);
    }
    this.step = step;
    this.stepId = step.module ?? id;
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

  /** Runs rein.py with the given files, argv and typed answers in Pyodide. Resolves an outcome, or null when Python is not ready. */
  async execute(files, argv, stdin = []) {
    if (python.state !== "ready") return null;
    const setup = this.step.checkpoint.setup ?? [];
    const reply = await python.exec(this.sharedFiles(files), setup, argv, stdin);
    if (reply.result) {
      this.keep(reply.result);
      return reply.result;
    }
    return { stdout: "", error: reply.timedOut ? "timed out" : reply.error ?? "no result" };
  }

  /** Keeps the files the last run wrote and announces them (hx-step-files, bubbling). */
  keep(outcome) {
    this.kept = outcome.files ?? {};
    this.dispatchEvent(new CustomEvent(KEEP_EVENT, { bubbles: true, detail: { step: this.stepId, files: this.kept } }));
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
    if (python.state !== "ready" || this.state.running || this.step.checkpoint.local) return null;
    this.patch({ running: true });
    const argv = this.step.checkpoint.argv;
    const job = this.execute(this.step.checkpoint.run.files, argv, this.step.checkpoint.stdin ?? []).then((outcome) => {
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
    if (brk.local) return null; // shown for the learner's machine; nothing runs here
    const job = (async () => {
      await this.ensureNormal();
      const outcome = await this.execute(brk.run.files, brk.run.argv, brk.stdin ?? []);
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
    if (this.step.checkpoint.local) {
      // A local checkpoint cannot run here: Check my file compares the text with the reference.
      const match = this.code() === this.step.rein;
      this.patch({ checkOutcome: { outcome: null, match, local: true } });
      if (match) this.evidence("step", { step: this.stepId, match: true });
      this.live(match ? MATCH_COPY : MISMATCH_COPY);
      return Promise.resolve({ outcome: null, match });
    }
    if (python.state !== "ready" || this.state.running) return null;
    this.patch({ running: true });
    const files = { ...this.step.checkpoint.run.files, "rein.py": this.code() };
    const job = this.execute(files, this.step.checkpoint.argv, this.step.checkpoint.stdin ?? []).then((outcome) => {
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
        el("div", { class: "diff", role: "region", tabindex: "0", "aria-label": hunk.where },
          ...diffRows(hunk.diff).map((row) => el("div", { class: `dl dl-${row.kind}` },
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
    dom.chunks[0]?.querySelector(".hunk")?.append(el("p", { class: "step-scroll-hint", text: SCROLL_HINT }));

    const scriptNames = Object.keys(step.scenarios ?? {});
    dom.script = el("details", { class: "step-script" },
      el("summary", { text: "The script for this step" }),
      ...scriptNames.map((name) => el("pre", { class: "code", "aria-label": name, role: "region", tabindex: "0" },
        el("code", { text: prettyScript(step.scenarios[name]) }))));

    dom.command = el("pre", { class: "code step-command", role: "region", tabindex: "0", "aria-label": "The command" },
      el("code", { text: step.checkpoint.command }));
    dom.expected = el("pre", { class: "code term", role: "region", tabindex: "0", "aria-label": "The expected output" },
      el("code", { text: step.checkpoint.expected }));
    dom.setupNote = el("p", { class: "step-note", text: (step.checkpoint.setup ?? []).length ? "This checkpoint starts with reset_demo.py, so the practice project is ready." : "" });
    const localCheckpoint = Boolean(step.checkpoint.local);
    dom.answers = el("p", { class: "step-answers", text: answersText(step.checkpoint.stdin ?? []) });
    const onCopy = (text, key) => this.copyText(text, key);
    dom.localCheckpoint = localCheckpoint ? localPanel(uid, step.checkpoint.command, step.checkpoint.stdin ?? [], step.checkpoint.expected, onCopy) : null;
    const usesStandIn = usesSubprocess([step.rein, ...Object.values(step.scenarios ?? {})]);
    dom.browserNote = usesStandIn && !browserNoteShown ? el("p", { class: "step-note step-browser", text: BROWSER_NOTE }) : null;
    if (dom.browserNote) browserNoteShown = true;
    dom.run = el("button", { class: "key key-primary", type: "button", "data-key": "run-here", text: RUN_HERE });
    dom.run.addEventListener("click", () => this.runHere());
    dom.check = el("button", { class: "key", type: "button", "data-key": "check", text: CHECK_MINE });

    dom.check.addEventListener("click", () => this.openCheck());
    dom.runVerdict = el("p", { class: "step-verdict" });
    dom.output = el("pre", { class: "code step-output", role: "region", tabindex: "0", "aria-label": `Output of the reference run` });
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
    dom.mineOutput = el("pre", { class: "code step-output", role: "region", tabindex: "0", "aria-label": "Your output" });
    dom.expectedOutput = el("pre", { class: "code step-output", role: "region", tabindex: "0", "aria-label": "The expected output" });
    dom.checkBlock.append(dom.checkHint, dom.host, el("div", { class: "keys" }, dom.runMine), dom.mineVerdict,
      dom.mineFirst, el("div", { class: "step-pair" },
        el("div", {}, el("p", { class: "step-label", text: YOUR_FILE_OUTPUT }), dom.mineOutput),
        el("div", {}, el("p", { class: "step-label", text: "You should see exactly this" }), dom.expectedOutput)));

    for (const brk of step.breaks) {
      const toggle = el("button", { class: "key step-toggle", type: "button", "data-key": `break-${brk.id}`, text: brk.title, "aria-pressed": "false" });
      toggle.addEventListener("click", () => this.toggleBreak(brk));
      const outputs = brk.local
        ? localPanel(`${uid}-${brk.id}`, commandOf(brk.run.argv), brk.stdin ?? [], brk.expected, onCopy)
        : el("div", { class: "step-pair", hidden: "" },
          el("div", {}, el("p", { class: "step-label", text: NORMAL }), el("pre", { class: "code step-output", role: "region", tabindex: "0", "aria-label": `Normal output for ${brk.title}` })),
          el("div", {}, el("p", { class: "step-label", text: BROKEN }), el("pre", { class: "code step-output", role: "region", tabindex: "0", "aria-label": `Broken output for ${brk.title}` })));
      if (brk.local) outputs.hidden = true;
      dom.breaks.push({ brk, toggle, outputs, explain: el("p", { class: "step-note", text: brk.explain }), answers: el("p", { class: "step-answers", text: answersText(brk.stdin ?? []) }) });
    }

    dom.fullTitle = el("summary", { text: `The whole rein.py after step ${step.number} (${step.lines_after} lines)` });
    dom.fullCode = el("pre", { class: "code step-file", role: "region", tabindex: "0", "aria-label": "The whole rein.py" }, el("code", { text: step.rein }));
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
        dom.localCheckpoint ?? dom.command,
        dom.setupNote,
        dom.localCheckpoint ? null : el("p", { class: "step-label", text: "You should see exactly this" }),
        dom.localCheckpoint ? null : dom.expected,
        el("div", { class: "keys" }, dom.run, dom.check),
        dom.answers,
        dom.browserNote,
        dom.runVerdict, dom.output, dom.explain, dom.checkBlock),
      el("section", { class: "step-breaks", "aria-label": "Break it on purpose" },
        el("h4", { text: "Break it on purpose" }),
        ...dom.breaks.map((item) => el("div", { class: "step-break" }, el("div", { class: "keys" }, item.toggle), item.explain, item.answers, item.outputs))),
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
    const localCheckpoint = Boolean(step.checkpoint.local);
    dom.run.hidden = localCheckpoint;
    dom.run.disabled = py !== "ready";
    dom.run.setAttribute("aria-disabled", String(s.running));
    dom.run.textContent = s.running ? RUNNING_COPY : RUN_HERE;
    dom.answers.textContent = answersText(step.checkpoint.stdin ?? []);
    dom.answers.hidden = !(step.checkpoint.stdin ?? []).length;
    dom.runMine.disabled = py !== "ready";
    dom.runMine.textContent = s.running ? RUNNING_COPY : localCheckpoint ? CHECK_MINE : RUN_MINE;
    for (const button of this.ui.querySelectorAll("[data-copy-label]")) {
      button.textContent = s.copied === button.dataset.key ? COPIED : button.dataset.copyLabel;
    }
    if (localCheckpoint) dom.explain.hidden = false;

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
    if (s.check && s.checkOutcome && s.checkOutcome.local) {
      dom.mineVerdict.hidden = false;
      dom.mineVerdict.replaceChildren(glyph(s.checkOutcome.match ? "check" : "cross"), s.checkOutcome.match ? MATCH_COPY : MISMATCH_COPY);
      dom.mineVerdict.className = `step-verdict ${s.checkOutcome.match ? "is-pass" : "is-fail"}`;
      dom.mineFirst.hidden = false;
      dom.mineFirst.textContent = CHECK_LOCAL_NOTE;
      dom.mineOutput.textContent = "";
      dom.expectedOutput.textContent = step.checkpoint.expected;
    } else if (s.check && s.checkOutcome) {
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
      if (on && !item.brk.local) {
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
   * Copies a chunk (the copy must be exactly its added lines), runs the reference (it must match the expected output), turns
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
