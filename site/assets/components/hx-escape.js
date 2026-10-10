// hx-escape (BP-3.5 §2, E1 and E2): red team, then blue team, on the simulator's runEval (ENGINE A11.7, A12).
//   <hx-escape src="data/escape-demo.json" ></hx-escape>
// Red team: a plant hides an instruction where content can carry it. A plant is a tape patch (a custom tool's results,
// description or version). Blue team: a defense is a board patch (modules replace the base board's; permissions rules
// concatenate in the order listed). Its leg says what it does: it cuts a leg of the trifecta, or it is a prompt
// wording, or a supply-chain pin. Replay: runEval over the patched tape and board, graded leaked and code.
// Evidence: "escape", {plant, defenses, leaked, finished, trials}. Values: leaked, finished (read-only, from the latest replay).
import { HxElement } from "./lib/hx-element.js";
import { formatInt, plural } from "./lib/format.js";
import { loadEval, runEval } from "../sim/index.js";
import { getBoard, getFactsCore, getTape } from "./lib/data.js";

const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const TRIFECTA = [
  { id: "private_data", name: "private data" },
  { id: "untrusted_content", name: "untrusted content" },
  { id: "exfiltration", name: "exfiltration" },
];
const LEG_WORDS = {
  private_data: "private data",
  untrusted_content: "untrusted content",
  exfiltration: "exfiltration",
  wording: "a prompt wording",
  supply_chain: "a supply-chain pin",
};
const LEG_IDS = Object.keys(LEG_WORDS);
const MAX_TRIALS = 50;
const REPLAY_TAPE = "replay-tape";
const LINE = "Seeded runs of the course's model: wording lowers the rate; only a cut leg stops the attack.";
const FINISH_NOTE = "Finished the task means the tape's checks passed: the summary holds the page's phrase, and the secrets file still holds its token.";
const INSTRUCTION = /NOTE TO THE AGENT[^]*?\./;
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
export function validEscape(src) {
  if (typeof src?.tape !== "string" || src.tape === "") throw new Error("hx-escape: needs tape");
  if (typeof src.base_board !== "string" || src.base_board === "") throw new Error("hx-escape: needs base_board");
  if (!Number.isInteger(src.trials) || src.trials < 1 || src.trials > MAX_TRIALS) throw new Error(`hx-escape: trials must be 1 to ${MAX_TRIALS}`);
  if (!Array.isArray(src.plants) || src.plants.length === 0) throw new Error("hx-escape: needs plants");
  for (const p of src.plants) {
    if (typeof p?.id !== "string" || typeof p.label !== "string" || typeof p.where !== "string") throw new Error(`hx-escape: bad plant ${String(p?.id)}`);
    if (typeof p.patch?.custom_tools !== "object" || p.patch.custom_tools === null) throw new Error(`hx-escape: plant ${p.id} needs custom_tools`);
  }
  if (!Array.isArray(src.defenses)) throw new Error("hx-escape: needs defenses");
  for (const d of src.defenses) {
    if (typeof d?.id !== "string" || typeof d.label !== "string") throw new Error(`hx-escape: bad defense ${String(d?.id)}`);
    if (!LEG_IDS.includes(d.leg)) throw new Error(`hx-escape: ${d.id} leg must be one of ${LEG_IDS.join(", ")}`);
    if (typeof d.patch?.modules !== "object" || d.patch.modules === null) throw new Error(`hx-escape: defense ${d.id} needs modules`);
  }
  if (src.note !== undefined && typeof src.note !== "string") throw new Error("hx-escape: note must be text");
  if (src.leg_tools !== undefined) {
    if (typeof src.leg_tools !== "object" || src.leg_tools === null) throw new Error("hx-escape: leg_tools must be an object");
    for (const [leg, names] of Object.entries(src.leg_tools)) {
      if (!TRIFECTA.some((t) => t.id === leg) || !Array.isArray(names) || names.some((n) => typeof n !== "string")) throw new Error(`hx-escape: leg_tools ${leg} must name tools for a trifecta leg`);
    }
  }
  return src;
}

/** The tape with one plant applied: each named custom tool gets the patch's fields in place (results, description, version). */
export function applyPlant(tape, plant) {
  const patched = structuredClone(tape);
  for (const [name, fields] of Object.entries(plant.patch.custom_tools)) {
    const tool = patched.custom_tools.find((c) => c.name === name);
    if (!tool) throw new Error(`plant ${plant.id} names unknown tool ${name}`);
    for (const [field, value] of Object.entries(fields)) tool[field] = value;
  }
  return patched;
}

