// hx-gatekeeper (BP-3.4 §2, C9): allow, ask or deny under pressure. Round 1 is by hand: calls arrive one at a time, and
// the learner decides each. An Ask goes to the simulated human (ENGINE A2, sim/human.js). Round 2 is by rule: the learner
// builds a policy and the same calls replay through the simulator's decidePermission (ENGINE §7.5), using the loaded
// permissions module. The human is a model, a tired reviewer, not a measurement.
//   <hx-gatekeeper src="data/gatekeeper-demo.json" seed="1"></hx-gatekeeper>
// Evidence after each round: "gatekeeper", {round, asks, dangerous_through, work_blocked, risky_unreviewed}. Values:
// asks and dangerous_through (read-only), from the latest finished round.
import { HxElement } from "./lib/hx-element.js";
import { formatInt, plural } from "./lib/format.js";
import { createHuman, createPrng, decidePermission, loadBoard } from "../sim/index.js";

const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const TICK_MS = 250;
const MODEL_LINE = "The course's model of a tired reviewer, not a measurement.";
let uidCount = 0;

/** The shape the component needs. Throws with the first problem. */
export function validGatekeeper(src) {
  if (!Array.isArray(src?.calls) || src.calls.length === 0) throw new Error("hx-gatekeeper: needs calls");
  const ids = new Set();
  for (const c of src.calls) {
    if (typeof c?.id !== "string" || ids.has(c.id)) throw new Error(`hx-gatekeeper: bad or repeated call id ${String(c?.id)}`);
    if (typeof c.tool !== "string" || typeof c.input !== "object" || c.input === null) throw new Error(`hx-gatekeeper: ${c.id} needs a tool and an input object`);
    if (!["safe", "risky", "dangerous"].includes(c.risk)) throw new Error(`hx-gatekeeper: ${c.id} risk must be safe, risky or dangerous`);
    if (typeof c.why !== "string") throw new Error(`hx-gatekeeper: ${c.id} needs a why`);
    ids.add(c.id);
  }
  if (!src.human || typeof src.human.default !== "string") throw new Error("hx-gatekeeper: needs a human with a default answer");
  if (!Array.isArray(src.rules_templates) || src.rules_templates.length === 0) throw new Error("hx-gatekeeper: needs rules_templates");
  for (const t of src.rules_templates) {
    if (typeof t?.id !== "string" || typeof t.label !== "string" || typeof t.tool !== "string" || typeof t.field !== "string" || typeof t.glob !== "string") {
      throw new Error(`hx-gatekeeper: bad rules template ${String(t?.id)}`);
    }
  }
  return src;
}

/** One call in words: the tool, then each input field as field: value. */
export function callWords(call) {
  return Object.entries(call.input).map(([field, value]) => `${field}: ${typeof value === "string" ? value : JSON.stringify(value)}`).join(", ");
}

/**
 * A round's totals from its per-call records: asks; dangerous calls that got through; work blocked, meaning safe or
 * risky calls that were denied (work someone wanted); and risky calls that ran without a look: allowed with no ask,
 * or approved by a human who was already past fatigue.
 */
export function summarize(records) {
  return {
    asks: records.filter((r) => r.decision === "ask").length,
    dangerous_through: records.filter((r) => r.call.risk === "dangerous" && r.final === "allow").length,
    work_blocked: records.filter((r) => r.call.risk !== "dangerous" && r.final === "deny").length,
    risky_unreviewed: records.filter((r) => r.call.risk === "risky" && r.final === "allow" && (r.decision !== "ask" || r.pastFatigue === true)).length,
  };
}

/**
 * Round 2 as the simulator plays it: the policy becomes a board's permissions module, each call goes through
 * decidePermission (ENGINE §7.5), and an ask goes to a fresh human on the seed (ENGINE A2).
 */
