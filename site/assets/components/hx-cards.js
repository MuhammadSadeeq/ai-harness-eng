// hx-cards: spaced review (BP-1.6 §3; AUTHORING §10; D-026 Leitner boxes).
//   <hx-cards src="B2">…no-JS fallback: the fronts and backs…</hx-cards>
//   <hx-cards src="data/cards-demo.json">…        (demo pages only, COMPONENTS §11)
// Session: the due cards, then the new cards, at most 20. A right answer moves a card up a box; a miss
// returns it to box 1 and it comes back later in the same session. Boxes live in
// store.state.cards[<card id>] = {box, due, seen, last}. Evidence "cards" when a session ends.
// Recall first: a self-graded card shows its front and a primary Show answer key; the back and the grade
// keys come after the reveal. Keys: Space or Enter shows the answer on the self-graded types, 1 is Again,
// 2 is Got it (a visible line says so).
import { HxElement } from "./lib/hx-element.js";
import { cardCredit } from "./lib/credit.js";
import { getContent, getCourseCore, getFactsCore, getOncall } from "./lib/data.js";
import { mountFacts } from "../core/shell/facts.js";
import { boardFreshOrder } from "./lib/pool.js";
import {
  localToday, addDays, grade as gradeCard, stored, sessionQueue, sessionSummary, cardProblem, SESSION_LIMIT,
  seedOf, shuffleAway, familyChoices, jsonRows, pointerGet,
} from "./lib/leitner.js";

const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const SELF_GRADED = new Set(["term", "wire-question"]);
const KEY_LINE = "Space or Enter shows the answer. 1 is Again, 2 is Got it.";
const RIGHT = "Right.";
const NOT_QUITE = "Not quite.";
let uidCount = 0;

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

const markWord = (...words) => {
  const text = words.filter(Boolean).join(", ");
  if (text === "") return null;
  return el("span", { class: "choice-mark" }, glyph(text.includes("right") ? "check" : "cross"), text);
};

export class HxCards extends HxElement {
  static styles = new URL("./hx-cards.css", import.meta.url).href;

  #overlay = {};
  #finished = false;
  // Keys are read from the document: after a click the focus can rest on the page body.
  #onDocumentKey = (event) => this.onKey(event);

