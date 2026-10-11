// hx-shift (BP-3.6 §1, F2): write the handoff the next shift needs. The learner writes a note; the note is the progress file
// the next session reads (ENGINE A14.2). The next shift runs in session 2 of the tape, and its script reacts with sent_lacks:
// to each required phrase it was not told about.
//   <hx-shift src="data/shift-demo.json"></hx-shift>
// The trials run through the simulator (runTrial): seed k is run k, and the note is in the workspace the next shift reads
// (the session before it never writes that file). Evidence: "shift", {shift_passed, trials, missing}. Values: passed,
// missing_count.
import { HxElement } from "./lib/hx-element.js";
import { formatInt, plural } from "./lib/format.js";
import { getFactsCore } from "./lib/data.js";
import { runTrial } from "../sim/index.js";

const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const MODEL_LINE = "The next shift is a script, so every trial repeats exactly. What it does without a note is the course's model, not a measurement.";
let uidCount = 0;

const yieldToLoop = () => new Promise((resolve) => {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    channel.port1.close();
    resolve();
  };
  channel.port2.postMessage(null);
});

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (name === "text") node.textContent = value;
    else if (name === "class") node.className = value;
    else if (name === "dataset") Object.assign(node.dataset, value);
    else if (name.startsWith("aria-")) node.setAttribute(name, String(value));
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

/** The shape the component needs. Throws with the first problem. */
export function validShift(src) {
  if (typeof src?.tape !== "string" || src.tape === "") throw new Error("hx-shift: needs tape");
  if (typeof src.board !== "string" || src.board === "") throw new Error("hx-shift: needs board");
  if (typeof src.note_path !== "string" || src.note_path === "") throw new Error("hx-shift: needs note_path");
  if (!Array.isArray(src.required) || src.required.length === 0) throw new Error("hx-shift: needs required items");
  const ids = new Set();
  for (const item of src.required) {
    if (typeof item?.id !== "string" || typeof item.phrase !== "string" || typeof item.why !== "string") {
      throw new Error("hx-shift: each required item needs id, phrase and why");
    }
    if (ids.has(item.id)) throw new Error(`hx-shift: duplicate required item ${item.id}`);
    ids.add(item.id);
  }
  if (!Number.isInteger(src.trials) || src.trials < 1 || src.trials > 20) throw new Error("hx-shift: trials must be 1 to 20");
  if (src.starter_note !== undefined && typeof src.starter_note !== "string") throw new Error("hx-shift: starter_note must be text");
  if (src.note !== undefined && typeof src.note !== "string") throw new Error("hx-shift: note must be text");
  return src;
}

/** The required items against the note: an item is in the note when its phrase is, ignoring case. */
export function itemsIn(note, required) {
  const text = note.toLowerCase();
  return required.map((item) => ({ ...item, inNote: text.includes(item.phrase.toLowerCase()) }));
}

/** The tape with the note in the workspace the next session reads. Only the workspace changes. */
export function tapeWithNote(tape, notePath, note) {
  return { ...structuredClone(tape), workspace: { ...structuredClone(tape.workspace), [notePath]: note } };
}

/** Counts over the trials: passed (the next shift done and its checks hold), and the turns it spent. */
export function outcomeOf(runs) {
  const passed = runs.filter((r) => r.passed).length;
  // The turns the next shift spent: its model replies in the second session (the run's turns include the first session).
  const turns = runs.map((r) => r.session.length);
  // The run's turn numbers the next shift's replies carry (its first and last), over the trials that had replies.
  const spans = runs.filter((r) => r.session.length > 0).map((r) => [r.session[0].turn, r.session[r.session.length - 1].turn]);
  return {
    trials: runs.length,
    passed,
    turnsMin: Math.min(...turns),
    turnsMax: Math.max(...turns),
    firstTurn: spans.length ? Math.min(...spans.map((x) => x[0])) : null,
    lastTurn: spans.length ? Math.max(...spans.map((x) => x[1])) : null,
  };
}

/** The readout's sentence: the count, and the run's turn numbers it spent, e.g. "The next shift took 4 turns (turns 3 to 6 of the run)." */
export function turnsLine(o) {
  const took = o.turnsMin === o.turnsMax ? plural(o.turnsMin, "turn") : `${formatInt(o.turnsMin)} to ${plural(o.turnsMax, "turn")}`;
  if (o.firstTurn === null) return `The next shift took ${took}.`;
  const where = o.firstTurn === o.lastTurn ? `turn ${formatInt(o.firstTurn)}` : `turns ${formatInt(o.firstTurn)} to ${formatInt(o.lastTurn)}`;
  return `The next shift took ${took} (${where} of the run).`;
}

