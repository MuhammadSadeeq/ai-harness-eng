// hx-wire: the Wire View (BP-1.5 §3, SPEC §6.1). One turn of a run as the request and response the model saw:
// Friendly (cards with token counts) or Wire (the exact JSON). "Show what changed" diffs this turn's request
// against the previous turn's. Everything shown is derived in render() from the run and the UI state.
import { HxElement } from "./lib/hx-element.js";
import { getTape, getBoard, getFactsCore } from "./lib/data.js";
import { runTrial, tokens, pyjson } from "../sim/index.js";
import { diffRequest } from "./lib/wirediff.js";
import { formatInt, plural } from "./lib/format.js";
import { toolUseHits, toolsRange, foldTools } from "./lib/wire-hits.js";

const MARK_PLUS = "M12 5v14M5 12h14";
const MARK_BANG = "M12 4.5v10M12 19v.5";
// B-16: the message status keys (the classes are is-new, is-changed and is-breakpoint-moved).
const MESSAGE_STATUS = { added: "new", changed: "changed", "breakpoint moved": "breakpoint-moved" };
/** The status of one part of the request diff; null when there is no diff or the part did not change. */
const partStatus = (diff, part) => diff?.rows.find((r) => r.part === part)?.status ?? null;
/** A small status tag for a system or tool part; null for an unchanged part. */
function statusTag(status) {
  if (!status || status === "same") return null;
  const words = { added: "new this turn", changed: "changed", "breakpoint moved": "breakpoint moved", removed: "removed" };
  const tag = el("span", `wire-status wire-part-status is-${MESSAGE_STATUS[status] ?? status}`, words[status]);
  if (status === "added") tag.prepend(svgMark(MARK_PLUS));
  if (status === "changed") tag.prepend(svgMark(MARK_BANG));
  return tag;
}
const lines = (text, n) => String(text).split("\n").slice(0, n);

/** The text of a content value: a string, or the text blocks of a list. */
function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((b) => (b.type === "text" ? b.text : b.type === "tool_result" ? textOf(b.content) : "")).join("\n");
}

function svgMark(path) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "wire-mark");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", path);
  svg.append(p);
  return svg;
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The usage line in plain words. A response with cache fields names all of them, so a cached call reads as what it is:
 * "Usage: 0 input tokens, 653 written to the cache, 0 read from the cache, 53 output tokens." The JSON keeps the API names.
 */
export function usageWords(usage) {
  const parts = [`${formatInt(usage.input_tokens)} input tokens`];
  if ("cache_creation_input_tokens" in usage || "cache_read_input_tokens" in usage) {
    parts.push(`${formatInt(usage.cache_creation_input_tokens ?? 0)} written to the cache`);
    parts.push(`${formatInt(usage.cache_read_input_tokens ?? 0)} read from the cache`);
  }
  parts.push(`${formatInt(usage.output_tokens)} output tokens`);
  return `Usage: ${parts.join(", ")}.`;
}

export class HxWire extends HxElement {
  static observedAttributes = ["tape", "board", "seed", "turn", "mode", "diff"];
  static styles = new URL("./hx-wire.css", import.meta.url).href;

  async setup() {
    const tapeId = this.getAttribute("tape");
    if (!tapeId) throw new Error("hx-wire needs a tape attribute");
    this.tape = await getTape(tapeId);
    const boardId = this.getAttribute("board") ?? this.tape.boards[0];
    const seed = Number(this.getAttribute("seed") ?? this.tape.golden_seeds[0]);
    const board = await getBoard(boardId);
    const facts = await getFactsCore();
    const run = runTrial(this.tape, board, seed, { facts });
    this.wire = run.wire;
    this.turns = Math.floor(run.wire.length / 2);
    if (this.turns < 1) throw new Error("the run has no model turns");
    const turn = Math.min(this.turns, Math.max(1, Number(this.getAttribute("turn") ?? 1) || 1));
    this.state = {
      turn,
      view: this.getAttribute("mode") === "wire" ? "wire" : "friendly",
      diff: this.hasAttribute("diff"),
      showSystem: false,
      copied: null,
      hit: -1,
      toolsOpen: false,
      ver: 0,
    };
  }

  // ---------- values (COMPONENTS §10) ----------