  async setup() {
    const src = this.getAttribute("src");
    if (!src) throw new Error("hx-cards needs src");
    const board = src === "board";
    const [cards, course, oncall] = await Promise.all([
      getContent("cards", src), getCourseCore(), board ? getOncall() : Promise.resolve(null),
    ]);
    if (!Array.isArray(cards) || cards.length === 0) throw new Error("hx-cards: no cards");
    const wires = [...course.wires].sort((a, b) => a.n - b.n);
    const wireIds = wires.map((wire) => wire.id);
    const familyIds = course.failure_families.map((family) => family.id);
    const ids = new Set();
    for (const card of cards) {
      const problem = cardProblem(card, wireIds, familyIds);
      if (problem) throw new Error(`hx-cards: ${problem}`);
      if (ids.has(card.id)) throw new Error(`hx-cards: duplicate card ${card.id}`);
      ids.add(card.id);
    }
    // A card that names a fact (cards.yaml `fact:`) shows the fact's chip on its back; the registry is read only then.
    this.facts = cards.some((card) => typeof card.fact === "string") ? await getFactsCore() : null;
    this.src = src;
    // The board draws its new cards from the learner's pool (D-062); a module's own cards need no pool.
    this.board = board ? { cards, course, incidentModules: (oncall.incidents ?? []).map((incident) => incident.module) } : null;
    this.cards = new Map(cards.map((card) => [card.id, card]));
    this.allIds = cards.map((card) => card.id);
    this.wires = wires;
    this.familyIds = familyIds;
    this.familyNames = new Map(course.failure_families.map((family) => [family.id, family.name]));
    this.uid = `hxc${++uidCount}`;
    this.start();
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("keydown", this.#onDocumentKey);
  }

  disconnectedCallback() {
    document.removeEventListener("keydown", this.#onDocumentKey);
  }

  /** A card's back. A card that names a fact gets the fact's chip on it (AUTHORING §7), from the registry it was given. */
  backNode(card, tabindex = null) {
    const attrs = tabindex === null ? { class: "card-back" } : { class: "card-back", tabindex };
    const node = typeof card.fact === "string"
      ? el("p", attrs, el("span", { class: "fact", "data-fact": card.fact, text: card.back }))
      : el("p", { ...attrs, text: card.back });
    if (this.facts) mountFacts(this.facts, node);
    return node;
  }

  /** A fresh session from the stored boxes and today's date. */
  start() {
    this.today = localToday();
    const fresh = this.board
      ? boardFreshOrder({ ...this.board, modules: this.store?.state?.modules ?? {} }, this.today)
      : null;
    this.queue = sessionQueue(this.cardsNow(), this.allIds, this.today, SESSION_LIMIT, fresh);
    this.queueStart = this.queue.length;
    this.seen = new Set();
    this.missed = new Set();
    this.rightIds = new Set();
    this.#finished = false;
    this.state = {
      index: 0,
      reveal: false,
      choice: null,
      checked: false,
      correct: null,
      order: null,
      reviewed: 0,
      right: 0,
      again: 0,
      done: this.queue.length === 0,
      focusPrimary: false,
    };
  }

  /** The stored boxes with this session's own writes on top (in case the store is blocked). */
  storeCards() {
    try {
      return this.store?.state?.cards ?? {};
    } catch {
      return {};
    }
  }

  cardsNow() {
    return { ...this.storeCards(), ...this.#overlay };
  }

  currentId() {
    return this.queue[this.state.index];
  }

  /** Writes a card's new state and counts the answer; a miss goes to the end of the queue. */
  record(correct) {
    const id = this.currentId();
    const next = gradeCard(stored(this.cardsNow(), id), correct, this.today);
    this.#overlay[id] = next;
    try {
      this.store?.update((doc) => {
        doc.cards ??= {};
        doc.cards[id] = next;
      });
    } catch {
      // Storage is blocked: the boxes last for this page only.
    }
    if (!correct) {
      this.missed.add(id);
      this.queue.push(id);
    } else {
      this.rightIds.add(id);
    }
    const s = this.state;
    this.setState({
      reviewed: s.reviewed + 1,
      right: s.right + (correct ? 1 : 0),
      again: s.again + (correct ? 0 : 1),
    });
  }

  advance() {
    const index = this.state.index + 1;
    if (index >= this.queue.length) {
      this.finish();
      return;
    }
    this.setState({
      index,
      reveal: false,
      choice: null,
      checked: false,
      correct: null,
      order: null,
      focusPrimary: true,
    });
  }

  finish() {
    const s = this.state;
    this.setState({ index: this.queue.length, done: true, focusPrimary: false });
    const summary = this.summaryText();
    this.live(summary);
    if (s.reviewed > 0 && !this.#finished) {
      this.#finished = true;
      // D-061: each card answered right credits its own objective (cards.yaml), once; "Again" credits nothing.
      this.evidence("cards", { src: this.src, reviewed: s.reviewed, right: s.right }, cardCredit(this.rightIds, this.cards));
    }
  }

  summaryText() {
    const { reviewed, right, again } = this.state;
    return sessionSummary({ reviewed, right, again }, this.cardsNow(), this.allIds, this.today);
  }

  selfGrade(correct) {
    this.record(correct);
    this.advance();
  }

  /** Auto-graded types: the answer is judged at Check, counted then, and shown with its back. */
  isCorrect(card, s) {
    if (card.type === "order-turn") return s.order.every((item, i) => item === card.items[i]);
    if (card.type === "spot-bug-json") return s.choice === card.bug_path;
    if (card.type === "which-wire") return s.choice === card.wire;
    return s.choice === card.family;
  }

  canCheck(card, s) {
    if (s.checked) return false;
    return card.type === "order-turn" || s.choice !== null;
  }

  checkAuto() {
    const card = this.cards.get(this.currentId());
    const s = this.state;
    if (!this.canCheck(card, s)) return;
    const correct = this.isCorrect(card, s);
    this.record(correct);
    this.setState({ checked: true, correct });
    this.live(correct ? RIGHT : NOT_QUITE);
  }

  moveItem(item, delta) {
    const s = this.state;
    if (s.checked) return;
    const order = [...s.order];
    const from = order.indexOf(item);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    this.setState({ order });
  }

  /**
   * Space, 1 and 2 act when focus is inside this component, or on the page body when this is the only
   * hx-cards on the page (so two decks never answer each other's keys).
   */
  onKey(event) {
    if (!this.cards) return; // keys can arrive before the deck has loaded
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    const inside = target instanceof Node && this.contains(target);
    const onBody = target === document.body || target === document.documentElement;
    const alone = document.querySelectorAll("hx-cards").length === 1;
    if (!inside && !(onBody && alone)) return;
    const s = this.state;
    if (s.done) return;
    const card = this.cards.get(this.currentId());
    if (!SELF_GRADED.has(card.type)) return;
    if ((event.key === " " || event.key === "Enter") && !s.reveal) {
      // A button or link under focus keeps its own key (Enter clicks it; Space presses it).
      if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement
        || event.target instanceof HTMLAnchorElement) return;
      event.preventDefault();
      this.setState({ reveal: true, focusBack: true });
    } else if ((event.key === "1" || event.key === "2") && s.reveal) {
      event.preventDefault();
      this.selfGrade(event.key === "2");
    }
  }

  render() {
    const s = this.state;
    const { screen, primary } = s.done ? { screen: this.summaryScreen(), primary: null } : this.cardScreen();
    this.ui.replaceChildren(screen);
    if (s.focusBack) {
      // The answer takes focus on reveal, so the next Tab reaches the grade keys (WCAG 2.4.3).
      s.focusBack = false;
      this.ui.querySelector(".card-back")?.focus({ preventScroll: true });
    }
    if (s.focusPrimary && primary) {
      primary.focus({ preventScroll: true });
      s.focusPrimary = false;
    }
  }

  summaryScreen() {
    return el("div", { class: "cards" }, el("p", { class: "cards-summary", text: this.summaryText() }));
  }

  cardScreen() {
    const s = this.state;
    const card = this.cards.get(this.currentId());
    const body = el("div", { class: "card", "data-type": card.type });
    let primary = null;
    if (SELF_GRADED.has(card.type)) {
      body.append(el("p", { class: "card-front", text: card.front }));
      if (!s.reveal) {
        primary = el("button", { class: "key key-primary", type: "button", "data-key": "show", text: "Show answer" });
        primary.addEventListener("click", () => this.setState({ reveal: true, focusBack: true }));
        body.append(el("div", { class: "card-keys" }, primary));
      } else {
        body.append(this.backNode(card, "-1"));
        const again = el("button", { class: "key", type: "button", "data-key": "again", text: "Again" });
        const got = el("button", { class: "key key-primary", type: "button", "data-key": "got", text: "Got it" });
        again.addEventListener("click", () => this.selfGrade(false));
        got.addEventListener("click", () => this.selfGrade(true));
        primary = got;
        body.append(el("div", { class: "card-keys" }, again, got));
      }
      body.append(el("p", { class: "card-hint", text: KEY_LINE }));
    } else {
      const answer = this.autoAnswer(card, s);
      answer.node.prepend(el("legend", { class: "card-front", text: card.front }));
      body.append(answer.node);
      primary = answer.primary;
      if (s.checked) {
        body.append(
          el("p", { class: `verdict${s.correct ? " is-pass" : " is-fail"}` },
            glyph(s.correct ? "check" : "cross"), s.correct ? RIGHT : NOT_QUITE),
          el("div", { class: "card-correct" }, el("span", { class: "card-label", text: "Right answer: " }), answer.right),
          this.backNode(card),
        );
        const next = el("button", { class: "key key-primary", type: "button", "data-key": "next", text: "Next" });
        next.addEventListener("click", () => this.advance());
        primary = next;
        body.append(el("div", { class: "card-keys" }, next));
      } else {
        const check = el("button", {
          class: "key key-primary", type: "button", "data-key": "check", text: "Check",
          "aria-disabled": String(!this.canCheck(card, s)),
        });
        check.addEventListener("click", () => this.checkAuto());
        body.append(el("div", { class: "card-keys" }, check));
      }
    }
    // The counter counts unique cards: a card that comes back after a miss is not a new step.
    this.seen.add(this.currentId());
    const again = this.missed.has(this.currentId()) ? el("span", { class: "card-tag", text: "Again" }) : null;
    const progress = el("p", { class: "cards-progress" }, `${this.seen.size} of ${this.queueStart}`, again);
    return { screen: el("div", { class: "cards" }, progress, body), primary };
  }

  /** The answer controls for an auto-graded card, the right answer as a node, and the first control. */
  autoAnswer(card, s) {
    if (card.type === "which-wire") return this.whichWire(card, s);
    if (card.type === "spot-bug-json") return this.spotBug(card, s);
    if (card.type === "order-turn") return this.orderTurn(card, s);
    return this.nameFamily(card, s);
  }

  whichWire(card, s) {
    const name = `${this.uid}-wire`;
    let primary = null;
    const rows = this.wires.map((wire) => {
      const input = el("input", { type: "radio", name, value: wire.id, "data-key": `wire-${wire.id}` });
      primary ??= input;
      input.checked = s.choice === wire.id;
      input.disabled = s.checked;
      input.addEventListener("change", () => this.setState({ choice: wire.id }));
      const mark = s.checked ? markWord(wire.id === card.wire ? "right" : null, s.choice === wire.id && wire.id !== card.wire ? "your pick" : null) : null;
      return el("li", {}, el("label", { class: "choice" }, input,
        el("span", { class: "choice-text" }, glyph(wire.glyph), el("span", { class: "opt-text", text: wire.name })), mark));
    });
    const right = this.wires.find((wire) => wire.id === card.wire)?.name ?? card.wire;
    return {
      node: el("fieldset", { class: "card-answer" }, el("ul", { class: "choices" }, ...rows)),
      primary,
      right,
    };
  }

  spotBug(card, s) {
    const rows = jsonRows(card.json);
    const targets = rows.filter((row) => row.pointer !== null);
    const selected = s.choice ?? targets[0]?.pointer ?? null;
    const group = el("div", { class: "json-rows", role: "radiogroup", "aria-label": "JSON lines" });
    group.addEventListener("keydown", (event) => this.moveRow(event, targets, card));
    let primary = null;
    rows.forEach((row, i) => {
      if (row.pointer === null) {
        group.append(el("div", { class: "json-line", "aria-hidden": "true", text: row.text }));
        return;
      }
      const isPick = s.choice === row.pointer;
      const isBug = row.pointer === card.bug_path;
      const button = el("button", {
        type: "button", role: "radio", class: "json-row", "data-key": `row-${i}`, "data-pointer": row.pointer,
        "aria-checked": String(isPick), tabindex: row.pointer === selected ? "0" : "-1",
        "aria-disabled": String(s.checked),
      });
      button.append(el("span", { class: "json-text", text: row.text }));
      if (s.checked && (isBug || isPick)) {
        button.append(markWord(isBug ? "right" : null, isPick && !isBug ? "your pick" : null));
      }
      button.addEventListener("click", () => {
        if (!this.state.checked) this.setState({ choice: row.pointer });
      });
      if (row.pointer === selected) primary = button;
      group.append(button);
    });
    const bugRow = rows.find((row) => row.pointer === card.bug_path);
    return {
      node: el("fieldset", { class: "card-answer" }, group),
      primary,
      right: el("code", { class: "card-code", text: bugRow ? bugRow.text.trim() : card.bug_path }),
    };
  }

  /** Arrow keys move through the selectable JSON rows; the row that gets focus is picked too. */
  moveRow(event, targets, card) {
    if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    if (this.state.checked) return;
    event.preventDefault();
    const current = targets.findIndex((row) => row.pointer === this.state.choice);
    const last = targets.length - 1;
    let next = current < 0 ? 0 : current;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = Math.min(last, next + 1);
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = Math.max(0, next - 1);
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = last;
    const pointer = targets[next].pointer;
    const index = jsonRows(card.json).findIndex((row) => row.pointer === pointer);
    this.setState({ choice: pointer });
    this.ui.querySelector(`[data-key="row-${index}"]`)?.focus({ preventScroll: true });
  }

  orderTurn(card, s) {
    if (s.order === null) s.order = shuffleAway(card.items, seedOf(card.id));
    const last = s.order.length - 1;
    const list = el("ol", { class: "order-list" });
    let primary = null;
    s.order.forEach((item, position) => {
      const key = card.items.indexOf(item);
      const up = el("button", {
        class: "key", type: "button", "data-key": `up-${key}`, text: "Move up",
        "aria-label": `Move up: ${item}`, "aria-disabled": String(position === 0 || s.checked),
      });
      const down = el("button", {
        class: "key", type: "button", "data-key": `down-${key}`, text: "Move down",
        "aria-label": `Move down: ${item}`, "aria-disabled": String(position === last || s.checked),
      });
      up.addEventListener("click", () => this.moveItem(item, -1));
      down.addEventListener("click", () => this.moveItem(item, 1));
      if (position === 0) primary = down;
      list.append(el("li", { class: "order-item" }, el("span", { class: "order-text", text: item }),
        el("span", { class: "order-keys" }, up, down)));
    });
    return {
      node: el("fieldset", { class: "card-answer" }, list),
      primary,
      right: el("ol", { class: "card-order" }, ...card.items.map((item) => el("li", { text: item }))),
    };
  }

  nameFamily(card, s) {
    const name = `${this.uid}-family`;
    const options = familyChoices(card.family, this.familyIds, card.id);
    let primary = null;
    const rows = options.map((family) => {
      const input = el("input", { type: "radio", name, value: family, "data-key": `family-${family}` });
      primary ??= input;
      input.checked = s.choice === family;
      input.disabled = s.checked;
      input.addEventListener("change", () => this.setState({ choice: family }));
      const mark = s.checked ? markWord(family === card.family ? "right" : null, s.choice === family && family !== card.family ? "your pick" : null) : null;
      return el("li", {}, el("label", { class: "choice" }, input,
        el("span", { class: "choice-text" }, el("span", { class: "opt-text", text: this.familyNames.get(family) ?? family })), mark));
    });
    return {
      node: el("fieldset", { class: "card-answer" },
        el("pre", { class: "trace", text: card.trace.join("\n") }),
        el("ul", { class: "choices" }, ...rows)),
      primary,
      right: this.familyNames.get(card.family) ?? card.family,
    };
  }

  /** Answers every card of a fresh session through the real UI: the first card wrong, the rest right. */
  answerInUi(card, right) {
    const q = (selector) => this.ui.querySelector(selector);
    if (SELF_GRADED.has(card.type)) {
      if (!this.state.reveal) q('[data-key="show"]').click();
      q(right ? '[data-key="got"]' : '[data-key="again"]').click();
      return;
    }
    if (card.type === "order-turn") {
      if (right) {
        card.items.forEach((item, i) => {
          while (this.state.order[i] !== item) q(`[data-key="up-${card.items.indexOf(item)}"]`).click();
        });
      }
    } else if (card.type === "spot-bug-json") {
      const rows = jsonRows(card.json);
      const index = right
        ? rows.findIndex((row) => row.pointer === card.bug_path)
        : rows.findIndex((row) => row.pointer !== null && row.pointer !== card.bug_path);
      q(`[data-key="row-${index}"]`).click();
    } else if (card.type === "which-wire") {
      const value = right ? card.wire : this.wires.find((wire) => wire.id !== card.wire).id;
      q(`[data-key="wire-${value}"]`).click();
    } else {
      const options = familyChoices(card.family, this.familyIds, card.id);
      const value = right ? card.family : options.find((family) => family !== card.family);
      q(`[data-key="family-${value}"]`).click();
    }
    q('[data-key="check"]').click();
    q('[data-key="next"]').click();
  }

  async selfTest() {
    // A clean session: this test's cards start in box 1 whatever earlier runs left behind.
    try {
      this.store?.update((doc) => {
        if (doc.cards) for (const id of this.allIds) delete doc.cards[id];
      });
    } catch {
      // Storage is blocked: the overlay below starts empty anyway.
    }
    this.#overlay = {};
    this.start();
    this.setState({});
    const initial = this.queue.length;
    // The session's own cards: a session takes at most SESSION_LIMIT, so a larger board (the shift's) is not all reviewed.
    const sessionIds = [...this.queue];
    if (initial === 0) return false;
    // A restored or fresh deck starts on a front, never on a back.
    if (this.state.reveal) return false;
    const first = this.queue[0];
    // Recall first: a self-graded front shows Show answer as the primary key and no back; Enter on the
    // front reveals it, as Space does.
    if (SELF_GRADED.has(this.cards.get(first).type)) {
      const show = this.ui.querySelector('[data-key="show"]');
      const front = this.ui.querySelector(".card-front");
      if (!show || !show.classList.contains("key-primary") || this.ui.querySelector(".card-back") || !front) return false;
      front.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      if (!this.state.reveal || !this.ui.querySelector(".card-back")) return false;
    }
    let missed = false;
    for (let steps = 0; !this.state.done; steps += 1) {
      if (steps > 100) return false;
      const id = this.currentId();
      const right = !(id === first && !missed);
      if (!right) missed = true;
      this.answerInUi(this.cards.get(id), right);
    }
    const s = this.state;
    if (s.reviewed !== initial + 1 || s.right !== initial || s.again !== 1) return false;
    const summary = this.ui.querySelector(".cards-summary")?.textContent ?? "";
    if (summary !== this.summaryText()) return false;
    const tomorrow = addDays(this.today, 1);
    return this.queueStart === initial
      && sessionIds.every((id) => {
        const card = stored(this.cardsNow(), id);
        return card && card.box === 2 && card.due === tomorrow;
      });
  }
}

customElements.define("hx-cards", HxCards);
