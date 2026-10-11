// hx-cacheline (BP-3.3 §4, C4): the request as blocks in the order they are sent, the prompt cache's accounting over
// several calls, and the silent invalidator. The accounting is the simulator's (ENGINE A6.5, sim/cache.js) and the
// prices are read by its resolver (sim/pricing.js): nothing here copies either. The course's model of prompt caching:
// one breakpoint at the end, exact prefix match.
//   <hx-cacheline src="data/cacheline-demo.json"></hx-cacheline>
// A block that changes on every call breaks the cache wherever it sits in the request. The fix it teaches is to stamp
// it into the new turn: its text, with that call's time, joins the newest message when the message is written, so the
// message becomes history and never changes again.
// Evidence: "cacheline" on each reorder that changes the hit rate, {order, hit_percent}; and on the invalidator pick,
// {order, hit_percent, pick, right}. Values: hit_percent, saving_percent (read-only).
import { HxElement } from "./lib/hx-element.js";
import { getFactsCore } from "./lib/data.js";
import { formatCost, formatInt, plural } from "./lib/format.js";
import { mountFacts } from "../core/shell/facts.js";
import { tokens } from "../sim/tokens.js";
import { pyjson } from "../sim/pyjson.js";
import { cacheAccount } from "../sim/cache.js";
import { resolvePricing } from "../sim/pricing.js";

const PART_RANK = { tools: 0, system: 1, messages: 2 };
const PART_WORD = { tools: "tools", system: "system", messages: "messages" };
const CHANGE_WORD = { never: "never changes", every_call: "changes every call", grows: "grows each call" };
const MODEL_LINE = "The course's model of prompt caching: one breakpoint at the end, exact prefix match.";
const EVERY_CALL_LINE = "A block that changes on every call breaks the cache wherever it sits in the request.";
let uidCount = 0;

const isPrefix = (a, b) => a.length <= b.length && a.every((text, i) => text === b[i]);

/** The stamp of call k: the stamped blocks' texts with that call's time. */
function stampOf(blocks, stamped) {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  return (k) => stamped.map((id) => byId.get(id).text.replaceAll("{t}", String(k))).join(" ");
}

/**
 * A block's texts in one call. {t} is the call number. A growing block is one message for its base text plus one
 * message per turn so far; each turn is written at its own call, so an appended turn leaves the earlier ones unchanged.
 */
export function blockTexts(block, call, stampFor = () => "") {
  if (block.changes === "every_call") return [block.text.replaceAll("{t}", String(call))];
  if (block.changes === "grows") {
    const turns = Array.from({ length: call }, (_, i) => {
      const k = i + 1;
      const stamp = stampFor(k);
      return `turn ${k}: ${block.turn_text ?? "a turn of history."}${stamp ? ` ${stamp}` : ""}`;
    });
    return [block.text, ...turns];
  }
  return [block.text];
}

/** The API's rule: the tools come before the system, the system before the messages; within a part, any order. */
export function validOrder(blocks, order, stamped = []) {
  const skip = new Set(stamped);
  const part = new Map(blocks.map((b) => [b.id, b.part]));
  let last = 0;
  for (const id of order) {
    if (skip.has(id)) continue;
    const rank = PART_RANK[part.get(id)];
    if (rank < last) return false;
    last = rank;
  }
  return true;
}

/** The three parts of one call's request (ENGINE A6.5). A stamped block is not a block of its own any more. */
export function requestParts(blocks, order, call, stamped = []) {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const skip = new Set(stamped);
  const stampFor = stampOf(blocks, stamped);
  const parts = { tools: [], system: [], messages: [] };
  for (const id of order) {
    if (skip.has(id)) continue;
    const block = byId.get(id);
    const texts = blockTexts(block, call, stampFor);
    if (block.part === "messages") parts.messages.push(...texts);
    else parts[block.part].push(...texts);
  }
  return { tools: parts.tools.join("\n"), system: parts.system.join("\n"), messages: parts.messages };
}

/**
 * The prefixes P(1) .. P(n) of a request, as A6.5 defines them: P(1) = {tools}, P(2) = {system, tools}, and
 * P(2 + j) = {system, tools, messages: the first j messages}. Each is keyed by its serialization, with its tokens.
 */