  hxValue(name) {
    return name === "turn" ? this.state.turn : null;
  }

  hxRange(name) {
    return name === "turn" ? { min: 1, max: this.turns, step: 1 } : null;
  }

  hxSetValue(name, value) {
    if (name !== "turn") return;
    const turn = Math.min(this.turns, Math.max(1, Math.round(Number(value))));
    if (turn === this.state.turn) return;
    this.setState({ turn, hit: -1 });
    this.dispatchEvent(new CustomEvent("hx-change", { bubbles: true, detail: { name: "turn", value: turn } }));
  }

  // ---------- derived data ----------

  payloads(turn = this.state.turn) {
    const request = this.wire[2 * (turn - 1)];
    const response = this.wire[2 * (turn - 1) + 1];
    const previous = turn > 1 ? this.wire[2 * (turn - 2)] : null;
    return { request, response, previous };
  }

  promptTokens(request) {
    const messages = request.messages.reduce((sum, m) => sum + tokens(m), 0);
    return tokens(request.system) + tokens(request.tools) + messages;
  }

  // ---------- rendering ----------

  render() {
    const { request, response, previous } = this.payloads();
    const root = el("div", "wire-root");
    root.append(this.#controls());
    if (this.state.view === "wire") root.append(this.#wireView(request, response));
    else root.append(this.#friendly(request, response, previous));
    root.append(el("p", "wire-total", `Prompt: ${formatInt(this.promptTokens(request))} tokens of the ${formatInt(this.tape.window)}-token window.`));
    this.ui.replaceChildren(root);
  }

  #controls() {
    const row = el("div", "wire-controls");
    const stepper = el("div", "wire-stepper");
    const back = el("button", "key");
    back.type = "button";
    back.dataset.key = "turn-back";
    back.textContent = "Previous";
    back.setAttribute("aria-label", "Previous turn");
    back.disabled = this.state.turn <= 1;
    back.addEventListener("click", () => this.hxSetValue("turn", this.state.turn - 1));
    const forward = el("button", "key");
    forward.type = "button";
    forward.dataset.key = "turn-forward";
    forward.textContent = "Next";
    forward.setAttribute("aria-label", "Next turn");
    forward.disabled = this.state.turn >= this.turns;
    forward.addEventListener("click", () => this.hxSetValue("turn", this.state.turn + 1));
    stepper.append(back, el("p", "wire-turn", `Turn ${this.state.turn} of ${this.turns}`), forward);
    const toggles = el("div", "wire-toggles");
    for (const [key, label, view] of [["view-friendly", "Friendly", "friendly"], ["view-wire", "Wire", "wire"]]) {
      const b = el("button", "key", label);
      b.type = "button";
      b.dataset.key = key;
      b.setAttribute("aria-pressed", String(this.state.view === view));
      b.addEventListener("click", () => this.setState({ view }));
      toggles.append(b);
    }
    // Changes: Off | On. The diff attribute is On at load; the segment shows which one is on.
    const changes = el("div", "wire-changes");
    changes.setAttribute("role", "group");
    changes.setAttribute("aria-label", "Changes");
    changes.append(el("span", "wire-changes-label", "Changes:"));
    for (const [key, label, on] of [["changes-off", "Off", false], ["changes-on", "On", true]]) {
      const option = el("button", "key", label);
      option.type = "button";
      option.dataset.key = key;
      option.setAttribute("aria-pressed", String(this.state.diff === on));
      option.addEventListener("click", () => this.setState({ diff: on }));
      changes.append(option);
    }
    toggles.append(changes);
    row.append(stepper, toggles);
    return row;
  }

  #block(block) {
    const item = el("li", `wire-block wire-block-${block.type ?? "other"}`);
    if (block.type === "text") item.append(el("p", "wire-text", block.text));
    else if (block.type === "tool_use") {
      item.append(el("p", "wire-tool", `Tool call: ${block.name}`));
      item.append(el("pre", "wire-code", pyjson(block.input ?? {})));
    } else if (block.type === "tool_result") {
      item.append(el("p", "wire-tool", `Answers ${block.tool_use_id}`));
      if (block.is_error) {
        const mark = el("p", "wire-error");
        mark.append(svgMark(MARK_BANG), el("span", null, "error"));
        item.append(mark);
      }
      item.append(el("pre", "wire-code", lines(textOf(block.content), 3).join("\n")));
    } else item.append(el("p", "wire-text", `${block.type ?? "block"}`));
    return item;
  }

  #message(message, index, status) {
    const card = el("li", `wire-message${status ? ` is-${status}` : ""}`);
    card.dataset.index = String(index);
    const head = el("p", "wire-message-head");
    if (status === "new") head.append(svgMark(MARK_PLUS), el("span", "wire-status", "new this turn"));
    if (status === "changed") head.append(svgMark(MARK_BANG), el("span", "wire-status", "changed"));
    if (status === "breakpoint-moved") head.append(el("span", "wire-status", "breakpoint moved"));
    head.append(el("span", "wire-role", message.role), el("span", "wire-tokens", `${formatInt(tokens(message))} tokens`));
    card.append(head);
    const blocks = typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content ?? [];
    const list = el("ul", "wire-blocks");
    for (const block of blocks) list.append(this.#block(block));
    card.append(list);
    return card;
  }

  #friendly(request, response, previous) {
    const wrap = el("div", "wire-friendly");
    const reqSection = el("section", "wire-request");
    reqSection.append(el("h3", null, "Request"));
    // B-16: with Changes on, every part of the request (system, each tool, each message) carries its own status.
    const diff = this.state.diff && previous ? diffRequest(previous, request) : null;
    const system = el("section", "wire-system");
    const sysLines = String(request.system ?? "").split("\n");
    const shown = this.state.showSystem ? sysLines : sysLines.slice(0, 3);
    const sysHead = el("h4", null, `System · ${formatInt(tokens(request.system))} tokens`);
    const sysTag = statusTag(partStatus(diff, "system"));
    if (sysTag) sysHead.append(" ", sysTag);
    system.append(sysHead);
    system.append(el("pre", "wire-code", shown.join("\n")));
    if (sysLines.length > 3) {
      const toggle = el("button", "key", this.state.showSystem ? "Show less" : "Show all");
      toggle.type = "button";
      toggle.dataset.key = "system-toggle";
      toggle.addEventListener("click", () => this.setState({ showSystem: !this.state.showSystem }));
      system.append(toggle);
    }
    reqSection.append(system);
    const tools = el("section", "wire-tools");
    tools.append(el("h4", null, `Tools · ${plural(request.tools.length, "tool", "tools")} · ${formatInt(tokens(request.tools))} tokens`));
    const names = el("ul", "wire-tool-names");
    request.tools.forEach((tool, i) => {
      const item = el("li", null, tool.name);
      const tag = statusTag(partStatus(diff, `tools[${i}]`));
      if (tag) item.append(" ", tag);
      names.append(item);
    });
    const toolsRemoved = diff ? diff.rows.filter((r) => r.part.startsWith("tools[") && r.status === "removed").length : 0;
    if (toolsRemoved > 0) names.append(el("li", "wire-removed", `${plural(toolsRemoved, "tool", "tools")} removed`));
    tools.append(names);
    reqSection.append(tools);
    reqSection.append(this.#messages(request, previous, diff));
    wrap.append(reqSection);
    wrap.append(this.#response(response));
    return wrap;
  }

  #messages(request, previous, diff) {
    const section = el("section", "wire-messages");
    section.append(el("h4", null, `Messages · ${plural(request.messages.length, "message", "messages")}`));
    const list = el("ol", "wire-message-list");
    if (!this.state.diff) {
      request.messages.forEach((m, i) => list.append(this.#message(m, i, null)));
    } else if (!previous) {
      section.append(el("p", "wire-first", "Turn 1: everything is new."));
      request.messages.forEach((m, i) => list.append(this.#message(m, i, null)));
    } else {
      // B-16: the message parts of the request diff, in request order. Leading unchanged messages collapse.
      const rows = diff.rows.filter((r) => r.part.startsWith("messages["));
      let unchanged = 0;
      let leading = true;
      const shown = [];
      for (const row of rows) {
        if (row.status === "removed") continue;
        if (row.status === "same" && leading) {
          unchanged += 1;
          continue;
        }
        if (row.status !== "same") leading = false;
        shown.push({ index: Number(row.part.slice("messages[".length, -1)), status: row.status });
      }
      const removed = rows.filter((r) => r.status === "removed").length;
      if (unchanged > 0) list.append(el("li", "wire-unchanged", `${plural(unchanged, "message", "messages")} unchanged`));
      for (const { index, status } of shown) list.append(this.#message(request.messages[index], index, MESSAGE_STATUS[status] ?? null));
      if (removed > 0) list.append(el("li", "wire-removed", `${plural(removed, "message", "messages")} removed`));
    }
    section.append(list);
    return section;
  }

  #response(response) {
    const section = el("section", "wire-response");
    section.append(el("h3", null, "Response"));
    section.append(el("p", "wire-stop", `Stop reason: ${response.stop_reason}`));
    const list = el("ul", "wire-blocks");
    for (const block of response.content ?? []) list.append(this.#block(block));
    section.append(list);
    section.append(el("p", "wire-usage", usageWords(response.usage)));
    return section;
  }

  #wireView(request, response) {
    const wrap = el("div", "wire-json");
    const texts = { request: JSON.stringify(request, null, 2), response: JSON.stringify(response, null, 2) };
    const hits = toolUseHits(texts.request, texts.response);
    const hit = hits.length > 0 && this.state.hit >= 0 ? hits[this.state.hit % hits.length] : null;
    wrap.append(this.#hitRow(hits, hit));
    // B2 round 3: the request's tools are one line by default, so the messages sit near the top of the box.
    const range = toolsRange(texts.request);
    const label = `${plural(request.tools.length, "definition", "definitions")}, ≈ ${formatInt(tokens(request.tools))} tokens`;
    const fold = range && !this.state.toolsOpen ? foldTools(texts.request, range, label) : null;
    for (const [name, payload] of [["request", request], ["response", response]]) {
      const section = el("section", "wire-json-part");
      section.append(el("h3", null, name === "request" ? "Request" : "Response"));
      const text = texts[name];
      const region = el("div", "wire-json-scroll");
      region.setAttribute("role", "region");
      region.setAttribute("tabindex", "0");
      region.setAttribute("aria-label", `${name === "request" ? "Request" : "Response"} JSON, turn ${this.state.turn}`);
      if (name === "request" && range) section.append(this.#toolsToggle(this.state.toolsOpen));
      region.append(this.#pre(text, hit, name, name === "request" ? fold : null));
      const copy = el("button", "key", this.state.copied === name ? "Copied" : "Copy");
      copy.type = "button";
      copy.dataset.key = `copy-${name}`;
      copy.addEventListener("click", () => this.#copy(name, text));
      section.append(copy, region);
      wrap.append(section);
    }
    return wrap;
  }

  /** The Next tool_use_id key and its status words (Wire view only). */
  #hitRow(hits, hit) {
    const row = el("div", "wire-hit-row");
    const next = el("button", "key", "Next tool_use_id");
    next.type = "button";
    next.dataset.key = "next-tool-use";
    next.disabled = hits.length === 0;
    next.addEventListener("click", () => this.#nextHit(hits.length));
    const words = hits.length === 0
      ? "No tool_use_id in this turn."
      : hit === null
        ? `${plural(hits.length, "tool_use_id", "tool_use_ids")} in this turn. Press Next to find each one.`
        : hit.kind === "answers"
          ? `tool_use_id ${this.state.hit % hits.length + 1} of ${hits.length}: result for ${hit.id}${hit.callLine >= 0 ? `, answered by the call on line ${hit.callLine + 1} of the request` : ""}.`
          : `tool_use_id ${this.state.hit % hits.length + 1} of ${hits.length}: call ${hit.id} in the response.`;
    row.append(next, el("p", "wire-hit-status", words));
    return row;
  }

  #nextHit(count) {
    if (count === 0) return;
    const hit = (this.state.hit + 1) % count;
    this.setState({ hit });
    this.live(this.ui?.querySelector(".wire-hit-status")?.textContent ?? "");
    // The answer (the last highlighted line) is the one the learner is looking for; bring it into view.
    const marks = this.ui?.querySelectorAll(".wire-json-scroll .wire-hit");
    marks?.[marks.length - 1]?.scrollIntoView({ block: "nearest" });
  }

  /** Shows or hides the request's tools array (Wire view only). */
  #toolsToggle(open) {
    const button = el("button", "key", open ? "Hide tools" : "Show tools");
    button.type = "button";
    button.dataset.key = "toggle-tools";
    button.setAttribute("aria-expanded", String(open));
    button.addEventListener("click", () => this.setState({ toolsOpen: !this.state.toolsOpen }));
    return button;
  }

  /** The JSON text, folded where asked, with the highlighted lines wrapped. Hit lines are full-text indices. */
  #pre(text, hit, part, fold = null) {
    const pre = el("pre", "wire-code");
    const lines = fold ? fold.lines : text.split("\n");
    const at = (full) => (fold ? fold.map[full] : full);
    if (hit === null) {
      pre.textContent = lines.join("\n");
      return pre;
    }
    const mark = new Set();
    const add = (full) => {
      const shown = at(full);
      if (shown !== undefined && shown >= 0) mark.add(shown);
    };
    if (hit.kind === "answers" && part === "request") {
      add(hit.line);
      if (hit.callLine >= 0) add(hit.callLine);
    } else if (hit.kind === "calls" && part === "response") {
      add(hit.line);
    }
    lines.forEach((line, i) => {
      if (i > 0) pre.append("\n");
      if (mark.has(i)) {
        const span = el("span", "wire-hit", line);
        span.dataset.line = String(i);
        pre.append(span);
      } else pre.append(line);
    });
    return pre;
  }

  #copy(name, text) {
    globalThis.navigator?.clipboard?.writeText?.(text).catch(() => {});
    this.setState({ copied: name });
    this.live("Copied");
    setTimeout(() => {
      if (this.state.copied === name) this.setState({ copied: null });
    }, 2000);
  }

  // ---------- self test (COMPONENTS §7) ----------

  async selfTest() {
    const saved = { view: this.state.view, diff: this.state.diff, turn: this.state.turn };
    try {
      return this.#runSelfTest();
    } finally {
      this.setState({ view: saved.view, diff: saved.diff, turn: saved.turn });
    }
  }

  #runSelfTest() {
    this.setState({ view: "friendly", diff: false });
    const turn = Math.min(3, this.turns);
    this.hxSetValue("turn", turn);
    const { request } = this.payloads(turn);
    const shown = this.ui?.querySelectorAll(".wire-message").length ?? 0;
    if (shown !== request.messages.length) return false;
    this.ui?.querySelector('[data-key="view-wire"]')?.click();
    // Folded by default: the tools are one line, and the messages are still in the box.
    const folded = this.ui?.querySelector(".wire-json-scroll pre")?.textContent ?? "";
    if (!folded.includes("definitions") || folded.includes(request.tools[0].description)) return false;
    // Shown on the key: the whole request is the JSON again. Then hidden, the default.
    this.ui?.querySelector('[data-key="toggle-tools"]')?.click();
    const pre = this.ui?.querySelector(".wire-json-scroll pre");
    if (!pre || JSON.stringify(JSON.parse(pre.textContent)) !== JSON.stringify(request)) return false;
    this.ui?.querySelector('[data-key="toggle-tools"]')?.click();
    // The key cycles and wraps: after the last tool_use_id it starts again at the first.
    this.ui?.querySelector('[data-key="view-wire"]')?.click();
    const count = toolUseHits(JSON.stringify(request, null, 2), JSON.stringify(this.payloads(turn).response, null, 2)).length;
    if (count > 0) {
      for (let k = 0; k < count + 1; k += 1) this.ui?.querySelector('[data-key="next-tool-use"]')?.click();
      if (this.state.hit !== 0) return false;
      if (!this.ui?.querySelector(".wire-json-scroll .wire-hit")) return false;
    }
    this.ui?.querySelector('[data-key="view-friendly"]')?.click();
    this.ui?.querySelector('[data-key="changes-on"]')?.click();
    const news = this.ui?.querySelectorAll(".wire-message.is-new").length ?? 0;
    const previous = this.wire[2 * (turn - 2)];
    const expected = diffRequest(previous, request).rows.filter((r) => r.part.startsWith("messages[") && r.status === "added").length;
    return news === expected;
  }
}

customElements.define("hx-wire", HxWire);
