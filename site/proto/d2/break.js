// Break: the cold open of B2. The learner predicts, locks in, replays the run, reads the reveal,
// finds the first bad moment, and chooses a fix. Every scrubbable number has a readout and steppers.
import { FIXTURE } from "../shared/fixture.js";
import { WIRES } from "./data.js";
import { el, glyph, makeAnnouncer, clamp, fmtInt, fmtCost, shorten, reduceMotion } from "./common.js";
import { WIRE_BY_ID, friendly, eventIcon, HEADER_KEYS, repeatMap } from "./events.js";

const TRACE = FIXTURE.trace;
const LAST = TRACE.length - 1;
const END = TRACE[LAST];
const MAX_T = END.t;
const MAX_TURN = Math.max(...TRACE.map((e) => e.turn));
const WINDOW = 8000;
const PAR_SECONDS = 60;
const STEP_MS = { 1: 1100, 2: 550, 4: 275 };
const PX_PER_STEP = 16;
const INCIDENT = FIXTURE.incident;
const PRED = INCIDENT.prediction;
const FIRST_BAD = TRACE.findIndex((e) => e.seq === INCIDENT.first_bad_seq);
const OLD_PASSES = FIXTURE.bench.old.filter((t) => t.passed).length;
const BENCH_N = FIXTURE.bench.old.length;
const DECISION = { allow: "Allowed", ask: "Asked", deny: "Denied" };

const WHY = [
  `Tempting: ${OLD_PASSES} of ${BENCH_N} scripted runs on the old board do fix the bug and stop, so it looks like the usual case.`,
  "Tempting: the model does say “Almost done.” But it never says it is done. It keeps going.",
  "Right. The old board has one exit, the model saying it is done. Here it never does, so the run ends only when a person presses stop.",
  "Tempting: the tests fail again and again. A failed tool returns its error as text, and the loop carries on.",
];

const FIX_WHY = [
  "Right. A turn limit and a token budget give the loop an exit that does not depend on the model.",
  "Not this. The model already says it is almost done. Asking it to try harder does not change when the loop stops.",
  "Not this. A bigger model can spiral too. The loop still has no exit.",
  "Not this. A retry starts the same loop again, and it gets stuck in the same place.",
];

// What the readouts need, computed once: the latest prompt size and the latest reply cost (cumulative in the fixture).
const PROMPT_AT = [];
const COST_AT = [];
{
  let prompt = 0;
  let cost = 0;
  TRACE.forEach((e, i) => {
    if (e.kind === "prompt_built") prompt = e.tokens;
    if (e.kind === "model_reply") cost = e.cost;
    PROMPT_AT[i] = prompt;
    COST_AT[i] = cost;
  });
}

const firstIndexOfTurn = (n) => Math.max(0, TRACE.findIndex((e) => e.turn === n));

function nearestIndex(t) {
  let best = 0;
  let gap = Infinity;
  TRACE.forEach((e, i) => {
    const d = Math.abs(e.t - t);
    if (d < gap) {
      gap = d;
      best = i;
    }
  });
  return best;
}

function toolLabel(e) {
  const args = Object.values(e.input || {}).map((v) => JSON.stringify(shorten(String(v), 40))).join(", ");
  return `${e.tool}(${args})`;
}

// The story line of each event in the transcript. Quotes for words, mono cards for tool calls.
function story(e) {
  switch (e.kind) {
    case "run_start":
      return [el("span", { class: "ev-text quote", text: `“${e.task}”` })];
    case "prompt_built":
      return [el("span", { class: "ev-meta", text: `Prompt of ${fmtInt(e.tokens)} tokens, built from ${e.layers.join(", ")}.` })];
    case "model_call":
      return [el("span", { class: "ev-meta", text: `Sent ${fmtInt(e.tokens_in)} input tokens to the model.` })];
    case "model_reply":
      return [
        e.text
          ? el("span", { class: "ev-text quote", text: `“${e.text}”` })
          : el("span", { class: "ev-meta", text: "No words in this reply." }),
        e.tool_use ? el("span", { class: "ev-meta", text: `Asks to use ${e.tool_use.name}.` }) : null,
      ];
    case "permission":
      return [el("span", { class: "ev-meta", text: `${e.tool}: ${DECISION[e.decision] || e.decision}. Rule: “${e.rule}”.` })];
    case "tool_call":
      return [
        el("span", { class: "ev-card" },
          el("span", { class: "label", text: e.ok ? "Tool ran" : "Tool failed" }),
          `${toolLabel(e)}\n→ ${shorten(e.output, 120)}`),
      ];
    case "interrupt":
      return [el("span", { class: "ev-text", text: "A person pressed stop." })];
    case "run_end":
      return [el("span", { class: "ev-text", text: `The run ends: ${e.status} after ${e.turns} turns.` })];
    default:
      return [el("span", { class: "ev-meta", text: e.kind })];
  }
}