export function playRound2(calls, policy, templates, humanData, seed) {
  const permissions = loadBoard(policyBoard(templates, policy)).modules.permissions;
  const human = createHuman(humanData, createPrng(seed));
  return calls.map((call) => {
    const d = decidePermission({ name: call.tool, input: call.input }, permissions);
    let human1 = null;
    let final = d.decision === "allow" ? "allow" : "deny";
    if (d.decision === "ask") {
      human1 = human.ask({ tool: call.tool, input: call.input });
      final = human1 === "approve" ? "allow" : "deny";
    }
    const pastFatigue = human.asks > (humanData.fatigue?.after ?? Infinity);
    return { call, decision: d.decision, rule: d.rule, reason: d.reason, human: human1, final, pastFatigue };
  });
}

/**
 * Round 2 against round 1 on the four counts. When round 2 is no worse on any of them, the line says the rules match or
 * beat the careful hand; otherwise it names each count where round 2 is worse, with both numbers.
 */
export function comparison(round1, round2) {
  const counts = [
    ["asks", "asks"],
    ["dangerous_through", "dangerous calls through"],
    ["work_blocked", "work blocked"],
    ["risky_unreviewed", "risky calls run unreviewed"],
  ];
  const worse = counts.filter(([key]) => round2[key] > round1[key]);
  if (worse.length === 0) {
    return { beats: true, text: "Your rules give your most careful answer on every call, without anyone watching the stream." };
  }
  const parts = worse.map(([key, label]) => `${label} (${formatInt(round2[key])} against ${formatInt(round1[key])})`);
  const list = parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return { beats: false, text: `Round 2 is worse on ${list}.` };
}

