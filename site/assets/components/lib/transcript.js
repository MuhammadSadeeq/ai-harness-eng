// The transcript and the lane strip, shared by hx-replay and hx-incident (BP-1.4 §2).
// Pure functions first (Node-testable); DOM builders below them run only when called.
import { pyjson } from "../../sim/index.js";
import { explain } from "./explain.js";

const SPRITE_URL = new URL("../../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
let spriteReady = null;

// The eight wires in turn order (DESIGN §3); the same ids, names and glyphs as course.json `wires`.
export const WIRES = Object.freeze([
  { id: "control", short: "Control", name: "Control plane", glyph: "layers" },
  { id: "context", short: "Context", name: "Context & memory", glyph: "window" },
  { id: "loop", short: "Loop", name: "Loop & state", glyph: "cycle" },
  { id: "errors", short: "Errors", name: "Errors & recovery", glyph: "zigzag" },
  { id: "tools", short: "Tools", name: "Tools", glyph: "hexagon" },
  { id: "permissions", short: "Permissions", name: "Permissions & sandbox", glyph: "diamond" },
  { id: "verify", short: "Verification", name: "Verification & evals", glyph: "shield" },
  { id: "observe", short: "Observability", name: "Observability", glyph: "eye" },
]);

// Events that the story view leaves out of the transcript (they still mark the lanes).
const STORY_HIDDEN = new Set(["prompt_built", "model_call", "recovery_check", "trace_write"]);

/** Transcript rows for an event list: [{index, event}]. detail "story" (default) or "full". */
export function rows(events, { detail = "story" } = {}) {
  const out = [];
  events.forEach((event, index) => {
    if (detail === "story") {
      if (STORY_HIDDEN.has(event.kind)) return;
      if (event.kind === "context_check" && event.action !== "overflow") return;
    }
    out.push({ index, event });
  });
  return out;
}

/** Event indexes the replay can step to: the transcript rows, filtered to one wire when given. */
export function visibleIndexes(events, { detail = "story", wire = null } = {}) {
  return rows(events, { detail })
    .filter((r) => wire === null || r.event.wire === wire)
    .map((r) => r.index);
}

/** For each event: for a tool_call, the turn of the first earlier identical call (tool + pyjson(input)); else null. */
export function repeats(events) {
  const first = new Map();
  return events.map((e) => {
    if (e.kind !== "tool_call") return null;
    const key = `${e.tool} ${pyjson(e.input)}`;
    if (!first.has(key)) {
      first.set(key, e.turn);
      return null;
    }
    return first.get(key);
  });
}

/** The glyph id of an event (DESIGN §4). */
export function eventGlyph(e) {
  switch (e.kind) {
    case "run_start": return "g-play";
    case "run_end": return e.status === "done" ? "g-flag-filled" : "g-flag";
    case "prompt_built": return "g-layers";
    case "context_check": return "g-window";
    case "model_call": return "g-box";
    case "model_reply": return "g-box-filled";
    case "model_error": return "g-zigzag";
    case "retry_wait": return "g-hourglass";
    case "breaker": return "g-switch-open";
    case "recovery_check": return "g-zigzag";
    case "tool_call": return e.ok ? "g-hexagon" : "g-hexagon-fail";
    case "permission": return e.decision === "allow" ? "g-permission-allow" : e.decision === "deny" ? "g-permission-deny" : "g-permission-ask";
    case "sandbox": return "g-sandbox";
    case "verify": return e.passed ? "g-shield-pass" : "g-shield-fail";
    case "guard": return "g-noentry";
    case "interrupt": return "g-pause";
    case "trace_write": return "g-eye";
    default: return "g-bang";
  }
}

/** Lane position of event `index` among `n` events: 0 at the first, 1 at the last. */
export function frac(index, n) {
  return n > 1 ? index / (n - 1) : 0;
}

/** The first event index of each turn, for the faint turn rules: [{index, turn}]. */
export function turnStarts(events) {
  const out = [];
  let last = null;
  events.forEach((e, index) => {
    if (e.turn !== last) out.push({ index, turn: e.turn });
    last = e.turn;
  });
  return out;
}

/**
 * The turn labels of the lane axis: [{index, turn, x}] for turns from 1 (turn 0 is the run start, with no
 * label). Every turn up to 8 is labelled; past that, every k-th turn, so the labels thin as runs grow.
 */
export function axisTurns(events) {
  const starts = turnStarts(events).filter((s) => s.turn >= 1);
  const step = Math.max(1, Math.ceil(starts.length / 8));
  const n = events.length;
  return starts
    .filter((s) => s.turn === 1 || s.turn % step === 0)
    .map((s) => ({ index: s.index, turn: s.turn, x: frac(s.index, n) }));
}

/** JSON with keys sorted at every depth (the Wire view). */
export function sortedJson(x) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v !== null && typeof v === "object") {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]));
    }
    return v;
  };
  return JSON.stringify(sort(x), null, 2);
}

/** A tool input as compact JSON (no spaces), keys in the order the tape gave them. */
export function compactJson(x) {
  return JSON.stringify(x);
}