// Margin note on desktop, tap-to-open note on phones. Both sit in the row; CSS shows one of them.
function notes(term, text) {
  return [
    el("p", { class: "mnote" }, el("strong", { text: term }), text),
    el("details", { class: "inote" }, el("summary", {}, glyph("info"), term), el("div", { class: "inote-body", text })),
  ];
}

export class BreakElement extends HTMLElement {
  connectedCallback() {
    if (this.built) return;
    this.built = true;
    this.say = makeAnnouncer();
    this.article = this.querySelector(".article") || this;
    this.state = {
      pick: null, locked: false, reachedEnd: false, idx: 0, speed: 1, playing: false,
      filter: null, view: "fields", hunt: "idle", hint: "", huntStart: 0, huntSeconds: 0,
      wrong: new Set(), fix: null,
    };
    this.timer = null;
    this.lastTurnSaid = TRACE[0].turn;
    this.mq = window.matchMedia("(min-width: 700px)");
    this.compact = !this.mq.matches;
    this.mq.addEventListener("change", () => this.relayLanes());
    this.buildPredict();
    this.buildReplay();
    this.buildLive();
    this.buildReveal();
    this.buildFix();
    this.buildCta();
    this.article.append(this.predictRow, this.plate, this.liveRow, this.revealRow, this.fixRow, this.ctaRow);
    this.paint();
    this.__test = { run: () => this.selfTest() };
  }

  disconnectedCallback() {
    if (this.built) this.stop();
  }

  // ---------- prediction gate ----------
  buildPredict() {
    this.inputs = PRED.options.map((text, i) => {
      const input = el("input", { type: "radio", name: "prediction", value: String(i) });
      input.addEventListener("change", () => this.pickPrediction(i));
      const mark = el("span", { class: "choice-mark" });
      const label = el("label", { class: "choice" }, input, el("span", { class: "choice-text" }, el("span", { text })), mark);
      return { input, mark, label };
    });
    this.lockBtn = el("button", { class: "btn btn-primary", type: "button", disabled: true, text: "Lock in" });
    this.lockBtn.addEventListener("click", () => this.lock());
    this.pickNote = el("p", { class: "pick-note", text: "Pick one answer to continue." });
    this.predictRow = el("section", { class: "row", "aria-labelledby": "predict-h" },
      el("h2", { id: "predict-h", text: "Predict first" }),
      el("p", { class: "lede", text: "Make a call before you press anything. The replay stays closed until you lock it in." }),
      el("fieldset", { class: "prediction" },
        el("legend", { class: "prediction-head", text: PRED.question }),
        el("ol", { class: "choices" }, this.inputs.map(({ label }) => el("li", {}, label)))),
      el("div", { class: "lock-row" }, this.lockBtn, this.pickNote),
      notes("Turn", "One turn is one model call and the tool calls it asks for."));
  }

  pickPrediction(i) {
    if (this.state.locked) return;
    this.state.pick = i;
    this.lockBtn.disabled = false;
    this.pickNote.textContent = `Your pick: “${PRED.options[i]}”. Lock it in to open the replay.`;
    this.paint();
  }

  lock() {
    const s = this.state;
    if (s.pick === null || s.locked) return;
    s.locked = true;
    const picked = PRED.options[s.pick];
    this.inputs.forEach(({ input }) => { input.disabled = true; });
    this.lockBtn.disabled = true;
    this.lockBtn.textContent = "Locked in";
    this.pickNote.textContent = `Locked in: “${picked}”. Your pick stays here.`;
    const right = s.pick === PRED.answer;
    this.verdict.className = `verdict ${right ? "is-pass" : "is-fail"}`;
    this.verdict.replaceChildren(
      glyph(right ? "check" : "cross"),
      right ? " Right. You called it." : ` Not quite. The answer is “${PRED.options[PRED.answer]}”.`);
    this.pickTags.forEach((tag, i) => { tag.hidden = i !== s.pick; });
    this.say(`Locked in: ${picked}. The replay is open.`);
    this.paint();
  }

