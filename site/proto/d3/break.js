// Break: the incident view (BP-0.7-common, screen 2). Custom element <hx-proto-break>.
import {
  DATA,
  EVENTS,
  LAST_INDEX,
  META,
  T_MAX,
  WIRES,
  WIRE,
  contextPct,
  costAt,
  esc,
  eventGlyph,
  fmt,
  fmtSeconds,
  friendly,
  glyph,
  initChrome,
  announce,
  PAR_SECONDS,
  reducedMotion,
  stepIndex,
  summary,
  visibleIndices,
  wireGlyph,
  writeStore,
} from "./app.js";

const INC = DATA.incident;
const FIRST_BAD = INC.first_bad_seq;
const TURNS = EVENTS[LAST_INDEX].turns;
const PREDICTION = INC.prediction;
const TEMPTING = [
  "The first edit is the right one, so the early turns look like progress.",
  "The model keeps writing “Almost done”, which sounds like it is wrapping up.",
  "Nothing in the loop ends it: the only exit is the model saying it is done, and it never does.",
  "The test output shows failures, but the harness hands them back to the model as results. Nothing crashes.",
];
const FIX_WHY = [
  "Right: the loop gets exits that do not depend on the model.",
  "Tempting, but the model is already trying. The loop still has no exit.",
  "Costs more, and the loop still has no exit.",
  "Repeats the same spiral with a new seed. The loop is unchanged.",
];
const SPEEDS = [1, 2, 4];

const pct = (t) => (t / T_MAX) * 100;

function markerLabel(ev) {
  return `Event ${ev.seq}, turn ${ev.turn}, ${WIRE[ev.wire].short}: ${summary(ev)}`;
}

function nearestIndexToTime(t) {
  let best = 0;
  let gap = Infinity;
  EVENTS.forEach((ev, i) => {
    const d = Math.abs(ev.t - t);
    if (d < gap) {
      gap = d;
      best = i;
    }
  });
  return best;
}