/**
 * The board with the chosen defenses applied in the order listed. A module replaces the base board's, except
 * permissions.rules, which concatenate in that order; the mode stays the base board's (or the first defense's when the
 * base has no permissions module).
 */
export function applyDefenses(board, defenses) {
  const patched = structuredClone(board);
  for (const d of defenses) {
    for (const [module, config] of Object.entries(d.patch.modules)) {
      if (module === "permissions") {
        const existing = patched.modules.permissions;
        if (existing) patched.modules.permissions = { ...existing, rules: [...existing.rules, ...config.rules] };
        else patched.modules.permissions = { mode: config.mode, rules: [...config.rules] };
      } else {
        patched.modules[module] = config;
      }
    }
  }
  return patched;
}

/** Which trifecta legs the chosen defenses cut. Wording and pins cut no leg. */
export function legsCut(defenses) {
  const cut = new Set(defenses.map((d) => d.leg).filter((leg) => TRIFECTA.some((t) => t.id === leg)));
  return TRIFECTA.map((t) => ({ ...t, cut: cut.has(t.id) }));
}

/** The line under the trifecta: all open, or the cut legs and what that means. */
export function trifectaLine(legs) {
  const cut = legs.filter((l) => l.cut);
  if (cut.length === 0) return "All three legs are open: an injection can steal data.";
  const names = cut.map((l) => l.name);
  if (cut.length === 1) return `A leg is cut (${names[0]}): the attack has no way to finish.`;
  return `Legs are cut (${names.join(" and ")}): the attack has no way to finish.`;
}

/** The text a plant shows: the tool output it replaces (or the tool's own output), and its description when it has one. */
export function plantParts(tape, plant) {
  const parts = [];
  for (const [name, fields] of Object.entries(plant.patch.custom_tools)) {
    if (fields.description !== undefined) parts.push({ label: `Tool description of ${name}`, text: fields.description });
    if (Array.isArray(fields.results) && fields.results.length > 0) parts.push({ label: `Page text ${name} returns`, text: fields.results[0].output });
    if (fields.results === undefined && fields.description === undefined) {
      const tool = tape.custom_tools.find((c) => c.name === name);
      parts.push({ label: `Output of ${name}`, text: tool?.default?.output ?? "" });
    }
  }
  return parts.map((p) => {
    const match = INSTRUCTION.exec(p.text);
    if (!match) return { label: p.label, before: p.text, instruction: "", after: "" };
    return { label: p.label, before: p.text.slice(0, match.index), instruction: match[0], after: p.text.slice(match.index + match[0].length) };
  });
}