export function prefixesOf(parts) {
  const sets = [{ tools: parts.tools }, { system: parts.system, tools: parts.tools }];
  for (let j = 1; j <= parts.messages.length; j += 1) {
    sets.push({ system: parts.system, tools: parts.tools, messages: parts.messages.slice(0, j) });
  }
  return sets.map((set) => ({ key: pyjson(set), tokens: tokens(set) }));
}

/**
 * The cache over `calls` calls, `gap` ms apart. Costs are in nano-units (1 USD = 1e9): a price in milli-units per
 * million tokens times the tokens is already nano-units.
 */
export function simulateCalls({ blocks, order, calls, gap, rules, price, stamped = [] }) {
  const cache = new Map();
  const rows = [];
  for (let c = 1; c <= calls; c += 1) {
    const prefixes = prefixesOf(requestParts(blocks, order, c, stamped));
    const prompt = prefixes[prefixes.length - 1].tokens;
    const a = cacheAccount(cache, prefixes, prompt, c * gap, rules);
    rows.push({
      call: c,
      prompt,
      read: a.read,
      write: a.write,
      uncached: a.uncached,
      withCache: a.read * price.cache_read_milli + a.write * price.cache_write_milli + a.uncached * price.input_milli,
      without: prompt * price.input_milli,
    });
  }
  const sum = (key) => rows.reduce((n, r) => n + r[key], 0);
  const prompts = sum("prompt");
  const without = sum("without");
  return {
    rows,
    withCache: sum("withCache"),
    without,
    hit_percent: prompts === 0 ? 0 : Math.round((100 * sum("read")) / prompts),
    saving_percent: without === 0 ? 0 : Math.round((100 * (without - sum("withCache"))) / without),
  };
}

/** The first block (in the order sent) whose texts change between call 1 and call 2, or null. Growth is not a change. */
export function firstDiffering(blocks, order, stamped = []) {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const skip = new Set(stamped);
  const stampFor = stampOf(blocks, stamped);
  const id = order.find((x) => {
    if (skip.has(x)) return false;
    const block = byId.get(x);
    return !isPrefix(blockTexts(block, 1, stampFor), blockTexts(block, 2, stampFor));
  });
  return id ?? null;
}

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key === "text") node.textContent = value;
    else node.setAttribute(key, String(value));
  }
  node.append(...children);
  return node;
};

/** A price in USD per million tokens, from milli-units: "$2", "$2.50", "$0.10". Never rounded. */
const usd = (milli) => {
  const n = milli / 1000;
  if (Number.isInteger(n)) return `$${n}`;
  const [whole, frac = ""] = String(n).split(".");
  return `$${whole}.${frac.padEnd(2, "0")}`;
};

export class HxCacheline extends HxElement {
  static observedAttributes = ["src"];
  static styles = new URL("./hx-cacheline.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    if (!src) throw new Error("hx-cacheline needs src");
    const response = await fetch(new URL(src, document.baseURI));
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
    const data = await response.json();
    if (!Array.isArray(data.blocks) || data.blocks.length < 2) throw new Error("hx-cacheline: needs blocks");
    const ids = new Set();
    for (const b of data.blocks) {
      if (typeof b.id !== "string" || ids.has(b.id) || typeof b.text !== "string" || typeof b.label !== "string") {
        throw new Error(`hx-cacheline: block ${String(b?.id)} needs a unique id, a label and text`);
      }
      if (!(b.part in PART_RANK) || !(b.changes in CHANGE_WORD)) throw new Error(`hx-cacheline: ${b.id} has a bad part or changes`);
      ids.add(b.id);
    }
    const order = data.blocks.map((b) => b.id);
    if (!validOrder(data.blocks, order)) throw new Error("hx-cacheline: the blocks are not in the API's order");
    if (!data.cache_rules || !Number.isInteger(data.cache_rules.min_tokens) || !Number.isInteger(data.cache_rules.ttl_ms)) {
      throw new Error("hx-cacheline: cache_rules needs min_tokens and ttl_ms");
    }
    if (data.invalidator !== undefined && !ids.has(data.invalidator.block)) throw new Error("hx-cacheline: the invalidator names no block");
    this.facts = await getFactsCore();
    for (const id of Object.values(data.cache_rules.facts ?? {})) {
      if (!this.facts[id]) throw new Error(`hx-cacheline: unknown fact ${id}`);
    }
    this.price = resolvePricing(data.pricing, this.facts);
    if (!Number.isInteger(this.price.cache_read_milli) || !Number.isInteger(this.price.cache_write_milli)) {
      throw new Error("hx-cacheline: this price has no cache prices yet");
    }
    this.data = data;
    this.calls = data.calls ?? 6;
    this.gap = data.call_gap_ms ?? 30000;
    // A block that changes every call can be stamped into the new turn, when the request has a growing block to stamp into.
    const hasGrows = data.blocks.some((b) => b.changes === "grows");
    this.stampable = hasGrows ? data.blocks.find((b) => b.changes === "every_call") ?? null : null;
    this.uid = `hxc${++uidCount}`;
    this.state = { order, stamped: false, hunt: false, pick: null };
  }

