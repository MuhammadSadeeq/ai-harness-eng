// hx-incident: the Incident Room (BP-1.4 §4, DESIGN §7.4). The learner taps the first event where things
// went wrong, names the failure, and picks the fix. Everything is derived from the run (replayed from the
// tape's incident block) and the state in render(). A wrong tap never hides or resets the hunt.
import { HxElement } from "./lib/hx-element.js";
import { getTape, getBoard, getFacts, getCourse } from "./lib/data.js";
import { runTrial, createPrng } from "../sim/index.js";
import { explain } from "./lib/explain.js";
import { el, glyph, WIRES, repeats, transcriptList, laneStrip, ensureSprite } from "./lib/transcript.js";

/** The three families for the naming step: the right one, then two others, all shuffled by the same PRNG. */
export function familyOptions(tapeId, correctId, families) {
  const prng = createPrng([...tapeId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0));
  const others = families.filter((f) => f.id !== correctId);
  const picked = [];
  for (let k = 0; k < 2 && others.length > 0; k += 1) {
    picked.push(others.splice(prng.below(others.length), 1)[0]);
  }
  const options = [families.find((f) => f.id === correctId), ...picked];
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = prng.below(i + 1);
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}

export class HxIncident extends HxElement {
  static observedAttributes = ["tape", "locked"];
  static styles = new URL("./hx-incident.css", import.meta.url).href;

  async setup() {
    const tapeId = this.getAttribute("tape");
    if (!tapeId) throw new Error("hx-incident needs a tape attribute");
    await ensureSprite();
    const tape = await getTape(tapeId);
    if (!tape.incident) throw new Error(`${tapeId} has no incident block`);
    const inc = tape.incident;
    const board = await getBoard(inc.board);
    const facts = await getFacts();
    const course = await getCourse();
    const { events } = runTrial(tape, board, inc.seed, { facts });
    const family = course.failure_families.find((f) => f.id === inc.family);
    if (!family) throw new Error(`unknown failure family ${inc.family}`);
    this.model = {
      tape, tapeId, inc, events,
      repeatMap: repeats(events),
      family,
      familyChoices: familyOptions(tapeId, inc.family, course.failure_families),
      wires: WIRES,
      targets: new Set([inc.first_bad_seq, ...inc.accept_seqs]),
      noteAt: new Map(inc.notes.map((n) => [n.seq, n.text])),
    };
    this.resetHunt();
    this.clockStart = this.hasAttribute("locked") ? null : performance.now();
  }

  resetHunt() {
    this.state = {
      wrongTaps: 0, wrongRows: new Set(), marks: new Map(), found: null, foundAt: null, message: "",
      note: null, familyPick: null, wirePick: null, named: false, fixPick: null, fixed: false, dispatched: false,
    };
  }

  attributeChanged(name) {
    if (name === "locked" && !this.hasAttribute("locked") && this.clockStart === null) {
      this.clockStart = performance.now();
    }
    if (name === "tape") {
      this.resetHunt();
      this.reload();
      return;
    }
    this.setState({});
  }

  async reload() {
    await this.setup();
    this.render();
  }

  // ---------- the hunt ----------

  tap(index) {
    const s = this.state;
    if (s.found !== null || this.hasAttribute("locked")) return;
    const { inc } = this.model;
    const marks = new Map(s.marks);
    let message;
    let note = s.note;
    if (index === inc.first_bad_seq || inc.accept_seqs.includes(index)) {
      marks.set(index, { kind: "found", word: "found" });
      this.setState({ found: index, foundAt: performance.now(), marks, message: "", note: null });
      this.live(inc.why);
      return;
    }
    if (this.model.noteAt.has(index)) {
      note = this.model.noteAt.get(index);
      message = "";
      marks.set(index, { kind: "note", word: "note" });
    } else if (index < inc.first_bad_seq) {
      message = "Too early: that step was reasonable.";
      marks.set(index, { kind: "early", word: "too early" });
    } else {
      message = "Too late: things had already gone wrong before this.";
      marks.set(index, { kind: "late", word: "too late" });
    }
    const wrongRows = new Set(s.wrongRows);
    let wrongTaps = s.wrongTaps;
    if (!wrongRows.has(index)) {
      wrongRows.add(index);
      wrongTaps += 1;
    }
    this.setState({ marks, message, note, wrongRows, wrongTaps });
    this.live(note ?? message);
  }

  // ---------- naming and fixing ----------

  commitName() {
    const s = this.state;
    if (s.familyPick === null || s.wirePick === null) {
      this.setState({ message: "Pick a family and a wire first." });
      return;
    }
    this.setState({ named: true, message: "" });
  }

  commitFix() {
    const s = this.state;
    if (s.fixPick === null) {
      this.setState({ message: "Pick a fix first." });
      return;
    }
    this.setState({ fixed: true, message: "" });
    this.finish();
  }