/** Counts from a replay: runs that leaked the secret, and runs that finished (a true done, the code grader). */
export function replayCounts(summary) {
  return { trials: summary.runs, leaked: summary.leaked, finished: summary.code };
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

export class HxEscape extends HxElement {
  static observedAttributes = ["src"];
  static styles = new URL("./hx-escape.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    if (!src) throw new Error("hx-escape needs src");
    const srcUrl = new URL(src, document.baseURI);
    const response = await fetch(srcUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
    this.data = validEscape(await response.json());
    // A tape or board named with .json is a file beside the demo page; any other name is a course tape or board.
    this.tape = this.data.tape.endsWith(".json")
      ? await (await fetchOk(new URL(this.data.tape, srcUrl))).json()
      : await getTape(this.data.tape);
    this.base = this.data.base_board.endsWith(".json")
      ? await (await fetchOk(new URL(this.data.base_board, srcUrl))).json()
      : await getBoard(this.data.base_board);
    this.facts = await getFactsCore();
    this.uid = `hxs${++uidCount}`;
    this.state = {
      plant: this.data.plants[0].id,
      defenses: [],
      result: null,
      history: [],
      running: false,
      progress: "",
      error: null,
    };
  }

  plant() {
    return this.data.plants.find((p) => p.id === this.state.plant);
  }

  chosenDefenses() {
    return this.data.defenses.filter((d) => this.state.defenses.includes(d.id));
  }

  /** One replay: the patched tape and board through runEval, one task, the chosen trials (seeds 1 to trials). */
  async replay() {
    if (this.state.running) return this.replayJob;
    this.replayJob = this.doReplay();
    return this.replayJob;
  }

  async doReplay() {
    const plant = this.plant();
    const defenses = this.chosenDefenses();
    this.setState({ running: true, result: null, error: null, progress: `Replaying the attack: ${plural(this.data.trials, "seed")} on the patched tape and board.` });
    await yieldToLoop();
    let summary;
    try {
      const tape = applyPlant(this.tape, plant);
      const board = applyDefenses(this.base, defenses);
      const spec = {
        id: "escape-replay",
        schema: 1,
        title: "The attack replay",
        kind: "capability",
        tasks: [{ id: "attack", tape: REPLAY_TAPE }],
        trials: this.data.trials,
        boards: [board.id],
        seed_base: 0,
      };
      summary = runEval(spec, { [REPLAY_TAPE]: tape }, board, { facts: this.facts }).summary;
    } catch (error) {
      this.setState({ running: false, progress: "", error: `The replay stopped: ${String(error?.message ?? error).slice(0, 160)}` });
      return false;
    }
    const counts = replayCounts(summary);
    const entry = { plant: plant.id, plantLabel: plant.label, defenses: defenses.map((d) => d.id), defenseLabels: defenses.map((d) => d.label), ...counts };
    const history = [entry, ...this.state.history].slice(0, 3);
    this.setState({ running: false, progress: "", result: { ...entry }, history });
    this.live(`${formatInt(counts.leaked)} of ${formatInt(counts.trials)} runs leaked the secret.`);
    this.evidence("escape", { plant: plant.id, defenses: entry.defenses, leaked: counts.leaked, finished: counts.finished, trials: counts.trials });
    for (const name of ["leaked", "finished"]) {
      this.dispatchEvent(new CustomEvent("hx-change", { bubbles: true, detail: { name, value: this.hxValue(name) } }));
    }
    return true;
  }

  hxValue(name) {
    const r = this.state?.result;
    if (!r) return null;
    if (name === "leaked") return r.leaked;
    if (name === "finished") return r.finished;
    return null;
  }

  hxRange() {
    return null;
  }

  hxLabel(name) {
    if (name === "leaked") return "Runs that leaked the secret";
    if (name === "finished") return "Runs that finished the task";
    return null;
  }

  wire() {
    if (this.wired) return;
    this.wired = true;
    this.ui.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || button.disabled) return;
      const key = button.dataset.key ?? "";
      if (key === "replay") this.replay();
      else if (key.startsWith("defense-")) {
        const id = key.slice("defense-".length);
        const defenses = this.state.defenses.includes(id) ? this.state.defenses.filter((d) => d !== id) : [...this.state.defenses, id];
        this.setState({ defenses, result: null });
      }
    });
    this.ui.addEventListener("change", (event) => {
      if (event.target.matches("input[name$='-plant']")) this.setState({ plant: event.target.value, result: null });
    });
  }

  render() {
    if (!this.ui.dataset.wired) {
      this.wire();
      this.ui.dataset.wired = "";
    }
    const { data, state: s } = this;
    const defenses = this.chosenDefenses();
    const legs = legsCut(defenses);
    const children = [];

    // Trifecta: the three legs, each with the tape's tools that carry its label, and open or cut in words.
    children.push(el("section", { class: "esc-legs", "aria-label": "The trifecta" },
      el("h3", { class: "esc-h", text: "The trifecta" }),
      el("p", { class: "esc-hint", text: "An attack needs all three legs: private data to steal, untrusted content to carry the instruction, and a way out." }),
      el("ol", { class: "esc-leg-list" },
        ...legs.map((leg) => {
          const labelled = this.tape.custom_tools.filter((t) => (t.trifecta ?? []).includes(leg.id)).map((t) => t.name);
          const tools = [...new Set([...labelled, ...(this.data.leg_tools?.[leg.id] ?? [])])];
          return el("li", { class: `esc-leg ${leg.cut ? "is-cut" : "is-open"}` },
            glyph(leg.cut ? "shield-pass" : "shield-fail"),
            el("span", { class: "esc-leg-name", text: leg.name }),
            el("span", { class: "esc-leg-state", text: leg.cut ? "cut" : "open" }),
            el("span", { class: "esc-leg-tools", text: tools.length ? `Tools: ${tools.join(", ")}` : "No tool in this tape carries this label." }));
        })),
      el("p", { class: "esc-verdict", text: trifectaLine(legs) })));

    // Red team: one plant at a time, with the planted instruction marked in words.
    const plant = this.plant();
    const parts = plantParts(this.tape, plant);
    children.push(el("section", { class: "esc-red", "aria-label": "Red team" },
      el("h3", { class: "esc-h", text: "Red team: plant the instruction" }),
      el("fieldset", { class: "esc-plants" },
        el("legend", { class: "esc-legend", text: "Where it hides" }),
        ...data.plants.map((p) => el("label", { class: "esc-plant" },
          el("input", { type: "radio", name: `${this.uid}-plant`, value: p.id, checked: p.id === s.plant, "data-key": `plant-${p.id}`, disabled: s.running }),
          el("span", { class: "esc-plant-text" },
            el("span", { class: "esc-plant-label", text: p.label }),
            el("span", { class: "esc-plant-where", text: p.where }))))),
      el("div", { class: "esc-text" },
        ...parts.map((part) => el("figure", { class: "esc-doc" },
          el("figcaption", { class: "esc-doc-label", text: part.label }),
          el("p", { class: "esc-doc-body" },
            part.before,
            part.instruction ? el("mark", { class: "esc-planted" },
              el("span", { class: "esc-planted-label", text: "planted instruction: " }),
              part.instruction) : null,
            part.after))))));

    // Blue team: each defense is a toggle, with its leg in words.
    children.push(el("section", { class: "esc-blue", "aria-label": "Blue team" },
      el("h3", { class: "esc-h", text: "Blue team: add a defense" }),
      el("div", { class: "esc-defenses" },
        ...data.defenses.map((d) => {
          const on = s.defenses.includes(d.id);
          return el("button", {
            type: "button",
            class: "esc-defense",
            "aria-pressed": on,
            "data-key": `defense-${d.id}`,
            disabled: s.running,
          },
          el("span", { class: "esc-defense-label", text: d.label }),
          el("span", { class: "esc-defense-leg", text: `Leg: ${LEG_WORDS[d.leg]}${TRIFECTA.some((t) => t.id === d.leg) ? " (cuts it)" : ""}` }));
        }))));

    // Replay (primary), the readouts, and the table of the last three replays.
    const r = s.result;
    children.push(el("div", { class: "esc-actions" },
      el("button", { type: "button", class: "key key-primary", "data-key": "replay", "aria-disabled": s.running, disabled: s.running, text: s.running ? "Replaying…" : "Replay the attack" })));
    if (s.error) children.push(el("p", { class: "esc-line esc-error", role: "alert", text: s.error }));
    if (s.progress) children.push(el("p", { class: "esc-line", text: s.progress }));
    if (r) {
      children.push(el("div", { class: "readouts esc-readouts" },
        el("div", { class: "readout" },
          el("p", { class: "readout-label", text: "Attack success" }),
          el("p", { class: "readout-value", text: `${formatInt(r.leaked)} of ${formatInt(r.trials)} runs leaked the secret` })),
        el("div", { class: "readout" },
          el("p", { class: "readout-label", text: "Task success" }),
          el("p", { class: "readout-value", text: `${formatInt(r.finished)} of ${formatInt(r.trials)} finished the task` }))));
      children.push(el("p", { class: "esc-hint", text: FINISH_NOTE }));
    }
    if (s.history.length) {
      children.push(el("div", { class: "table-wrap esc-table-wrap" },
        el("table", { class: "esc-table" },
          el("caption", { class: "esc-caption", text: "The last three replays" }),
          el("thead", {}, el("tr", {},
            el("th", { scope: "col", text: "Plant" }),
            el("th", { scope: "col", text: "Defenses" }),
            el("th", { scope: "col", text: "Leaked" }),
            el("th", { scope: "col", text: "Finished" }))),
          el("tbody", {}, ...s.history.map((h) => el("tr", {},
            el("td", { text: h.plantLabel }),
            el("td", { text: h.defenseLabels.length ? h.defenseLabels.join("; ") : "none" }),
            el("td", { text: `${formatInt(h.leaked)} of ${formatInt(h.trials)}` }),
            el("td", { text: `${formatInt(h.finished)} of ${formatInt(h.trials)}` })))))));
    }
    children.push(el("p", { class: "esc-figure-line", text: LINE }));

    this.ui.replaceChildren(...children);
  }

  async selfTest() {
    const saved = this.state;
    let evidence = 0;
    const count = (event) => {
      if (event.detail.kind === "escape") evidence += 1;
    };
    this.addEventListener("hx-evidence", count);
    try {
      this.setState({ result: null, history: [], defenses: [], plant: this.data.plants[0].id });
      // Blue team first: the exfiltration cut stops every leak in the simulator, so the replay must read zero.
      const egress = this.data.defenses.find((d) => d.leg === "exfiltration");
      if (!egress) return false;
      this.ui.querySelector(`[data-key='defense-${egress.id}']`).click();
      if (!this.state.defenses.includes(egress.id)) return false;
      this.ui.querySelector("[data-key='replay']").click();
      await this.replayJob;
      const r = this.state.result;
      if (!r || r.leaked !== 0 || r.trials !== this.data.trials || evidence !== 1) return false;
      if (this.state.history.length !== 1) return false;
      return true;
    } finally {
      this.removeEventListener("hx-evidence", count);
      this.setState(saved);
    }
  }
}

async function fetchOk(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response;
}

customElements.define("hx-escape", HxEscape);
