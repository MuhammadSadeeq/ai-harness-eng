// The clock face (DESIGN §7.1, BP-1.5 §1): the eight wires as spokes at their clock angles, nodes with their
// glyphs, tags on the spokes, and outer labels. It is drawn at the width it is shown at (never a scaled viewBox),
// so no text is smaller than it is set. Below 520 px the outer labels go and the tags show their short codes: the
// legend carries the full words. Above it, labels wrap to two lines and stay inside the face: nothing is clipped.
const DEG = Math.PI / 180;
const LABELS_FROM = 520;
export const LABEL_CHARS = 16;
export const GLYPH_SPRITE = new URL("../../core/glyphs.svg", import.meta.url).href;
const NS = "http://www.w3.org/2000/svg";
const SUB_LINE = 18;
const CHAR_SANS = 7.6; // estimated advance of a 14 px sans character
const CHAR_NAME = 8.6; // estimated advance of a 15 px sans-semibold character
const CHAR_TAG = 7.8; // estimated advance of a 14 px sans-semibold character in a tag

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

/**
 * Word-wraps text into at most `maxLines` lines of `maxChars` characters. Whatever does not fit is cut at the
 * end of the last line with an ellipsis, so text never runs past its line.
 */
export function wrapLines(text, maxChars = LABEL_CHARS, maxLines = 2) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || current === "") {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines.map((line) => cap(line, maxChars));
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = cap(`${kept[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`, maxChars);
  return kept;
}

