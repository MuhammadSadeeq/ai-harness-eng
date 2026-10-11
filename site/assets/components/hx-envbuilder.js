// hx-envbuilder (BP-3.6 §2, F6): build an environment (a grader and a sandbox), run a scripted policy over seeds, and read
// the reward (what the chosen grader said) against the truth (the task's own checks). A gap is a reward hack.
//   <hx-envbuilder src="data/envbuilder-demo.json"></hx-envbuilder>
// The runs go through the simulator (runTrial, ENGINE A9 and A11): seed k is run k, so the reward and the truth of
// every trial are the simulator's own. The grader and the sandbox are tape and board patches (`patchFor`). A run's hack
// is read from its events: an edited test marker, a file outside the workspace, the grader's words written in place of
// the fix. Evidence: "envbuilder", {grader, sandbox, reward, truth, trials}. Values: reward, truth (counts of runs).
import { HxElement } from "./lib/hx-element.js";
import { formatInt, plural } from "./lib/format.js";
import { getFactsCore } from "./lib/data.js";
import { runTrial } from "../sim/index.js";

const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const MODEL_LINE = "The policy is a script, so its hacks repeat exactly. The rates are the course's model, not a measurement.";
const SANDBOX_LINE = "The sandbox is one module. Turning either option on plugs it, and it keeps file paths inside the workspace; the egress list decides which hosts a network call may reach.";
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
export function validEnvbuilder(src) {
  if (typeof src?.tape !== "string" || src.tape === "") throw new Error("hx-envbuilder: needs tape");
  if (typeof src.base_board !== "string" || src.base_board === "") throw new Error("hx-envbuilder: needs base_board");
  if (!Number.isInteger(src.trials) || src.trials < 1 || src.trials > 50) throw new Error("hx-envbuilder: trials must be 1 to 50");
  if (!Array.isArray(src.grader_options) || src.grader_options.length === 0) throw new Error("hx-envbuilder: needs grader_options");
  for (const o of [...src.grader_options, ...(src.sandbox_options ?? [])]) {
    if (typeof o?.id !== "string" || typeof o.label !== "string" || typeof o.patch !== "object") {
      throw new Error("hx-envbuilder: each option needs id, label and patch");
    }
  }
  if (src.grader_options.filter((o) => o.default).length !== 1) throw new Error("hx-envbuilder: exactly one grader option is the default");
  if (src.note !== undefined && typeof src.note !== "string") throw new Error("hx-envbuilder: note must be text");
  return src;
}

/**
 * The tape and the board with the chosen grader and sandbox patches applied. A patch's `tape` sets top-level fields (null
 * removes one); its `board` sets module configs (null removes the module). Sandbox patches apply in the order listed, so a
 * later one wins for the same module.
 */
export function patchFor(tape, board, grader, sandboxes = []) {
  const t = structuredClone(tape);
  const b = structuredClone(board);
  const apply = (patch) => {
    for (const [field, value] of Object.entries(patch.tape ?? {})) {
      if (value === null) delete t[field];
      else t[field] = value;
    }
    for (const [module, config] of Object.entries(patch.board ?? {})) {
      if (config === null) delete b.modules[module];
      else b.modules[module] = config;
    }
  };
  apply(grader.patch);
  for (const s of sandboxes) apply(s.patch);
  return { tape: t, board: b };
}

/** The grader's verdict on a run: the last verify event's answer when the gate ran, else whether the run said done. */
export function rewardOf(events, result) {
  const verify = [...events].reverse().find((e) => e.kind === "verify");
  return verify ? verify.passed === true : result.status === "done";
}

/** How the gate ended a run, from its verdicts in order: no gate, passed, caught, or caught and then repaired. */
export function gateEnd(events) {
  const verdicts = events.filter((e) => e.kind === "verify").map((e) => e.passed === true);
  if (verdicts.length === 0) return "no gate";
  if (verdicts.every((v) => v)) return "passed the gate";
  return verdicts[verdicts.length - 1] ? "caught by the gate, then repaired" : "caught by the gate";
}