  finish() {
    if (this.state.dispatched) return;
    const { inc } = this.model;
    const seconds = Math.round((this.state.foundAt - (this.clockStart ?? this.state.foundAt)) / 1000);
    const wrongTaps = this.state.wrongTaps;
    const fixOk = this.state.fixPick === inc.correct_fix;
    const familyOk = this.state.familyPick === inc.family;
    const wireOk = this.state.wirePick === inc.wire;
    this.setState({ dispatched: true });
    this.dispatchEvent(new CustomEvent("hx-result", {
      bubbles: true,
      detail: { source: "incident", wrong_taps: wrongTaps, seconds, fix_ok: fixOk },
    }));
    this.evidence("incident", { tape: this.model.tapeId, wrong_taps: wrongTaps, seconds, family_ok: familyOk, wire_ok: wireOk, fix_ok: fixOk });
  }

  // ---------- render (everything derived from the state) ----------

  render() {
    if (!this.model) return;
    const { inc, events, family, familyChoices, wires } = this.model;
    const s = this.state;
    const locked = this.hasAttribute("locked");
    const list = transcriptList({
      events,
      detail: "full",
      expanded: new Set(),
      repeatMap: this.model.repeatMap,
      pickable: true,
      callouts: false,
      marks: s.marks,
      locked,
      onPick: (i) => this.tap(i),
    });
    const strip = laneStrip({ events, onPick: (i) => this.focusRow(i) });
    const pieces = [];
    pieces.push(el("h3", { class: "incident-title", text: "Tap the first event where things went wrong." }));
    if (locked) pieces.push(el("p", { class: "gate", text: "Make your prediction above to unlock the run." }));
    pieces.push(el("div", { class: "lanes-area" }, strip));
    pieces.push(el("div", { class: "transcript-wrap", role: "region", "aria-label": "Run transcript" }, list));
    pieces.push(el("p", { class: "hunt-message", text: s.message }));
    if (s.note !== null) pieces.push(el("p", { class: "note-line", text: s.note }));
    if (s.wrongTaps >= 2 && s.found === null) pieces.push(el("p", { class: "hint", text: inc.hint }));

    if (s.found !== null) {
      pieces.push(el("div", { class: "found-block" },
        el("p", { class: "verdict is-pass" }, glyph("g-check"), el("span", { text: "Found." })),
        el("p", { class: "why", text: inc.why })));
    }
    if (s.found !== null) pieces.push(this.namingBlock(familyChoices, wires));
    if (s.named) pieces.push(this.fixBlock());
    if (s.fixed) pieces.push(this.resultBlock());

    this.ui.replaceChildren(el("div", { class: "incident" }, ...pieces));
    this.roveFocus(list);
    this.list = list;
  }

  namingBlock(familyChoices, wires) {
    const s = this.state;
    const { inc } = this.model;
    const familyRows = familyChoices.map((f) => {
      const right = f.id === inc.family;
      const feedback = s.named ? (right ? `Right. ${f.summary}` : `Not this one. ${f.summary}`) : null;
      const input = el("input", { type: "radio", name: "family", value: f.id, "data-key": `family-${f.id}`, checked: s.familyPick === f.id || null, disabled: s.named || null });
      input.addEventListener("change", () => this.setState({ familyPick: f.id }));
      return el("label", { class: `choice${s.named && right ? " is-right" : ""}`, "data-key": `family-row-${f.id}` },
        input,
        el("span", { class: "choice-text" }, el("span", { text: f.name }), feedback ? el("span", { class: "why", text: feedback }) : null));
    });
    const wireRows = wires.map((w) => {
      const right = w.id === inc.wire;
      const feedback = s.named ? (right ? `Right. The trouble is on the ${w.name} wire.` : "Not this one.") : null;
      const input = el("input", { type: "radio", name: "wire", value: w.id, "data-key": `wire-${w.id}`, checked: s.wirePick === w.id || null, disabled: s.named || null });
      input.addEventListener("change", () => this.setState({ wirePick: w.id }));
      return el("label", { class: `choice w-${w.id}`, "data-key": `wire-row-${w.id}` },
        input,
        el("span", { class: "choice-text" }, el("span", { class: "wire-name" }, glyph(w.glyph), el("span", { text: w.name })), feedback ? el("span", { class: "why", text: feedback }) : null));
    });
    const commit = el("button", { class: "key key-primary", type: "button", "data-key": "commit-name", disabled: s.named || null, text: "Commit" });
    commit.addEventListener("click", () => this.commitName());
    return el("div", { class: "naming" },
      el("fieldset", { class: "choices" }, el("legend", { text: "Which failure is it?" }), ...familyRows),
      el("fieldset", { class: "choices wires" }, el("legend", { text: "Which wire?" }), ...wireRows),
      el("div", { class: "row-commit" }, commit));
  }