  stampedIds() {
    return this.state.stamped && this.stampable ? [this.stampable.id] : [];
  }

  simulation() {
    return simulateCalls({
      blocks: this.data.blocks, order: this.state.order, calls: this.calls, gap: this.gap,
      rules: this.data.cache_rules, price: this.price, stamped: this.stampedIds(),
    });
  }

  /** The block moves one place, when the API's order allows it. */
  legal(id, delta) {
    const order = [...this.state.order];
    const index = order.indexOf(id);
    const to = index + delta;
    if (index < 0 || to < 0 || to >= order.length) return false;
    [order[index], order[to]] = [order[to], order[index]];
    return validOrder(this.data.blocks, order, this.stampedIds());
  }

  move(id, delta) {
    if (!this.legal(id, delta)) return;
    const order = [...this.state.order];
    const index = order.indexOf(id);
    [order[index], order[index + delta]] = [order[index + delta], order[index]];
    const before = this.simulation().hit_percent;
    this.setState({ order });
    const after = this.simulation().hit_percent;
    if (after !== before) this.evidence("cacheline", { order: [...order], hit_percent: after });
  }

  toggleStamp() {
    this.setState({ stamped: !this.state.stamped, pick: null });
  }

  toggleHunt() {
    this.setState({ hunt: !this.state.hunt, pick: null });
  }

  pickInvalidator(id) {
    if (this.state.pick !== null || !this.data.invalidator) return;
    const right = id === this.data.invalidator.block;
    this.setState({ pick: { block: id, right } });
    this.evidence("cacheline", { order: [...this.state.order], hit_percent: this.simulation().hit_percent, pick: id, right });
  }