/** The result of a tool, cut to its first six lines for a card. */
export function cardLines(output, limit = 6) {
  const lines = String(output ?? "").split("\n");
  return { shown: lines.slice(0, limit).join("\n"), more: lines.length > limit, total: lines.length };
}

// ---------- DOM builders (run in a browser only) ----------

/** Creates an element; `text` sets its text, `class` its class, other attributes are set as given. */
export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "text") node.textContent = v;
    else if (k === "class") node.className = v;
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  node.append(...kids.filter((k) => k !== null && k !== undefined));
  return node;
}

/**
 * Copies the glyph symbols into one hidden sprite in the page, once. A <use> that points at the page is far
 * cheaper to restyle than one that points into a file (replay steps restyle many marks).
 */
export function ensureSprite() {
  if (!spriteReady) {
    spriteReady = (async () => {
      if (document.getElementById("hx-glyph-sprite")) return true;
      const text = await (await fetch(SPRITE_URL)).text();
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("id", "hx-glyph-sprite");
      svg.setAttribute("class", "hx-sprite");
      svg.setAttribute("aria-hidden", "true");
      for (const symbol of doc.querySelectorAll("symbol")) svg.append(document.importNode(symbol, true));
      document.body.append(svg);
      return true;
    })();
  }
  return spriteReady;
}

/** An instrument glyph: the sprite symbol, at the size the class sets (DESIGN §4). */
export function glyph(id, cls = "glyph") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#${id}`);
  svg.append(use);
  return svg;
}

const wireOf = (id) => WIRES.find((w) => w.id === id);

/** One transcript row's body (the quote, the card, or the one-line harness sentence). */
function rowBody(event, expanded) {
  const text = explain(event).text;
  if (event.kind === "model_reply" && event.text) {
    return { body: el("blockquote", { class: "ev-text quote", text: `“${event.text}”` }), callout: text };
  }
  if (event.kind === "tool_call") {
    const card = cardLines(event.output);
    const shown = expanded ? String(event.output ?? "") : card.shown;
    const head = el("span", { class: "label", text: event.ok ? "Tool ran" : "Tool failed" });
    const call = el("span", { class: "ev-tool", text: `${event.tool}(${compactJson(event.input)})` });
    const out = el("span", { class: "ev-out", text: shown });
    return { body: el("span", { class: "ev-card" }, head, call, out), callout: text, more: card.more && !expanded };
  }
  return { body: el("span", { class: "ev-meta", text }), callout: null };
}

/**
 * The transcript list: one <li> per visible row. opts:
 *   events, detail, wire, expanded (Set of indexes), repeatMap (from repeats()), pickable (rows are buttons:
 *   the incident hunt), onPick(index), onExpand(index), marks (Map index -> {kind, word}),
 *   feedback (Map index -> [lines], shown under that row: the hunt's answers), callouts (the explanation under
 *   quote and card rows, shown when the row is current), locked.
 */
export function transcriptList(opts) {
  const { events, detail = "story", wire = null, expanded = new Set(), repeatMap = [], pickable = false, marks = new Map(), feedback = new Map(), callouts = true, locked = false } = opts;
  const list = el("ol", { class: "transcript", "aria-label": "Transcript" });
  const rowsByIndex = new Map();
  const picks = [];
  for (const { index, event } of rows(events, { detail }).filter((r) => wire === null || r.event.wire === wire)) {
    const w = wireOf(event.wire);
    const { body, callout, more } = rowBody(event, expanded.has(index));
    const seen = repeatMap[index] !== null && repeatMap[index] !== undefined
      ? el("span", { class: "ev-seen", text: `seen at turn ${repeatMap[index]}` })
      : null;
    const head = el("span", { class: "ev-line" }, glyph(eventGlyph(event)), body, seen);
    const mark = marks.get(index);
    const markEl = mark ? el("span", { class: `ev-mark is-${mark.kind}`, text: mark.word }) : null;
    let main;
    if (pickable) {
      main = el("button", { class: "ev-main", type: "button", "data-key": `row-${index}`, "data-index": index, tabindex: "-1", disabled: locked || null, "aria-label": `${w?.name ?? event.wire}: ${explain(event).text}` }, head);
      main.addEventListener("click", () => opts.onPick?.(index));
      picks.push(main);
    } else {
      main = el("div", { class: "ev-main", "data-index": index }, head);
    }
    const moreEl = more
      ? el("button", { class: "ev-more", type: "button", "aria-expanded": expanded.has(index) ? "true" : "false", text: expanded.has(index) ? "Show less" : "Show all" })
      : null;
    if (moreEl) moreEl.addEventListener("click", () => opts.onExpand?.(index));
    const callEl = callouts && callout ? el("p", { class: "ev-callout", text: callout }) : null;
    const lines = feedback.get(index) ?? [];
    const feedEl = lines.length > 0
      ? el("div", { class: "hunt-feedback", role: "status" }, ...lines.map((line) => el("p", { class: "hunt-line", text: line })))
      : null;
    const li = el("li", { class: `ev w-${event.wire}`, "data-index": index, "data-wire": event.wire }, main, moreEl, feedEl, callEl, markEl);
    rowsByIndex.set(index, li);
    list.append(li);
  }
  list.rowsByIndex = rowsByIndex;
  list.picks = picks;
  return list;
}

