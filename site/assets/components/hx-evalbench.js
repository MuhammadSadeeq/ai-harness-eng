// hx-evalbench (BP-3.5 §1, D1 and D3): assemble an eval, run it on two boards, see its noise, and trust its grader.
//   <hx-evalbench src="data/evalbench-demo.json"></hx-evalbench>
// The eval runs through the simulator's runEval (ENGINE A11.7). A cell opens through runTrial: the same seed, so the
// same run and reply. The run goes one task at a time (at most `trials` runs per batch, never more than 50), yielding
// between batches. Each task keeps its index in the eval, so its model-grader draws match a whole-eval run.
// Evidence: "evalbench", {tasks, trials, grader, old: {pass, runs}, new: {pass, runs}, overlap}.
// Values: old_rate, new_rate (percent, read-only), from the latest finished run.
import { HxElement } from "./lib/hx-element.js";
import { formatCost, formatInt, plural, statusWords, pricingIsUsd } from "./lib/format.js";
import { percent, wilson } from "./lib/stats.js";
import { loadEval, runEval, runTrial } from "../sim/index.js";
import { getBoard, getFactsCore, getTape } from "./lib/data.js";

const TRIAL_CHOICES = [1, 3, 5, 10, 20, 50];
const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const MODEL_LINE = "The course's model of a judge, not a measurement.";
const OVERLAP_LINE = "The intervals overlap: this eval can't tell the boards apart. Add tasks or trials.";
const FALSE_DONE_NOTE = "A false done is a run that said done and failed its checks.";
let uidCount = 0;

const yieldToLoop = () => new Promise((resolve) => {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    channel.port1.close();
    resolve();
  };
  channel.port2.postMessage(null);
});

/** The shape the component needs. Throws with the first problem. */
export function validEvalbench(src) {
  if (typeof src?.eval !== "string" || src.eval === "") throw new Error("hx-evalbench: needs eval");
  if (typeof src.boards?.old !== "string" || typeof src.boards?.new !== "string") throw new Error("hx-evalbench: needs boards old and new");
  if (!Array.isArray(src.start_tasks) || src.start_tasks.some((t) => typeof t !== "string")) throw new Error("hx-evalbench: start_tasks must be a list of task ids");
  if (src.note !== undefined && typeof src.note !== "string") throw new Error("hx-evalbench: note must be text");
  return src;
}

/** One runEval spec for task `index` of the eval. Its model-grader draws are the eval's own (seed_base + 1000 * index + k). */
export function taskSpec(E, index, trials) {
  return { ...E, tasks: [E.tasks[index]], trials, seed_base: E.seed_base + 1000 * index };
}

/** Counts for one board over the chosen tasks: pass, Wilson interval, pass@k, pass^k, cost, and the model grader's checks. */
export function tally(rows, taskIds) {
  const runs = rows.length;
  const pass = rows.filter((r) => r.code).length;
  const w = wilson(pass, runs);
  return {
    runs,
    pass,
    percent: percent(pass, runs),
    lo: w.lo,
    hi: w.hi,
    tasks: taskIds.length,
    anyPass: taskIds.filter((id) => rows.some((r) => r.task === id && r.code)).length,
    allPass: taskIds.filter((id) => rows.filter((r) => r.task === id).every((r) => r.code)).length,
    cost: rows.reduce((sum, r) => sum + r.cost, 0),
    agree: rows.filter((r) => r.model === r.code).length,
    falsePasses: rows.filter((r) => r.status === "done" && !r.passed && r.model === true).length,
  };
}

/** The verdict from the two intervals: overlap is "can't tell apart"; otherwise the one above the other is better. */
export function verdict(oldT, newT, names) {
  const overlap = oldT.lo <= newT.hi && newT.lo <= oldT.hi;
  if (overlap) return { overlap: true, text: OVERLAP_LINE };
  const better = newT.lo > oldT.hi ? names.new : names.old;
  return { overlap: false, text: `${better} is better: its interval sits above the other's.` };
}

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (name === "text") node.textContent = value;
    else if (name === "class") node.className = value;
    else if (name === "dataset") Object.assign(node.dataset, value);
    else if (name.startsWith("aria-")) node.setAttribute(name, String(value));
    else if (value === false) continue;
    else node.setAttribute(name, value === true ? "" : String(value));
  }
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
};

