// hx-clock: the Turn Clock and the learner's Harness Board (BP-1.5 §1, DESIGN §7.1, D-035). One face serves five
// modes: board="learner" (the learner's board from the store), preview="A3 A4" (demo only), board="<scenario>"
// (a scenario board's tags), compare="old,new" (two boards, with What changes and Plug it in), and tape + turn
// (one turn of a run). Every state the learner sees is derived in render() from the mode, the data and the UI.
import { HxElement } from "./lib/hx-element.js";
import { getCourse, getBoard, getTape, getFacts } from "./lib/data.js";
import { runTrial } from "../sim/index.js";
import { drawFace, fitFace, svgEl, spokeAnchor, GLYPH_SPRITE } from "./lib/clockface.js";
import {
  wiresInOrder, learnerBoard, dueByWire, wireLevel, comesIn, scenarioBoard, boardChanges, boardRows, changeText,
  turnCount, turnEvents, stepText, SCENARIO_CODE, taggedModules,
} from "./lib/board-tags.js";
import { formatInt, plural } from "./lib/format.js";

const TODAY = () => new Date().toISOString().slice(0, 10);
const HOP_MS = 300;
const STATUS_WORD = { done: "done", started: "started", todo: "not started" };
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

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
      scenarioBoard(this.data.old);
      scenarioBoard(this.data.new);
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
    this.unsubscribe = this.store?.subscribe?.((doc, reason) => {
      if (reason === "update" || reason === "import" || reason === "reset") this.setState({ ver: (this.state.ver ?? 0) + 1 });
    }) ?? null;
    this.state = {
      turn: Math.min(this.data.turns ?? 1, Math.max(1, Number(this.getAttribute("turn") ?? 1) || 1)),
      step: 0, plugged: false, plugNow: false, card: null, focusWire: this.wires[0].id, ver: 0,
    };
    this.lastWidth = 0;
    this.offsets = [];
    // The face is drawn at its measured width, so a change of width redraws it (DESIGN §5.1).
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
    this.dispatchEvent(new CustomEvent("hx-change", { bubbles: true, detail: { name: "turn", value: turn } }));
  }

  // ---------- derived content ----------

  /** The spokes of the learner's board (or of a preview). A spoke's sub-line lists every tag on it. */
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
      spokes[wire.id] = {
        name: `${wire.name}, ${wire.clock} o'clock`,
        tags: tags.map((t) => ({ code: t.id, text: `${t.id} · ${t.label}` })),
        sub: tags.length ? tags.map((t) => `${t.id} · ${t.label}`).join("; ") : `comes in ${comesIn(this.course, wire.id)}`,
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
        sub: tags.length ? tags.map((t) => t.label).join(", ") : "not on this board",
        muted: tags.length === 0,
      };
    }
    return spokes;
  }

  /** The new face's spokes: the old board's until Plug it in, then the new board's, with the added tags flagged. */
  newFaceSpokes() {
    if (!this.state.plugged) return this.scenarioSpokes(this.data.old);
    const spokes = this.scenarioSpokes(this.data.new);
    for (const wire of this.wires) {
      for (const tag of spokes[wire.id].tags) tag.added = this.data.added.includes(tag.id);
    }
    return spokes;
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
      return `${formatInt(board.earned)} of ${formatInt(board.total)} tags plugged.`;
    }
    if (this.mode === "scenario") {
      return `${this.data.board.label}: ${plural(scenarioBoard(this.data.board).count, "module")} on this board.`;
    }
    return "";
  }

  // ---------- rendering ----------

  render() {
    const doc = this.store?.state ?? { modules: {}, cards: {} };
    this.lastWidth = this.faceWidth();
    const root = el("div", `clock-root clock-${this.mode}`);
    const faces = el("div", this.mode === "compare" ? "clock-faces is-compare" : "clock-faces");
    const svgs = [];

    let spokes;
    let hand = null;
    let turnEv = null;
    if (this.mode === "turn") {
      spokes = this.scenarioSpokes(this.data.board);
      turnEv = turnEvents(this.data.events, this.state.turn)[this.state.step] ?? null;
      hand = turnEv?.wire ?? null;
    } else if (this.mode === "scenario") {
      spokes = this.scenarioSpokes(this.data.board);
    } else if (this.mode === "compare") {
      spokes = this.newFaceSpokes();
    } else {
      spokes = this.learnerSpokes(doc);
    }

    const faceCount = this.mode === "compare" ? 2 : 1;
    for (let k = 0; k < faceCount; k += 1) {
      const isNew = this.mode === "compare" && k === 1;
      const faceSpokes = this.mode === "compare" ? (isNew ? this.newFaceSpokes() : this.scenarioSpokes(this.data.old)) : spokes;
      const label = this.mode === "compare" ? `${isNew ? "New" : "Old"} board: ${(isNew ? this.data.new : this.data.old).label}` : "Turn Clock board";
      const figure = el("figure", "clock-face");
      const { svg, spokes: groups } = drawFace({ width: this.faceWidth(), wires: this.wires, spokes: faceSpokes, hand, label });
      this.#wireSpokes(groups, faceSpokes);
      this.#lightAdded(svg, faceSpokes, isNew);
      figure.append(svg);
      if (this.state.card && k === 0) figure.append(this.#card(doc, faceSpokes));
      svgs.push(svg);
      faces.append(figure);
    }
    root.append(faces);

    root.append(el("p", "clock-caption", this.caption(doc)));
    if (this.mode === "compare") root.append(this.#changes());
    if (this.mode === "turn") root.append(this.#turnControls(turnEv));
    if (this.mode === "compare") root.append(this.#plugControls());
    root.append(this.#legend(spokes));
    this.ui.replaceChildren(root);
    // Fit each face to what it draws, now that it is in the page (the drawing keeps its real text sizes).
    this.offsets = svgs.map((svg) => fitFace(svg));
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
    if (spoke.muted) return "not on this board";
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

  /** The card: the wire's question and law, its tags in full, its modules with status words, and its level. */
  #card(doc, spokes) {
    const wire = this.wires.find((w) => w.id === this.state.card);
    const card = el("div", "clock-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-labelledby", "clock-card-title");
    const title = el("h3", null, wire.name);
    title.id = "clock-card-title";
    const question = el("p", null, wire.question);
    const law = el("p", "clock-law", wire.law);
    const tags = spokes[wire.id]?.tags ?? [];
    const tagList = el("ul", "clock-card-tags");
    if (tags.length) {
      tagList.append(...tags.map((t) => el("li", null, t.text)));
    } else {
      tagList.append(el("li", null, "Nothing is plugged on this wire."));
    }
    const modules = el("ul", "clock-card-modules");
    const tagged = taggedModules(this.course).filter((m) => m.tag.wire === wire.id);
    for (const mod of tagged) {
      const status = doc.modules?.[mod.id]?.status ?? "todo";
      modules.append(el("li", null, `${mod.id} · ${mod.title}: ${STATUS_WORD[status] ?? "not started"}`));
    }
    if (tagged.length === 0) modules.append(el("li", null, "No core module is tagged on this wire."));
    const level = el("p", "clock-level", `Level: ${wireLevel(this.course, wire.id, doc)}`);
    const higher = el("p", "clock-higher", "Higher levels come from building and measuring.");
    const close = el("button", "key", "Close");
    close.type = "button";
    close.dataset.key = "card-close";
    close.addEventListener("click", () => this.closeCard());
    card.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeCard();
      }
    });
    card.append(title, question, law, tagList, modules, level, higher, close);
    const width = this.faceWidth();
    const [nx, ny] = spokeAnchor(width, wire.angle);
    const offset = this.offsets[0] ?? 0;
    card.style.left = `${Math.round(Math.min(width - 260, Math.max(0, nx - 120)))}px`;
    card.style.top = `${Math.round(Math.max(0, ny - offset + 24))}px`;
    return card;
  }

  #lightAdded(svg, spokes, isNew) {
    if (!isNew || !this.state.plugged) return;
    for (const wire of this.wires) {
      const spoke = spokes[wire.id];
      if (!spoke?.tags?.some((t) => t.added)) continue;
      const group = svg.querySelector(`[data-wire="${wire.id}"]`);
      group?.classList.add("is-lit");
      if (this.reducedMotion) group?.classList.add("is-ring");
    }
    if (!this.reducedMotion && this.state.plugNow) {
      svg.querySelectorAll(".tag-group").forEach((g) => {
        if (g.dataset.added === "true") g.classList.add("plug-in");
      });
    }
  }

  /** What changes between the two boards: one row per wire whose tags differ (BP-1.5 §1). Shown at every width. */
  #changes() {
    const rows = boardRows(this.course, this.data.old, this.data.new);
    const section = el("section", "clock-changes");
    section.append(el("h3", null, "What changes"));
    if (rows.length === 0) {
      section.append(el("p", "clock-changes-none", "The two boards are the same."));
      return section;
    }
    const list = el("ol", "clock-changes-list");
    for (const row of rows) {
      const item = el("li", `w-${row.wire.id}`, changeText(row));
      if (this.state.plugged) item.classList.add("is-plugged");
      list.append(item);
    }
    section.append(list);
    return section;
  }

  #plugControls() {
    const row = el("div", "clock-plug");
    const button = el("button", "key key-primary", this.state.plugged ? "Plugged in" : "Plug it in");
    button.type = "button";
    button.dataset.key = "plug";
    button.disabled = this.state.plugged;
    button.addEventListener("click", () => this.plugIn());
    row.append(button);
    return row;
  }

  plugIn() {
    if (this.state.plugged) return;
    this.setState({ plugged: true, plugNow: true });
    this.live(`${plural(this.data.added.length, "module")} plugged in.`);
    setTimeout(() => {
      this.state.plugNow = false;
    }, HOP_MS);
  }

  #afterPlug() {
    this.state.plugNow = false;
  }

  #turnControls(turnEv) {
    const row = el("div", "clock-turn");
    const events = turnEvents(this.data.events, this.state.turn);
    const turnLabel = el("p", "clock-turnlabel", `Turn ${this.state.turn} of ${this.data.turns}`);
    const step = el("p", "clock-step", turnEv ? stepText(turnEv, this.course) : "No events on this turn.");
    const counter = el("p", "clock-counter", `${Math.min(this.state.step + 1, Math.max(1, events.length))} / ${events.length}`);
    const back = el("button", "key", "Back");
    back.type = "button";
    back.dataset.key = "back";
    back.disabled = this.state.step <= 0;
    back.addEventListener("click", () => this.#moveStep(-1));
    const forward = el("button", "key key-primary", "Step");
    forward.type = "button";
    forward.dataset.key = "step";
    forward.disabled = this.state.step >= events.length - 1;
    forward.addEventListener("click", () => this.#moveStep(1));
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
    this.dispatchEvent(new CustomEvent("hx-change", { bubbles: true, detail: { name: "step", value: next + 1 } }));
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
    const dot = svgEl("circle", { class: "pulse", r: 5 });
    svg.append(dot);
    const span = (toWire.angle - fromWire.angle + 360) % 360;
    const hops = Math.max(1, Math.round(span / 45));
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / (HOP_MS * hops));
      const [x, y] = spokeAnchor(width, fromWire.angle + span * t);
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", String(y));
      if (t < 1) requestAnimationFrame(step);
      else dot.remove();
    };
    requestAnimationFrame(step);
  }

  #legend(spokes) {
    const list = el("ol", "legend clock-legend");
    list.setAttribute("aria-label", "Wires in turn order");
    for (const wire of this.wires) {
      const spoke = spokes[wire.id] ?? {};
      const li = el("li", `legend-row w-${wire.id}`);
      const n = el("span", "legend-n", String(wire.n));
      const svg = svgEl("svg", { class: "legend-glyph", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" });
      svg.append(svgEl("use", { href: `${GLYPH_SPRITE}#g-${wire.glyph}` }));
      const text = el("span", "legend-text");
      text.append(el("span", "legend-name", `${wire.name}, ${wire.clock} o'clock`), el("span", "legend-state", this.#spokeState(wire, spoke)));
      if (spoke.badge) text.append(el("span", "badge", spoke.badge));
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
      return Boolean(after?.disabled) && this.ui.querySelectorAll(".tag-group.plug-in, .tag-group[data-added=\"true\"]").length > 0;
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
