// hx-incident: the Incident Room (BP-1.4 §4, DESIGN §7.4). The learner taps the first event where things
// went wrong, names the failure, and picks the fix. Everything is derived from the run (replayed from the
// tape's incident block) and the state. A wrong tap never hides or resets the hunt: its answer appears under
// the tapped row, and the transcript keeps its scroll position.
import { HxElement } from "./lib/hx-element.js";
import { getTape, getBoard, getFactsCore, getCourseCore } from "./lib/data.js";
import { runTrial, createPrng } from "../sim/index.js";
import { el, glyph, WIRES, repeats, transcriptList, laneStrip, ensureSprite } from "./lib/transcript.js";
import { formatMs, plural } from "./lib/format.js";
import { validHunt } from "./lib/restore.js";
import { incidentCredit } from "./lib/credit.js";

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

let uidCount = 0;

export class HxIncident extends HxElement {
  static observedAttributes = ["tape", "locked"];
  static styles = new URL("./hx-incident.css", import.meta.url).href;
  // A radio group is named per instance, so two incidents on one page never share a group (item 1).
  uid = `hxi${++uidCount}`;

  async setup() {
    const tapeId = this.getAttribute("tape");
    if (!tapeId) throw new Error("hx-incident needs a tape attribute");
    await ensureSprite();
    const tape = await getTape(tapeId);
    if (!tape.incident) throw new Error(`${tapeId} has no incident block`);
    const inc = tape.incident;
    const board = await getBoard(inc.board);
    const facts = await getFactsCore();
    const course = await getCourseCore();
    const { events } = runTrial(tape, board, inc.seed, { facts });
    const family = course.failure_families.find((f) => f.id === inc.family);
    if (!family) throw new Error(`unknown failure family ${inc.family}`);
    this.model = {
      tape, tapeId, inc, events,
      repeatMap: repeats(events),
      familyChoices: familyOptions(tapeId, inc.family, course.failure_families),
      noteAt: new Map(inc.notes.map((n) => [n.seq, n.text])),
    };
    this.resetHunt();
    // B2 round 2: a finished hunt is restored from the store with no evidence (it was credited once already).
    const saved = validHunt(this.store?.state?.hunts?.[tapeId], inc,
      course.failure_families.map((f) => f.id), WIRES.map((w) => w.id), inc.fixes.length);
    if (saved) this.restoreFinished(saved);
    this.clockStart = this.hasAttribute("locked") ? null : performance.now();
  }

  /** The hunt as it finished: found, the family and wire named, the fix chosen, the result line. */
  restoreFinished(saved) {
    this.state = {
      ...this.state,
      started: true,
      found: saved.found,
      foundAt: null,
      marks: new Map([[saved.found, { kind: "found", word: "found" }]]),
      familyPick: saved.familyPick,
      wirePick: saved.wirePick,
      named: true,
      fixPick: saved.fixPick,
      fixed: true,
      dispatched: true,
      wrongTaps: saved.wrongTaps,
      seconds: saved.seconds,
    };
  }

  /** "none" before the hunt starts, "started" while it runs, "finished" once the fix is committed (COMPONENTS §10). */
  huntStage() {
    if (!this.state || !this.state.started) return "none";
    return this.state.fixed ? "finished" : "started";
  }