export function svgEl(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** The radii of one face: spokes, the node on each spoke end, and the rim. */
export function faceGeometry(width) {
  const W = Math.max(300, Math.round(width));
  const narrow = W < LABELS_FROM;
  const R = narrow ? W * 0.33 : W >= 900 ? Math.min(W * 0.3, 210) : W * 0.22;
  const nodeR = narrow ? 15 : 17;
  return { W, narrow, R, nodeR, rimR: R + nodeR + 6 };
}

/** Where a spoke's node sits on a face `width` px wide, for a spoke at `angle` degrees. */
export function spokeAnchor(width, angle) {
  const { W, R } = faceGeometry(width);
  const c = W / 2;
  return [c + R * Math.sin(angle * DEG), c - R * Math.cos(angle * DEG)];
}

function glyphUse(name, x, y, size) {
  const group = svgEl("g", { class: "gl-wrap", transform: `translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})` });
  group.append(svgEl("use", { class: "gl-use", href: `${GLYPH_SPRITE}#g-${name}`, width: 24, height: 24 }));
  return group;
}

/** A tag: a box on its spoke. Narrow faces show the code; wide faces show the label, wrapped to two lines. */
/** The warning mark of a bug tag: a triangle with an exclamation mark, so the meaning is a shape, not a colour. */
function warningMark(x, y) {
  const mark = svgEl("g", { class: "bug-mark", "aria-hidden": "true" });
  mark.append(svgEl("path", { class: "bug-triangle", d: `M${x + 5} ${y} L${x + 10} ${y + 10} L${x} ${y + 10} Z` }));
  mark.append(svgEl("path", { class: "bug-bang", d: `M${x + 5} ${y + 3.5} V${y + 6.8} M${x + 5} ${y + 8.1} V${y + 8.3}` }));
  return mark;
}

const TAG_GAP = 4; // clear space between two tag boxes, and between a box and the hub or a node
const MARK_ROOM = 14; // the warning mark's room at a bug tag's left edge

/** The box a tag needs: its width from its longest line (plus the mark's room), its height from its line count. */
export function tagSize(parts) {
  const widest = Math.max(...parts.lines.map((l) => l.length));
  const pad = parts.bug ? 22 : 16; // a bug tag's text sits beside its mark: 6 px more than an ordinary tag's padding
  return { w: Math.max(36, Math.round(widest * CHAR_TAG + pad)), h: parts.lines.length * 17 + 8 };
}

/** The box centred on (x, y), moved inside the face by 4 px at each side (as tags have always been kept). */
function boxAt(x, y, size, W) {
  const left = Math.min(W - 4 - size.w, Math.max(4, x - size.w / 2));
  return { left, top: y - size.h / 2, w: size.w, h: size.h };
}

function boxesTooClose(a, b) {
  const dx = Math.abs(a.left + a.w / 2 - (b.left + b.w / 2));
  const dy = Math.abs(a.top + a.h / 2 - (b.top + b.h / 2));
  return dx < (a.w + b.w) / 2 + TAG_GAP && dy < (a.h + b.h) / 2 + TAG_GAP;
}

function boxNearCircle(box, circle) {
  const nx = Math.min(Math.max(circle.x, box.left), box.left + box.w);
  const ny = Math.min(Math.max(circle.y, box.top), box.top + box.h);
  return Math.hypot(circle.x - nx, circle.y - ny) < circle.r + TAG_GAP;
}

/**
 * Places the tag boxes (BP-3.1b §2): no two boxes overlap, and no box covers the hub or a node. Each item is
 * {key, angle, size}. It slides along its spoke from `preferred` (px from the centre) to the nearest free radius in
 * [from, to], outer side first. Items are placed in order, so earlier items keep their places. Returns a Map of
 * key -> box; an item with no free place is left out of the map (its word is still in the sub-line or the legend).
 */
export function placeTags({ W, centre, items, circles, preferred, from, to, step = 2 }) {
  const placed = new Map();
  const taken = [];
  const radii = [];
  for (let d = 0; preferred + d <= to || preferred - d >= from; d += step) {
    if (preferred + d <= to) radii.push(preferred + d);
    if (d > 0 && preferred - d >= from) radii.push(preferred - d);
  }
  // On the spoke first (every radius); then sideways, at most 30 px off the spoke, nearer offsets first.
  const sideways = [0];
  for (let k = 1; k <= 10; k += 1) sideways.push(3 * k, -3 * k);
  for (const item of items) {
    const rad = item.angle * DEG;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    let found = null;
    for (const side of sideways) {
      for (const r of radii) {
        const box = boxAt(centre + r * sin + side * cos, centre - r * cos + side * sin, item.size, W);
        if (taken.some((other) => boxesTooClose(other, box))) continue;
        if (circles.some((circle) => boxNearCircle(box, circle))) continue;
        found = box;
        break;
      }
      if (found) break;
    }
    if (found) {
      taken.push(found);
      placed.set(item.key, found);
    }
  }
  return placed;
}

/** One tag drawn in its placed box: the code (narrow) or the label (wide), with the warning mark on a bug tag. */
function tagBox(group, box, parts, cls, added) {
  const lines = parts.lines;
  const room = parts.bug ? MARK_ROOM : 0;
  const tag = svgEl("g", { class: `tag-group ${cls}`, "data-tag": parts.code, "data-added": added ? "true" : "false" });
  if (parts.bug) {
    tag.setAttribute("role", "img");
    tag.setAttribute("aria-label", `bug: ${parts.label ?? lines.join(" ")}`);
  }
  tag.append(svgEl("rect", { class: "tag-box", x: box.left, y: box.top, width: box.w, height: box.h, rx: 6 }));
  if (parts.bug) tag.append(warningMark(box.left + 3, box.top + (box.h - 10) / 2));
  lines.forEach((line, i) => {
    const text = svgEl("text", {
      class: "tag-text", x: box.left + room + (box.w - room) / 2, y: box.top + 15 + i * 17, "text-anchor": "middle", "font-size": 14,
    });
    text.textContent = line;
    tag.append(text);
  });
  group.append(tag);
}

/**
 * Draws one face at `width` px. wires: course wires in clock order. spokes: wireId -> {name, tags, sub, badge,
 * dim, empty, muted}; a tag is {code, text, added}. hand: the wire id the hand points at, or null.
 * Returns {svg, spokes} with svg unattached: call fitFace() once it is in the page.
 */
export function drawFace({ width, wires, spokes, hand = null, label = "Turn Clock board" }) {
  const { W, narrow, R, nodeR, rimR } = faceGeometry(width);
  const c = W / 2;
  const svg = svgEl("svg", {
    class: "clock", viewBox: `0 0 ${W} ${W}`, width: W, height: W, role: "group", "aria-label": label,
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
  const codes = [];

  // The tags of every spoke are placed together, so no two boxes overlap (BP-3.1b §2). Narrow faces: each spoke's
  // first two codes; wide faces: the first tag's label (its code when the label does not fit the room by the hub).
  const hubR = Math.max(7, R * 0.12);
  const room = R - nodeR - hubR - 8;
  const circles = [{ x: c, y: c, r: hubR }];
  for (const wire of wires) {
    const [x, y] = pos(wire.angle, R);
    circles.push({ x, y, r: nodeR });
  }
  const items = [];
  for (const wire of wires) {
    const tags = (spokes[wire.id] ?? { tags: [] }).tags;
    if (narrow) {
      tags.slice(0, 2).forEach((tag, i) => {
        const parts = { code: tag.code, lines: [tag.code], bug: tag.bug === true, label: tag.label ?? tag.text };
        codes.push({ code: tag.code, name: tag.name ?? tag.code });
        items.push({ key: `${wire.id}:${i}`, wire, tag, parts, angle: wire.angle, size: tagSize(parts), wide: false });
      });
    } else if (tags.length > 0) {
      const tag = tags[0];
      const lines = wrapLines(tag.text ?? tag.code, LABEL_CHARS, 2);
      const labelWidth = Math.max(...lines.map((l) => l.length)) * CHAR_TAG + 16;
      const fits = labelWidth <= room;
      const parts = { code: tag.code, lines: fits ? lines : [tag.code], bug: tag.bug === true, label: tag.label ?? tag.text };
      items.push({ key: `${wire.id}:0`, wire, tag, parts, angle: wire.angle, size: tagSize(parts), wide: true, fits });
    }
  }
  const placed = placeTags({
    W,
    centre: c,
    items: items.map(({ key, angle, size }) => ({ key, angle, size })),
    circles,
    preferred: narrow ? R * 0.36 : hubR + 4 + room / 2,
    from: hubR + 4,
    to: R - nodeR - 4,
  });
  for (const item of items) {
    // A wide label that does not fit, or finds no free place, shows its code; the legend carries the word.
    if (item.wide && (!item.fits || !placed.has(item.key))) codes.push({ code: item.tag.code, name: item.tag.name ?? item.tag.code });
  }

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

    // This spoke's tags, in the boxes placeTags found. An item with no free place is not drawn: the sub-line or the
    // legend still names it.
    let shown = 0;
    for (const item of items) {
      const box = item.wire === wire ? placed.get(item.key) : null;
      if (!box) continue;
      tagBox(group, box, item.parts, shown === 0 ? "tag-main" : "tag-extra", Boolean(item.tag.added));
      shown += 1;
    }

    if (!narrow) {
      const [lx, ly] = pos(wire.angle, rimR + 16);
      const s = Math.sin(wire.angle * DEG);
      const co = Math.cos(wire.angle * DEG);
      const anchor = Math.abs(s) < 0.3 ? "middle" : s > 0 ? "start" : "end";
      const dy = co > 0.5 ? -6 : co < -0.5 ? 18 : 5;
      const nameWidth = wire.short.length * CHAR_NAME;
      const subLines = spoke.sub ? wrapLines(spoke.sub, LABEL_CHARS, 2) : [];
      const widest = Math.max(nameWidth / CHAR_SANS, ...subLines.map((l) => l.length), 0) * CHAR_SANS;
      // Keep the label block inside the face: a label that would run past an edge moves in, never out.
      const half = widest / 2;
      let x = lx;
      if (anchor === "start") x = Math.min(lx, W - 6 - widest);
      if (anchor === "end") x = Math.max(lx, 6 + widest);
      if (anchor === "middle") x = Math.min(W - 6 - half, Math.max(6 + half, lx));
      const name = svgEl("text", { class: "label-name", x, y: ly + dy, "text-anchor": anchor, "font-size": 15 });
      name.textContent = wire.short;
      group.append(name);
      subLines.forEach((line, i) => {
        const sub = svgEl("text", { class: "label-sub", x, y: ly + dy + SUB_LINE * (i + 1), "text-anchor": anchor, "font-size": 14 });
        sub.textContent = line;
        group.append(sub);
      });
      if (spoke.badge) {
        const bw = Math.round(spoke.badge.length * CHAR_SANS + 16);
        const by = ly + dy + SUB_LINE * (subLines.length + 1) + 4;
        const bx = anchor === "end" ? x - bw : anchor === "middle" ? x - bw / 2 : x;
        const badgeText = svgEl("text", { class: "badge-text", x: bx + bw / 2, y: by + 16, "text-anchor": "middle", "font-size": 14 });
        badgeText.textContent = spoke.badge;
        group.append(svgEl("rect", { class: "badge-box", x: bx, y: by, width: bw, height: 24, rx: 12 }), badgeText);
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
  return { svg, spokes: groups, codes };
}

/**
 * Fits the viewBox to what the face draws (its rim, tags and labels), at scale 1, so the figure hugs the face.
 * Call once the svg is in the page. Returns the y offset of the new viewBox (for placing a card).
 */
export function fitFace(svg) {
  const width = Number(svg.getAttribute("width"));
  const box = svg.getBBox();
  const pad = 6;
  const y = Math.floor(box.y - pad);
  const height = Math.ceil(box.height + pad * 2);
  svg.setAttribute("viewBox", `0 ${y} ${width} ${height}`);
  svg.setAttribute("height", String(height));
  return y;
}