const glyph = (name) => {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "glyph");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `${SPRITE}#g-${name}`);
  svg.append(use);
  return svg;
};

const uniqueTapes = (E) => [...new Set(E.tasks.map((t) => t.tape))];

export class HxEvalbench extends HxElement {
  static observedAttributes = ["src"];
  static styles = new URL("./hx-evalbench.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    if (!src) throw new Error("hx-evalbench needs src");
    const srcUrl = new URL(src, document.baseURI);
    const response = await fetch(srcUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
    this.data = validEvalbench(await response.json());
    // The eval is a file beside a demo page (a name ending in .json), or a course eval by id.
    const evalUrl = this.data.eval.endsWith(".json")
      ? new URL(this.data.eval, srcUrl)
      : new URL(`../../data/evals/${this.data.eval}.json`, import.meta.url);
    const evalResponse = await fetch(evalUrl);
    if (!evalResponse.ok) throw new Error(`HTTP ${evalResponse.status} for the eval`);
    this.E = loadEval(await evalResponse.json());
    const ids = this.E.tasks.map((t) => t.id);
    for (const id of this.data.start_tasks) if (!ids.includes(id)) throw new Error(`hx-evalbench: start task ${id} is not in the eval`);
    this.facts = await getFactsCore();
    this.tapes = {};
    await Promise.all(uniqueTapes(this.E).map(async (id) => { this.tapes[id] = await getTape(id); }));
    this.boards = { old: await getBoard(this.data.boards.old), new: await getBoard(this.data.boards.new) };
    this.priced = pricingIsUsd(this.tapes[this.E.tasks[0].tape]);
    this.uid = `hxe${++uidCount}`;
    this.state = {
      checked: this.data.start_tasks.slice(),
      trials: 5,
      grader: "code",
      board: "old",
      result: null,
      running: false,
      progress: "",
      open: null,
      detail: null,
      error: null,
    };
  }

  boardLabel(side) {
    return this.boards[side].label ?? (side === "old" ? "Old board" : "New board");
  }

  checkedIndexes() {
    return this.E.tasks.map((t, i) => (this.state.checked.includes(t.id) ? i : -1)).filter((i) => i >= 0);
  }

  /** Runs every checked task on both boards: one batch per task and board, yielding between batches. */
  run() {
    if (this.state.running) return this.runJob;
    const indexes = this.checkedIndexes();
    if (indexes.length === 0) return null;
    this.runJob = this.doRun(indexes, this.state.trials, this.E.model_grader && this.state.grader === "model" ? "model" : "code");
    return this.runJob;
  }

  async doRun(indexes, trials, grader) {
    this.setState({ running: true, result: null, open: null, detail: null, error: null, progress: "" });
    const rows = { old: [], new: [] };
    const total = 2 * indexes.length;
    let step = 0;
    try {
      for (const side of ["old", "new"]) {
        for (const i of indexes) {
          step += 1;
          const task = this.E.tasks[i].id;
          this.setState({ progress: `Running the ${this.boardLabel(side)}, task ${task}: batch ${formatInt(step)} of ${formatInt(total)}, ${plural(trials, "trial")} each.` });
          rows[side].push(...runEval(taskSpec(this.E, i, trials), this.tapes, this.boards[side], { facts: this.facts }).results);
          await yieldToLoop();
        }
      }
    } catch (error) {
      this.setState({ running: false, progress: "", error: `The run stopped: ${String(error?.message ?? error).slice(0, 160)}` });
      return false;
    }
    const taskIds = indexes.map((i) => this.E.tasks[i].id);
    const old = tally(rows.old, taskIds);
    const next = tally(rows.new, taskIds);
    const names = { old: this.boardLabel("old"), new: this.boardLabel("new") };
    const judged = verdict(old, next, names);
    const result = { trials, grader, taskIds, old, new: next, rows, overlap: judged.overlap, verdict: judged.text };
    this.setState({ running: false, progress: `Done: ${plural(old.runs, "run")} on each board.`, result });
    this.live(judged.text);
    this.evidence("evalbench", {
      tasks: taskIds.length,
      trials,
      grader,
      old: { pass: old.pass, runs: old.runs },
      new: { pass: next.pass, runs: next.runs },
      overlap: judged.overlap,
    });
    for (const name of ["old_rate", "new_rate"]) {
      this.dispatchEvent(new CustomEvent("hx-change", { bubbles: true, detail: { name, value: this.hxValue(name) } }));
    }
    return true;
  }

  /** A cell opens its trial: the same run again through runTrial (same seed, so the same reply). */
  openCell(side, taskId, trial) {
    const task = this.E.tasks.find((t) => t.id === taskId);
    const { events, result } = runTrial(this.tapes[task.tape], this.boards[side], trial, { facts: this.facts });
    const replies = events.filter((e) => e.kind === "model_reply");
    const row = this.state.result.rows[side].find((r) => r.task === taskId && r.trial === trial);
    this.setState({
      open: { side, task: taskId, trial },
      detail: {
        status: statusWords(result.status, result.passed),
        passed: result.passed,
        model: row?.model ?? null,
        reply: replies.length ? replies[replies.length - 1].text : "(no reply)",
      },
    });
  }

  hxValue(name) {
    const r = this.state?.result;
    if (!r) return null;
    if (name === "old_rate") return r.old.percent;
    if (name === "new_rate") return r.new.percent;
    return null;
  }

  hxRange() {
    return null;
  }

  hxLabel(name) {
    if (name === "old_rate") return `${this.boardLabel("old")} pass rate`;
    if (name === "new_rate") return `${this.boardLabel("new")} pass rate`;
    return null;
  }

  /** Delegated handlers: the real UI drives every change (the self-test uses the same path). */
  wire() {
    if (this.wired) return;
    this.wired = true;
    this.ui.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || button.disabled) return;
      const key = button.dataset.key ?? "";
      if (key === "run") this.run();
      else if (key === "grader-code") this.setState({ grader: "code", result: null, open: null, detail: null });
      else if (key === "grader-model") this.setState({ grader: "model", result: null, open: null, detail: null });
      else if (key === "board-old") this.setState({ board: "old", open: null, detail: null });
      else if (key === "board-new") this.setState({ board: "new", open: null, detail: null });
      else if (button.dataset.side) this.openCell(button.dataset.side, button.dataset.task, Number(button.dataset.trial));
    });
    this.ui.addEventListener("change", (event) => {
      const target = event.target;
      if (target.matches("select.eb-trials")) {
        this.setState({ trials: Number(target.value), result: null, open: null, detail: null });
      } else if (target.matches("input[data-task]")) {
        const id = target.dataset.task;
        const checked = this.state.checked.includes(id) ? this.state.checked.filter((t) => t !== id) : [...this.state.checked, id];
        this.setState({ checked, result: null, open: null, detail: null });
      }
    });
  }

  render() {
    if (!this.ui.dataset.wired) {
      this.wire();
      this.ui.dataset.wired = "";
    }
    const { E, data, state: s } = this;
    const indexes = this.checkedIndexes();
    const canRun = !s.running && indexes.length > 0;
    const priced = this.priced;
    const costOf = (cost) => formatCost(cost, { usd: priced });
    const children = [];
    children.push(el("h3", { class: "eb-title", text: E.title }));
    if (data.note) children.push(el("p", { class: "eb-note", text: data.note }));

    // Assemble: the tasks as a checklist, the trial count, the grader, and one primary key.
    const taskList = el("fieldset", { class: "eb-tasks" },
      el("legend", { class: "eb-legend", text: "Tasks" }),
      ...E.tasks.map((task) => {
        const tape = this.tapes[task.tape];
        return el("label", { class: "eb-task" },
          el("input", { type: "checkbox", checked: s.checked.includes(task.id), disabled: s.running, dataset: { task: task.id }, "data-key": `task-${task.id}` }),
          el("span", { class: "eb-task-text" },
            el("span", { class: "eb-task-id", text: task.id }),
            el("span", { class: "eb-task-tape", text: tape?.title ?? task.tape })));
      }));
    const trialSelect = el("select", { class: "eb-trials", id: `${this.uid}-trials`, "data-key": "trials", disabled: s.running },
      ...TRIAL_CHOICES.map((n) => el("option", { value: n, selected: n === s.trials, text: formatInt(n) })));
    const graderGroup = E.model_grader
      ? el("div", { class: "seg eb-seg", role: "group", "aria-label": "Grader" },
        el("button", { type: "button", "aria-pressed": s.grader === "code", "data-key": "grader-code", disabled: s.running, text: "Code grader" }),
        el("button", { type: "button", "aria-pressed": s.grader === "model", "data-key": "grader-model", disabled: s.running, text: "Model grader" }))
      : null;
    children.push(el("div", { class: "eb-assemble" },
      taskList,
      el("div", { class: "eb-row" },
        el("label", { class: "eb-label", for: `${this.uid}-trials`, text: "Trials per task" }),
        trialSelect),
      graderGroup,
      el("div", { class: "eb-actions" },
        el("button", { type: "button", class: "key key-primary", "data-key": "run", "aria-disabled": !canRun, disabled: !canRun, text: s.running ? "Running…" : "Run both boards" }))));
    if (indexes.length === 0) children.push(el("p", { class: "eb-line", text: "Tick at least one task to run the eval." }));
    if (s.error) children.push(el("p", { class: "eb-line eb-error", role: "alert", text: s.error }));
    if (s.progress) children.push(el("p", { class: "eb-line", text: s.progress }));

    if (s.result) {
      const r = s.result;
      const column = (side) => {
        const t = r[side];
        const interval = el("div", { class: "eb-interval" });
        interval.style.left = `${(t.lo * 100).toFixed(2)}%`;
        interval.style.width = `${((t.hi - t.lo) * 100).toFixed(2)}%`;
        const point = el("div", { class: "eb-point" });
        point.style.left = `${t.percent.toFixed(2)}%`;
        const axis = el("div", { class: "eb-axis", role: "img", "aria-label": `${this.boardLabel(side)}: ${formatInt(t.percent)} percent pass rate; 95 percent interval from ${formatInt(Math.round(t.lo * 100))} to ${formatInt(Math.round(t.hi * 100))} percent` }, interval, point);
        return el("div", { class: "readout eb-readout" },
          el("p", { class: "readout-label", text: this.boardLabel(side) }),
          el("p", { class: "readout-value", text: `${formatInt(t.pass)} of ${formatInt(t.runs)} runs pass · ${formatInt(t.percent)} %` }),
          axis,
          el("p", { class: "eb-axis-ticks", text: "0 % to 100 %, one axis for both boards" }),
          el("p", { class: "readout-note", text: `95 % interval: ${formatInt(Math.round(t.lo * 100))} % to ${formatInt(Math.round(t.hi * 100))} %` }),
          el("p", { class: "readout-note", text: `pass@k, at least one of k trials passed: ${formatInt(t.anyPass)} of ${formatInt(t.tasks)} tasks` }),
          el("p", { class: "readout-note", text: `pass^k, every one of k trials passed: ${formatInt(t.allPass)} of ${formatInt(t.tasks)} tasks` }),
          el("p", { class: "readout-note", text: `Cost: ${costOf(t.cost)}` }));
      };
      children.push(el("div", { class: "readouts eb-readouts" }, column("old"), column("new")));
      children.push(el("p", { class: "eb-verdict", text: r.verdict }));
      if (r.grader === "model") {
        const runs = r.old.runs + r.new.runs;
        const agree = r.old.agree + r.new.agree;
        const falseDones = r.old.falsePasses + r.new.falsePasses;
        children.push(el("p", { class: "eb-line", text: `The model grader agreed with the code grader on ${formatInt(agree)} of ${formatInt(runs)} trials. It passed ${formatInt(falseDones)} false ${falseDones === 1 ? "done" : "dones"}.` }));
        children.push(el("p", { class: "eb-hint", text: FALSE_DONE_NOTE }));
      }

      // The grid: tasks by trials, one board at a time. A cell opens its trial.
      const rows = r.taskIds.map((id) => {
        const cells = Array.from({ length: r.trials }, (_, k) => {
          const trial = k + 1;
          const row = r.rows[s.board].find((x) => x.task === id && x.trial === trial);
          const disagree = r.grader === "model" && row.model !== row.code;
          const word = r.grader === "model" ? `${row.code ? "pass" : "fail"}, model ${row.model ? "pass" : "fail"}` : (row.code ? "pass" : "fail");
          const open = s.open !== null && s.open.side === s.board && s.open.task === id && s.open.trial === trial;
          return el("button", {
            type: "button",
            class: `eb-cell ${row.code ? "is-pass" : "is-fail"}${disagree ? " is-disagree" : ""}${open ? " is-open" : ""}`,
            "aria-pressed": open,
            "aria-label": `${id}, trial ${formatInt(trial)}: ${word}${disagree ? ", the graders disagree" : ""}`,
            dataset: { side: s.board, task: id, trial: String(trial) },
            "data-key": `cell-${s.board}-${id}-${trial}`,
          },
          glyph(row.code ? "check" : "cross"),
          el("span", { class: "eb-cell-word", text: word }),
          disagree ? el("span", { class: "eb-cell-disagree", text: "disagree" }) : null);
        });
        return el("div", { class: "eb-grid-row" }, el("p", { class: "eb-grid-task", text: id }), el("div", { class: "eb-cells" }, ...cells));
      });
      children.push(el("div", { class: "eb-grid-wrap" },
        el("div", { class: "seg eb-seg", role: "group", "aria-label": "Board for the grid" },
          el("button", { type: "button", "aria-pressed": s.board === "old", "data-key": "board-old", text: this.boardLabel("old") }),
          el("button", { type: "button", "aria-pressed": s.board === "new", "data-key": "board-new", text: this.boardLabel("new") })),
        el("div", { class: "eb-grid" }, ...rows)));
      if (s.detail && s.open) {
        const d = s.detail;
        children.push(el("aside", { class: "eb-detail" },
          el("p", { class: "eb-detail-head", text: `${s.open.task}, trial ${formatInt(s.open.trial)} on the ${this.boardLabel(s.open.side)}` }),
          el("p", { class: "eb-line", text: `Status: ${d.status}. The checks: ${d.passed ? "pass" : "fail"}.` }),
          r.grader === "model" ? el("p", { class: "eb-line", text: `The model grader said ${d.model ? "pass" : "fail"}.` }) : null,
          el("p", { class: "eb-label", text: "The run's last reply" }),
          el("blockquote", { class: "eb-reply", text: d.reply })));
      }
      if (r.grader === "model") children.push(el("p", { class: "eb-figure-line", text: MODEL_LINE }));
    }

    this.ui.replaceChildren(...children);
  }

  async selfTest() {
    const saved = this.state;
    let evidence = 0;
    const count = (event) => {
      if (event.detail.kind === "evalbench") evidence += 1;
    };
    this.addEventListener("hx-evidence", count);
    try {
      this.setState({ result: null, open: null, detail: null, checked: this.E.tasks.slice(0, 2).map((t) => t.id) });
      const select = this.ui.querySelector("select.eb-trials");
      select.value = "1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      if (this.state.trials !== 1) return false;
      this.ui.querySelector("[data-key='run']").click();
      await this.runJob;
      const r = this.state.result;
      if (!r || r.old.runs !== 2 || r.new.runs !== 2 || evidence !== 1) return false;
      this.ui.querySelector("[data-side]").click();
      if (!this.state.open || !this.state.detail) return false;
      return true;
    } finally {
      this.removeEventListener("hx-evidence", count);
      this.restoreAfterTest(saved);
    }
  }
}

customElements.define("hx-evalbench", HxEvalbench);
