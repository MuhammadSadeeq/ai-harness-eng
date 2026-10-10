// The clock face (DESIGN §7.1, BP-1.5 §1): the eight wires as spokes at their clock angles, nodes with their
// glyphs, tags on the spokes, and outer labels. It is drawn at the width it is shown at (never a scaled viewBox),
// so no text is smaller than it is set. Narrow faces (under 520 px) drop the outer labels: the legend carries them.
const DEG = Math.PI / 180;
const LABELS_FROM = 520;
export const GLYPH_SPRITE = new URL("../../core/glyphs.svg", import.meta.url).href;
const NS = "http://www.w3.org/2000/svg";

/** Stroke pattern and width of each wire's line style (course.json wires[].line). */
const LINE = Object.freeze({
  "solid": { dash: "", width: 2, round: false },
  "10 4": { dash: "10 4", width: 2, round: false },
  "solid-heavy": { dash: "", width: 3.5, round: false },
  "8 3 2 3": { dash: "8 3 2 3", width: 2, round: false },
  "4 3": { dash: "4 3", width: 2, round: false },
  "8 3 2 3 2 3": { dash: "8 3 2 3 2 3", width: 2, round: false },
  "0.1 4": { dash: "0.1 4", width: 2.5, round: true },
  "2 2": { dash: "2 2", width: 1.5, round: false },
});

export function lineStyle(name) {
  const style = LINE[name];
  if (!style) throw new Error(`unknown line style: ${name}`);
  return style;
}

const cap = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function svgEl(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** Where a spoke's node sits on a face `width` px wide, for a spoke at `angle` degrees. */
export function spokeAnchor(width, angle) {
  const { R, c } = faceGeometry(width);
  return [c + R * Math.sin(angle * DEG), c - R * Math.cos(angle * DEG)];
}

/** The radii of one face: spokes, the node on each spoke end, and the rim. */
export function faceGeometry(width) {
  const W = Math.max(300, Math.round(width));
  const narrow = W < LABELS_FROM;
  const R = narrow ? W * 0.33 : W >= 900 ? Math.min(W * 0.3, 210) : W * 0.22;
  const nodeR = narrow ? 15 : 17;
  return { W, narrow, R, nodeR, rimR: R + nodeR + 6 };
}

function glyphUse(name, x, y, size) {
  const group = svgEl("g", { class: "gl-wrap", transform: `translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})` });
  group.append(svgEl("use", { class: "gl-use", href: `${GLYPH_SPRITE}#g-${name}` }));
  return group;
}

function tagBox(group, x, y, code, cls, added = false) {
  const w = Math.max(36, Math.round(code.length * 9 + 16));
  const h = 24;
  const tag = svgEl("g", { class: `tag-group ${cls}`, "data-tag": code, "data-added": added ? "true" : "false" });
  tag.append(svgEl("rect", { class: "tag-box", x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 6 }));
  const text = svgEl("text", { class: "tag-text", x, y: y + 5, "text-anchor": "middle", "font-size": 14 });
  text.textContent = code;
  tag.append(text);
  group.append(tag);
}

/**
 * Draws one face at `width` px.
 * wires: course wires in clock order. spokes: wireId -> {tags: [{code, text}], sub, badge, dim, empty, muted,
 * name}. hand: wire id the hand points at, or null. Returns {svg, spokes: {wireId: group}}.
 */
export function drawFace({ width, wires, spokes, hand = null, label = "Turn Clock board" }) {
  const { W, narrow, R, nodeR, rimR } = faceGeometry(width);
  const c = W / 2;
  const svg = svgEl("svg", {
    class: "clock", viewBox: `0 0 ${W} ${W}`, width: W, height: W, role: "img", "aria-label": label,
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
  const groups = {};

  for (const wire of wires) {
    const spoke = spokes[wire.id] ?? { tags: [] };
    const style = lineStyle(wire.line);
    const [nx, ny] = pos(wire.angle, R);
    const [hx, hy] = pos(wire.angle, R * 0.18);
    const classes = ["spoke-group", `w-${wire.id}`];
    if (spoke.dim) classes.push("is-dim");
    if (spoke.empty) classes.push("is-empty");
    if (spoke.muted) classes.push("is-muted");
    const group = svgEl("g", { class: classes.join(" "), "data-wire": wire.id });
    groups[wire.id] = group;
    const line = svgEl("line", { class: "spoke", x1: hx, y1: hy, x2: nx, y2: ny, "stroke-width": style.width });
    if (spoke.empty || spoke.muted) line.setAttribute("stroke-dasharray", "2 4");
    else if (style.dash) line.setAttribute("stroke-dasharray", style.dash);
    if (style.round) line.setAttribute("stroke-linecap", "round");
    group.append(line);
    group.append(svgEl("circle", { class: "hit", cx: nx, cy: ny, r: 22 }));
    const node = svgEl("circle", { class: "node", cx: nx, cy: ny, r: nodeR });
    if (spoke.empty || spoke.muted) node.setAttribute("stroke-dasharray", "3 3");
    group.append(node, glyphUse(wire.glyph, nx, ny, narrow ? 16 : 18));
    spoke.tags.slice(0, 2).forEach((tag, k) => {
      const [tx, ty] = pos(wire.angle, R * (narrow ? 0.36 : 0.52) + k * (narrow ? 38 : 44));
      tagBox(group, tx, ty, tag.code, k === 0 ? "tag-main" : "tag-extra", Boolean(tag.added));
    });
    if (!narrow) {
      const [lx, ly] = pos(wire.angle, rimR + 16);
      const s = Math.sin(wire.angle * DEG);
      const co = Math.cos(wire.angle * DEG);
      const anchor = Math.abs(s) < 0.3 ? "middle" : s > 0 ? "start" : "end";
      const dy = co > 0.5 ? -6 : co < -0.5 ? 18 : 5;
      const name = svgEl("text", { class: "label-name", x: lx, y: ly + dy, "text-anchor": anchor, "font-size": 15 });
      name.textContent = wire.short;
      group.append(name);
      if (spoke.sub) {
        const sub = svgEl("text", { class: "label-sub", x: lx, y: ly + dy + 18, "text-anchor": anchor, "font-size": 14 });
        sub.textContent = cap(spoke.sub, 26);
        group.append(sub);
      }
      if (spoke.badge) {
        const bw = Math.round(spoke.badge.length * 7.6 + 16);
        const bx = anchor === "end" ? lx - bw : anchor === "middle" ? lx - bw / 2 : lx;
        const badgeText = svgEl("text", { class: "badge-text", x: bx + bw / 2, y: ly + dy + 42, "text-anchor": "middle", "font-size": 14 });
        badgeText.textContent = spoke.badge;
        group.append(svgEl("rect", { class: "badge-box", x: bx, y: ly + dy + 26, width: bw, height: 24, rx: 12 }), badgeText);
      }
    }
    const title = svgEl("title");
    title.textContent = spoke.name ?? wire.name;
    group.prepend(title);
    svg.append(group);
  }
  if (hand) {
    const wire = wires.find((w) => w.id === hand);
    if (wire) {
      const [hx, hy] = pos(wire.angle, rimR - 4);
      svg.append(svgEl("line", { class: "hand", x1: c, y1: c, x2: hx, y2: hy }));
    }
  }
  return { svg, spokes: groups };
}