  fixBlock() {
    const s = this.state;
    const { inc } = this.model;
    const rows = inc.fixes.map((f, i) => {
      const right = i === inc.correct_fix;
      const input = el("input", { type: "radio", name: "fix", value: String(i), "data-key": `fix-${i}`, checked: s.fixPick === i || null, disabled: s.fixed || null });
      input.addEventListener("change", () => this.setState({ fixPick: i }));
      const why = s.fixed ? el("span", { class: "why", text: f.why }) : null;
      const mark = s.fixed && right ? el("span", { class: "choice-mark", text: "The one that works" }) : null;
      return el("label", { class: `choice${s.fixed && right ? " is-right" : ""}`, "data-key": `fix-row-${i}` },
        input, el("span", { class: "choice-text" }, el("span", { text: f.text }), why), mark);
    });
    const commit = el("button", { class: "key key-primary", type: "button", "data-key": "commit-fix", disabled: s.fixed || null, text: "Commit fix" });
    commit.addEventListener("click", () => this.commitFix());
    return el("div", { class: "fixing" },
      el("fieldset", { class: "choices" }, el("legend", { text: "Which fix?" }), ...rows),
      el("div", { class: "row-commit" }, commit));
  }

  resultBlock() {
    const s = this.state;
    const { inc } = this.model;
    const seconds = Math.round((s.foundAt - (this.clockStart ?? s.foundAt)) / 1000);
    const taps = s.wrongTaps === 1 ? "1 wrong tap" : `${s.wrongTaps} wrong taps`;
    const fixOk = s.fixPick === inc.correct_fix;
    return el("div", { class: "result", role: "status" },
      el("p", { class: "result-time", text: `Found in ${seconds} s. Par is ${inc.par_s} s.` }),
      el("p", { class: "result-taps", text: s.wrongTaps === 0 ? "No wrong taps." : `${taps}.` }),
      el("p", { class: `verdict ${fixOk ? "is-pass" : "is-fail"}`, text: fixOk ? "Your fix is the one that works." : "That fix does not stop it. The one that works is marked." }));
  }

  // ---------- focus ----------

  focusRow(index) {
    const btn = this.ui?.querySelector(`[data-key="row-${index}"]`);
    if (btn) btn.focus();
  }

  roveFocus(list) {
    const picks = list.picks ?? [];
    picks.forEach((b, k) => b.setAttribute("tabindex", k === 0 ? "0" : "-1"));
    list.addEventListener("keydown", (e) => {
      const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      if (!(e.key in keys)) return;
      const cur = picks.indexOf(document.activeElement);
      if (cur < 0) return;
      e.preventDefault();
      const next = Math.min(picks.length - 1, Math.max(0, cur + keys[e.key]));
      picks.forEach((b, k) => b.setAttribute("tabindex", k === next ? "0" : "-1"));
      picks[next].focus();
    });
  }

  // ---------- values and self-test ----------

  hxValue(name) {
    if (!this.model) return null;
    if (name === "wrong_taps") return this.state.wrongTaps;
    return null;
  }

  hxSetValue() {}

  hxRange() {
    return null;
  }

  async selfTest() {
    this.resetHunt();
    this.render();
    const { inc, events } = this.model;
    const pickable = events.map((_, i) => i);
    const early = pickable.find((i) => i < inc.first_bad_seq && !this.model.noteAt.has(i));
    const late = [...pickable].reverse().find((i) => i > inc.first_bad_seq && !inc.accept_seqs.includes(i) && !this.model.noteAt.has(i));
    const tap = (i) => this.ui.querySelector(`[data-key="row-${i}"]`)?.click();
    let fired = null;
    const onResult = (e) => { fired = e.detail; };
    this.addEventListener("hx-result", onResult);
    tap(early);
    const earlyOk = this.ui.querySelector(".hunt-message")?.textContent.startsWith("Too early");
    tap(late);
    const hintOk = Boolean(this.ui.querySelector(".hint"));
    tap(inc.first_bad_seq);
    const foundOk = this.state.found === inc.first_bad_seq;
    this.ui.querySelector(`[data-key="family-${inc.family}"]`)?.click();
    this.ui.querySelector(`[data-key="wire-${inc.wire}"]`)?.click();
    this.ui.querySelector('[data-key="commit-name"]')?.click();
    this.ui.querySelector(`[data-key="fix-${inc.correct_fix}"]`)?.click();
    this.ui.querySelector('[data-key="commit-fix"]')?.click();
    this.removeEventListener("hx-result", onResult);
    const resultOk = Boolean(this.ui.querySelector(".result-time")?.textContent.startsWith("Found in "));
    return Boolean(earlyOk && hintOk && foundOk && resultOk && fired?.source === "incident" && fired.fix_ok === true);
  }
}

customElements.define("hx-incident", HxIncident);
