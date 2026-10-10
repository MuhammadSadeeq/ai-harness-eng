// hx-clock: the Turn Clock and the learner's Harness Board (BP-1.5 §1, DESIGN §7.1, D-035). One face serves five
// modes: board="learner" (the learner's board from the store), preview="A3 A4" (demo only), board="<scenario>"
// (a scenario board's tags), compare="old,new" (two boards, with Plug it in), and tape + turn (one turn of a run).
// Every state the learner sees is derived in render() from the mode, the data and the UI state.
import { HxElement } from "./lib/hx-element.js";
import { getCourse, getBoard, getTape, getFacts } from "./lib/data.js";
import { runTrial } from "../sim/index.js";
import { drawFace, svgEl, spokeAnchor, faceGeometry, GLYPH_SPRITE } from "./lib/clockface.js";
import {
  wiresInOrder, learnerBoard, dueByWire, wireLevel, comesIn, scenarioBoard, boardChanges, turnCount,
  turnEvents, stepText, SCENARIO_CODE, taggedModules,
} from "./lib/board-tags.js";

const TODAY = () => new Date().toISOString().slice(0, 10);
const HOP_MS = 300;
const STATUS_WORD = { done: "done", started: "started", todo: "not started" };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

export class HxClock extends HxElement {
  static observedAttributes = ["board", "preview", "compare", "tape", "turn", "seed"];
  static styles = new URL("./hx-clock.css", import.meta.url).href;

  async setup() {
    this.course = await getCourse();
    this.wires = wiresInOrder(this.course);
    this.mode = this.#modeFromAttributes();
    this.data = {};
    if (this.mode === "compare") {
      const [oldId, newId] = (this.getAttribute("compare") ?? "").split(",").map((s) => s.trim());
      if (!oldId || !newId) throw new Error('compare needs "old,new" board ids');
      this.data.old = await getBoard(oldId);
      this.data.new = await getBoard(newId);
      this.data.added = boardChanges(this.data.old, this.data.new);
    } else if (this.mode === "scenario") {
      this.data.board = await getBoard(this.getAttribute("board"));
      scenarioBoard(this.data.board);
    } else if (this.mode === "turn") {
      const tape = await getTape(this.getAttribute("tape"));
      const boardId = this.getAttribute("board") ?? tape.boards[0];
      const seed = Number(this.getAttribute("seed") ?? tape.golden_seeds[0]);
      this.data.board = await getBoard(boardId);
      const facts = await getFacts();
      const run = runTrial(tape, this.data.board, seed, { facts });
      this.data.events = run.events;
      this.data.turns = turnCount(run.events);
      if (this.data.turns < 1) throw new Error("the run has no turns");
    } else if (this.mode === "preview") {
      this.data.preview = (this.getAttribute("preview") ?? "").split(/\s+/).filter(Boolean);
    }
    const storeRef = this.store;
    this.unsubscribe = storeRef?.subscribe?.((doc, reason) => {
      if (reason === "update" || reason === "import" || reason === "reset") this.setState({ ver: (this.state.ver ?? 0) + 1 });
    }) ?? null;
    this.state = {
      turn: Math.min(this.data.turns ?? 1, Math.max(1, Number(this.getAttribute("turn") ?? 1) || 1)),
      step: 0, plugged: false, plugNow: false, card: null, focusWire: this.wires[0].id, ver: 0,
    };
    // The face is drawn at its measured width, so a change of width redraws it (DESIGN §5.1).
    this.lastWidth = 0;
    if (typeof ResizeObserver === "function") {
      this.resizer = new ResizeObserver(() => {
        if (this.ui && this.faceWidth() !== this.lastWidth) this.render();
      });
      this.resizer.observe(this);
    }
  }