  // ---------- replay figure ----------
  buildReplay() {
    this.lanesHost = this.buildLanes();
    this.buildTranscript();
    this.filterText = el("p", { class: "filter-state", text: "Showing: all eight wires." });
    this.bannerText = el("p", { class: "hint" });
    this.banner = el("div", { class: "hunt-banner", tabindex: "-1", hidden: true },
      el("p", { class: "prediction-head", text: "Find the first bad moment" }), this.bannerText);
    this.transcriptCol = el("div", { class: "transcript-col" }, this.banner, this.filterText, this.list);
    this.transcriptWrap = el("div", { class: "transcript-wrap" }, this.transcriptCol, this.buildDetail());
    this.transport = this.buildTransport();
    this.readouts = this.buildReadouts();
    this.chips = this.buildChips();
    this.gate = el("p", { class: "hint", text: "Lock in a prediction above to open the replay." });
    this.plateState = el("p", { class: "plate-state" });
    this.replayBody = el("div", { class: "replay-body" },
      this.lanesHost, this.transport, this.readouts, this.chips, this.transcriptWrap);
    this.plate = el("figure", { class: "plate replay", "aria-labelledby": "fig1" },
      el("div", { class: "plate-head" }, el("span", { class: "fig-label", id: "fig1", text: "FIG 1 · The run, replayed" }), this.plateState),
      this.gate,
      this.replayBody,
      el("figcaption", { text: "Try this: press Step and watch the marks move. Tap a wire name to see only its events, or drag along a lane to scrub." }));
  }

  buildLanes() {
    const compact = this.compact;
    const lanes = el("div", {
      class: `lanes ${compact ? "lanes-compact" : "lanes-full"}`,
      role: "group",
      "aria-label": "Eight lanes, one per wire, in turn order",
    });
    this.laneBtn = {};
    this.playheads = [];
    this.markNodes = new Array(TRACE.length);
    if (!compact) {
      const ticks = [0, 15, 30, 45, 60].map((t) => el("span", { style: `left:${(t / MAX_T) * 100}%`, text: `${t} s` }));
      lanes.append(el("div", { class: "lane-axis", "aria-hidden": "true" }, ticks));
    }
    for (const wire of WIRES) {
      const used = TRACE.some((e) => e.wire === wire.id);
      let label;
      if (compact) {
        label = el("span", { class: `lane-label w-${wire.id}`, title: wire.name }, glyph(wire.glyph));
      } else {
        label = el("button", { class: `lane-label w-${wire.id}`, type: "button", "aria-pressed": "false", title: wire.name }, glyph(wire.glyph), wire.short);
        label.addEventListener("click", () => this.toggleFilter(wire.id));
        this.laneBtn[wire.id] = label;
      }
      const track = el("div", { class: `lane-track${used ? "" : " is-empty"}` });
      const playhead = el("span", { class: "playhead", "aria-hidden": "true" });
      this.playheads.push(playhead);
      track.append(playhead);
      TRACE.forEach((e, i) => {
        if (e.wire !== wire.id) return;
        const icon = eventIcon(e);
        const mark = el("button", {
          class: `mark w-${wire.id}`, type: "button", tabindex: "-1",
          "aria-label": `Event ${e.seq + 1}, ${wire.name}: ${friendly(e)}`,
        }, glyph(icon.names, { fill: Boolean(icon.fill) }));
        mark.style.left = `${(e.t / MAX_T) * 100}%`;
        mark.addEventListener("click", () => this.activate(i));
        this.markNodes[i] = mark;
        track.append(mark);
      });
      lanes.append(el("div", { class: `lane w-${wire.id}` }, label, track));
    }
    this.attachLaneScrub(lanes);
    return lanes;
  }

