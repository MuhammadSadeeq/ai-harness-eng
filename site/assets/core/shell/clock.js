// The Turn Clock board (DESIGN §5.1, §7.1). It is drawn at the measured width of its host, so every label keeps
// the size it is set at: a fixed viewBox scaled down would put 14 px labels at 7 px on a phone. Below 520 px the
// wire labels are carried by the legend list under the board, and the board keeps its glyphs and tags.
const NS = "http://www.w3.org/2000/svg";
const DEG = Math.PI / 180;
const LABELS_FROM = 520;

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** The board data the generator wrote into the page (the #clock-data island). Returns null if it is missing. */
export function readClockData(doc = document) {
  const island = doc.getElementById("clock-data");
  if (!island) return null;
  try {
    return JSON.parse(island.textContent || "null");
  } catch {
    return null;
  }
}

/** Radius of the spokes and the rim for a board drawn `width` px wide. */
export function clockGeometry(width) {
  const W = Math.max(300, Math.round(width));
  const narrow = W < LABELS_FROM;
  const R = narrow ? W * 0.33 : W >= 900 ? Math.min(W * 0.3, 210) : W * 0.22;
  const nodeR = narrow ? 15 : 17;
  return { W, narrow, R, nodeR, rimR: R + nodeR + 6 };
}

function glyphGroup(paths, x, y, size) {
  const group = svgEl("g", { class: "gl-wrap", transform: `translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})` });
  for (const d of paths || []) group.append(svgEl("path", { d, class: "gl" }));
  return group;
}

// A code tag sits on its spoke, short enough to read at 14 px on every width.
function drawTag(group, x, y, id) {
  const w = Math.max(36, Math.round(id.length * 9 + 16));
  const h = 24;
  const tag = svgEl("g", { class: "tag-group tag-main", "data-tag": id });
  tag.append(svgEl("rect", { class: "tag-box", x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 6 }));
  const text = svgEl("text", { class: "tag-text", x, y: y + 5, "text-anchor": "middle", "font-size": 14 });
  text.textContent = id;
  tag.append(text);
  group.append(tag);
}

/** Draws the board at `width` px from the data island. */
export function drawClock(width, data) {
  const { W, narrow, R, nodeR, rimR } = clockGeometry(width);
  const c = W / 2;
  const svg = svgEl("svg", {
    class: "clock", viewBox: `0 0 ${W} ${W}`, width: W, height: W, role: "img",
    "aria-label": "Turn Clock board: eight wires as spokes at their clock angles. Plugged modules are tags on their spokes.",
  });
  svg.append(svgEl("circle", { class: "rim", cx: c, cy: c, r: rimR }));
  for (let k = 0; k < 12; k += 1) {
    const a = (k / 12) * Math.PI * 2;
    const r1 = rimR - (k % 3 === 0 ? 9 : 5);
    svg.append(svgEl("line", {
      class: "tick",
      x1: c + r1 * Math.sin(a), y1: c - r1 * Math.cos(a),
      x2: c + rimR * Math.sin(a), y2: c - rimR * Math.cos(a),
    }));
  }
  svg.append(svgEl("circle", { class: "hub", cx: c, cy: c, r: Math.max(7, R * 0.12) }));
  const pos = (deg, r) => [c + r * Math.sin(deg * DEG), c - r * Math.cos(deg * DEG)];

  for (const wire of data.wires) {
    const plugged = data.plugged?.[wire.id] ?? null;
    const comesIn = data.comesIn?.[wire.id] ?? null;
    const [nx, ny] = pos(wire.angle, R);
    const [hx, hy] = pos(wire.angle, R * 0.18);
    const group = svgEl("g", { class: `spoke-group w-${wire.id}`, "data-wire": wire.id });
    const line = svgEl("line", { class: "spoke", x1: hx, y1: hy, x2: nx, y2: ny, "stroke-width": wire.width });
    if (wire.dash) line.setAttribute("stroke-dasharray", wire.dash);
    if (wire.round) line.setAttribute("stroke-linecap", "round");
    if (!plugged) line.setAttribute("opacity", "0.7");
    group.append(line);
    const node = svgEl("circle", { class: "node", cx: nx, cy: ny, r: nodeR });
    if (!plugged) node.setAttribute("stroke-dasharray", "3 3");
    group.append(node, glyphGroup(data.glyphs?.[wire.glyph], nx, ny, narrow ? 16 : 18));
    if (plugged) {
      const [tx, ty] = pos(wire.angle, R * (narrow ? 0.36 : 0.52));
      drawTag(group, tx, ty, plugged.id);
    }
    if (!narrow) {
      const [lx, ly] = pos(wire.angle, rimR + 16);
      const s = Math.sin(wire.angle * DEG);
      const co = Math.cos(wire.angle * DEG);
      const anchor = Math.abs(s) < 0.3 ? "middle" : s > 0 ? "start" : "end";
      const dy = co > 0.5 ? -6 : co < -0.5 ? 18 : 5;
      const name = svgEl("text", { class: "label-name", x: lx, y: ly + dy, "text-anchor": anchor, "font-size": 15 });
      name.textContent = wire.short;
      const status = plugged ? `${plugged.id} plugged` : comesIn ? `comes in ${comesIn.id}` : "empty";
      const sub = svgEl("text", { class: "label-sub", x: lx, y: ly + dy + 18, "text-anchor": anchor, "font-size": 14 });
      sub.textContent = status;
      group.append(name, sub);
    }
    svg.append(group);
  }
  return svg;
}

/** Draws the board into [data-clock] and redraws it whenever its width changes. */
export function mountClock(doc = document) {
  const host = doc.querySelector("[data-clock]");
  const data = readClockData(doc);
  if (!host || !data) return;
  let drawn = -1;
  const paint = () => {
    const width = Math.floor(host.clientWidth);
    if (width <= 0 || width === drawn) return;
    drawn = width;
    host.replaceChildren(drawClock(width, data));
  };
  paint();
  if (typeof ResizeObserver === "function") new ResizeObserver(paint).observe(host);
  else doc.defaultView?.addEventListener("resize", paint);
}