  resetHunt() {
    this.state = {
      wrongTaps: 0, wrongRows: new Set(), marks: new Map(), feedback: new Map(), found: null, foundAt: null,
      familyPick: null, wirePick: null, named: false, fixPick: null, fixed: false, dispatched: false, focusRow: null,
      started: false, seconds: null,
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
    // COMPONENTS §10: the hunt starts on the first allowed tap; the check that waits on it may reveal now.
    if (!s.started) {
      this.state = { ...s, started: true };
      this.dispatchEvent(new CustomEvent("hx-result", { bubbles: true, detail: { source: "incident", stage: "start" } }));
    }
    const { inc, noteAt } = this.model;
    const marks = new Map(s.marks);
    const feedback = new Map(s.feedback);
    if (index === inc.first_bad_seq || inc.accept_seqs.includes(index)) {
      marks.set(index, { kind: "found", word: "found" });
      this.setState({ found: index, foundAt: performance.now(), marks });
      this.live(inc.why);
      this.focusFound();
      return;
    }
    const wrongRows = new Set(s.wrongRows);
    let wrongTaps = s.wrongTaps;
    if (!wrongRows.has(index)) {
      wrongRows.add(index);
      wrongTaps += 1;
    }
    const lines = [];
    if (noteAt.has(index)) {
      lines.push(noteAt.get(index));
      marks.set(index, { kind: "note", word: "note" });
    } else if (index < inc.first_bad_seq) {
      lines.push("Too early: that step was reasonable.");
      marks.set(index, { kind: "early", word: "too early" });
    } else {
      lines.push("Too late: things had already gone wrong before this.");
      marks.set(index, { kind: "late", word: "too late" });
    }
    if (wrongTaps >= 2) lines.push(inc.hint);
    feedback.set(index, lines);
    this.setState({ marks, feedback, wrongRows, wrongTaps, focusRow: index });
    this.live(lines.join(" "));
    this.revealRow(index);
  }

  /** Keeps the tapped row and its answer on screen, without moving the transcript to the top. */
  revealRow(index) {
    const li = this.ui?.querySelector(`.transcript-wrap li[data-index="${index}"]`);
    if (!li) return;
    li.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
  }

  /** On found: focus the found block's heading and bring it into view (instant under reduced motion). */
  focusFound() {
    const heading = this.ui?.querySelector(".found-block h4");
    if (!heading) return;
    heading.scrollIntoView({ block: "start", behavior: this.reducedMotion ? "auto" : "smooth" });
    heading.focus({ preventScroll: true });
  }

  // ---------- naming and fixing ----------

  commitName() {
    const s = this.state;
    if (s.familyPick === null || s.wirePick === null) {
      this.live("Pick a family and a wire first.");
      return;
    }
    this.setState({ named: true });
  }

  commitFix() {
    if (this.state.fixPick === null) {
      this.live("Pick a fix first.");
      return;
    }
    this.setState({ fixed: true });
    this.finish();
  }

  finish() {
    if (this.state.dispatched) return;
    const { inc } = this.model;
    const seconds = this.seconds();
    const fixOk = this.state.fixPick === inc.correct_fix;
    this.setState({ dispatched: true, seconds });
    this.saveHunt({
      found: this.state.found, wrong_taps: this.state.wrongTaps, seconds,
      family_pick: this.state.familyPick, wire_pick: this.state.wirePick, fix_pick: this.state.fixPick,
    });
    this.dispatchEvent(new CustomEvent("hx-result", {
      bubbles: true,
      detail: { source: "incident", stage: "end", wrong_taps: this.state.wrongTaps, seconds, fix_ok: fixOk },
    }));
    // D-061: a hunt credits its objectives only when the family, the wire and the fix are all right.
    const declared = (this.dataset.objective ?? "").split(/\s+/).filter(Boolean);
    const picks = { family: this.state.familyPick, wire: this.state.wirePick, fix: this.state.fixPick };
    this.evidence("incident", {
      tape: this.model.tapeId, wrong_taps: this.state.wrongTaps, seconds,
      family_ok: this.state.familyPick === inc.family, wire_ok: this.state.wirePick === inc.wire, fix_ok: fixOk,
    }, incidentCredit(declared, inc, picks));
  }

  seconds() {
    const start = this.clockStart ?? this.state.foundAt;
    return Math.round(((this.state.foundAt ?? start) - start) / 1000);
  }

  /** Writes the finished hunt to the store (the learner's own UI state). Skipped while a self-test runs. */
  saveHunt(record) {
    if (this.testing) return;
    try {
      this.store?.update((doc) => {
        doc.hunts ??= {};
        doc.hunts[this.model.tapeId] = record;
      });
    } catch {
      // The store refused the write; the result still shows for this visit.
    }
  }

  /** Clears the saved hunt and starts again on the same run. The evidence already given stays as it was. */
  huntAgain() {
    if (!this.testing) {
      try {
        this.store?.update((doc) => {
          if (doc.hunts) delete doc.hunts[this.model.tapeId];
        });
      } catch {
        // Nothing to clear if the store refused.
      }
    }
    this.resetHunt();
    this.clockStart = this.hasAttribute("locked") ? null : performance.now();
    this.setState({});
    this.live("Hunt again: tap the first event where things went wrong.");
  }

  // ---------- render (everything derived from the state) ----------

  render() {
    if (!this.model) return;
    const { inc, events, familyChoices } = this.model;
    const s = this.state;
    const locked = this.hasAttribute("locked");
    const keep = this.ui?.querySelector(".transcript-wrap")?.scrollTop ?? 0;
    const list = transcriptList({
      events,
      detail: "full",
      expanded: new Set(),
      repeatMap: this.model.repeatMap,
      pickable: true,
      callouts: false,
      marks: s.marks,
      feedback: s.feedback,
      locked,
      onPick: (i) => this.tap(i),
    });
    const strip = laneStrip({ events, onPick: (i) => this.focusRow(i) });
    const pieces = [el("h3", { class: "incident-title", text: "Tap the first event where things went wrong." })];
    pieces.push(el("p", { class: "hunt-keys", text: "With a keyboard: arrow keys move between events, Enter picks one." }));
    if (locked) pieces.push(el("p", { class: "gate", text: "Make your prediction above to unlock the run." }));
    pieces.push(el("div", { class: "lanes-area" }, strip));
    // The cue sits outside the scroll region, so it stays at the bottom edge while the rows scroll (B-15).
    const more = el("p", { class: "more-cue", "aria-hidden": "true", text: "More below" });
    pieces.push(el("div", { class: "transcript-frame" },
      el("div", { class: "transcript-wrap", tabindex: "0", role: "region", "aria-label": "Run transcript" }, list), more));
    if (s.found !== null) {
      pieces.push(el("div", { class: "found-block" },
        el("h4", { class: "found-heading", tabindex: "-1", text: "Found." }),
        el("p", { class: "why", text: inc.why })));
      pieces.push(this.namingBlock(familyChoices));
    }
    if (s.named) pieces.push(this.fixBlock());
    if (s.fixed) pieces.push(this.resultBlock());

    this.ui.replaceChildren(el("div", { class: "incident" }, ...pieces));
    const wrap = this.ui.querySelector(".transcript-wrap");
    if (wrap) {
      wrap.scrollTop = keep;
      wrap.addEventListener("scroll", () => this.updateCue(), { passive: true });
    }
    this.updateCue();
    if (!this.resizeBound) {
      this.resizeBound = true;
      globalThis.addEventListener("resize", () => this.updateCue());
    }
    this.roveFocus(list);
    this.list = list;
  }

  /** The bottom cue: the fade and the "More below" text show only while rows lie below the visible part; the line is
   *  read once, the first time it applies (B-15). No motion: the cue is shown or hidden, never animated. */
  updateCue() {
    const wrap = this.ui?.querySelector(".transcript-wrap");
    const frame = wrap?.parentElement;
    if (!wrap || !frame?.classList.contains("transcript-frame")) return;
    const more = wrap.scrollTop + wrap.clientHeight < wrap.scrollHeight - 4;
    frame.classList.toggle("has-more", more);
    if (more && !this.cueSaid) {
      this.cueSaid = true;
      this.live("More below");
    }
  }

  namingBlock(familyChoices) {
    const s = this.state;
    const { inc } = this.model;
    const familyRows = familyChoices.map((f) => {
      const chosen = s.familyPick === f.id;
      const right = f.id === inc.family;
      const verdict = s.named && (right || chosen)
        ? el("span", { class: "why verdict-line", text: right ? "Right." : "Not this one." })
        : null;
      const input = el("input", { type: "radio", name: `${this.uid}-family`, value: f.id, "data-key": `family-${f.id}`, checked: chosen || null, disabled: s.named || null });
      input.addEventListener("change", () => this.setState({ familyPick: f.id }));
      return el("label", { class: `choice${s.named && right ? " is-right" : ""}`, "data-key": `family-row-${f.id}` },
        input,
        el("span", { class: "choice-text" }, el("span", { text: f.name }), el("span", { class: "why", text: f.summary }), verdict));
    });
    const wireRows = WIRES.map((w) => {
      const chosen = s.wirePick === w.id;
      const right = w.id === inc.wire;
      let verdict = null;
      if (s.named && right) verdict = el("span", { class: "why verdict-line", text: `Right. The trouble is on the ${w.name} wire.` });
      else if (s.named && chosen) verdict = el("span", { class: "why verdict-line", text: "Not this one." });
      const input = el("input", { type: "radio", name: `${this.uid}-wire`, value: w.id, "data-key": `wire-${w.id}`, checked: chosen || null, disabled: s.named || null });
      input.addEventListener("change", () => this.setState({ wirePick: w.id }));
      return el("label", { class: `choice w-${w.id}${s.named && right ? " is-right" : ""}`, "data-key": `wire-row-${w.id}` },
        input,
        el("span", { class: "choice-text" }, el("span", { class: "wire-name" }, glyph(`g-${w.glyph}`), el("span", { text: w.name })), verdict));
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
      const input = el("input", { type: "radio", name: `${this.uid}-fix`, value: String(i), "data-key": `fix-${i}`, checked: s.fixPick === i || null, disabled: s.fixed || null });
      input.addEventListener("change", () => this.setState({ fixPick: i }));
      const why = s.fixed ? el("span", { class: "why", text: f.why }) : null;
      const mark = s.fixed && right ? el("span", { class: "choice-mark", text: "The one that works" }) : null;
      return el("label", { class: `choice${s.fixed && right ? " is-right" : ""}`, "data-key": `fix-row-${i}` },
        input, el("span", { class: "choice-text" }, mark, el("span", { text: f.text }), why));
    });
    const commit = el("button", { class: "key key-primary", type: "button", "data-key": "commit-fix", disabled: s.fixed || null, text: "Commit fix" });
    commit.addEventListener("click", () => this.commitFix());
    const pickLine = s.fixed ? null : el("p", { class: "pick-line", text: "Pick one. Every option's reason shows after you commit." });
    return el("div", { class: "fixing" },
      pickLine,
      el("fieldset", { class: "choices" }, el("legend", { text: "Which fix?" }), ...rows),
      el("div", { class: "row-commit" }, commit));
  }

  resultBlock() {
    const s = this.state;
    const { inc } = this.model;
    const taps = plural(s.wrongTaps, "wrong tap", "wrong taps");
    const fixOk = s.fixPick === inc.correct_fix;
    const again = el("button", { class: "key", type: "button", "data-key": "hunt-again", text: "Hunt again" });
    again.addEventListener("click", () => this.huntAgain());
    return el("div", { class: "result", role: "status" },
      el("p", { class: "result-time", text: `Found in ${s.seconds ?? this.seconds()} s. A good time is ${formatMs(inc.par_s * 1000)}.` }),
      el("p", { class: "result-taps", text: s.wrongTaps === 0 ? "No wrong taps." : `${taps}.` }),
      el("p", { class: `verdict ${fixOk ? "is-pass" : "is-fail"}`, text: fixOk ? "Your fix is the one that works." : "That fix does not stop it. The one that works is marked." }),
      el("div", { class: "row-commit" }, again));
  }

  // ---------- focus ----------

  focusRow(index) {
    const btn = this.ui?.querySelector(`[data-key="row-${index}"]`);
    if (btn) btn.focus({ preventScroll: true });
    this.revealRow(index);
  }

  roveFocus(list) {
    const picks = list.picks ?? [];
    picks.forEach((b, k) => b.setAttribute("tabindex", k === 0 ? "0" : "-1"));
    const steps = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, PageDown: 10, PageUp: -10 };
    list.addEventListener("keydown", (e) => {
      const cur = picks.indexOf(document.activeElement);
      if (cur < 0) return;
      let next;
      if (e.key === "Home") next = 0;
      else if (e.key === "End") next = picks.length - 1;
      else if (e.key in steps) next = cur + steps[e.key];
      else return;
      e.preventDefault();
      next = Math.min(picks.length - 1, Math.max(0, next));
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

  /** The viewport check the self-test relies on: the element's box lies inside the window (2 px of rounding). */
  inWindow(node) {
    const r = node?.getBoundingClientRect();
    return Boolean(r && r.height > 0 && r.top >= -2 && r.bottom <= globalThis.innerHeight + 2);
  }

  /** The tapped row (its button) is on screen, and so is the top of its answer. */
  rowAndAnswerVisible(li) {
    const row = li?.querySelector(".ev-main");
    const answer = li?.querySelector(".hunt-feedback");
    if (!row || !answer) return false;
    const top = answer.getBoundingClientRect().top;
    return this.inWindow(row) && top >= -2 && top < globalThis.innerHeight;
  }

  async selfTest() {
    this.testing = true;
    try {
      return await this.runSelfTest();
    } finally {
      this.testing = false;
    }
  }

  async runSelfTest() {
    this.resetHunt();
    this.render();
    const { inc, events } = this.model;
    const early = events.findIndex((_, i) => i < inc.first_bad_seq && !this.model.noteAt.has(i));
    // the second wrong tap shows the hint: a later event if there is one, else a second early one (the bad event can be the last)
    const wrong = (i) => i !== inc.first_bad_seq && !inc.accept_seqs.includes(i) && !this.model.noteAt.has(i);
    const late = [...events.keys()].reverse().find((i) => i > inc.first_bad_seq && wrong(i))
      ?? [...events.keys()].find((i) => i < inc.first_bad_seq && i !== early && wrong(i));
    const row = (i) => this.ui.querySelector(`.transcript-wrap li[data-index="${i}"]`);
    const tap = (i) => this.ui.querySelector(`[data-key="row-${i}"]`)?.click();
    let fired = null;
    const onResult = (e) => { fired = e.detail; };
    this.addEventListener("hx-result", onResult);

    tap(early);
    const earlyLine = row(early)?.querySelector(".hunt-line")?.textContent ?? "";
    const earlyOk = earlyLine.startsWith("Too early") && this.rowAndAnswerVisible(row(early));

    tap(late);
    const lateRow = row(late);
    const hintOk = Boolean([...(lateRow?.querySelectorAll(".hunt-line") ?? [])].find((p) => p.textContent === inc.hint));
    const lateOk = hintOk && this.rowAndAnswerVisible(lateRow);

    tap(inc.first_bad_seq);
    const foundHeading = this.ui.querySelector(".found-block h4");
    await this.settleScroll(foundHeading);
    const foundOk = this.state.found === inc.first_bad_seq && document.activeElement === foundHeading && this.inWindow(foundHeading);

    const groupsOk = ["family", "wire"].every((g) => document.querySelectorAll(`input[name="${this.uid}-${g}"]`).length === (g === "family" ? this.model.familyChoices.length : 8));
    this.ui.querySelector(`[data-key="family-${inc.family}"]`)?.click();
    this.ui.querySelector(`[data-key="wire-${inc.wire}"]`)?.click();
    this.ui.querySelector('[data-key="commit-name"]')?.click();
    this.ui.querySelector(`[data-key="fix-${inc.correct_fix}"]`)?.click();
    this.ui.querySelector('[data-key="commit-fix"]')?.click();
    this.removeEventListener("hx-result", onResult);
    const resultOk = Boolean(this.ui.querySelector(".result-time")?.textContent.startsWith("Found in "));
    return Boolean(groupsOk && earlyOk && lateOk && foundOk && resultOk && fired?.source === "incident" && fired.fix_ok === true);
  }

  /** Resolves when the node has reached the top of the window (within 2 px), or after 3 seconds. */
  settleScroll(node) {
    return new Promise((resolve) => {
      const started = performance.now();
      const step = () => {
        const top = node?.getBoundingClientRect().top;
        if ((top !== undefined && Math.abs(top) <= 2) || performance.now() - started > 3000) return resolve();
        requestAnimationFrame(step);
      };
      step();
    });
  }
}

customElements.define("hx-incident", HxIncident);