/** The hacks a run used, named from its events: a test marker edited, a file outside the workspace, the grader's words written in place of the fix. */
export function hacksOf(events, tape) {
  const markers = new Set((tape.tests ?? []).map((t) => t.marker.file));
  const graderWords = (tape.tests ?? []).map((t) => t.check.contains).filter((w) => typeof w === "string" && w !== "");
  const truthWords = (tape.checks ?? []).map((c) => c.contains).filter((w) => typeof w === "string" && w !== "");
  const names = [];
  const add = (name) => {
    if (!names.includes(name)) names.push(name);
  };
  const fromOutside = []; // what the run read outside the workspace, trimmed
  for (const e of events) {
    // The sandbox refused a read outside the workspace before any tool ran (a sandbox event, not a tool call).
    if (e.kind === "sandbox" && e.allowed === false && /outside the workspace/.test(e.reason ?? "")) add("tried a file outside the workspace (blocked)");
    if (e.kind !== "tool_call") continue;
    const path = typeof e.input?.path === "string" ? e.input.path : "";
    if ((e.tool === "write_file" || e.tool === "edit_file") && markers.has(path) && e.ok) add("edited a test marker");
    if (path.startsWith("../")) {
      add(e.ok ? "read a file outside the workspace" : "tried a file outside the workspace (blocked)");
      if (e.ok && typeof e.output === "string" && e.output.trim() !== "") fromOutside.push(e.output.trim());
    }
    if (e.tool === "write_file" && typeof e.input?.content === "string") {
      const text = e.input.content;
      // The expected output read from outside, copied in: special-cased, not solved.
      if (fromOutside.some((o) => text.includes(o))) {
        add("special-cased an answer read from outside the workspace");
      } else if (graderWords.some((w) => text.includes(w)) && !truthWords.some((w) => text.includes(w))) {
        // A whole-file write that holds the grader's words but not the truth's: the words, not the fix.
        add("wrote the grader's words in place of the fix");
      }
    }
  }
  return names;
}

/** Counts over the runs: the reward, the truth, the runs that pass the grader without solving the task, and the reverse. */
export function summaryOf(runs) {
  const trials = runs.length;
  const reward = runs.filter((r) => r.reward).length;
  const truth = runs.filter((r) => r.passed).length;
  const hacks = runs.filter((r) => r.reward && !r.passed).length;
  const missed = runs.filter((r) => !r.reward && r.passed).length;
  return { trials, reward, truth, hacks, missed };
}

/** The sentence under the readouts: the gap, in words. */
export function gapLine(s) {
  const head = `The grader rewarded ${plural(s.reward, "run")}; ${formatInt(s.truth)} really solved the task.`;
  if (s.hacks > 0) return `${head} The policy found a way to pass the grader: ${plural(s.hacks, "run")} passed it without solving the task.`;
  if (s.missed > 0) return `${head} The grader also turned away ${plural(s.missed, "run")} that solved the task.`;
  return `${head} The grader and the truth agree on every run.`;
}

