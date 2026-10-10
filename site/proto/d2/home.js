// Home: the Harness Board as a specimen plate (a Turn Clock on wide screens, a turn-ordered list
// on narrow ones) and the contents table with check marks. Static HTML is the no-JS fallback.
import { WIRES, PARTS, PROGRESS, SOCKETS, PLUGGED } from "./data.js";
import { el, svgEl, glyph } from "./common.js";

const CLOCK_MIN_WIDTH = 640;
const RING = 124;   // radius of the rim (px)
const LABEL_GAP = 38;

const done = new Set(PROGRESS.done);
const current = PROGRESS.current;

/** Socket text for one wire: what is plugged, or what comes in later. */
function socketState(wire) {
  const plugged = PLUGGED[wire.id];
  if (plugged) return { kind: "plugged", id: plugged.id, title: plugged.title };
  const empty = SOCKETS[wire.id];
  return empty ? { kind: "empty", id: empty.id, title: empty.title } : { kind: "none" };
}

function drawClock(width) {
  const height = 500;
  const cx = width / 2;
  const cy = height / 2;
  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`, width, height, class: "clock-svg",
    role: "img", "aria-labelledby": "plate-title plate-desc",
  });
  svg.append(svgEl("title", { id: "plate-title" }));
  svg.querySelector("title").textContent = "The Harness Board: eight wires as spokes of a Turn Clock";
  const desc = svgEl("desc", { id: "plate-desc" });
  desc.textContent = "Spokes run in turn order from 12 o'clock. Plugged modules sit on their spokes; empty spokes say what comes in later.";
  svg.append(desc);
  // face: rim and ticks
  svg.append(svgEl("circle", { cx, cy, r: RING + 6, fill: "none", stroke: "#E6E3DC", "stroke-width": 1 }));
  for (let i = 0; i < 12; i += 1) {
    const a = (i * 30 * Math.PI) / 180;
    svg.append(svgEl("line", {
      x1: cx + (RING + 6) * Math.sin(a), y1: cy - (RING + 6) * Math.cos(a),
      x2: cx + (RING + 12) * Math.sin(a), y2: cy - (RING + 12) * Math.cos(a),
      stroke: "#E6E3DC", "stroke-width": 1,
    }));
  }
  // spokes
  for (const wire of WIRES) {
    const state = socketState(wire);
    const a = (wire.angle * Math.PI) / 180;
    const sx = Math.sin(a);
    const sy = -Math.cos(a);
    const isEmpty = state.kind === "empty";
    const dim = wire.id === "context";
    const g = svgEl("g", { class: `spoke spoke-${wire.id}`, opacity: dim ? 0.55 : isEmpty ? 0.5 : 1 });
    const spoke = svgEl("line", {
      x1: cx + 24 * sx, y1: cy + 24 * sy, x2: cx + RING * sx, y2: cy + RING * sy,
      stroke: wire.color, "stroke-width": wire.width,
      "stroke-linecap": wire.round ? "round" : "butt",
    });
    if (wire.dash) spoke.setAttribute("stroke-dasharray", wire.dash);
    g.append(spoke);
    // rim disc with the wire glyph
    g.append(svgEl("circle", {
      cx: cx + RING * sx, cy: cy + RING * sy, r: 20, fill: "#FFFFFF", stroke: wire.color,
      "stroke-width": 2, "stroke-dasharray": isEmpty ? "3 3" : null,
    }));
    const gx = cx + RING * sx - 11;
    const gy = cy + RING * sy - 11;
    for (const d of glyphPaths(wire.glyph)) {
      g.append(svgEl("path", {
        d, transform: `translate(${gx} ${gy}) scale(0.92)`, fill: "none", stroke: wire.color,
        "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round",
      }));
    }
    // a small labeled tag on the spoke for plugged modules
    if (state.kind === "plugged") {
      const tx = cx + RING * 0.7 * sx;
      const ty = cy + RING * 0.7 * sy;
      const label = `${state.id} · ${state.title.split(" ")[0]}`;
      const w = label.length * 7.6 + 20;
      g.append(svgEl("rect", {
        x: tx - w / 2, y: ty - 13, width: w, height: 26, rx: 13,
        fill: "#FFFFFF", stroke: wire.color, "stroke-width": 1.5,
      }));
      const t = svgEl("text", { x: tx, y: ty + 5, "text-anchor": "middle", class: "tag-sub", fill: "#1B1B1B" });
      t.textContent = label;
      g.append(t);
    }
    svg.append(g);
    // label block at the rim
    const lr = RING + LABEL_GAP;
    const px = cx + lr * sx;
    const py = cy + lr * sy;
    const anchor = Math.abs(sx) < 0.25 ? "middle" : sx > 0 ? "start" : "end";
    const lines = [{ text: wire.name, cls: "tag-name" }];
    if (state.kind === "plugged") {
      for (const part of wrap(`${state.title} · ${state.id}`, 22)) lines.push({ text: part, cls: "tag-sub" });
    } else if (state.kind === "empty") {
      lines.push({ text: `comes in ${state.id}`, cls: "tag-sub" });
      for (const part of wrap(state.title, 22)) lines.push({ text: part, cls: "tag-sub" });
    }
    if (dim) lines.push({ text: "2 cards due", cls: "tag-sub", badge: true });
    const up = sy < -0.35;
    const down = sy > 0.35;
    lines.forEach((line, i) => {
      const y = up ? py - 8 - (lines.length - 1 - i) * 20 : down ? py + 16 + i * 20 : py - (lines.length * 20) / 2 + 12 + i * 20;
      const x = anchor === "middle" ? px : px + (anchor === "start" ? 4 : -4) * (anchor === "start" ? 1 : 1);
      if (line.badge) {
        const w = 88;
        const bx = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
        svg.append(svgEl("rect", { x: bx, y: y - 15, width: w, height: 22, rx: 11, fill: "#FCFBF8", stroke: "#1B1B1B" }));
        const t = svgEl("text", { x: bx + w / 2, y: y, "text-anchor": "middle", class: "tag-sub", fill: "#1B1B1B" });
        t.textContent = line.text;
        svg.append(t);
      } else {
        const t = svgEl("text", { x, y, "text-anchor": anchor, class: line.cls, fill: "#1B1B1B" });
        t.textContent = line.text;
        svg.append(t);
      }
    });
  }
  // hub
  svg.append(svgEl("circle", { cx, cy, r: 22, fill: "#1B1B1B" }));
  svg.append(svgEl("circle", { cx, cy, r: 6, fill: "#FCFBF8" }));
  return svg;
}

/** Break text into lines of at most n characters, at spaces (labels stay inside the plate). */
function wrap(text, n) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > n && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function glyphPaths(name) {
  // reuse the glyph table through a throwaway svg so the paths stay in one place
  const svg = glyph(name);
  return [...svg.querySelectorAll("path")].map((p) => p.getAttribute("d"));
}

function drawList() {
  const list = el("ol", { class: "spokes" });
  for (const wire of WIRES) {
    const state = socketState(wire);
    const disc = el("span", { class: `spoke-disc w-${wire.id}`, "aria-hidden": "true" });
    disc.append(glyph(wire.glyph));
    let text;
    if (state.kind === "plugged") text = `Plugged: ${state.title} · ${state.id}`;
    else if (state.kind === "empty") text = `Empty. Comes in ${state.id} · ${state.title}`;
    else text = "Empty.";
    const item = el("li", { class: `w-${wire.id}${wire.id === "context" ? " is-dim" : ""}` },
      disc,
      el("p", { class: "spoke-name", text: `${wire.n}. ${wire.name}` }),
      el("p", { class: `spoke-state socket is-${state.kind === "plugged" ? "plugged" : "empty"}`, text }),
      wire.id === "context" ? el("span", { class: "badge", text: "2 cards due" }) : null,
    );
    list.append(item);
  }
  return list;
}

function buildToc() {
  const list = el("ul", { class: "toc" });
  PARTS.forEach((part) => {
    const total = part.modules.length;
    const doneCount = part.modules.filter((m) => done.has(m.id)).length;
    const inProgress = part.modules.some((m) => m.id === current);
    const complete = total > 0 && doneCount === total;
    const status = complete ? `${doneCount} of ${total} done` : inProgress ? `${doneCount} of ${total} · in progress` : `${doneCount} of ${total} · ahead`;
    const expanded = inProgress;
    const state = complete ? glyph("check") : inProgress ? halfCircle() : emptyCircle();
    state.classList.add("state");
    const button = el("button", {
      class: "toc-part", type: "button", "aria-expanded": expanded ? "true" : "false",
      "aria-controls": `toc-${part.id}`,
    },
      state,
      el("span", {}, el("span", { class: "part-id", text: `PART ${part.id}` }), el("br"), part.title),
      el("span", { class: "status", text: status }),
      glyph("chevron", { cls: "glyph chev" }),
    );
    const modules = el("ul", { class: "toc-modules", id: `toc-${part.id}`, hidden: !expanded });
    for (const mod of part.modules) {
      const isDone = done.has(mod.id);
      const isCurrent = mod.id === current;
      const row = el("button", { class: "mod-row", type: "button" },
        el("span", { class: "mod-id", text: mod.id }),
        el("span", { class: isDone || isCurrent ? "" : "dim", text: mod.title }),
        isCurrent ? el("span", { class: "now", text: "now" }) : null,
        isDone ? glyph("check", { cls: "glyph tick" }) : null,
      );
      modules.append(el("li", {}, row));
    }
    button.addEventListener("click", () => {
      const open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", open ? "false" : "true");
      modules.hidden = open;
    });
    list.append(el("li", {}, button, modules));
  });
  return list;
}

function halfCircle() {
  const svg = svgEl("svg", { viewBox: "0 0 24 24", class: "glyph state", "aria-hidden": "true", focusable: "false" });
  svg.append(svgEl("circle", { cx: 12, cy: 12, r: 7, fill: "none", stroke: "#1B1B1B", "stroke-width": 2 }));
  svg.append(svgEl("path", { d: "M12 5a7 7 0 0 1 0 14z", fill: "#1B1B1B" }));
  return svg;
}
function emptyCircle() {
  const svg = svgEl("svg", { viewBox: "0 0 24 24", class: "glyph state", "aria-hidden": "true", focusable: "false" });
  svg.append(svgEl("circle", { cx: 12, cy: 12, r: 7, fill: "none", stroke: "#5A5853", "stroke-width": 2 }));
  return svg;
}

export class HomeElement extends HTMLElement {
  connectedCallback() {
    if (this._ready) return;
    this._ready = true;
    this.__test = { run: () => this.selfTest() };
    this.plateHost = this.querySelector("[data-plate-host]");
    this.tocHost = this.querySelector("[data-toc-host]");
    if (this.tocHost) this.tocHost.replaceChildren(buildToc());
    if (this.plateHost) {
      this.drawPlate = () => this.paintPlate();
      this.resizer = new ResizeObserver(() => this.paintPlate());
      this.resizer.observe(this.plateHost);
      this.paintPlate();
    }
  }

  paintPlate() {
    const width = Math.floor(this.plateHost.getBoundingClientRect().width);
    if (width <= 0) return;
    if (width >= CLOCK_MIN_WIDTH) {
      if (this.plateHost.dataset.mode !== "clock") {
        this.plateHost.dataset.mode = "clock";
        const clock = drawClock(width);
        this.plateHost.replaceChildren(clock);
      } else {
        // width changed while staying on the clock: redraw at the new size
        this.plateHost.replaceChildren(drawClock(width));
      }
    } else if (this.plateHost.dataset.mode !== "list") {
      this.plateHost.dataset.mode = "list";
      this.plateHost.replaceChildren(drawList());
    }
  }

  selfTest() {
    // Eight sockets render (as spokes, or as list items on narrow screens), and the primary action goes to break.html.
    const sockets = this.plateHost.querySelectorAll(".spoke, .spokes > li").length;
    const primary = this.querySelector('a[href="break.html"]');
    const ok = sockets >= 8 && Boolean(primary) && primary.getAttribute("href") === "break.html";
    return ok;
  }
}

export { CLOCK_MIN_WIDTH };
