import { motionIsReduced } from "./prefs.js";
// Shared helpers for the D2 prototype: glyphs (DESIGN §4), a safe DOM builder,
// motion mode (the in-page toggle wins over the system setting), and an announcer.

export const GLYPHS = {
  layers: ["M4 6h16M6.5 12h11M9 18h6"],
  window: ["M8 4H5v16h3M16 4h3v16h-3M9.5 13h5M9.5 16.5h5"],
  cycle: ["M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.2h-4.2"],
  zigzag: ["M2.5 12l3-6 3.6 12 3.8-12 3.6 12 3-6"],
  hexagon: ["M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z", "M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 1 0 0-5.6"],
  diamond: ["M12 2.8l9.2 9.2-9.2 9.2L2.8 12z"],
  shield: ["M12 2.8l7.5 3v5.6c0 4.6-3.1 8.1-7.5 10-4.4-1.9-7.5-5.4-7.5-10V5.8z", "M8.6 12.2l2.4 2.4 4.4-4.8"],
  eye: ["M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z", "M12 9.3a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 1 0 0-5.4"],
  play: ["M8 5.5l11 6.5-11 6.5z"],
  flag: ["M5.5 21V4h11l-2.2 4.2 2.2 4.3H5.5"],
  box: ["M5 7h14a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H5a2.5 2.5 0 0 1-2.5-2.5v-5A2.5 2.5 0 0 1 5 7z"],
  pause: ["M8.5 5v14M15.5 5v14"],
  noentry: ["M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M5.6 5.6l12.8 12.8"],
  nested: ["M3.5 3.5h17v17h-17zM8.5 8.5h7v7h-7z"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  cross: ["M6.5 6.5l11 11M17.5 6.5l-11 11"],
  bang: ["M12 4.5v10M12 19v.5"],
  plus: ["M5 12h14M12 5v14"],
  minus: ["M5 12h14"],
  stepBack: ["M7 5v14", "M18.5 5.5 9.5 12l9 6.5z"],
  stepFwd: ["M17 5v14", "M5.5 5.5 14.5 12l-9 6.5z"],
  chevron: ["M6 9l6 6 6-6"],
  plug: ["M9 3v5M15 3v5M7 8h10v4a5 5 0 0 1-10 0z", "M12 17v4"],
  bookmark: ["M6 3.5h12v17l-6-4.2-6 4.2z"],
  slash: ["M5 19L19 5"],
  permAllow: ["M8.8 12.2l2.2 2.2 4.2-4.6"],
  permAsk: ["M10 9.8a2 2 0 1 1 2.8 1.9c-.6.3-.8.8-.8 1.4", "M12 16.2v.1"],
  permDeny: ["M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"],
  info: ["M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18", "M12 10.5v6", "M12 7.2v.1"],
  reset: ["M4.5 12a7.5 7.5 0 1 0 2.2-5.3", "M4.5 4.5v4h4"],
  motion: ["M4 12h3M17 12h3M9.5 8.5v7M14.5 8.5v7"],
};
const FILLABLE = new Set(["box", "flag"]);
const SVGNS = "http://www.w3.org/2000/svg";

/** Build a glyph <svg>. `extra` adds more path groups (e.g. a permission mark). */
export function glyph(names, { fill = false, cls = "glyph", label = "" } = {}) {
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", label ? "false" : "true");
  svg.setAttribute("focusable", "false");
  if (label) {
    const title = document.createElementNS(SVGNS, "title");
    title.textContent = label;
    svg.append(title);
  }
  const list = Array.isArray(names) ? names : [names];
  for (const name of list) {
    const paths = GLYPHS[name] || [];
    for (const d of paths) {
      const path = document.createElementNS(SVGNS, "path");
      path.setAttribute("d", d);
      if (fill && FILLABLE.has(name)) path.setAttribute("class", "fill");
      svg.append(path);
    }
  }
  return svg;
}

/** Tiny DOM builder: el("p", {class: "x", text: "..."}, child, "string", [children]). */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "text") node.textContent = String(value);
    else if (key === "class") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  }
  const flat = children.flat(Infinity);
  for (const child of flat) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function svgEl(name, attrs = {}) {
  const node = document.createElementNS(SVGNS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** Motion: the learner's stored choice wins; otherwise the system setting (see prefs.js). */
export function reduceMotion() {
  return motionIsReduced();
}

/** A polite live region. Callers keep messages sparse (one per turn, one per result). */
export function makeAnnouncer() {
  let region = document.getElementById("live-polite");
  if (!region) {
    region = el("div", { id: "live-polite", class: "sr-only", "aria-live": "polite", role: "status" });
    document.body.append(region);
  }
  let last = "";
  return (message) => {
    if (!message || message === last) return;
    last = message;
    region.textContent = "";
    window.setTimeout(() => { region.textContent = message; }, 20);
  };
}

export const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
export const fmtInt = (n) => Math.round(n).toLocaleString("en-US");
/** Costs are relative units from the fixture; show three decimals with a ≈ sign. */
export const fmtCost = (c, digits = 3) => `≈ ${Number(c).toFixed(digits)} units`;
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const shorten = (s, n = 90) => {
  const flat = String(s).replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
};