/** Marks the current row (replay). Only the previous and the new row change. */
export function setCurrentRow(list, index) {
  if (list.current !== undefined && list.current !== index) {
    list.rowsByIndex.get(list.current)?.classList.remove("is-current");
  }
  list.current = index;
  const target = list.rowsByIndex.get(index) ?? null;
  target?.classList.add("is-current");
  return target;
}

/**
 * The 8-lane strip (DESIGN §3, §7.2). Returns a wrapper with two parts side by side: `labelsCol` (one tag per
 * wire: a glyph, and on desktop a button with the wire's name when `labels` is true, so the wire filter works)
 * and `strip`, the track area that holds the marks, the turn rules and the playhead. The strip is the scrubber,
 * so it never contains a focusable control.
 */
export function laneStrip({ events, wires = WIRES, compact = false, labels = false, onWire = null, onPick = null }) {
  const n = events.length;
  const wrap = el("div", { class: `lanes-wrap ${compact ? "lanes-compact" : "lanes-full"}` });
  const strip = el("div", { class: "lanes", "data-n": n });
  const labelsCol = el("div", { class: "lane-labels" });
  labelsCol.append(el("div", { class: "lane-axis-spacer", "aria-hidden": "true" }));
  strip.marks = new Map();
  strip.lanes = new Map();
  const axis = el("div", { class: "lane-axis", "aria-hidden": "true" });
  for (const { index, turn } of turnStarts(events)) {
    const rule = el("span", { class: "turn-rule", "data-turn": turn, "aria-hidden": "true" });
    rule.style.setProperty("--x", frac(index, n));
    strip.append(rule);
  }
  for (const t of axisTurns(events)) {
    const label = el("span", { class: "turn-num", "data-x": String(t.x), text: String(t.turn) });
    label.style.setProperty("--x", t.x);
    axis.append(label);
  }
  strip.append(axis);
  for (const w of wires) {
    const used = events.some((e) => e.wire === w.id);
    const track = el("div", { class: `lane w-${w.id}${used ? "" : " is-empty"}`, "data-lane": w.id });
    events.forEach((e, index) => {
      if (e.wire !== w.id) return;
      const mark = el("span", { class: "mark", "data-index": index }, glyph(eventGlyph(e)));
      mark.style.setProperty("--x", frac(index, n));
      strip.marks.set(index, mark);
      track.append(mark);
    });
    strip.lanes.set(w.id, track);
    strip.append(track);
    const glyphEl = glyph(`g-${w.glyph}`, "glyph lane-glyph");
    const tag = el("div", { class: `lane-tag w-${w.id}${labels ? " has-button" : ""}` }, glyphEl);
    if (labels) {
      const button = el("button", { class: "lane-label", type: "button", "aria-pressed": "false", "data-wire": w.id, title: w.name }, glyph(`g-${w.glyph}`, "glyph"), el("span", { text: w.short }));
      button.addEventListener("click", () => onWire?.(w.id));
      tag.append(button);
    }
    labelsCol.append(tag);
  }
  strip.append(el("span", { class: "playhead", "aria-hidden": "true" }));
  if (onPick && n > 0) {
    strip.addEventListener("pointerdown", (ev) => onPick(nearestIndex(strip, ev.clientX, n)));
  }
  wrap.strip = strip;
  wrap.labelsCol = labelsCol;
  wrap.append(labelsCol, strip);
  return wrap;
}

/**
 * Hides the turn labels that would touch (closer than 22 px) so none overlaps at any width. Reads the layout,
 * so call it on build and on resize, not on every step.
 */
export function fitAxis(strip) {
  const width = strip.clientWidth || 0;
  let lastX = -Infinity;
  for (const label of strip.querySelectorAll(".turn-num")) {
    label.hidden = false;
    const x = 14 + (width - 28) * Number(label.dataset.x);
    if (x - lastX < 22) label.hidden = true;
    else lastX = x;
  }
}

/** The nearest event index to a pointer x inside a strip (the whole strip is one scrubber). */
export function nearestIndex(strip, clientX, n) {
  const box = strip.getBoundingClientRect();
  const f = box.width > 0 ? Math.min(1, Math.max(0, (clientX - box.left) / box.width)) : 0;
  return Math.round(f * (n - 1));
}

/** Moves the playhead of a strip to event `index`, and marks that mark as current. */
export function setPlayhead(strip, index) {
  const n = Number(strip.dataset.n);
  if (strip.current !== undefined && strip.current !== index) {
    strip.marks.get(strip.current)?.classList.remove("is-current");
  }
  strip.current = index;
  strip.marks.get(index)?.classList.add("is-current");
  const head = strip.querySelector(".playhead");
  if (head) head.style.left = `calc(14px + (100% - 28px) * ${frac(index, n)})`;
}