/** The second session's events of one run, in order, as the replay lists them: the next shift's replies and calls. */
export function secondSession(events) {
  const start = events.findIndex((e) => e.kind === "session_start" && e.session === 2);
  if (start < 0) return [];
  const rows = [];
  for (const e of events.slice(start + 1)) {
    if (e.kind === "session_start") break;
    if (e.kind === "model_reply") rows.push({ turn: e.turn, text: e.text || "(no words)", tools: e.tool_uses.map((u) => `${u.name} ${u.input.path ?? ""}`.trim()) });
  }
  return rows;
}

export class HxShift extends HxElement {
  static observedAttributes = ["src"];
  static styles = new URL("./hx-shift.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    if (!src) throw new Error("hx-shift needs src");
    const srcUrl = new URL(src, document.baseURI);
    const response = await fetch(srcUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
    this.data = validShift(await response.json());
    this.tape = await fetchJson(new URL(this.data.tape, srcUrl));
    this.board = await fetchJson(new URL(this.data.board, srcUrl));
    this.facts = await getFactsCore();
    this.uid = `hxh${++uidCount}`;
    // The note is typed without a render (so the text box keeps its focus); the run reads it from this.note.
    this.note = this.data.starter_note ?? "";
    this.state = { trials: this.data.trials, result: null, running: false, progress: "", open: null, error: null };
  }

  run() {
    if (this.state.running) return this.runJob;
    this.runJob = this.doRun();
    return this.runJob;
  }

  async doRun() {
    const note = this.note;
    const tape = tapeWithNote(this.tape, this.data.note_path, note);
    const trials = this.data.trials;
    this.setState({ running: true, result: null, open: null, error: null, progress: "" });
    const runs = [];
    try {
      for (let k = 1; k <= trials; k += 1) {
        this.setState({ progress: `Running the next shift, seed ${formatInt(k)} of ${formatInt(trials)}.` });
        const { events, result } = runTrial(tape, this.board, k, { facts: this.facts });
        runs.push({ seed: k, status: result.status, passed: result.passed, turns: result.turns, session: secondSession(events), events });
        if (k % 5 === 0) await yieldToLoop();
      }
    } catch (error) {
      this.setState({ running: false, progress: "", error: `The run stopped: ${String(error?.message ?? error).slice(0, 160)}` });
      return false;
    }
    const items = itemsIn(note, this.data.required);
    const missing = items.filter((i) => !i.inNote).map((i) => i.id);
    const outcome = outcomeOf(runs);
    const result = { note, items, missing, outcome, runs: runs.map(({ events, ...rest }) => rest) };
    this.setState({ running: false, progress: `Done: ${plural(trials, "run")} of the next shift.`, result });
    this.live(`The next shift passed ${formatInt(outcome.passed)} of ${formatInt(trials)} runs.`);
    this.evidence("shift", { shift_passed: outcome.passed, trials, missing });
    for (const name of ["passed", "missing_count"]) {
      this.dispatchEvent(new CustomEvent("hx-change", { bubbles: true, detail: { name, value: this.hxValue(name) } }));
    }
    return true;
  }

  hxValue(name) {
    const r = this.state?.result;
    if (!r) return null;
    if (name === "passed") return r.outcome.passed;
    if (name === "missing_count") return r.missing.length;
    return null;
  }

  hxRange() {
    return null;
  }

  hxLabel(name) {
    if (name === "passed") return "Next shift: runs that pass";
    if (name === "missing_count") return "Handoff: required items missing";
    return null;
  }

  wire() {
    if (this.wired) return;
    this.wired = true;
    this.ui.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return;
      if (button.dataset.key === "run") this.run();
      else if (button.dataset.trial) this.setState({ open: Number(button.dataset.trial) });
    });
    // Typing keeps the note in this.note and does not re-render, so the box keeps its text and focus.
    this.ui.addEventListener("input", (event) => {
      if (event.target.matches("textarea.sh-note")) this.note = event.target.value;
    });
  }

  render() {
    if (!this.ui.dataset.wired) {
      this.wire();
      this.ui.dataset.wired = "";
    }
    const { data, state: s } = this;
    const children = [];
    children.push(el("h3", { class: "sh-title", text: this.tape.title ?? "The handoff" }));
    if (data.note) children.push(el("p", { class: "sh-note-line", text: data.note }));
    children.push(el("div", { class: "sh-write" },
      el("label", { class: "sh-label", for: `${this.uid}-note`, text: "The handoff note" }),
      el("textarea", { class: "sh-box", id: `${this.uid}-note`, rows: 6, spellcheck: "false", "data-key": "note", disabled: s.running, text: this.note }),
      el("p", { class: "sh-hint", text: `The next shift reads this note at ${data.note_path}. It does not see the session before it.` }),
      el("div", { class: "sh-actions" },
        el("button", { type: "button", class: "key key-primary", "data-key": "run", "aria-disabled": s.running, text: s.running ? "Running…" : "Start the next shift" }))));
    if (s.error) children.push(el("p", { class: "sh-line sh-error", role: "alert", text: s.error }));
    if (s.progress) children.push(el("p", { class: "sh-line", text: s.progress }));

    if (s.result) {
      const r = s.result;
      const o = r.outcome;
      const turns = o.turnsMin === o.turnsMax ? plural(o.turnsMin, "turn") : `${formatInt(o.turnsMin)} to ${plural(o.turnsMax, "turn")}`;
      children.push(el("div", { class: "readouts sh-readouts" },
        el("div", { class: "readout sh-readout" },
          el("p", { class: "readout-label", text: "The next shift" }),
          el("p", { class: "readout-value", text: `${formatInt(o.passed)} of ${formatInt(o.trials)}` }),
          el("p", { class: "readout-note", text: "runs finish done with the checks holding" })),
        el("div", { class: "readout sh-readout" },
          el("p", { class: "readout-label", text: "Turns it spent" }),
          el("p", { class: "readout-value", text: turns }),
          el("p", { class: "readout-note", text: turnsLine(o) }))));
      children.push(el("p", { class: "sh-verdict", text: r.missing.length === 0 ? "The note has every required item. The next shift had what it needed." : `${plural(r.missing.length, "required item")} missing from the note.` }));
      children.push(el("ol", { class: "sh-items" },
        ...r.items.map((item) => el("li", { class: `sh-item ${item.inNote ? "is-in" : "is-missing"}` },
          glyph(item.inNote ? "check" : "cross"),
          el("span", { class: "sh-item-text" },
            el("span", { class: "sh-item-head", text: `${item.inNote ? "in the note" : "missing"}: ${item.phrase}` }),
            item.inNote ? null : el("span", { class: "sh-item-why", text: item.why }))))));
      children.push(el("div", { class: "sh-grid", role: "group", "aria-label": "Trials" },
        ...r.runs.map((run) => el("button", {
          type: "button",
          class: `sh-cell ${run.passed ? "is-pass" : "is-fail"}${s.open === run.seed ? " is-open" : ""}`,
          "aria-pressed": s.open === run.seed,
          "aria-label": `Trial ${formatInt(run.seed)}: the next shift ${run.passed ? "passed" : "failed"}, ${plural(run.session.length, "turn")}`,
          dataset: { trial: String(run.seed) },
          "data-key": `trial-${run.seed}`,
        }, glyph(run.passed ? "check" : "cross"), el("span", { class: "sh-cell-word", text: String(run.seed) })))));
      const open = r.runs.find((run) => run.seed === s.open);
      if (open) {
        children.push(el("aside", { class: "sh-detail" },
          el("p", { class: "sh-detail-head", text: `The second session of trial ${formatInt(open.seed)}` }),
          el("ol", { class: "sh-steps" },
            ...open.session.map((row) => el("li", { class: "sh-step" },
              el("span", { class: "sh-step-turn", text: `Turn ${formatInt(row.turn)}` }),
              el("span", { class: "sh-step-text", text: row.text }),
              el("span", { class: "sh-step-calls", text: row.tools.length ? `Calls: ${row.tools.join(", ")}` : "No call." })))),
          el("p", { class: "sh-line", text: `The checks ${open.passed ? "held" : "did not hold"}, and the run ended ${open.status}.` })));
      }
      children.push(el("p", { class: "sh-hint", text: MODEL_LINE }));
    }
    this.ui.replaceChildren(...children);
  }

  async selfTest() {
    const saved = { state: this.state, note: this.note };
    let evidence = 0;
    const count = (event) => {
      if (event.detail.kind === "shift") evidence += 1;
    };
    this.addEventListener("hx-evidence", count);
    try {
      // An empty note: the required items are missing, and the next shift does not pass every run.
      this.note = "";
      this.setState({ result: null, open: null });
      this.ui.querySelector("[data-key='run']").click();
      await this.runJob;
      const empty = this.state.result;
      if (!empty || empty.missing.length !== this.data.required.length || evidence !== 1) return false;
      // The full note: every item is in it, and the next shift passes.
      this.note = this.data.required.map((item) => item.phrase).join(".\n") + ".\n";
      const box = this.ui.querySelector("textarea.sh-box");
      box.value = this.note;
      box.dispatchEvent(new Event("input", { bubbles: true }));
      this.ui.querySelector("[data-key='run']").click();
      await this.runJob;
      const full = this.state.result;
      if (!full || full.missing.length !== 0 || full.outcome.passed !== this.data.trials || evidence !== 2) return false;
      this.ui.querySelector("[data-trial]").click();
      return this.state.open !== null;
    } finally {
      this.removeEventListener("hx-evidence", count);
      this.note = saved.note;
      this.setState(saved.state);
    }
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url.pathname}`);
  return response.json();
}

if (!customElements.get("hx-shift")) customElements.define("hx-shift", HxShift);