  // Drag along any lane to scrub: the playhead jumps to the nearest event in time.
  attachLaneScrub(lanes) {
    let dragging = false;
    const indexAt = (ev) => {
      const box = lanes.querySelector(".lane-track").getBoundingClientRect();
      return nearestIndex(clamp((ev.clientX - box.left) / box.width, 0, 1) * MAX_T);
    };
    lanes.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0 || ev.target.closest(".mark, .lane-label, .lane-axis")) return;
      dragging = true;
      lanes.setPointerCapture(ev.pointerId);
      this.stop();
      this.setIndex(indexAt(ev));
    });
    lanes.addEventListener("pointermove", (ev) => { if (dragging) this.setIndex(indexAt(ev)); });
    const release = () => { dragging = false; };
    lanes.addEventListener("pointerup", release);
    lanes.addEventListener("pointercancel", release);
  }

  relayLanes() {
    const compact = !this.mq.matches;
    if (compact === this.compact) return;
    this.compact = compact;
    const fresh = this.buildLanes();
    this.lanesHost.replaceWith(fresh);
    this.lanesHost = fresh;
    this.paint();
  }

  buildTranscript() {
    this.seen = repeatMap(TRACE);
    this.tags = [];
    this.rowNodes = TRACE.map((e, i) => this.buildRow(e, i));
    this.list = el("ol", { class: "transcript", "aria-label": "The run, one event per row" }, this.rowNodes);
    this.list.addEventListener("keydown", (ev) => this.onListKey(ev));
  }

  buildRow(e, i) {
    const wire = WIRE_BY_ID[e.wire];
    const icon = eventIcon(e);
    const tag = el("span", { class: "ev-tag", hidden: true });
    this.tags[i] = tag;
    const seenTurn = this.seen.get(i);
    const line = el("span", { class: "ev-line" },
      el("span", { class: `ev-chip w-${wire.id}` }, glyph(wire.glyph), wire.name),
      el("span", { class: "ev-meta", text: `event ${e.seq + 1} · turn ${e.turn} · ${e.t.toFixed(1)} s` }),
      seenTurn === undefined ? null : el("span", { class: "ev-seen", text: `seen at turn ${seenTurn}` }),
      tag);
    const main = el("button", { class: `ev-main w-${wire.id}`, type: "button", tabindex: "-1" },
      glyph(icon.names, { fill: Boolean(icon.fill) }),
      el("span", { class: "ev-body" }, line, story(e)));
    main.addEventListener("click", () => this.activate(i));
    return el("li", { class: "ev", dataset: { i: String(i) } }, main, el("span", { class: "ev-callout", text: friendly(e) }));
  }

  buildDetail() {
    this.detailLabel = el("p", { class: "ev-meta" });
    this.viewFields = el("button", { type: "button", "aria-pressed": "true", text: "Fields" });
    this.viewFields.addEventListener("click", () => this.setView("fields"));
    this.viewJson = el("button", { type: "button", "aria-pressed": "false", text: "Wire JSON" });
    this.viewJson.addEventListener("click", () => this.setView("json"));
    this.detailBody = el("div");
    return el("section", { class: "detail", "aria-label": "Event details" },
      el("div", { class: "detail-head" },
        this.detailLabel,
        el("div", { class: "seg", role: "group", "aria-label": "Detail view" }, this.viewFields, this.viewJson)),
      this.detailBody);
  }

  buildTransport() {
    this.startBtn = el("button", { class: "btn btn-quiet", type: "button", text: "Start over" });
    this.startBtn.addEventListener("click", () => this.restart());
    this.backBtn = el("button", { class: "btn", type: "button" }, glyph("stepBack"), "Back");
    this.backBtn.addEventListener("click", () => this.moveBy(-1));
    this.stepBtn = el("button", { class: "btn btn-primary", type: "button" }, "Step", glyph("stepFwd"));
    this.stepBtn.addEventListener("click", () => this.moveBy(1));
    this.playBtn = el("button", { class: "btn", type: "button", "aria-pressed": "false" });
    this.playBtn.addEventListener("click", () => this.togglePlay());
    this.range = el("input", { type: "range", min: "0", max: String(LAST), step: "1", value: "0", "aria-label": "Event" });
    this.range.addEventListener("input", () => this.stepTo(Number(this.range.value)));
    this.rangeMinus = el("button", { class: "icon-btn", type: "button", "aria-label": "One event earlier" }, glyph("minus"));
    this.rangeMinus.addEventListener("click", () => this.stepTo(this.state.idx - 1));
    this.rangePlus = el("button", { class: "icon-btn", type: "button", "aria-label": "One event later" }, glyph("plus"));
    this.rangePlus.addEventListener("click", () => this.stepTo(this.state.idx + 1));
    this.rangeText = el("span", { class: "readout-small" });
    this.speedBtns = [1, 2, 4].map((n) => {
      const btn = el("button", { type: "button", "aria-pressed": n === 1 ? "true" : "false", text: `${n}×` });
      btn.addEventListener("click", () => this.setSpeed(n));
      return btn;
    });
    return el("div", { class: "transport is-sticky", role: "group", "aria-label": "Replay controls" },
      el("div", { class: "transport-row" }, this.startBtn, this.backBtn, this.stepBtn, this.playBtn),
      el("div", { class: "range-row" }, this.rangeMinus, this.range, this.rangePlus, this.rangeText),
      el("div", { class: "transport-row" },
        el("span", { class: "ev-meta", text: "Speed" }),
        el("div", { class: "seg", role: "group", "aria-label": "Speed" }, this.speedBtns)));
  }

  buildReadouts() {
    this.roTurn = el("p", { class: "value" });
    this.roCtx = el("p", { class: "value" });
    this.roCtxBar = el("span");
    this.roCost = el("p", { class: "value" });
    const box = (label, ...kids) => el("div", { class: "readout" }, el("p", { class: "label", text: label }), ...kids);
    return el("div", { class: "readouts" },
      box("Turn", this.roTurn),
      box("Context window", this.roCtx, el("div", { class: "bar", "aria-hidden": "true" }, this.roCtxBar)),
      box("Cost so far", this.roCost));
  }

  buildChips() {
    this.chipBtns = {};
    return el("ul", { class: "chips filter-chips", "aria-label": "Show one wire" }, WIRES.map((w) => {
      const btn = el("button", { class: `chip w-${w.id}`, type: "button", "aria-pressed": "false" }, glyph(w.glyph), w.short);
      btn.addEventListener("click", () => this.toggleFilter(w.id));
      this.chipBtns[w.id] = btn;
      return el("li", {}, btn);
    }));
  }

  // ---------- live sentence under the figure ----------
  buildLive() {
    this.scrubEl = el("span", {
      class: "scrub", role: "slider", tabindex: "0", "aria-label": "Turn number",
      "aria-valuemin": "0", "aria-valuemax": String(MAX_TURN),
    });
    this.bindTurnScrub(this.scrubEl);
    this.livePrompt = el("strong");
    this.liveCost = el("strong");
    const minus = el("button", { class: "icon-btn", type: "button", "aria-label": "Earlier turn" }, glyph("minus"));
    minus.addEventListener("click", () => this.setTurn(this.turnNow() - 1));
    const plus = el("button", { class: "icon-btn", type: "button", "aria-label": "Later turn" }, glyph("plus"));
    plus.addEventListener("click", () => this.setTurn(this.turnNow() + 1));
    this.liveRow = el("section", { class: "row live-row", "aria-label": "Live readout" },
      el("p", { class: "live-sentence" },
        "At turn ", this.scrubEl, ", the prompt is ", this.livePrompt, " and the run has cost ", this.liveCost, "."),
      el("div", { class: "stepper" }, el("span", { class: "ev-meta", text: "Turn" }), minus, plus),
      notes("Context window", "A model reads at most 8,000 tokens in one call. The bar on the replay shows how full that window is."));
  }

  bindTurnScrub(node) {
    let drag = null;
    node.addEventListener("pointerdown", (ev) => {
      drag = { x: ev.clientX, v: this.turnNow() };
      node.setPointerCapture(ev.pointerId);
      node.classList.add("is-active");
    });
    node.addEventListener("pointermove", (ev) => {
      if (!drag) return;
      this.setTurn(drag.v + Math.round((ev.clientX - drag.x) / PX_PER_STEP));
    });
    const end = () => {
      drag = null;
      node.classList.remove("is-active");
    };
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
    const keys = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -5, PageUp: 5 };
    node.addEventListener("keydown", (ev) => {
      if (ev.key in keys) {
        ev.preventDefault();
        this.setTurn(this.turnNow() + keys[ev.key]);
      } else if (ev.key === "Home") {
        ev.preventDefault();
        this.setTurn(0);
      } else if (ev.key === "End") {
        ev.preventDefault();
        this.setTurn(MAX_TURN);
      }
    });
  }

  // ---------- reveal ----------
  buildReveal() {
    this.pickTags = [];
    this.outcome = el("p", { class: "outcome", text: `It never stopped on its own: ${END.turns} turns, ${fmtCost(END.cost)}, until a person pressed stop.` });
    this.verdict = el("p", { class: "verdict" });
    this.huntBtn = el("button", { class: "btn btn-primary", type: "button", text: "Find the first bad moment" });
    this.huntBtn.addEventListener("click", () => this.startHunt());
    this.revealRow = el("section", { class: "row reveal", hidden: true, "aria-labelledby": "reveal-h" },
      el("h2", { id: "reveal-h", text: "What the run did" }),
      this.outcome,
      this.verdict,
      el("p", { class: "wry", text: "The model is very sure it's almost done. It isn't." }),
      el("p", { class: "hint", text: "Why each option is tempting:" }),
      el("ol", { class: "options-why" }, PRED.options.map((text, i) => this.optionItem(text, i))),
      el("div", { class: "lock-row" }, this.huntBtn),
      notes("Exit", "An exit is the rule that ends a loop. Here the only exit is the model saying it is done."));
  }

  optionItem(text, i) {
    const right = i === PRED.answer;
    const tag = el("span", { class: "ev-seen", text: "Your pick", hidden: true });
    this.pickTags[i] = tag;
    return el("li", {},
      glyph(right ? "check" : "cross"),
      el("div", {}, el("span", { text }), " ", tag, el("span", { class: "why", text: WHY[i] })));
  }

  // ---------- Find the first bad moment, then the fix ----------
  startHunt() {
    const s = this.state;
    if (s.hunt !== "idle") return;
    s.hunt = "on";
    s.hint = "";
    s.huntStart = performance.now();
    this.say("Find the first bad moment. Tap the event where things went wrong.");
    this.paint();
    this.banner.scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" });
    this.banner.focus({ preventScroll: true });
  }

  guess(i) {
    const s = this.state;
    if (i === FIRST_BAD) {
      s.hunt = "done";
      s.hint = "";
      s.huntSeconds = Math.max(1, Math.round((performance.now() - s.huntStart) / 1000));
      this.say(`Found it: event ${TRACE[i].seq + 1}. Found in ${s.huntSeconds} seconds.`);
      this.paint();
      return;
    }
    s.wrong.add(i);
    s.hint = i > FIRST_BAD ? "Too late: the loop was already repeating." : "Too early: that step was reasonable.";
    this.say(s.hint);
    this.paint();
  }

  buildFix() {
    this.fixInputs = INCIDENT.fixes.map((text, i) => {
      const input = el("input", { type: "radio", name: "fix", value: String(i) });
      input.addEventListener("change", () => this.pickFix(i));
      const why = el("span", { class: "why", text: FIX_WHY[i], hidden: true });
      const mark = el("span", { class: "choice-mark" });
      const label = el("label", { class: "choice" }, input, el("span", { class: "choice-text" }, el("span", { text }), why), mark);
      return { input, why, mark, label };
    });
    this.fixVerdict = el("p", { class: "verdict" });
    this.fixRow = el("section", { class: "row fix-panel", hidden: true, "aria-labelledby": "fix-h" },
      el("h2", { id: "fix-h", text: "Why it spiralled, and the fix" }),
      el("p", { class: "lede", text: INCIDENT.why }),
      el("fieldset", { class: "fix-set" },
        el("legend", { class: "prediction-head", text: "Which change would stop this spiral?" }),
        el("ol", { class: "choices" }, this.fixInputs.map(({ label }) => el("li", {}, label)))),
      this.fixVerdict);
  }

  pickFix(i) {
    this.state.fix = i;
    this.fixInputs.forEach(({ why, mark }, k) => {
      why.hidden = false;
      mark.textContent = k === i ? "Your pick" : "";
    });
    const right = i === INCIDENT.correct_fix;
    this.fixVerdict.className = `verdict ${right ? "is-pass" : "is-fail"}`;
    this.fixVerdict.replaceChildren(
      glyph(right ? "check" : "cross"),
      right ? " Right. Next, measure it on Prove." : " Not this one. Try another, or measure the one you think works on Prove.");
    this.say(right ? "Right fix." : "Not this fix.");
  }

  buildCta() {
    this.ctaRow = el("section", { class: "cta", "aria-label": "Next page" },
      el("p", { text: `Fix it, then measure it on the same ${BENCH_N} seeds.` }),
      el("a", { class: "btn btn-primary", href: "prove.html", text: "Fix it → Prove" }));
  }

  // ---------- state changes ----------
  turnNow() {
    return TRACE[this.state.idx].turn;
  }

  nextMatch(from, dir) {
    const f = this.state.filter;
    for (let i = from + dir; i >= 0 && i <= LAST; i += dir) {
      if (!f || TRACE[i].wire === f) return i;
    }
    return null;
  }

  setIndex(i, { scroll = false } = {}) {
    const s = this.state;
    const before = s.idx;
    s.idx = clamp(i, 0, LAST);
    if (s.idx === LAST) s.reachedEnd = true;
    this.paint();
    if (scroll) this.rowNodes[s.idx].scrollIntoView({ block: "nearest" });
    if (s.idx !== before) this.announceTurn(s.idx);
  }

  announceTurn(i) {
    if (i === LAST) {
      this.say(`The run ends: ${END.status} after ${END.turns} turns.`);
      return;
    }
    const turn = TRACE[i].turn;
    if (turn !== this.lastTurnSaid) {
      this.lastTurnSaid = turn;
      this.say(`Turn ${turn} of ${MAX_TURN}.`);
    }
  }

  activate(i) {
    if (this.state.hunt === "on") {
      this.guess(i);
      return;
    }
    this.stop();
    this.setIndex(i);
  }

  stepTo(i) {
    this.stop();
    this.setIndex(clamp(i, 0, LAST));
  }

  setTurn(n) {
    this.stop();
    this.setIndex(firstIndexOfTurn(clamp(n, 0, MAX_TURN)));
  }

  moveBy(dir) {
    this.stop();
    const j = this.nextMatch(this.state.idx, dir);
    if (j !== null) this.setIndex(j, { scroll: true });
  }

  restart() {
    this.stop();
    this.setIndex(0);
  }

  toggleFilter(id) {
    this.state.filter = this.state.filter === id ? null : id;
    this.say(this.state.filter ? `Showing ${WIRE_BY_ID[id].name} only.` : "Showing all wires.");
    this.paint();
  }

  setView(view) {
    this.state.view = view;
    this.paint();
  }

  setSpeed(n) {
    this.state.speed = n;
    if (this.state.playing) {
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.tick(), STEP_MS[n]);
    }
    this.paint();
  }

  togglePlay() {
    if (this.state.playing) {
      this.stop();
      return;
    }
    if (this.state.idx === LAST) this.setIndex(0);
    this.state.playing = true;
    this.tick();
  }

  tick() {
    const j = this.nextMatch(this.state.idx, 1);
    if (j === null) {
      this.stop();
      return;
    }
    this.setIndex(j, { scroll: true });
    this.timer = window.setTimeout(() => this.tick(), STEP_MS[this.state.speed]);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.state.playing = false;
    if (this.state.idx !== undefined && this.built) this.paint();
  }

  onListKey(ev) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(ev.key) || !this.state.locked) return;
    ev.preventDefault();
    let target;
    if (ev.key === "Home") target = this.nextMatch(-1, 1);
    else if (ev.key === "End") target = this.nextMatch(LAST + 1, -1);
    else target = this.nextMatch(this.state.idx, ev.key === "ArrowDown" ? 1 : -1);
    if (target === null) return;
    this.stop();
    this.setIndex(target);
    this.rowNodes[target].querySelector(".ev-main").focus();
  }

  // ---------- painting: every readout and state follows the current event ----------
  paint() {
    const s = this.state;
    const e = TRACE[s.idx];
    const open = s.locked;
    const tokens = PROMPT_AT[s.idx];
    const cost = COST_AT[s.idx];

    this.replayBody.inert = !open;
    this.liveRow.inert = !open;
    this.gate.hidden = open;
    this.transport.classList.toggle("is-locked", !open);
    this.inputs.forEach(({ mark }, i) => { mark.textContent = i === s.pick ? "Your pick" : ""; });

    this.plateState.replaceChildren(
      "Event ", el("strong", { text: String(e.seq + 1) }), ` of ${TRACE.length} · turn `,
      el("strong", { text: String(e.turn) }), ` of ${MAX_TURN}`);

    // lanes
    const pct = `${(e.t / MAX_T) * 100}%`;
    for (const ph of this.playheads) ph.style.left = pct;
    this.markNodes.forEach((node, i) => {
      if (!node) return;
      node.classList.toggle("is-dim", Boolean(s.filter) && TRACE[i].wire !== s.filter);
      if (i === s.idx) node.setAttribute("aria-current", "step");
      else node.removeAttribute("aria-current");
    });
    for (const [id, btn] of Object.entries(this.laneBtn)) btn.setAttribute("aria-pressed", String(s.filter === id));
    for (const [id, btn] of Object.entries(this.chipBtns)) btn.setAttribute("aria-pressed", String(s.filter === id));
    this.filterText.textContent = s.filter
      ? `Showing: ${WIRE_BY_ID[s.filter].name}. Step and Back move between its events.`
      : "Showing: all eight wires.";

    // transcript
    const hunting = s.hunt === "on";
    this.list.classList.toggle("hunt", hunting);
    this.rowNodes.forEach((li, i) => {
      li.classList.toggle("is-hidden", Boolean(s.filter) && TRACE[i].wire !== s.filter);
      li.classList.toggle("is-current", i === s.idx);
      li.classList.toggle("is-wrong", s.wrong.has(i));
      li.classList.toggle("is-right", s.hunt === "done" && i === FIRST_BAD);
      const main = li.querySelector(".ev-main");
      main.tabIndex = i === s.idx ? 0 : -1;
      if (i === s.idx) main.setAttribute("aria-current", "step");
      else main.removeAttribute("aria-current");
      const tag = this.tags[i];
      const show = s.hunt !== "idle" && (s.wrong.has(i) || (s.hunt === "done" && i === FIRST_BAD));
      tag.hidden = !show;
      if (show) {
        const good = i === FIRST_BAD;
        tag.replaceChildren(glyph(good ? "check" : "cross"), good ? "Found it" : "Not this");
      }
    });

    // readouts
    const pctFull = Math.min(100, (tokens / WINDOW) * 100);
    this.roTurn.textContent = `${e.turn} of ${MAX_TURN}`;
    this.roCtx.textContent = tokens ? `${fmtInt(tokens)} of ${fmtInt(WINDOW)} tokens · ${Math.round(pctFull)}%` : "No prompt yet";
    this.roCtxBar.style.width = `${pctFull}%`;
    this.roCost.textContent = fmtCost(cost);

    // range and transport
    this.range.value = String(s.idx);
    this.range.setAttribute("aria-valuetext", `Event ${e.seq + 1} of ${TRACE.length}`);
    this.rangeText.textContent = `${e.seq + 1} of ${TRACE.length}`;
    this.rangeMinus.disabled = s.idx === 0;
    this.rangePlus.disabled = s.idx === LAST;
    this.playBtn.setAttribute("aria-pressed", String(s.playing));
    this.playBtn.replaceChildren(glyph(s.playing ? "pause" : "play"), s.playing ? "Pause" : "Play");
    this.backBtn.disabled = this.nextMatch(s.idx, -1) === null;
    this.stepBtn.disabled = this.nextMatch(s.idx, 1) === null;
    this.speedBtns.forEach((btn, k) => btn.setAttribute("aria-pressed", String([1, 2, 4][k] === s.speed)));
    this.viewFields.setAttribute("aria-pressed", String(s.view === "fields"));
    this.viewJson.setAttribute("aria-pressed", String(s.view === "json"));
    this.renderDetail(e);

    // live sentence
    this.scrubEl.textContent = String(e.turn);
    this.scrubEl.setAttribute("aria-valuenow", String(e.turn));
    this.scrubEl.setAttribute("aria-valuetext", `Turn ${e.turn} of ${MAX_TURN}`);
    this.livePrompt.textContent = tokens ? `${fmtInt(tokens)} tokens` : "not built yet";
    this.liveCost.textContent = fmtCost(cost);

    // reveal, hunt, fix
    this.revealRow.hidden = !s.reachedEnd;
    this.huntBtn.hidden = s.hunt !== "idle";
    this.banner.hidden = s.hunt === "idle";
    this.bannerText.textContent = s.hunt === "done"
      ? `Found it in ${s.huntSeconds} s. Par is ${PAR_SECONDS} s.`
      : (s.hint || "Tap the event where things went wrong. Nothing is timed while you look.");
    this.fixRow.hidden = s.hunt !== "done";
  }

  renderDetail(e) {
    const s = this.state;
    const wire = WIRE_BY_ID[e.wire];
    this.detailLabel.textContent = `Event ${e.seq + 1} of ${TRACE.length} · ${e.kind} · ${wire.name}`;
    if (s.view === "json") {
      this.detailBody.replaceChildren(el("pre", { text: JSON.stringify(e, null, 2) }));
      return;
    }
    const rows = Object.entries(e)
      .filter(([key]) => !HEADER_KEYS.includes(key))
      .map(([key, value]) => el("tr", {},
        el("th", { scope: "row", text: key }),
        el("td", { text: typeof value === "object" ? JSON.stringify(value) : String(value) })));
    this.detailBody.replaceChildren(el("table", { class: "fields" }, el("tbody", {}, rows)));
  }

  // ---------- test hook: drives the real UI from the prediction to the success state ----------
  async selfTest() {
    try {
      this.inputs[2].input.click();
      this.lockBtn.click();
      if (!this.state.locked) return false;
      let guard = 0;
      while (this.state.idx < LAST && guard++ < 200) this.stepBtn.click();
      if (this.state.idx !== LAST || this.revealRow.hidden) return false;
      if (!this.outcome.textContent.includes("It never stopped on its own")) return false;
      this.huntBtn.click();
      this.list.querySelector(`li[data-i="${FIRST_BAD}"] .ev-main`).click();
      const row = this.list.querySelector(`li[data-i="${FIRST_BAD}"]`);
      return this.state.hunt === "done" && !this.fixRow.hidden && row.classList.contains("is-right");
    } catch (error) {
      console.error(error);
      return false;
    }
  }
}