class HxProtoBreak extends HTMLElement {
  constructor() {
    super();
    this.__test = { run: () => this.selfTest() };
    this.s = {
      idx: 0,
      speed: 1,
      playing: false,
      timer: null,
      filter: null,
      pick: null,
      locked: false,
      lockedAt: 0,
      found: false,
      foundAt: 0,
      durationSeconds: 0,
      wrongTaps: 0,
      hint: "",
      hintTone: "",
      fixPick: null,
      fixed: false,
      fixHint: "",
      detail: "friendly",
      announcedTurn: 0,
      ended: false,
      endAnnounced: false,
    };
  }

  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "1";
    this.buildShell();
    this.bind();
    this.update();
  }

  disconnectedCallback() {
    this.stop();
  }

  // --- structure ---------------------------------------------------------------------

  buildShell() {
    const lanes = WIRES.map((w) => {
      const marks = EVENTS.flatMap((ev, i) => {
        if (ev.wire !== w.id) return [];
        const left = pct(ev.t).toFixed(3);
        const loopClass = w.id === "loop" ? " is-loop" : "";
        const repeat = META[i].repeatOfTurn ? " is-repeat" : "";
        return [
          `<button type="button" class="mark${loopClass}${repeat}" tabindex="-1" data-seq="${ev.seq}" data-index="${i}" style="left:${left}%;--w:${w.color}" aria-label="${esc(markerLabel(ev))}">${eventGlyph(ev, 16)}</button>`,
        ];
      });
      const empty = marks.length === 0 ? `<span class="lane-empty">no events in this run</span>` : "";
      return `<div class="lane" data-wire="${w.id}" style="--w:${w.color}">
        <button type="button" class="lane-label" data-filter="${w.id}" aria-pressed="false">${wireGlyph(w.id, 18)}<span>${esc(w.short)}</span></button>
        <div class="lane-track">${marks.join("")}${empty}</div>
      </div>`;
    }).join("");

    const strip = WIRES.map((w) => {
      const ticks = EVENTS.flatMap((ev, i) =>
        ev.wire === w.id
          ? [`<span class="tick" data-index="${i}" style="left:${pct(ev.t).toFixed(3)}%;--w:${w.color}"></span>`]
          : [],
      ).join("");
      const empty = ticks === "" ? " is-empty" : "";
      return `<div class="strip-lane${empty}" style="--w:${w.color}" data-wire="${w.id}" title="${esc(w.name)}">${ticks}</div>`;
    }).join("");

    const logRows = EVENTS.map((ev, i) => {
      const w = WIRE[ev.wire];
      const repeat = META[i].repeatOfTurn
        ? `<span class="repeat-tag">seen at turn ${META[i].repeatOfTurn}</span>`
        : "";
      return `<li><button type="button" class="log-row" data-index="${i}" data-seq="${ev.seq}" data-wire="${ev.wire}" style="--w:${w.color}" aria-current="false">
        <span class="idx">${String(ev.seq).padStart(2, "0")}</span>
        ${eventGlyph(ev, 18)}
        <span class="text">
          <span class="meta"><span class="wire">${esc(w.short)}</span><span>turn ${ev.turn}</span><span>t ${ev.t.toFixed(1)}\u00a0s</span>${repeat}</span>
          <span>${esc(summary(ev))}</span>
          <span class="friendly">${esc(friendly(ev))}</span>
        </span>
      </button></li>`;
    }).join("");

    const optionCards = PREDICTION.options
      .map(
        (text, i) => `<li><label class="option" data-option="${i}">
          <input type="radio" name="prediction" value="${i}" />
          <span>${esc(text)}</span>
        </label></li>`,
      )
      .join("");

    const fixCards = INC.fixes
      .map(
        (text, i) => `<li><label class="option" data-fix="${i}">
          <input type="radio" name="fix" value="${i}" />
          <span>${esc(text)}<span class="why">${esc(FIX_WHY[i])}</span></span>
        </label></li>`,
      )
      .join("");

    const reasons = PREDICTION.options
      .map(
        (text, i) => `<li><span class="option-text">${esc(text)}</span><span class="tempt">${esc(TEMPTING[i])}</span></li>`,
      )
      .join("");

    this.innerHTML = `
<section class="panel incident-head" data-head aria-labelledby="incident-title">
  <div class="incident">
    <div class="incident-top">
      <p class="kicker">Incident · loop wire · run b2-spiral</p>
      <span class="status warn fade-status" data-status>${glyph("bang", { size: 16 })}<span data-status-text>Open</span></span>
    </div>
    <h1 id="incident-title">The “almost done” spiral</h1>
    <p class="voice">Page acknowledged. Let’s look at the trace.</p>
    <p class="setup">The agent’s job: fix the failing test in calc.py. Its loop stops only when the model says it is done. Predict how this run ends, then open the trace.</p>
    <p class="timer" data-timer hidden></p>
  </div>
</section>

<section class="panel gate" aria-labelledby="gate-title" data-gate>
  <form data-gate-form>
    <fieldset class="gate">
      <legend id="gate-title">1 · Predict: ${esc(PREDICTION.question)}</legend>
      <ul class="options" data-options>${optionCards}</ul>
      <div class="gate-row">
        <button type="submit" class="btn" data-lock>Lock in</button>
        <span class="locked-note" data-locked-note>Pick one, then lock it in. The trace stays closed until you do.</span>
      </div>
    </fieldset>
  </form>
</section>

<div class="replay-lock" data-replay-lock>Lock in a prediction to open the trace.</div>

<section class="replay" data-replay hidden aria-label="Replay of run b2-spiral">
  <div class="readouts" style="grid-area:readouts">
    <div class="readout">
      <div class="label">Turn</div>
      <div class="big num" data-turn>0</div>
      <div class="sub" data-turn-sub>of 14</div>
    </div>
    <div class="readout">
      <div class="label">Desk usage</div>
      <div class="big num" data-context>0%</div>
      <div class="sub" data-context-sub>0 of 8,000 tokens</div>
      <div class="gauge" aria-hidden="true"><span data-context-bar></span></div>
    </div>
    <div class="readout">
      <div class="label">Run cost so far</div>
      <div class="big num" data-cost>0.000</div>
      <div class="sub">units</div>
    </div>
  </div>

  <div class="lanes" style="grid-area:lanes" data-lanes>
    <div class="callout" data-callout role="group" aria-label="Current event explained">
      <div class="head" data-callout-head></div>
      <p data-callout-text></p>
      <p class="repeat" data-callout-repeat hidden></p>
    </div>
    <div class="lanes-body" data-lanes-body>
      <div class="playhead" data-playhead></div>
      ${lanes}
    </div>
    <div class="axis" aria-hidden="true">${[0, 10, 20, 30, 40, 50, 60].map((s) => `<span style="left:calc(168px + (100% - 168px) * ${(s / T_MAX).toFixed(5)})">${s}\u00a0s</span>`).join("")}</div>
  </div>

  <div class="strip only-phone" style="grid-area:strip" data-strip>
    <div class="strip-head"><span>All 8 wires</span><span data-strip-readout></span></div>
    <div class="strip-lanes" data-strip-lanes role="slider" tabindex="0" aria-label="Replay position" aria-valuemin="0" aria-valuemax="${LAST_INDEX}" aria-valuenow="0" aria-valuetext="Event 1 of ${EVENTS.length}">
      ${strip}
      <div class="strip-cursor" data-strip-cursor></div>
    </div>
  </div>

  <div class="log-wrap" style="grid-area:log">
    <div class="log-head">
      <span>Event log · newest at the bottom of what you have seen</span>
      <span class="filter-note" data-filter-note></span>
    </div>
    <ol class="log" data-log aria-label="Events">${logRows}</ol>
  </div>

  <div class="transport" style="grid-area:transport" data-transport>
    <div class="transport-main">
      <button type="button" class="btn btn-quiet btn-small" data-prev>‹ Back</button>
      <button type="button" class="btn" data-next>Next ›</button>
      <button type="button" class="btn btn-quiet btn-small" data-play aria-pressed="false">Play</button>
    </div>
    <div class="speed" role="group" aria-label="Playback speed">
      <span>Speed</span>
      ${SPEEDS.map((s) => `<button type="button" class="field-btn" data-speed="${s}" aria-pressed="${s === 1}">${s}×</button>`).join("")}
    </div>
    <div class="scrub">
      <button type="button" class="field-btn" data-minus aria-label="Previous event">−</button>
      <input type="range" min="0" max="${LAST_INDEX}" step="1" value="0" data-scrub aria-label="Replay position" />
      <button type="button" class="field-btn" data-plus aria-label="Next event">+</button>
    </div>
    <p class="readout-line" data-readout-line></p>
  </div>

  <div class="detail" style="grid-area:detail" data-detail>
    <div class="detail-head">
      <h2>Event detail</h2>
      <div class="seg" role="group" aria-label="Detail view">
        <button type="button" data-view="friendly" aria-pressed="true">Friendly</button>
        <button type="button" data-view="json" aria-pressed="false">Wire JSON</button>
      </div>
    </div>
    <div data-detail-body></div>
  </div>
</section>

<section class="panel stage" data-reveal hidden aria-labelledby="reveal-title">
  <p class="kicker" id="reveal-title">2 · Reveal</p>
  <p class="reveal-line" data-reveal-line></p>
  <p class="verdict" data-verdict></p>
  <ul class="why-list" aria-label="Why each option is tempting">${reasons}</ul>
</section>

<section class="panel stage" data-find hidden aria-labelledby="find-title">
  <p class="kicker" id="find-title">3 · Find the first bad moment</p>
  <div class="find-banner">
    <p>Tap the first event where things went wrong.</p>
    <span class="status quiet" data-find-status>Searching</span>
  </div>
  <p class="hint" data-hint aria-live="off"></p>
</section>

<section class="panel stage" data-fix hidden aria-labelledby="fix-title">
  <p class="kicker" id="fix-title">4 · Pick the fix</p>
  <p data-why-line></p>
  <form data-fix-form>
    <fieldset class="gate">
      <legend>What do you ship to the harness?</legend>
      <ul class="fix-options" data-fix-options>${fixCards}</ul>
      <div class="gate-row">
        <button type="submit" class="btn" data-confirm-fix>Confirm fix</button>
        <span class="hint" data-fix-hint aria-live="off"></span>
      </div>
    </fieldset>
  </form>
</section>

<div class="cta-row">
  <p class="muted small">Next: prove the fix on the canary.</p>
  <a class="btn" href="prove.html" data-cta>Fix it → Prove</a>
</div>
`;
  }

  // --- behaviour ---------------------------------------------------------------------

  bind() {
    this.addEventListener("click", (event) => this.onClick(event));
    this.addEventListener("submit", (event) => this.onSubmit(event));
    this.addEventListener("change", (event) => this.onChange(event));
    this.addEventListener("keydown", (event) => this.onKey(event));
    const strip = this.querySelector("[data-strip-lanes]");
    strip.addEventListener("pointerdown", (event) => {
      strip.setPointerCapture(event.pointerId);
      this.seekFromStrip(event, strip);
    });
    strip.addEventListener("pointermove", (event) => {
      if (strip.hasPointerCapture(event.pointerId)) this.seekFromStrip(event, strip);
    });
    this.onResize = () => this.positionCallout();
    window.addEventListener("resize", this.onResize);
  }

  seekFromStrip(event, strip) {
    const rect = strip.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    this.seek(nearestIndexToTime(frac * T_MAX));
  }

  onClick(event) {
    const target = event.target.closest("button, [data-index]");
    if (!target) return;
    if (target.matches("[data-lock]")) return;
    if (target.matches("[data-prev]")) return this.stepBy(-1);
    if (target.matches("[data-next]")) return this.stepBy(1);
    if (target.matches("[data-play]")) return this.togglePlay();
    if (target.matches("[data-speed]")) {
      this.s.speed = Number(target.dataset.speed);
      if (this.s.playing) this.restartTimer();
      return this.update();
    }
    if (target.matches("[data-minus]")) return this.stepBy(-1);
    if (target.matches("[data-plus]")) return this.stepBy(1);
    if (target.matches("[data-view]")) {
      this.s.detail = target.dataset.view;
      return this.update();
    }
    if (target.matches("[data-filter]")) {
      const wire = target.dataset.filter;
      this.s.filter = this.s.filter === wire ? null : wire;
      this.fixFilterIndex();
      return this.update();
    }
    if (target.matches("[data-filter-clear]")) {
      this.s.filter = null;
      return this.update();
    }
    if (target.matches("[data-index]") || target.closest("[data-index]")) {
      const el = target.matches("[data-index]") ? target : target.closest("[data-index]");
      const index = Number(el.dataset.index);
      if (this.isFinding()) return this.answer(index);
      return this.seek(index);
    }
  }

  onSubmit(event) {
    if (event.target.matches("[data-gate-form]")) {
      event.preventDefault();
      this.lockIn();
    } else if (event.target.matches("[data-fix-form]")) {
      event.preventDefault();
      this.confirmFix();
    }
  }

  onChange(event) {
    if (event.target.matches("[data-scrub]")) {
      this.stop();
      this.seek(Number(event.target.value));
    }
    if (event.target.name === "prediction") {
      this.s.pick = Number(event.target.value);
      this.update();
    }
    if (event.target.name === "fix") {
      this.s.fixPick = Number(event.target.value);
      this.update();
    }
  }

  onKey(event) {
    if (event.target.matches("[data-strip-lanes]")) {
      const map = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 };
      if (event.key in map) {
        event.preventDefault();
        this.stepBy(map[event.key]);
      }
    }
  }

  lockIn() {
    if (this.s.locked || this.s.pick === null) {
      if (this.s.pick === null) {
        this.querySelector("[data-locked-note]").textContent = "Pick one option first.";
      }
      return;
    }
    this.s.locked = true;
    this.s.lockedAt = performance.now();
    this.s.idx = 0;
    this.update();
    announce("Prediction locked in. The trace is open.");
  }

  isFinding() {
    return this.s.ended && !this.s.found;
  }

  answer(index) {
    const ev = EVENTS[index];
    if (ev.seq === FIRST_BAD) {
      this.s.found = true;
      this.s.foundAt = performance.now();
      this.s.durationSeconds = (this.s.foundAt - this.s.lockedAt) / 1000;
      this.s.hint = "Found it. That edit undid the earlier fix, and the loop had no exit.";
      this.s.hintTone = "is-good";
      announce(`Found it: event ${ev.seq}, turn ${ev.turn}.`);
      writeStore({ break: { diagnosedSeconds: this.s.durationSeconds } });
    } else {
      this.s.wrongTaps += 1;
      const late = ev.seq > FIRST_BAD;
      this.s.hint = late
        ? "Too late: the loop was already repeating."
        : "Too early: that step was reasonable.";
      if (this.s.wrongTaps >= 3) {
        this.s.hint += " Hint: follow the edits to calc.py around turns 4 and 6.";
      }
      this.s.hintTone = late ? "is-late" : "is-early";
      announce(this.s.hint);
    }
    this.update();
  }

  confirmFix() {
    if (this.s.fixPick === null) {
      this.querySelector("[data-fix-hint]").textContent = "Pick a fix first.";
      return;
    }
    if (this.s.fixPick === INC.correct_fix) {
      this.s.fixed = true;
      this.s.fixHint = `Fix chosen. ${FIX_WHY[INC.correct_fix]}`;
      announce("Fix chosen. Take it to the canary.");
    } else {
      this.s.fixHint = `Not this one. ${FIX_WHY[this.s.fixPick]}`;
    }
    this.update();
  }

  // --- playback ----------------------------------------------------------------------

  seek(index) {
    this.s.idx = Math.max(0, Math.min(LAST_INDEX, index));
    this.update();
  }

  stepBy(dir) {
    const visible = visibleIndices(this.s.filter);
    const next = stepIndex(this.s.idx, dir, visible.length ? visible : [this.s.idx]);
    if (this.s.idx === LAST_INDEX && dir > 0) return this.update();
    this.seek(next);
    if (this.s.idx === LAST_INDEX) this.stop();
  }

  fixFilterIndex() {
    if (!this.s.filter) return;
    const visible = visibleIndices(this.s.filter);
    if (!visible.includes(this.s.idx)) {
      const before = visible.filter((i) => i <= this.s.idx);
      this.s.idx = before.length ? before[before.length - 1] : visible[0];
    }
  }

  togglePlay() {
    if (this.s.playing) this.stop();
    else this.play();
  }

  play() {
    if (this.s.idx === LAST_INDEX) this.s.idx = 0;
    this.s.playing = true;
    this.restartTimer();
    this.update();
  }

  restartTimer() {
    clearInterval(this.s.timer);
    const interval = reducedMotion() ? 800 : Math.round(600 / this.s.speed);
    this.s.timer = setInterval(() => {
      if (this.s.idx >= LAST_INDEX) {
        this.stop();
        return;
      }
      this.stepBy(1);
    }, interval);
  }

  stop() {
    clearInterval(this.s.timer);
    this.s.timer = null;
    if (this.s.playing) {
      this.s.playing = false;
      this.update();
    }
  }

  // --- rendering ---------------------------------------------------------------------

  update() {
    const { s } = this;
    const ev = EVENTS[s.idx];
    const meta = META[s.idx];
    const current = s.idx;
    const visible = new Set(visibleIndices(s.filter));
    const find = s.ended && !s.found;

    this.querySelector("[data-replay]").hidden = !s.locked;
    this.querySelector("[data-replay-lock]").hidden = s.locked;
    const locked = s.locked;
    this.querySelector("[data-gate-form]").toggleAttribute("inert", locked);
    this.querySelector("[data-lock]").disabled = locked;
    this.querySelectorAll("[name='prediction']").forEach((input) => {
      input.disabled = locked;
    });
    this.querySelectorAll("[data-option]").forEach((label) => {
      const i = Number(label.dataset.option);
      label.classList.toggle("is-picked", s.pick === i);
      label.classList.toggle("is-correct", locked && i === PREDICTION.answer && s.pick === i);
      label.classList.toggle("is-wrong", locked && s.pick === i && i !== PREDICTION.answer);
    });
    this.querySelector("[data-locked-note]").textContent = locked
      ? `Locked in: “${PREDICTION.options[s.pick]}”. The trace is open.`
      : "Pick one, then lock it in. The trace stays closed until you do.";

    // Readouts
    this.querySelector("[data-turn]").textContent = String(ev.turn);
    this.querySelector("[data-turn-sub]").textContent = `of ${TURNS} · t ${ev.t.toFixed(1)}\u00a0s`;
    const pctContext = contextPct(current);
    this.querySelector("[data-context]").textContent = `${pctContext}%`;
    this.querySelector("[data-context-sub]").textContent = `${fmt(meta.tokens)} of 8,000 tokens`;
    const bar = this.querySelector("[data-context-bar]");
    bar.style.width = `${pctContext}%`;
    bar.parentElement.classList.toggle("is-high", pctContext >= 75);
    this.querySelector("[data-cost]").textContent = costAt(current).toFixed(3);

    // Timeline
    const p = ev.t / T_MAX;
    this.querySelector("[data-lanes-body]").style.setProperty("--p", p.toFixed(5));
    this.querySelector("[data-playhead]").style.setProperty("--p", p.toFixed(5));
    this.querySelector("[data-strip-cursor]").style.left = `${(p * 100).toFixed(3)}%`;
    this.querySelectorAll(".lane").forEach((lane) => {
      const wire = lane.dataset.wire;
      const muted = Boolean(s.filter) && s.filter !== wire;
      lane.classList.toggle("is-muted", muted);
      lane.querySelector(".lane-label").setAttribute("aria-pressed", String(s.filter === wire));
    });
    this.querySelectorAll(".mark").forEach((mark) => {
      const i = Number(mark.dataset.index);
      mark.classList.toggle("is-current", i === current);
      mark.classList.toggle("is-answer", find);
      mark.tabIndex = find ? 0 : -1;
      mark.hidden = Boolean(s.filter) && !visible.has(i);
      mark.classList.toggle("is-future", i > current);
    });
    this.querySelectorAll(".strip-lanes .tick").forEach((tick) => {
      tick.classList.toggle("is-current", Number(tick.dataset.index) === current);
    });

    // Log
    const rows = this.querySelectorAll("[data-log] .log-row");
    rows.forEach((row) => {
      const i = Number(row.dataset.index);
      row.classList.toggle("is-current", i === current);
      row.classList.toggle("is-future", i > current);
      row.classList.toggle("is-hidden", !visible.has(i));
      row.classList.toggle("is-answer", find && visible.has(i));
      row.setAttribute("aria-current", i === current ? "step" : "false");
      row.tabIndex = 0;
    });
    const current_row = this.querySelector(`[data-log] .log-row[data-index="${current}"]`);
    if (current_row && this.s.lastScrolled !== current) {
      this.s.lastScrolled = current;
      current_row.scrollIntoView({ block: "nearest", behavior: "auto" });
    }

    // Filter note and readout line
    const note = this.querySelector("[data-filter-note]");
    if (s.filter) {
      note.innerHTML = `Showing: ${esc(WIRE[s.filter].name)} · ${visible.size} events <button type="button" class="btn btn-quiet btn-small" data-filter-clear>Show all</button>`;
    } else {
      note.textContent = "Showing: all 8 wires";
    }
    this.querySelector("[data-readout-line]").innerHTML = `<span>Event <strong>${current + 1}</strong> of ${EVENTS.length}</span><span>turn <strong>${ev.turn}</strong></span><span>t <strong>${ev.t.toFixed(1)}\u00a0s</strong></span>`;
    this.querySelector("[data-strip-readout]").textContent = `Event ${current + 1} of ${EVENTS.length} · turn ${ev.turn}`;
    const strip = this.querySelector("[data-strip-lanes]");
    strip.setAttribute("aria-valuenow", String(current));
    strip.setAttribute("aria-valuetext", `Event ${current + 1} of ${EVENTS.length}, turn ${ev.turn}`);
    const scrub = this.querySelector("[data-scrub]");
    scrub.value = String(current);
    scrub.setAttribute("aria-valuetext", `Event ${current + 1} of ${EVENTS.length}, turn ${ev.turn}`);
    this.querySelectorAll("[data-speed]").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(Number(btn.dataset.speed) === s.speed));
    });
    const play = this.querySelector("[data-play]");
    play.textContent = s.playing ? "Pause" : "Play";
    play.setAttribute("aria-pressed", String(s.playing));
    this.querySelector("[data-prev]").disabled = current === 0;
    this.querySelector("[data-next]").disabled = current === LAST_INDEX;
    this.querySelector("[data-next]").textContent = current === LAST_INDEX ? "End of run" : "Next ›";

    // Detail
    this.renderDetail(ev);
    this.querySelectorAll("[data-view]").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.view === s.detail));
    });

    // Callout (desktop)
    this.querySelector("[data-callout-head]").innerHTML = `${wireGlyph(ev.wire, 16)}<span>Turn ${ev.turn} · ${esc(WIRE[ev.wire].short)} · ${esc(summary(ev))}</span>`;
    this.querySelector("[data-callout-text]").textContent = friendly(ev);
    const repeat = this.querySelector("[data-callout-repeat]");
    repeat.hidden = !meta.repeatOfTurn;
    repeat.textContent = meta.repeatOfTurn ? `Seen at turn ${meta.repeatOfTurn}: same tool, same input.` : "";
    this.positionCallout();

    // Turn announcement: at most one per turn.
    if (s.locked && s.announcedTurn !== ev.turn && s.idx > 0) {
      s.announcedTurn = ev.turn;
      announce(`Turn ${ev.turn}: ${summary(ev)}.`);
    }

    // Reveal, find, fix
    s.ended = s.locked && s.idx === LAST_INDEX;
    this.querySelector("[data-reveal]").hidden = !s.ended;
    this.querySelector("[data-find]").hidden = !s.ended;
    this.querySelector("[data-fix]").hidden = !s.found;
    if (s.ended) this.renderReveal();
    if (s.ended && !s.endAnnounced) {
      s.endAnnounced = true;
      announce(`The run never stopped on its own: ${TURNS} turns. Find the first bad moment.`);
    }
    this.renderFind();
    this.renderFix();
    this.renderStatus();
  }

  positionCallout() {
    const body = this.querySelector("[data-lanes-body]");
    const callout = this.querySelector("[data-callout]");
    if (!body || !callout || body.offsetWidth === 0) return;
    const p = EVENTS[this.s.idx].t / T_MAX;
    const width = body.offsetWidth;
    const x = 168 + (width - 168) * p;
    const calloutWidth = Math.min(360, width);
    const left = Math.max(0, Math.min(x - calloutWidth / 2, width - calloutWidth));
    callout.style.left = `${left}px`;
    callout.style.setProperty("--arrow", `${x - left}px`);
  }

  renderDetail(ev) {
    const body = this.querySelector("[data-detail-body]");
    if (this.s.detail === "json") {
      body.innerHTML = `<pre class="json">${esc(JSON.stringify(ev, null, 2))}</pre>`;
      return;
    }
    const skip = new Set(["v", "run", "seq", "t", "turn", "agent", "kind", "wire"]);
    const extras = Object.entries(ev)
      .filter(([key]) => !skip.has(key))
      .map(([key, value]) => {
        const text = typeof value === "object" ? JSON.stringify(value) : String(value);
        return `<dt>${esc(key)}</dt><dd>${esc(text)}</dd>`;
      })
      .join("");
    body.innerHTML = `<p class="small" style="margin-bottom:10px">${esc(friendly(ev))}</p>
      <dl class="fields">
        <dt>Event</dt><dd>${esc(ev.kind)} · seq ${ev.seq}</dd>
        <dt>Wire</dt><dd>${esc(WIRE[ev.wire].name)}</dd>
        <dt>Turn</dt><dd>${ev.turn}</dd>
        <dt>Time</dt><dd>${ev.t.toFixed(1)}\u00a0s</dd>
        ${extras}
      </dl>`;
  }

  renderReveal() {
    const last = EVENTS[LAST_INDEX];
    const turns = last.turns;
    this.querySelector("[data-reveal-line]").textContent = `It never stopped on its own: ${turns} turns, ≈ ${last.cost.toFixed(3)} units, until a person pressed stop.`;
    const picked = PREDICTION.options[this.s.pick];
    const right = this.s.pick === PREDICTION.answer;
    this.querySelector("[data-verdict]").textContent = right
      ? `You predicted “${picked}”. That was right.`
      : `You predicted “${picked}”. Not this time: ${PREDICTION.options[PREDICTION.answer]}`;
  }

  renderFind() {
    const hint = this.querySelector("[data-hint]");
    hint.textContent = this.s.hint;
    hint.className = `hint ${this.s.hintTone}`;
    const status = this.querySelector("[data-find-status]");
    if (this.s.found) {
      status.className = "status ok";
      status.textContent = "Found";
      const timer = this.querySelector("[data-timer]");
      timer.hidden = false;
      timer.textContent = `Diagnosed in ${fmtSeconds(this.s.durationSeconds)} · par ${PAR_SECONDS}\u00a0s`;
    } else {
      status.className = "status quiet";
      status.textContent = this.s.ended ? "Searching" : "Waiting for the end of the run";
    }
  }

  renderFix() {
    if (!this.s.found) return;
    this.querySelector("[data-why-line]").textContent = INC.why;
    this.querySelectorAll("[data-fix-options] [data-fix]").forEach((label) => {
      const i = Number(label.dataset.fix);
      label.classList.toggle("is-picked", this.s.fixPick === i);
      label.classList.toggle("is-correct", this.s.fixed && i === INC.correct_fix);
      label.classList.toggle("is-wrong", !this.s.fixed && this.s.fixPick === i && i !== INC.correct_fix);
    });
    this.querySelectorAll("[name='fix']").forEach((input) => {
      input.disabled = this.s.fixed;
      input.checked = this.s.fixPick === Number(input.value);
    });
    this.querySelector("[data-confirm-fix]").disabled = this.s.fixed;
    this.querySelector("[data-fix-hint]").textContent = this.s.fixHint;
    const cta = this.querySelector("[data-cta]");
    cta.classList.toggle("btn-quiet", !this.s.fixed);
  }

  renderStatus() {
    const head = this.querySelector("[data-head]");
    const status = this.querySelector("[data-status]");
    const done = this.s.fixed;
    head.classList.toggle("is-ok", done);
    status.className = `status fade-status ${done ? "ok" : "warn"}`;
    const word = done ? "Fixed" : this.s.found ? "Diagnosed" : "Open";
    status.innerHTML = `${glyph(done ? "check" : "bang", { size: 16 })}<span data-status-text>${word}</span>`;
  }

  // --- self test (QA): drive the real UI through the whole screen ---------------------

  async selfTest() {
    try {
      // 1. Pick option 3 (index 2) and lock it in.
      const option = this.querySelector('[name="prediction"][value="2"]');
      if (!option) return false;
      option.click();
      this.querySelector("[data-lock]").click();
      if (this.querySelector("[data-replay]").hidden) return false;
      // 2. Step to the end with the Next button.
      for (let guard = 0; guard < 200 && this.s.idx < LAST_INDEX; guard += 1) {
        this.querySelector("[data-next]").click();
      }
      if (this.s.idx !== LAST_INDEX) return false;
      // 3. Reveal exists and says the run never stopped on its own.
      const reveal = this.querySelector("[data-reveal-line]").textContent;
      if (!reveal.includes("It never stopped on its own")) return false;
      // 4. Tap the first bad event (seq 30).
      const row = this.querySelector(`[data-log] .log-row[data-seq="${FIRST_BAD}"]`);
      if (!row) return false;
      row.click();
      if (!this.s.found) return false;
      // 5. Success state: the fix choice is visible.
      return !this.querySelector("[data-fix]").closest("section").hidden;
    } catch {
      return false;
    }
  }
}

customElements.define("hx-proto-break", HxProtoBreak);
initChrome();