/** The rules a policy holds: one per template with a decision and a reason, in the board's module shape. */
export function policyBoard(templates, policy) {
  const rules = templates
    .filter((t) => policy.rules[t.id] && policy.rules[t.id].decision !== "none")
    .map((t) => ({ decision: policy.rules[t.id].decision, tool: t.tool, match: { [t.field]: t.glob }, reason: policy.rules[t.id].reason.trim() }));
  return { id: "gatekeeper-policy", modules: { permissions: { mode: policy.mode, rules } } };
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

const DECISION_WORD = { allow: "Allow", ask: "Ask", deny: "Deny" };

export class HxGatekeeper extends HxElement {
  static observedAttributes = ["src", "seed"];
  static styles = new URL("./hx-gatekeeper.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    if (!src) throw new Error("hx-gatekeeper needs src");
    const response = await fetch(new URL(src, document.baseURI));
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
    this.data = validGatekeeper(await response.json());
    this.uid = `hxg${++uidCount}`;
    this.pace = this.data.pace_ms ?? 4000;
    const seed = Number(this.getAttribute("seed") ?? 1);
    this.seed = Number.isInteger(seed) && seed >= 1 && seed <= 999 ? seed : 1;
    this.left = this.pace;
    this.state = {
      seed: this.seed,
      index: 0,
      records: [],
      pick: null,
      timerOn: true,
      paused: false,
      policy: {
        mode: "ask",
        rules: Object.fromEntries(this.data.rules_templates.map((t) => [t.id, { decision: "none", reason: "" }])),
      },
      round2: null,
      round2Records: null,
    };
    this.startStream();
  }

  disconnectedCallback() {
    clearInterval(this.timerId);
  }

  /** A new stream: a fresh PRNG from the seed and a fresh human (ENGINE A2). */
  startStream() {
    this.prng = createPrng(this.state.seed);
    this.human = createHuman(this.data.human, this.prng);
    this.left = this.pace;
  }

  /** The learner's decision on the current call, or the timer's (ask) when the time runs out. */
  decide(decision, timedOut = false) {
    const s = this.state;
    if (s.records.length >= this.data.calls.length) return;
    const call = this.data.calls[s.index];
    const words = { tool: call.tool, input: call.input };
    let human = null;
    let final = decision === "allow" ? "allow" : "deny";
    if (decision === "ask") {
      human = this.human.ask(words);
      final = human === "approve" ? "allow" : "deny";
    }
    const record = { call, decision, timedOut, human, final, pastFatigue: this.human.asks > (this.data.human.fatigue?.after ?? Infinity) };
    const records = [...s.records, record];
    const index = s.index + 1;
    this.left = this.pace;
    this.setState({ records, index, pick: null });
    if (records.length === this.data.calls.length) {
      const totals = summarize(records);
      this.evidence("gatekeeper", { round: 1, ...totals });
    }
  }

  /** The timer: counts the pace down while on and not paused; at zero the call goes to the human (ask). */
  tick() {
    const s = this.state;
    if (!s.timerOn || s.paused || s.records.length >= this.data.calls.length) return;
    this.left -= TICK_MS;
    if (this.left <= 0) {
      this.decide("ask", true);
      return;
    }
    this.paintTimer();
  }

  paintTimer() {
    if (!this.dom) return;
    const { dom, state: s } = this;
    const done = s.records.length >= this.data.calls.length;
    if (done) return;
    const secs = Math.ceil(this.left / 1000);
    dom.timer.textContent = !s.timerOn
      ? "No timer: the call waits for your answer."
      : s.paused
        ? `Paused with ${plural(secs, "second")} left.`
        : `Next call in ${plural(secs, "second")}.`;
    dom.bar.style.width = `${Math.max(0, Math.min(100, (100 * this.left) / this.pace))}%`;
  }

  setPolicyRule(id, patch) {
    const rules = { ...this.state.policy.rules, [id]: { ...this.state.policy.rules[id], ...patch } };
    this.setState({ policy: { ...this.state.policy, rules }, round2: null, round2Records: null });
  }

  runRound2() {
    const s = this.state;
    const records = playRound2(this.data.calls, s.policy, this.data.rules_templates, this.data.human, this.state.seed);
    const totals = summarize(records);
    this.setState({ round2Records: records, round2: totals });
    this.evidence("gatekeeper", { round: 2, ...totals });
  }

  build() {
    const dom = { rounds: {} };
    this.dom = dom;
    dom.line = el("p", { class: "gk-line", text: MODEL_LINE });
    dom.card = el("p", { class: "gk-call" });
    dom.progress = el("p", { class: "gk-progress" });
    dom.timer = el("p", { class: "gk-timer" });
    dom.bar = el("div", { class: "gk-bar" });
    dom.pause = el("button", { class: "key gk-pause", type: "button", "data-key": "pause" });
    dom.pause.addEventListener("click", () => this.setState({ paused: !this.state.paused }));
    dom.timerSwitch = el("button", { class: "key gk-switch", type: "button", role: "switch", "aria-checked": "true", "data-key": "timer" },
      el("span", { class: "gk-track", "aria-hidden": "true" }),
      el("span", { text: "Timer" }));
    dom.timerSwitch.addEventListener("click", () => this.setState({ timerOn: !this.state.timerOn }));
    dom.choices = Object.entries(DECISION_WORD).map(([key, word]) => {
      const input = el("input", { type: "radio", name: `${this.uid}-decision`, value: key, "data-key": `choose-${key}` });
      input.addEventListener("change", () => this.setState({ pick: key }));
      return { key, input, label: el("label", { class: "gk-choice" }, input, el("span", { text: word })) };
    });
    dom.decide = el("button", { class: "key key-primary", type: "button", "data-key": "decide", text: "Decide" });
    dom.decide.addEventListener("click", () => this.state.pick && this.decide(this.state.pick));
    dom.fatigue = el("p", { class: "gk-fatigue" });
    dom.fatigueBar = el("div", { class: "gk-bar gk-bar-fatigue" });
    dom.seedKey = el("button", { class: "key", type: "button", "data-key": "new-seed", text: "New seed" });
    dom.seedKey.addEventListener("click", () => this.newSeed());
    dom.replay = el("ol", { class: "gk-replay" });
    dom.replaySummary = el("p", { class: "gk-summary" });
    dom.rules = el("ul", { class: "gk-rules" });
    dom.mode = el("select", { class: "gk-select", "data-key": "mode", "aria-label": "When no rule matches" },
      ...Object.entries(DECISION_WORD).map(([key, word]) => el("option", { value: key, text: word })));
    dom.mode.addEventListener("change", () => this.setState({ policy: { ...this.state.policy, mode: dom.mode.value }, round2: null, round2Records: null }));
    dom.run = el("button", { class: "key key-primary", type: "button", "data-key": "run-round2", text: "Run the stream" });
    dom.run.addEventListener("click", () => !dom.run.getAttribute("aria-disabled")?.includes("true") && this.runRound2());
    dom.runNote = el("p", { class: "gk-note" });
    dom.readouts = el("div", { class: "gk-readouts" });
    dom.round2Replay = el("ol", { class: "gk-replay" });
    dom.live = el("p", { class: "gk-summary" });
    dom.compare = el("p", { class: "gk-summary" });

    dom.streamSection = el("section", { class: "gk-part" },
      el("h3", { class: "gk-part-title", text: "Round 1: by hand" }),
      el("figure", { class: "plate instrument gk-plate" },
        el("figcaption", { class: "fig-label", text: "The next call" }),
        dom.progress,
        dom.card,
        dom.timer,
        el("div", { class: "gk-track-wrap", "aria-hidden": "true" }, dom.bar),
        el("div", { class: "gk-timer-controls" }, dom.pause, dom.timerSwitch)),
      dom.line,
      el("fieldset", { class: "gk-decision" },
        el("legend", { class: "gk-legend", text: "Your decision" }),
        el("div", { class: "gk-choices" }, ...dom.choices.map((c) => c.label))),
      el("div", { class: "gk-actions" }, dom.decide),
      el("div", { class: "gk-fatigue-wrap" }, dom.fatigue, el("div", { class: "gk-track-wrap", "aria-hidden": "true" }, dom.fatigueBar)),
      el("div", { class: "gk-actions" }, dom.seedKey),
      el("div", { class: "gk-replay-wrap" }, dom.replaySummary, dom.replay));

    dom.policySection = el("section", { class: "gk-part" },
      el("h3", { class: "gk-part-title", text: "Round 2: by rule" }),
      el("p", { class: "gk-hint", text: "Give a decision and a reason to any rule you want. Rules without a decision are left out." }),
      dom.rules,
      el("label", { class: "gk-field" }, el("span", { class: "gk-field-label", text: "When no rule matches" }), dom.mode),
      el("div", { class: "gk-actions" }, dom.run),
      dom.runNote,
      dom.readouts,
      dom.round2Replay,
      dom.live,
      dom.compare);

    this.ui.append(el("section", { class: "gk" }, dom.streamSection, dom.policySection));
    this.timerId = setInterval(() => this.tick(), TICK_MS);
  }

  newSeed() {
    const seed = this.state.seed >= 999 ? 1 : this.state.seed + 1;
    this.startStream();
    this.setState({ seed, index: 0, records: [], pick: null, timerOn: true, paused: false, round2: null, round2Records: null });
  }

  render() {
    if (!this.dom) this.build();
    const { dom, state: s, data } = this;
    const total = data.calls.length;
    const done = s.records.length >= total;
    const call = data.calls[s.index];
    dom.progress.textContent = done ? `All ${plural(total, "call")} decided.` : `Call ${formatInt(s.index + 1)} of ${formatInt(total)}`;
    dom.card.textContent = call ? `${call.tool}  ${callWords(call)}` : "";
    dom.card.hidden = done;
    dom.timer.hidden = done;
    dom.pause.hidden = !s.timerOn || done;
    dom.pause.textContent = s.paused ? "Resume" : "Pause";
    dom.pause.setAttribute("aria-pressed", String(s.paused));
    dom.timerSwitch.setAttribute("aria-checked", String(s.timerOn));
    dom.timerSwitch.classList.toggle("is-on", s.timerOn);
    dom.bar.hidden = done || !s.timerOn;
    dom.choices.forEach((c) => { c.input.checked = s.pick === c.key; c.input.disabled = done; });
    dom.decide.setAttribute("aria-disabled", String(done || s.pick === null));
    dom.decide.hidden = done;
    this.paintTimer();
    // Fatigue meter: asks so far against the point where the human starts to tire (A2).
    const fatigue = data.human.fatigue;
    const asks = this.human?.asks ?? 0;
    dom.fatigue.hidden = !fatigue;
    if (fatigue) {
      dom.fatigue.textContent = `Asks so far: ${formatInt(asks)} of ${formatInt(fatigue.after)}${asks > fatigue.after ? `. Past ${formatInt(fatigue.after)}, the human may approve without looking.` : "."}`;
      dom.fatigueBar.style.width = `${Math.min(100, (100 * asks) / Math.max(1, fatigue.after))}%`;
      dom.fatigueBar.classList.toggle("is-past", asks > fatigue.after);
    }
    dom.seedKey.textContent = "New seed";
    // Replay of round 1: each call with what happened, and the dangerous ones that got through.
    dom.replay.hidden = !done;
    dom.replaySummary.hidden = !done;
    if (done) {
      const totals = summarize(s.records);
      const expired = s.records.filter((r) => r.timedOut).length;
      dom.replaySummary.textContent = `Round 1: ${plural(totals.asks, "ask")}, ${formatInt(totals.dangerous_through)} dangerous ${totals.dangerous_through === 1 ? "call" : "calls"} got through, ${plural(totals.work_blocked, "work call")} blocked, ${plural(totals.risky_unreviewed, "risky call")} ran without a look.${expired ? ` ${plural(expired, "call")} ran out of time and went to the reviewer.` : ""}`;
      dom.replay.replaceChildren(...s.records.map((r, i) => this.replayRow(r, i)));
    } else {
      dom.replay.replaceChildren();
      dom.replaySummary.textContent = "";
    }
    // Round 2: the rule builder.
    dom.rules.replaceChildren(...data.rules_templates.map((t) => this.ruleRow(t)));
    dom.mode.value = s.policy.mode;
    const missing = data.rules_templates.filter((t) => s.policy.rules[t.id].decision !== "none" && s.policy.rules[t.id].reason.trim() === "");
    dom.runNote.textContent = missing.length ? `A reason is required for ${plural(missing.length, "rule")}.` : "";
    dom.runNote.hidden = missing.length === 0;
    dom.run.setAttribute("aria-disabled", String(!done || missing.length > 0));
    const r2 = s.round2;
    dom.readouts.replaceChildren(
      this.readoutColumn("Round 1", summarize(s.records), done),
      this.readoutColumn("Round 2", r2, r2 !== null));
    dom.round2Replay.replaceChildren(...(s.round2Records ?? []).map((r, i) => this.replayRow(r, i)));
    dom.round2Replay.hidden = s.round2Records === null;
    dom.live.textContent = r2 ? `Round 2: ${plural(r2.asks, "ask")}, ${formatInt(r2.dangerous_through)} dangerous through, ${plural(r2.work_blocked, "work call")} blocked, ${plural(r2.risky_unreviewed, "risky call")} ran without a look.` : "";
    dom.live.hidden = !r2;
    const cmp = r2 && done ? comparison(summarize(s.records), r2) : null;
    dom.compare.textContent = cmp ? cmp.text : "";
    dom.compare.hidden = !cmp;
    if (done) this.live(dom.replaySummary.textContent);
  }

  readoutColumn(title, totals, ready) {
    const value = (n) => (ready ? formatInt(n) : "not yet");
    return el("div", { class: "gk-column" },
      el("p", { class: "gk-column-title", text: title }),
      el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Asks" }), el("p", { class: "readout-value", text: value(totals?.asks ?? 0) })),
      el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Dangerous through" }), el("p", { class: "readout-value", text: value(totals?.dangerous_through ?? 0) })),
      el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Work blocked" }), el("p", { class: "readout-value", text: value(totals?.work_blocked ?? 0) })),
      el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Risky ran unreviewed" }), el("p", { class: "readout-value", text: value(totals?.risky_unreviewed ?? 0) })));
  }

  replayRow(r, i) {
    // Round 1 records a learner's choice; round 2 records the decision the simulator gave, with its reason.
    const words = r.rule !== undefined
      ? `The policy says ${DECISION_WORD[r.decision].toLowerCase()}: ${r.reason}.`
      : r.decision === "ask"
        ? (r.timedOut ? "The time ran out, so the question went to the human." : `You asked; the human said ${r.human}.`)
        : `You chose ${DECISION_WORD[r.decision].toLowerCase()}.`;
    const outcome = r.final === "allow"
      ? (r.decision === "ask" && r.pastFatigue ? "It ran, approved by a tired human." : r.decision === "ask" ? "It ran, approved by the human." : "It ran.")
      : (r.decision === "ask" ? "It was denied by the human." : "It was denied.");
    const through = r.call.risk === "dangerous" && r.final === "allow";
    const blockedWork = r.call.risk !== "dangerous" && r.final === "deny";
    return el("li", { class: `gk-record${through ? " is-through" : ""}` },
      el("p", { class: "gk-record-call", text: `${i + 1}. ${r.call.tool}  ${callWords(r.call)}` }),
      el("p", { class: "gk-record-words", text: words }),
      el("p", { class: "gk-record-outcome", text: outcome }),
      through ? el("p", { class: "gk-record-why" }, glyph("bang"), `Dangerous, and it got through: ${r.call.why}`) : null,
      blockedWork ? el("p", { class: "gk-record-note", text: r.call.risk === "safe" ? "A safe call was blocked." : "A risky call was blocked, so its work did not happen." }) : null);
  }

  ruleRow(t) {
    const rule = this.state.policy.rules[t.id];
    const select = el("select", { class: "gk-select", "data-key": `decision-${t.id}`, "aria-label": `Decision for ${t.label}` },
      el("option", { value: "none", text: "Not in the policy" }),
      ...Object.entries(DECISION_WORD).map(([key, word]) => el("option", { value: key, text: word })));
    select.value = rule.decision;
    select.addEventListener("change", () => this.setPolicyRule(t.id, { decision: select.value }));
    const reason = el("input", { class: "gk-reason", type: "text", "data-key": `reason-${t.id}`, "aria-label": `Reason for ${t.label}`, placeholder: "Why? Required when a decision is set." });
    reason.value = rule.reason;
    reason.addEventListener("input", () => this.setPolicyRule(t.id, { reason: reason.value }));
    return el("li", { class: "gk-rule" },
      el("p", { class: "gk-rule-name", text: t.label }),
      el("p", { class: "gk-rule-match", text: `${t.tool}, ${t.field} matches ${t.glob}` }),
      el("div", { class: "gk-rule-fields" },
        el("label", { class: "gk-field" }, el("span", { class: "gk-field-label", text: "Decision" }), select),
        el("label", { class: "gk-field" }, el("span", { class: "gk-field-label", text: "Reason" }), reason)));
  }

  hxValue(name) {
    const s = this.state;
    const latest = s.round2 ?? (s.records.length >= this.data.calls.length ? summarize(s.records) : null);
    if (!latest) return null;
    if (name === "asks") return latest.asks;
    if (name === "dangerous_through") return latest.dangerous_through;
    return null;
  }

  hxRange() {
    return null;
  }

  async selfTest() {
    const saved = this.state;
    const savedHuman = this.human;
    const savedPrng = this.prng;
    const { dom, data } = this;
    let evidence = 0;
    const count = (event) => {
      if (event.detail.kind === "gatekeeper") evidence += 1;
    };
    this.addEventListener("hx-evidence", count);
    try {
      this.startStream();
      this.setState({ index: 0, records: [], pick: null, timerOn: false, paused: false, round2: null, round2Records: null });
      dom.decide.click();
      if (this.state.records.length !== 0) return false;
      for (let i = 0; i < data.calls.length; i += 1) {
        const choice = dom.choices.find((c) => c.key === (i === 0 ? "ask" : "allow"));
        choice.input.click();
        dom.decide.click();
      }
      if (this.state.records.length !== data.calls.length || evidence !== 1) return false;
      if (this.human.asks < 1) return false;
      const template = data.rules_templates[0];
      this.setPolicyRule(template.id, { decision: "deny" });
      dom.run.click();
      if (this.state.round2 !== null) return false;
      this.setPolicyRule(template.id, { reason: "self-test" });
      dom.run.click();
      if (!this.state.round2 || this.state.round2Records.length !== data.calls.length || evidence !== 2) return false;
      return true;
    } finally {
      this.removeEventListener("hx-evidence", count);
      this.human = savedHuman;
      this.prng = savedPrng;
      this.setState(saved);
    }
  }
}

customElements.define("hx-gatekeeper", HxGatekeeper);
