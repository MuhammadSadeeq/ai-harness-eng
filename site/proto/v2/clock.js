// The Turn Clock board (DESIGN §7.1). One drawing serves the home page (the Harness Board) and Prove
// (where a new module plugs in). It is drawn at the measured width, so its text keeps real sizes.
import { WIRES, SOCKETS, PLUGGED } from "./data.js";
import { GLYPHS, svgEl, el } from "./common.js";

const DASH = { control: "", context: "10 4", loop: "", errors: "8 3 2 3", tools: "4 3", permissions: "8 3 2 3 2 3", verify: "0.1 4", observe: "2 2" };
const WIDTH = { control: 2, context: 2, loop: 3.5, errors: 2, tools: 2, permissions: 2, verify: 2.5, observe: 1.5 };
const ROUND = { verify: true };

/** Module state per wire, derived from data: plugged (A3, A4), dimmed with due cards, or empty (comes in X). */
export function wireStates(overrides = {}) {
  const states = {};
  for (const w of WIRES) {
    const plugged = PLUGGED.context && w.id === "context" ? PLUGGED.context : PLUGGED.loop && w.id === "loop" ? PLUGGED.loop : null;
    states[w.id] = {
      plugged: overrides.plugged?.[w.id] ?? plugged,
      next: SOCKETS[w.id] || null,
      due: w.id === "context" ? (overrides.due ?? 2) : 0,
      dim: w.id === "context",
    };
  }
  return states;
}

const NODE_GLYPH_UNITS = 24;

function glyphGroup(name, x, y, size) {
  const scale = size / NODE_GLYPH_UNITS;
  const group = svgEl("g", { class: "gl-wrap", transform: `translate(${x - size / 2} ${y - size / 2}) scale(${scale})` });
  for (const d of GLYPHS[name] || []) group.append(svgEl("path", { d, class: "gl" }));
  return group;
}

// A code tag sits ON its spoke. The first tag is at 60 % of the spoke (50 % on phones); a second tag on the
// same spoke stacks outward, 26 px further. Tags never reach another spoke: they are short codes.
function drawCodeTag(group, x, y, id, cls, animate) {
  const w = Math.max(36, Math.round(id.length * 9 + 16));
  const h = 24;
  const tag = svgEl("g", { class: `tag-group ${cls}`, "data-tag": id });
  if (animate) tag.setAttribute("data-plug", "true");
  tag.append(svgEl("rect", { class: "tag-box", x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 6 }));
  const text = svgEl("text", { class: "tag-text", x, y: y + 5, "text-anchor": "middle", "font-size": 14 });
  text.textContent = id;
  tag.append(text);
  group.append(tag);
}