  build() {
    const dom = { rows: {} };
    this.dom = dom;
    dom.line = el("p", { class: "cl-line", text: MODEL_LINE });
    dom.rule = el("p", { class: "cl-rule", text: EVERY_CALL_LINE });
    dom.rules = el("p", { class: "cl-rules" });
    dom.list = el("ol", { class: "cl-blocks" });
    for (const block of this.data.blocks) {
      const up = el("button", { class: "btn cl-move", type: "button", "aria-label": `Move ${block.label} up`, "data-key": `${block.id}-up`, text: "Move up" });
      const down = el("button", { class: "btn cl-move", type: "button", "aria-label": `Move ${block.label} down`, "data-key": `${block.id}-down`, text: "Move down" });
      up.addEventListener("click", () => this.move(block.id, -1));
      down.addEventListener("click", () => this.move(block.id, 1));
      const moves = el("div", { class: "cl-moves" }, up, down);
      const fixed = el("p", { class: "cl-fixed", text: "fixed: tools come first" });
      const pick = el("button", { class: "btn cl-pick", type: "button", "data-key": `${block.id}-pick`, text: "Pick this block" });
      pick.addEventListener("click", () => this.pickInvalidator(block.id));
      const pickWrap = el("div", { class: "cl-moves" }, pick);
      const state = el("p", { class: "cl-state" });
      const tokensEl = el("p", { class: "cl-tokens" });
      const row = el("li", { class: "cl-block" },
        el("p", { class: "cl-name", text: block.label }),
        el("p", { class: "cl-meta", text: `${PART_WORD[block.part]} · ${CHANGE_WORD[block.changes]}` }),
        tokensEl,
        state,
        moves,
        fixed,
        pickWrap);
      dom.rows[block.id] = { row, up, down, pick, moves, fixed, pickWrap, state, tokens: tokensEl, block };
    }
    dom.stamp = this.stampable
      ? el("button", { class: "btn cl-stamp", type: "button", "data-key": "stamp" })
      : null;
    if (dom.stamp) dom.stamp.addEventListener("click", () => this.toggleStamp());
    dom.stampState = el("p", { class: "cl-stamp-state" });
    dom.hunt = this.data.invalidator
      ? el("button", { class: "btn cl-hunt", type: "button", "aria-pressed": "false", "data-key": "hunt" })
      : null;
    if (dom.hunt) dom.hunt.addEventListener("click", () => this.toggleHunt());
    dom.hint = el("p", { class: "cl-hint" });
    dom.reveal = el("p", { class: "cl-reveal" });
    dom.calls = el("ol", { class: "cl-calls" });
    dom.hit = el("span", { class: "readout-value" });
    dom.saving = el("span", { class: "readout-value" });
    dom.totals = el("p", { class: "cl-totals" });
    this.ui.append(el("section", { class: "cl" },
      dom.line,
      dom.rule,
      el("div", { class: "cl-controls" }, ...[dom.stamp, dom.hunt].filter(Boolean)),
      dom.stamp ? dom.stampState : null,
      dom.hint,
      el("figure", { class: "plate instrument cl-plate" },
        el("figcaption", { class: "fig-label", text: "The request, in the order sent" }),
        dom.list),
      dom.rules,
      dom.reveal,
      el("div", { class: "cl-readouts" },
        el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Hit rate" }), dom.hit),
        el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Saving" }), dom.saving)),
      dom.totals,
      dom.calls));
  }

  render() {
    if (!this.dom) this.build();
    const { dom, state: s, data } = this;
    const sim = this.simulation();
    const stamped = this.stampedIds();
    const last = s.order.length - 1;
    const sizes = new Map(data.blocks.map((b) => [b.id, tokens(blockTexts(b, 1).join("\n"))]));
    s.order.forEach((id, index) => {
      const view = dom.rows[id];
      const isStamped = stamped.includes(id);
      view.tokens.textContent = isStamped ? "stamped, no tokens of its own" : `${formatInt(sizes.get(id))} tokens`;
      view.state.textContent = isStamped ? "Stamped into the new turn: the time is written into each new message." : "";
      view.state.hidden = !isStamped;
      view.moves.hidden = s.hunt || view.block.part === "tools";
      view.fixed.hidden = s.hunt || view.block.part !== "tools";
      view.pickWrap.hidden = !s.hunt;
      view.up.setAttribute("aria-disabled", String(isStamped || !this.legal(id, -1) || index === 0));
      view.down.setAttribute("aria-disabled", String(isStamped || !this.legal(id, 1) || index === last));
      view.pick.setAttribute("aria-disabled", String(s.pick !== null));
    });
    dom.list.replaceChildren(...s.order.map((id) => dom.rows[id].row));
    if (dom.stamp) {
      const isClock = /clock/i.test(this.stampable.label);
      const noun = isClock ? "the clock" : this.stampable.label.toLowerCase();
      const subject = isClock ? "The clock" : this.stampable.label;
      dom.stamp.textContent = s.stamped ? `Take ${noun} out of the new turn` : `Stamp ${noun} into the new turn`;
      dom.stamp.setAttribute("aria-pressed", String(s.stamped));
      dom.stampState.textContent = s.stamped
        ? `${subject} is stamped: its time joins each new message as it is written, so the message never changes again.`
        : `${subject} is a block of its own: it changes every call, so the cache breaks.`;
    }
    if (dom.hunt) {
      dom.hunt.textContent = s.hunt ? "Leave the hunt" : "Find the silent invalidator";
      dom.hunt.setAttribute("aria-pressed", String(s.hunt));
    }
    this.renderRules(dom);
    dom.hint.textContent = s.hunt ? "Pick the block you think breaks the cache. You get one pick." : "";
    dom.hint.hidden = !s.hunt;
    if (s.pick) {
      // The hunt is about the request as shipped: the first block that changes, whether or not it is stamped now.
      const diff = firstDiffering(data.blocks, s.order);
      const label = data.blocks.find((b) => b.id === diff)?.label;
      const why = diff === data.invalidator.block
        ? data.invalidator.why
        : "Nothing that changes between the calls is before this point in the request, so the cache can still read it.";
      const first = label
        ? `The first block that differs between call 1 and call 2 is ${label}.`
        : "No block differs between call 1 and call 2: the time is stamped into the new turn, and the history only grows.";
      dom.reveal.textContent = `${s.pick.right ? "Right." : "Not this one."} ${first} ${label ? why : ""}`.trim();
      dom.reveal.hidden = false;
      this.live(dom.reveal.textContent);
    } else {
      dom.reveal.textContent = "";
      dom.reveal.hidden = true;
    }
    dom.hit.textContent = `${sim.hit_percent}%`;
    dom.saving.textContent = `${sim.saving_percent}%`;
    dom.totals.textContent = `Over ${plural(this.calls, "call")}: ${formatCost(sim.withCache)} with the cache, ${formatCost(sim.without)} without it.`;
    dom.calls.replaceChildren(...sim.rows.map((r) => {
      const bar = el("div", { class: "cl-bar", "aria-hidden": "true" });
      for (const [key, value] of [["read", r.read], ["write", r.write], ["uncached", r.uncached]]) {
        if (value <= 0) continue;
        const seg = el("div", { class: `cl-seg is-${key}` });
        seg.style.width = `${(100 * value) / r.prompt}%`;
        bar.append(seg);
      }
      return el("li", { class: "cl-call" },
        el("p", { class: "cl-call-text", text: `Call ${r.call}: ${formatInt(r.prompt)} tokens, ${formatInt(r.read)} from cache, ${formatInt(r.write)} written, ${formatInt(r.uncached)} not cached. ${formatCost(r.withCache)} with the cache, ${formatCost(r.without)} without.` }),
        bar);
    }));
    mountFacts(this.facts, document);
  }

  /** One line under the figure: the price, the minimum and the TTL, each part backed by its fact (chip). */
  renderRules(dom) {
    const { cache_rules: rules } = this.data;
    const f = rules.facts ?? {};
    const p = this.price;
    dom.rules.replaceChildren(
      el("span", { text: `${rules.model_label}: ` }),
      el("span", { class: "fact", "data-fact": f.price, text: `input ${usd(p.input_milli)}, cache write ${usd(p.cache_write_milli)}, cache read ${usd(p.cache_read_milli)} per million tokens` }),
      el("span", { text: "; " }),
      el("span", { class: "fact", "data-fact": f.minimum, text: `prompts under ${formatInt(rules.min_tokens)} tokens are not cached` }),
      el("span", { text: "; " }),
      el("span", { class: "fact", "data-fact": f.ttl, text: `entries last ${formatInt(rules.ttl_ms / 60000)} minutes` }),
      el("span", { text: "." }));
  }

  hxValue(name) {
    const sim = this.simulation();
    if (name === "hit_percent") return sim.hit_percent;
    if (name === "saving_percent") return sim.saving_percent;
    return null;
  }

  hxRange() {
    return null;
  }

  async selfTest() {
    const saved = this.state;
    const inv = this.data.invalidator?.block ?? this.state.order[0];
    let evidence = 0;
    const count = (event) => {
      if (event.detail.kind === "cacheline") evidence += 1;
    };
    this.addEventListener("hx-evidence", count);
    try {
      this.setState({ order: this.data.blocks.map((b) => b.id), stamped: false, hunt: false, pick: null });
      const before = this.state.order.join(",");
      if (this.legal(inv, 1)) {
        this.dom.rows[inv].down.click();
        if (this.state.order.join(",") === before) return false;
        this.dom.rows[inv].up.click();
        if (this.state.order.join(",") !== before) return false;
      }
      if (this.stampable) {
        const plain = this.simulation().hit_percent;
        this.dom.stamp.click();
        if (!this.state.stamped) return false;
        if (this.simulation().hit_percent < plain) return false;
        this.dom.stamp.click();
      }
      if (this.data.invalidator) {
        this.dom.hunt.click();
        if (!this.state.hunt || this.dom.rows[inv].moves.hidden !== true) return false;
        this.dom.rows[inv].pick.click();
        if (!this.state.pick || this.state.pick.block !== inv || this.state.pick.right !== true) return false;
        if (!this.dom.reveal.textContent.includes("first block that differs")) return false;
        this.dom.hunt.click();
        if (this.dom.rows[inv].moves.hidden !== false) return false;
      }
      return evidence >= 1;
    } finally {
      this.removeEventListener("hx-evidence", count);
      this.restoreAfterTest(saved);
    }
  }
}

customElements.define("hx-cacheline", HxCacheline);