  #modeFromAttributes() {
    if (this.hasAttribute("compare")) return "compare";
    if (this.hasAttribute("tape")) return "turn";
    const board = this.getAttribute("board");
    if (board === "learner") return this.hasAttribute("preview") ? "preview" : "learner";
    if (board) return "scenario";
    throw new Error("hx-clock needs board, compare or tape");
  }

  // ---------- values (COMPONENTS §10) ----------

  hxValue(name) {
    if (name === "turn" && this.mode === "turn") return this.state.turn;
    if (name === "step" && this.mode === "turn") return this.state.step + 1;
    return null;
  }

  hxRange(name) {
    if (name === "turn" && this.mode === "turn") return { min: 1, max: this.data.turns, step: 1 };
    return null;
  }

  hxSetValue(name, value) {
    if (name !== "turn" || this.mode !== "turn") return;
    const turn = Math.min(this.data.turns, Math.max(1, Math.round(Number(value))));
    if (turn === this.state.turn) return;
    this.setState({ turn, step: 0 });
    this.#changed("turn", turn);
  }

  #changed(name, value) {
    this.dispatchEvent(new CustomEvent("hx-change", { bubbles: true, detail: { name, value } }));
  }

  // ---------- derived content ----------

  /** The spokes of the learner's board (or of a preview). */
  learnerSpokes(doc) {
    const preview = this.data.preview;
    const board = preview
      ? learnerBoard(this.course, { modules: Object.fromEntries(preview.map((id) => [id, { status: "done" }])) })
      : learnerBoard(this.course, doc);
    const due = preview ? {} : dueByWire(this.course, doc?.cards, TODAY());
    const spokes = {};
    for (const wire of this.wires) {
      const tags = board.byWire[wire.id];
      const n = due[wire.id] ?? 0;
      const first = tags[0];
      spokes[wire.id] = {
        name: `${wire.name}, ${wire.clock} o'clock`,
        tags: tags.map((t) => ({ code: t.id, text: t.label })),
        sub: first ? `${first.id} · ${first.label}${tags.length > 1 ? ` +${tags.length - 1}` : ""}` : `comes in ${comesIn(this.course, wire.id)}`,
        empty: tags.length === 0,
        dim: n > 0,
        badge: n > 0 ? plural(n, "card due", "cards due") : null,
      };
    }
    return spokes;
  }

  /** The spokes of a scenario board. A spoke with no module says "not on this board". */
  scenarioSpokes(board) {
    const { byWire } = scenarioBoard(board);
    const spokes = {};
    for (const wire of this.wires) {
      const tags = byWire[wire.id] ?? [];
      spokes[wire.id] = {
        name: `${wire.name}, ${wire.clock} o'clock`,
        tags: tags.map((t) => ({ code: SCENARIO_CODE[t.id] ?? t.id, text: t.label, id: t.id })),
        sub: tags.length ? tags[0].label : "not on this board",
        muted: tags.length === 0,
      };
    }
    return spokes;
  }

  /** The spoke states of the compare mode's new face: the added modules are marked for plug-in. */
  newFaceSpokes() {
    const base = this.scenarioSpokes(this.state.plugged ? this.data.new : this.data.old);
    if (this.state.plugged) {
      for (const wire of this.wires) {
        const spoke = base[wire.id];
        spoke.tags.forEach((t) => {
          t.added = this.data.added.includes(t.id);
        });
      }
    }
    return base;
  }

  caption(doc) {
    if (this.mode === "preview") {
      const ids = this.data.preview;
      const list = ids.length > 1 ? `${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1]}` : ids.join("");
      return `Example board: ${list} plugged`;
    }
    if (this.mode === "learner") {
      const board = learnerBoard(this.course, doc);
      if (board.earned === 0) return "Your board is empty. Each module you finish plugs a tag onto its wire.";
      return `${board.earned} of ${board.total} tags plugged.`;
    }
    if (this.mode === "scenario") {
      const n = scenarioBoard(this.data.board).count;
      return `${this.data.board.label}: ${plural(n, "module", "modules")} on this board.`;
    }
    return "";
  }

  // ---------- rendering ----------

  render() {
    const doc = this.store?.state ?? { modules: {}, cards: {} };
    const ui = this.ui;
    this.lastWidth = this.faceWidth();
    const root = document.createElement("div");
    root.className = `clock-root clock-${this.mode}`;
    const faces = document.createElement("div");
    faces.className = this.mode === "compare" ? "clock-faces is-compare" : "clock-faces";

    let spokes;
    let hand = null;
    let turnEv = null;
    if (this.mode === "turn") {
      spokes = this.scenarioSpokes(this.data.board);
      const events = turnEvents(this.data.events, this.state.turn);
      turnEv = events[this.state.step] ?? null;
      hand = turnEv?.wire ?? null;
    } else if (this.mode === "scenario") {
      spokes = this.scenarioSpokes(this.data.board);
    } else if (this.mode === "compare") {
      spokes = null;
    } else {
      spokes = this.learnerSpokes(doc);
    }

    const faceCount = this.mode === "compare" ? 2 : 1;
    const figs = [];
    for (let k = 0; k < faceCount; k += 1) {
      const isNew = this.mode === "compare" && k === 1;
      const faceSpokes = this.mode === "compare" ? (isNew ? this.newFaceSpokes() : this.scenarioSpokes(this.data.old)) : spokes;
      const label = this.mode === "compare" ? `${isNew ? "New" : "Old"} board: ${(isNew ? this.data.new : this.data.old).label}` : "Turn Clock board";
      const figure = document.createElement("figure");
      figure.className = "clock-face";
      const { svg, spokes: groups } = drawFace({ width: this.faceWidth(), wires: this.wires, spokes: faceSpokes, hand, label });
      this.#wireSpokes(groups, faceSpokes);
      this.#lightAdded(svg, faceSpokes, isNew);
      figure.append(svg);
      if (this.state.card && k === 0) figure.append(this.#card(doc));
      figs.push(figure);
    }
    faces.append(...figs);
    root.append(faces);

    const cap = document.createElement("p");
    cap.className = "clock-caption";
    cap.textContent = this.caption(doc);
    root.append(cap);

    if (this.mode === "turn") root.append(this.#turnControls(turnEv));
    if (this.mode === "compare") root.append(this.#plugControls());
    root.append(this.#legend(spokes ?? this.newFaceSpokes()));
    ui.replaceChildren(root);
    this.ui = ui;
    if (this.mode === "turn" && turnEv) this.live(stepText(turnEv, this.course));
    if (this.state.plugNow) this.#afterPlug();
    if (this.pendingPulse) this.#pulse();
  }

  faceWidth() {
    const host = this.clientWidth || this.parentElement?.clientWidth || 343;
    return this.mode === "compare" ? Math.max(300, Math.floor((host - 16) / 2)) : Math.max(300, Math.floor(host));
  }

  /** Makes each spoke a keyboard group: roving focus, arrow keys in clock order, Enter or tap opens its card. */
  #wireSpokes(groups, spokes) {
    for (const wire of this.wires) {
      const group = groups[wire.id];
      if (!group) continue;
      const spoke = spokes[wire.id];
      group.setAttribute("role", "button");
      group.setAttribute("tabindex", this.state.focusWire === wire.id ? "0" : "-1");
      group.setAttribute("aria-label", `${spoke.name}. ${this.#spokeState(wire, spoke)}`);
      group.setAttribute("data-key", `spoke-${wire.id}`);
      group.addEventListener("focus", () => {
        if (this.state.focusWire !== wire.id) this.state.focusWire = wire.id;
      });
      group.addEventListener("click", () => this.openCard(wire.id));
      group.addEventListener("keydown", (event) => this.#spokeKey(event, wire.id));
    }
  }

  #spokeState(wire, spoke) {
    if (spoke.muted) return "Not on this board";
    if (spoke.tags.length) return spoke.sub;
    if (spoke.empty) return `Empty: comes in ${comesIn(this.course, wire.id)}`;
    return spoke.sub ?? "";
  }

  #spokeKey(event, wireId) {
    const order = this.wires.map((w) => w.id);
    const i = order.indexOf(wireId);
    const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (move) {
      event.preventDefault();
      const next = order[(i + move + order.length) % order.length];
      this.setState({ focusWire: next });
      this.ui?.querySelector(`[data-key="spoke-${next}"]`)?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.openCard(wireId);
    }
  }

  openCard(wireId) {
    this.setState({ card: wireId, focusWire: wireId });
    this.ui?.querySelector('[data-key="card-close"]')?.focus();
  }

  closeCard() {
    const wireId = this.state.card;
    this.setState({ card: null });
    if (wireId) this.ui?.querySelector(`[data-key="spoke-${wireId}"]`)?.focus();
  }

  /** The card: the wire's question and law, its modules with status marks and words, and its level. */
  #card(doc) {
    const wire = this.wires.find((w) => w.id === this.state.card);
    const card = document.createElement("div");
    card.className = "clock-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-labelledby", "clock-card-title");
    const title = document.createElement("h3");
    title.id = "clock-card-title";
    title.textContent = wire.name;
    const question = document.createElement("p");
    question.textContent = wire.question;
    const law = document.createElement("p");
    law.className = "clock-law";
    law.textContent = wire.law;
    const modules = document.createElement("ul");
    modules.className = "clock-card-modules";
    const tagged = taggedModules(this.course).filter((m) => m.tag.wire === wire.id);
    for (const mod of tagged) {
      const status = doc.modules?.[mod.id]?.status ?? "todo";
      const li = document.createElement("li");
      li.textContent = `${mod.id} · ${mod.title}: ${STATUS_WORD[status] ?? "not started"}`;
      modules.append(li);
    }
    if (tagged.length === 0) {
      const none = document.createElement("li");
      none.textContent = "No core module is tagged on this wire.";
      modules.append(none);
    }
    const level = document.createElement("p");
    level.className = "clock-level";
    level.textContent = `Level: ${wireLevel(this.course, wire.id, doc)}`;
    const higher = document.createElement("p");
    higher.className = "clock-higher";
    higher.textContent = "Higher levels come from building and measuring.";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "key";
    close.dataset.key = "card-close";
    close.textContent = "Close";
    close.addEventListener("click", () => this.closeCard());
    card.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeCard();
      }
    });
    card.append(title, question, law, modules, level, higher, close);
    const width = this.faceWidth();
    const [nx, ny] = spokeAnchor(width, wire.angle);
    card.style.left = `${Math.round(Math.min(width - 260, Math.max(0, nx - 120)))}px`;
    card.style.top = `${Math.round(Math.max(0, ny + 24))}px`;
    return card;
  }

  #lightAdded(svg, spokes, isNew) {
    if (!isNew || !this.state.plugged) return;
    for (const wire of this.wires) {
      const spoke = spokes[wire.id];
      if (!spoke?.tags?.some((t) => t.added)) continue;
      svg.querySelector(`[data-wire="${wire.id}"]`)?.classList.add("is-lit");
      if (this.reducedMotion) svg.querySelector(`[data-wire="${wire.id}"]`)?.classList.add("is-ring");
    }
    if (!this.reducedMotion && this.state.plugNow) {
      svg.querySelectorAll(".tag-group").forEach((g) => {
        if (g.dataset.added === "true") g.classList.add("plug-in");
      });
    }
  }

  #plugControls() {
    const row = document.createElement("div");
    row.className = "clock-plug";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "key key-primary";
    button.dataset.key = "plug";
    button.textContent = this.state.plugged ? "Plugged in" : "Plug it in";
    button.disabled = this.state.plugged;
    button.addEventListener("click", () => this.plugIn());
    row.append(button);
    return row;
  }

  plugIn() {
    if (this.state.plugged) return;
    this.setState({ plugged: true, plugNow: true });
    const added = this.data.added.length;
    this.live(`${plural(added, "module", "modules")} plugged in.`);
    setTimeout(() => {
      this.state.plugNow = false;
    }, HOP_MS);
  }

  #afterPlug() {
    this.state.plugNow = false;
  }

  #turnControls(turnEv) {
    const row = document.createElement("div");
    row.className = "clock-turn";
    const step = document.createElement("p");
    step.className = "clock-step";
    step.textContent = turnEv ? stepText(turnEv, this.course) : "No events on this turn.";
    const events = turnEvents(this.data.events, this.state.turn);
    const counter = document.createElement("p");
    counter.className = "clock-counter";
    counter.textContent = `${Math.min(this.state.step + 1, Math.max(1, events.length))} / ${events.length}`;
    const back = document.createElement("button");
    back.type = "button";
    back.className = "key";
    back.dataset.key = "back";
    back.textContent = "Back";
    back.disabled = this.state.step <= 0;
    back.addEventListener("click", () => this.#moveStep(-1));
    const forward = document.createElement("button");
    forward.type = "button";
    forward.className = "key key-primary";
    forward.dataset.key = "step";
    forward.textContent = "Step";
    forward.disabled = this.state.step >= events.length - 1;
    forward.addEventListener("click", () => this.#moveStep(1));
    const turnLabel = document.createElement("p");
    turnLabel.className = "clock-turnlabel";
    turnLabel.textContent = `Turn ${this.state.turn} of ${this.data.turns}`;
    row.append(turnLabel, step, counter, back, forward);
    return row;
  }

  #moveStep(delta) {
    const events = turnEvents(this.data.events, this.state.turn);
    const from = events[this.state.step]?.wire ?? null;
    const next = Math.min(events.length - 1, Math.max(0, this.state.step + delta));
    this.pendingPulse = !this.reducedMotion && from && events[next] && events[next].wire !== from
      ? { from, to: events[next].wire } : null;
    this.setState({ step: next });
    this.#changed("step", next + 1);
  }

  /** A pulse travels the rim clockwise from one spoke to the next, about 300 ms per hop (full motion only). */
  #pulse() {
    const { from, to } = this.pendingPulse;
    this.pendingPulse = null;
    const svg = this.ui?.querySelector("svg.clock");
    if (!svg) return;
    const fromWire = this.wires.find((w) => w.id === from);
    const toWire = this.wires.find((w) => w.id === to);
    const width = this.faceWidth();
    const { rimR } = faceGeometry(width);
    const dot = svgEl("circle", { class: "pulse", r: 5 });
    svg.append(dot);
    const span = (toWire.angle - fromWire.angle + 360) % 360;
    const hops = Math.max(1, Math.round(span / 45));
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / (HOP_MS * hops));
      const [x, y] = spokeAnchor(width, fromWire.angle + span * t);
      void rimR;
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", String(y));
      if (t < 1) requestAnimationFrame(step);
      else dot.remove();
    };
    requestAnimationFrame(step);
  }

  #legend(spokes) {
    const list = document.createElement("ol");
    list.className = "legend clock-legend";
    list.setAttribute("aria-label", "Wires in turn order");
    for (const wire of this.wires) {
      const spoke = spokes[wire.id] ?? {};
      const li = document.createElement("li");
      li.className = `legend-row w-${wire.id}`;
      const n = document.createElement("span");
      n.className = "legend-n";
      n.textContent = String(wire.n);
      const svg = svgEl("svg", { class: "legend-glyph", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" });
      svg.append(svgEl("use", { href: `${GLYPH_SPRITE}#g-${wire.glyph}` }));
      const text = document.createElement("span");
      text.className = "legend-text";
      const name = document.createElement("span");
      name.className = "legend-name";
      name.textContent = `${wire.name}, ${wire.clock} o'clock`;
      const state = document.createElement("span");
      state.className = "legend-state";
      state.textContent = this.#spokeState(wire, spoke);
      text.append(name, state);
      if (spoke.badge) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = spoke.badge;
        text.append(badge);
      }
      li.append(n, svg, text);
      list.append(li);
    }
    return list;
  }

  // ---------- self test (COMPONENTS §7): drives the real controls ----------

  async selfTest() {
    const saved = { plugged: this.state.plugged, turn: this.state.turn, step: this.state.step, card: this.state.card };
    try {
      return await this.#runSelfTest();
    } finally {
      this.setState({ plugged: saved.plugged, turn: saved.turn, step: saved.step, card: saved.card });
    }
  }

  async #runSelfTest() {
    if (this.mode === "compare") {
      const button = this.ui?.querySelector('[data-key="plug"]');
      if (!button || button.disabled) return false;
      button.click();
      const after = this.ui?.querySelector('[data-key="plug"]');
      return Boolean(after?.disabled) && this.ui.querySelectorAll(".tag-group").length > 0;
    }
    if (this.mode === "turn") {
      this.ui?.querySelector('[data-key="step"]')?.click();
      this.ui?.querySelector('[data-key="step"]')?.click();
      const events = turnEvents(this.data.events, this.state.turn);
      const want = Math.min(2, events.length - 1);
      return this.state.step === want && this.ui?.querySelector(".hand") != null;
    }
    const first = this.ui?.querySelector('[data-key="spoke-control"]');
    if (!first) return false;
    first.focus();
    first.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const card = this.ui?.querySelector(".clock-card");
    if (!card || !card.textContent.includes(this.wires[0].question)) return false;
    await nextFrame();
    card.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return this.ui?.querySelector(".clock-card") == null && document.activeElement === this.ui?.querySelector('[data-key="spoke-control"]');
  }
}

customElements.define("hx-clock", HxClock);