/** Draws the clock at `width` px. opts: { states, hand, plugMotion }. */
export function drawClock(width, opts = {}) {
  const W = Math.max(300, Math.round(width));
  const narrow = W < 560;
  const states = opts.states || wireStates();
  const c = W / 2;
  const R = narrow ? W * 0.33 : Math.min(W * 0.3, 210);
  const nodeR = narrow ? 15 : 17;
  const rimR = R + nodeR + 6;
  const svg = svgEl("svg", {
    class: "clock", viewBox: `0 0 ${W} ${W}`, width: W, height: W, role: "img",
    "aria-label": "Turn Clock board: eight wires as spokes at their clock angles. Plugged modules are tags on their spokes.",
  });

  svg.append(svgEl("circle", { class: "rim", cx: c, cy: c, r: rimR }));
  for (let k = 0; k < 12; k += 1) {
    const a = (k / 12) * Math.PI * 2;
    const r1 = rimR - (k % 3 === 0 ? 9 : 5);
    svg.append(svgEl("line", { class: "tick", x1: c + r1 * Math.sin(a), y1: c - r1 * Math.cos(a), x2: c + rimR * Math.sin(a), y2: c - rimR * Math.cos(a) }));
  }
  svg.append(svgEl("circle", { class: "hub", cx: c, cy: c, r: Math.max(7, R * 0.12) }));

  const pos = (deg, r) => {
    const a = (deg * Math.PI) / 180;
    return [c + r * Math.sin(a), c - r * Math.cos(a)];
  };

  for (const w of WIRES) {
    const st = states[w.id];
    const rad = w.angle;
    const [nx, ny] = pos(rad, R);
    const [hx, hy] = pos(rad, R * 0.18);
    const group = svgEl("g", { class: `spoke-group w-${w.id}${st.dim ? " is-dim" : ""}${st.plugged ? "" : " is-empty"}`, "data-wire": w.id });
    const line = svgEl("line", { class: "spoke", x1: hx, y1: hy, x2: nx, y2: ny });
    if (DASH[w.id]) line.setAttribute("stroke-dasharray", DASH[w.id]);
    line.setAttribute("stroke-width", String(WIDTH[w.id]));
    if (ROUND[w.id]) line.setAttribute("stroke-linecap", "round");
    if (!st.plugged) line.setAttribute("opacity", "0.7");
    group.append(line);
    const node = svgEl("circle", { class: "node", cx: nx, cy: ny, r: nodeR });
    if (!st.plugged) node.setAttribute("stroke-dasharray", "3 3");
    group.append(node, glyphGroup(w.glyph, nx, ny, narrow ? 16 : 18));

    // earned modules: code tags on the spoke; a second module stacks outward along the same spoke
    [st.plugged, st.extra].filter(Boolean).forEach((m, k) => {
      // a second tag stacks outward by one tag width plus a 4 px gap; the pair stays clear of the node
      const [tx, ty] = pos(rad, R * (narrow ? 0.36 : 0.52) + k * (narrow ? 38 : 44));
      drawCodeTag(group, tx, ty, m.id, k === 0 ? "tag-main" : "tag-extra", opts.plugMotion === w.id && k === 0);
    });

    if (!narrow) {
      const [lx, ly] = pos(rad, rimR + 16);
      const s = Math.sin((rad * Math.PI) / 180);
      const co = Math.cos((rad * Math.PI) / 180);
      const anchor = Math.abs(s) < 0.3 ? "middle" : s > 0 ? "start" : "end";
      const dy = co > 0.5 ? -6 : co < -0.5 ? 18 : 5;
      const name = svgEl("text", { class: "label-name", x: lx, y: ly + dy, "text-anchor": anchor, "font-size": 15 });
      name.textContent = w.short;
      group.append(name);
      const status = st.plugged ? `${st.plugged.id} plugged` : st.next ? `comes in ${st.next.id}` : "empty";
      const sub = svgEl("text", { class: "label-sub", x: lx, y: ly + dy + 18, "text-anchor": anchor, "font-size": 14 });
      sub.textContent = status;
      group.append(sub);
      if (st.due > 0) {
        const badge = `${st.due} cards due`;
        const bw = Math.round(badge.length * 7.6 + 16);
        const bx = anchor === "end" ? lx - bw : anchor === "middle" ? lx - bw / 2 : lx;
        const badgeText = svgEl("text", { class: "badge-text", x: bx + bw / 2, y: ly + dy + 42, "text-anchor": "middle", "font-size": 14 });
        badgeText.textContent = badge;
        group.append(svgEl("rect", { class: "badge-box", x: bx, y: ly + dy + 26, width: bw, height: 24, rx: 12 }), badgeText);
      }
    }
    svg.append(group);
  }

  if (opts.hand) {
    const wire = WIRES.find((w) => w.id === opts.hand);
    const [hx, hy] = pos(wire.angle, rimR - 4);
    svg.append(svgEl("line", { class: "hand", x1: c, y1: c, x2: hx, y2: hy }));
  }
  return svg;
}

function legendGlyph(name) {
  const svg = svgEl("svg", { class: "legend-glyph", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" });
  for (const d of GLYPHS[name] || []) svg.append(svgEl("path", { d, class: "gl" }));
  return svg;
}

/** The numbered legend list under the clock on phones (also the screen-reader view of the board). */
export function legendList(states = wireStates()) {
  return el("ol", { class: "legend", "aria-label": "Wires in turn order" },
    WIRES.map((w) => {
      const st = states[w.id];
      const status = st.plugged
        ? `${st.plugged.id} · ${st.plugged.title} is plugged in`
        : st.next ? `Empty: comes in ${st.next.id}` : "Empty";
      return el("li", { class: `legend-row w-${w.id}${st.dim ? " is-dim" : ""}` },
        el("span", { class: "legend-n", text: String(w.n) }),
        legendGlyph(w.glyph),
        el("span", { class: "legend-text" },
          el("span", { class: "legend-name", text: `${w.name}, ${w.clock} o'clock` }),
          el("span", { class: "legend-state", text: status }),
          st.due > 0 ? el("span", { class: "badge", text: `${st.due} cards due` }) : null));
    }));
}

/** The names of what is plugged in, under the board (the tags carry codes; this list carries the titles). */
export function moduleList(states = wireStates()) {
  const items = [];
  for (const w of WIRES) {
    for (const m of [states[w.id].plugged, states[w.id].extra].filter(Boolean)) items.push({ wire: w, m });
  }
  return el("ul", { class: "module-list", "aria-label": "Modules on the board" },
    items.map(({ wire, m }) => el("li", { class: `w-${wire.id}` },
      el("span", { class: "module-code", text: m.id }),
      el("span", { class: "module-title", text: m.title }),
      el("span", { class: "module-wire", text: wire.short }))));
}