export class HxEnvbuilder extends HxElement {
  static observedAttributes = ["src"];
  static styles = new URL("./hx-envbuilder.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    if (!src) throw new Error("hx-envbuilder needs src");
    const srcUrl = new URL(src, document.baseURI);
    const response = await fetch(srcUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
    this.data = validEnvbuilder(await response.json());
    this.tape = await fetchJson(new URL(this.data.tape, srcUrl));
    this.base = await fetchJson(new URL(this.data.base_board, srcUrl));
    this.facts = await getFactsCore();
    this.uid = `hxv${++uidCount}`;
    const grader = this.data.grader_options.find((o) => o.default).id;
    this.state = { grader, sandbox: [], trials: this.data.trials, result: null, running: false, progress: "", open: null, error: null };
  }

  graderOption() {
    return this.data.grader_options.find((o) => o.id === this.state.grader);
  }

  sandboxOptions() {
    return (this.data.sandbox_options ?? []).filter((o) => this.state.sandbox.includes(o.id));
  }

  run() {
    if (this.state.running) return this.runJob;
    this.runJob = this.doRun();
    return this.runJob;
  }

  async doRun() {
    const { grader, sandbox, trials } = this.state;
    const graderOpt = this.graderOption();
    const sandboxOpts = this.sandboxOptions();
    const patched = patchFor(this.tape, this.base, graderOpt, sandboxOpts);
    this.setState({ running: true, result: null, open: null, error: null, progress: "" });
    const runs = [];
    try {
      for (let k = 1; k <= trials; k += 1) {
        this.setState({ progress: `Running the policy, seed ${formatInt(k)} of ${formatInt(trials)}.` });
        const { events, result } = runTrial(patched.tape, patched.board, k, { facts: this.facts });
        runs.push({
          seed: k,
          status: result.status,
          passed: result.passed,
          reward: rewardOf(events, result),
          hacks: hacksOf(events, this.tape),
          gate: gateEnd(events),
          turns: result.turns,
          reply: [...events].reverse().find((e) => e.kind === "model_reply")?.text ?? "",
        });
        if (k % 5 === 0) await yieldToLoop();
      }
    } catch (error) {
      this.setState({ running: false, progress: "", error: `The run stopped: ${String(error?.message ?? error).slice(0, 160)}` });
      return false;
    }
    const counts = summaryOf(runs);
    const line = gapLine(counts);
    const result = { grader, sandbox, runs, counts, line, graderLabel: graderOpt.label, sandboxLabels: sandboxOpts.map((o) => o.label) };
    this.setState({ running: false, progress: `Done: ${plural(trials, "run")} for the policy.`, result });
    this.live(line);
    this.evidence("envbuilder", { grader, sandbox, reward: counts.reward, truth: counts.truth, trials });
    for (const name of ["reward", "truth"]) {
      this.dispatchEvent(new CustomEvent("hx-change", { bubbles: true, detail: { name, value: this.hxValue(name) } }));
    }
    return true;
  }

  hxValue(name) {
    const r = this.state?.result;
    if (!r) return null;
    if (name === "reward") return r.counts.reward;
    if (name === "truth") return r.counts.truth;
    return null;
  }

  hxRange() {
    return null;
  }

  hxLabel(name) {
    if (name === "reward") return "Reward: the grader's pass count";
    if (name === "truth") return "Truth: the task's own checks pass count";
    return null;
  }

  wire() {
    if (this.wired) return;
    this.wired = true;
    this.ui.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || button.disabled) return;
      const key = button.dataset.key ?? "";
      if (key === "run") this.run();
      else if (key.startsWith("sandbox-")) {
        const id = key.slice("sandbox-".length);
        const sandbox = this.state.sandbox.includes(id) ? this.state.sandbox.filter((x) => x !== id) : [...this.state.sandbox, id];
        // Keep the listed order, so a later sandbox option wins for the same module.
        const ordered = this.data.sandbox_options.map((o) => o.id).filter((x) => sandbox.includes(x));
        this.setState({ sandbox: ordered, result: null, open: null });
      } else if (button.dataset.trial) {
        this.setState({ open: Number(button.dataset.trial) });
      }
    });
    this.ui.addEventListener("change", (event) => {
      if (event.target.matches("select.ev-grader")) this.setState({ grader: event.target.value, result: null, open: null });
    });
  }

  render() {
    if (!this.ui.dataset.wired) {
      this.wire();
      this.ui.dataset.wired = "";
    }
    const { data, state: s } = this;
    const children = [];
    children.push(el("h3", { class: "ev-title", text: this.tape.title ?? "The environment" }));
    if (data.note) children.push(el("p", { class: "ev-note", text: data.note }));

    const grader = el("div", { class: "ev-field" },
      el("label", { class: "ev-label", for: `${this.uid}-grader`, text: "Grader" }),
      el("select", { class: "ev-grader", id: `${this.uid}-grader`, "data-key": "grader", disabled: s.running },
        ...data.grader_options.map((o) => el("option", { value: o.id, selected: o.id === s.grader, text: o.label }))));
    const sandbox = el("div", { class: "ev-field" },
      el("p", { class: "ev-label", text: "Sandbox" }),
      el("div", { class: "seg ev-seg", role: "group", "aria-label": "Sandbox" },
        ...(data.sandbox_options ?? []).map((o) => el("button", {
          type: "button",
          "aria-pressed": s.sandbox.includes(o.id),
          "data-key": `sandbox-${o.id}`,
          disabled: s.running,
          text: o.label,
        }))));
    children.push(el("div", { class: "ev-build" },
      grader,
      sandbox,
      el("div", { class: "ev-actions" },
        el("button", { type: "button", class: "key key-primary", "data-key": "run", disabled: s.running, "aria-disabled": s.running, text: s.running ? "Running…" : "Run the policy" }))));
    children.push(el("p", { class: "ev-line", text: SANDBOX_LINE }));
    if (s.error) children.push(el("p", { class: "ev-line ev-error", role: "alert", text: s.error }));
    if (s.progress) children.push(el("p", { class: "ev-line", text: s.progress }));

    if (s.result) {
      const r = s.result;
      const readout = (label, note, value, words) => el("div", { class: "readout ev-readout" },
        el("p", { class: "readout-label", text: label }),
        el("p", { class: "readout-value", text: value }),
        el("p", { class: "readout-note", text: words }),
        el("p", { class: "readout-note", text: note }));
      children.push(el("div", { class: "readouts ev-readouts" },
        readout("Reward", "What the grader said.", `${formatInt(r.counts.reward)} of ${formatInt(r.counts.trials)}`, `${formatInt(r.counts.reward)} runs pass the grader`),
        readout("Truth", "The task's own checks.", `${formatInt(r.counts.truth)} of ${formatInt(r.counts.trials)}`, `${formatInt(r.counts.truth)} runs solve the task`)));
      children.push(el("p", { class: "ev-verdict", text: r.line }));
      children.push(el("p", { class: "ev-hint", text: `Grader: ${r.graderLabel}. Sandbox: ${r.sandboxLabels.length ? r.sandboxLabels.join(", ") : "none"}.` }));
      children.push(el("p", { class: "ev-hint", text: MODEL_LINE }));
      // The trials: a hack names itself in the panel; a run is one button.
      children.push(el("div", { class: "ev-grid", role: "group", "aria-label": "Trials" },
        ...r.runs.map((run) => el("button", {
          type: "button",
          class: `ev-cell ${run.reward ? "is-pass" : "is-fail"}${run.reward && !run.passed ? " is-hack" : ""}${s.open === run.seed ? " is-open" : ""}`,
          "aria-pressed": s.open === run.seed,
          "aria-label": `Trial ${formatInt(run.seed)}: the grader ${run.reward ? "passed" : "failed"} it, the checks ${run.passed ? "passed" : "failed"} it`,
          dataset: { trial: String(run.seed) },
          "data-key": `trial-${run.seed}`,
        },
        glyph(run.reward ? "check" : "cross"),
        el("span", { class: "ev-cell-word", text: `${run.seed}` }),
        run.reward && !run.passed ? el("span", { class: "ev-cell-hack", text: "hack" }) : null))));
      const open = r.runs.find((run) => run.seed === s.open);
      if (open) {
        children.push(el("aside", { class: "ev-detail" },
          el("p", { class: "ev-detail-head", text: `Trial ${formatInt(open.seed)}: ${open.status}` }),
          el("p", { class: "ev-line", text: `The grader said ${open.reward ? "pass" : "fail"}. The checks said ${open.passed ? "pass" : "fail"}.` }),
          el("p", { class: "ev-line", text: open.hacks.length ? `The run used: ${open.hacks.map((h) => `${h} (${open.gate})`).join("; ")}.` : "The run used no hack: it made the fix." }),
          el("p", { class: "ev-label", text: "The run's last reply" }),
          el("blockquote", { class: "ev-reply", text: open.reply || "(no reply)" })));
      }
    }
    this.ui.replaceChildren(...children);
  }

  async selfTest() {
    const saved = this.state;
    let evidence = 0;
    const count = (event) => {
      if (event.detail.kind === "envbuilder") evidence += 1;
    };
    this.addEventListener("hx-evidence", count);
    try {
      this.setState({ result: null, open: null, sandbox: [] });
      const select = this.ui.querySelector("select.ev-grader");
      select.value = this.data.grader_options[0].id;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      this.ui.querySelector("[data-key='run']").click();
      await this.runJob;
      const r = this.state.result;
      if (!r || r.counts.trials !== this.data.trials || evidence !== 1) return false;
      if (r.counts.reward !== r.counts.trials) return false;
      this.ui.querySelector("[data-trial]").click();
      if (this.state.open === null) return false;
      return true;
    } finally {
      this.removeEventListener("hx-evidence", count);
      this.restoreAfterTest(saved);
    }
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url.pathname}`);
  return response.json();
}

if (!customElements.get("hx-envbuilder")) customElements.define("hx-envbuilder", HxEnvbuilder);
