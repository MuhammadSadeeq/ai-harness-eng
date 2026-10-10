// Home: the rack. Eight slots in turn order, the MODEL core above, cables in wire colors,
// the Continue key and today's shift, and path progress as patch-point lights.
import { WIRES } from "./shared.js";
import { announce, reducedMotion } from "./app.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const COLORS = {
  control: "#7457E6", context: "#14408F", loop: "#D23A4A", errors: "#6A2A10",
  tools: "#946E00", permissions: "#12553F", verify: "#187A6D", observe: "#36404E",
};
// Populated modules (brief): history resend (context, A3) and block-aware reply parser (loop, A4).
const MODULES = {
  context: { name: "history resend", readout: "KEEP 2 turns", angle: -40, led: false, badge: "2 cards due" },
  loop: { name: "block-aware reply parser", readout: "PARSE blocks", angle: 50, led: true },
};

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

function glyph(name, cls = "glyph") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `glyphs.svg#g-${name}`);
  svg.append(use);
  return svg;
}

function dial(angle) {
  return el("span", { class: "dial", "aria-hidden": "true", style: `--ang:${angle}deg` });
}

function slot(wire, index) {
  const mod = MODULES[wire.id];
  const isEmpty = !mod;
  const top = el("div", { class: "slot-top" }, [
    el("span", { class: "slot-num", text: String(index + 1).padStart(2, "0") }),
    el("span", { class: "jack", "aria-hidden": "true" }),
  ]);
  let body;
  if (isEmpty) {
    body = el("div", { class: "slot-body" }, [
      el("p", { class: "label small-ink", text: "Plugs in later" }),
      el("p", { class: "plug-later" }, [el("span", { class: "pl-id", text: wire.later.split(" · ")[0] }), el("span", { class: "pl-name", text: wire.later.split(" · ")[1] })]),
    ]);
  } else {
    const nameRow = el("p", { class: "slot-name" }, [
      glyph(wire.glyph, "glyph slot-glyph sm"),
      el("span", { text: mod.name }),
    ]);
    const readoutRow = el("div", { class: "slot-foot" }, [
      el("span", { class: "slot-readout", text: mod.readout }),
      dial(mod.angle),
    ]);
    body = el("div", { class: "slot-body" }, [nameRow, readoutRow]);
    if (mod.badge) body.append(el("span", { class: "badge" }, [glyph("bang", "glyph sm"), el("span", { text: mod.badge })]));
  }
  const state = isEmpty ? "empty" : mod.led ? "populated" : "populated dim";
  const foot = el("div", { class: "slot-foot" }, [
    el("span", { class: `led${!isEmpty && mod.led ? " on" : ""}`, style: `--c:${COLORS[wire.id]}`, "aria-hidden": "true" }),
    el("span", { class: "label", text: `${wire.short}` }),
  ]);
  return el("article", {
    class: `panel slot ${state}`,
    "data-wire": wire.id,
    "data-slot": wire.id,
    "aria-label": `${wire.name}: ${isEmpty ? `empty, plugs in later: ${wire.later}` : mod.name}`,
  }, [el("span", { class: "slot-jack-stub", "aria-hidden": "true" }), top, body, foot]);
}

function patchPoints() {
  const parts = [
    { id: "start", label: "Start", state: "done", text: "✓ done" },
    { id: "a", label: "Part A", state: "done", text: "✓ done" },
    { id: "b", label: "Part B", state: "now", text: "in progress" },
    { id: "c-i", label: "C–I", state: "ahead", text: "ahead" },
  ];
  const sub = [
    { id: "b1", label: "B1", state: "done", text: "✓" },
    { id: "b2", label: "B2", state: "now", text: "now" },
    { id: "b3", label: "B3", state: "ahead", text: "ahead" },
    { id: "b4", label: "B4", state: "ahead", text: "ahead" },
  ];
  const note = el("p", { class: "pathnote", id: "path-note", "aria-live": "off" });
  const explain = {
    start: "Start is done.",
    a: "Part A is done.",
    b: "Part B is in progress: B1 is done, B2 is next.",
    "c-i": "Parts C to I open in order after Part B.",
  };
  const row = el("div", { class: "patch-row", role: "group", "aria-label": "Path progress" },
    parts.map((p) => el("button", {
      type: "button", class: `patch ${p.state}`, "data-part": p.id,
      "aria-label": `${p.label}, ${p.text}`,
    }, [
      el("span", { class: `led${p.state === "done" ? " on" : p.state === "now" ? " on" : ""}`, style: `--c:${p.state === "now" ? "#D23A4A" : "#1D6B3F"}`, "aria-hidden": "true" }),
      el("span", { text: p.label }),
      el("span", { class: "st", text: p.text }),
    ])),
  );
  const subList = el("ul", { class: "subparts", "aria-label": "Part B modules" },
    sub.map((s) => el("li", { class: s.state === "now" ? "now" : "", text: `${s.label} ${s.text}` })));
  const buttons = [...row.querySelectorAll("button")];
  for (const button of buttons) {
    button.addEventListener("click", () => {
      note.textContent = explain[button.getAttribute("data-part")];
    });
  }
  return el("section", { class: "section", "aria-labelledby": "path-h" }, [
    el("header", {}, [
      el("h2", { id: "path-h", text: "Path progress" }),
      el("p", { class: "hint", text: "Parts open in order. Tap a part to see where you are." }),
    ]),
    row,
    subList,
    note,
  ]);
}

function cablesSvg(rack) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "cables");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  rack.prepend(svg);
  return svg;
}

class HomeElement extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "1";
    this.render();
    this.__test = { run: async () => this.check() };
  }

  render() {
    const model = el("div", { class: "model-row" }, [
      el("div", { class: "panel model", "aria-label": "MODEL core: scripted model" }, [
        el("p", { class: "label", text: "MODEL · core" }),
        el("p", { class: "small-ink", text: "scripted model" }),
        el("span", { class: "model-jack", "aria-hidden": "true" }),
      ]),
    ]);
    const rack = el("div", { class: "rack", "data-rack": "" }, [
      el("div", { class: "slots", role: "list", "aria-label": "Eight wire modules in turn order" },
        WIRES.map((w, i) => { const s = slot(w, i); s.setAttribute("role", "listitem"); return s; })),
    ]);
    this.svg = cablesSvg(rack);
    this.rack = rack;
    const rackCard = el("section", { class: "section", "aria-labelledby": "rack-h" }, [
      el("header", {}, [
        el("h2", { id: "rack-h", text: "Your harness board" }),
        el("p", { class: "hint", text: "The model feeds eight modules in turn order. Two are in; the rest are waiting for a lesson." }),
      ]),
      el("div", { class: "panel lg rack-card" }, [model, rack]),
    ]);
    this.append(
      el("div", { class: "home-wrap" }, [
        el("header", { class: "hero-head" }, [
          el("div", {}, [
            el("p", { class: "label small-ink", text: "Patch Bay · Phase 0" }),
            el("h1", { text: "Patch your harness together" }),
          ]),
          el("p", { class: "voice", text: "Two modules are in. Six sockets are waiting." }),
        ]),
        rackCard,
        el("div", { class: "seq-row" }, [this.continueCard(), this.shiftCard()]),
        patchPoints(),
      ]),
    );
    this.drawCables();
    this.resizeObserver = new ResizeObserver(() => this.drawCables());
    this.resizeObserver.observe(this.rack);
  }

  continueCard() {
    return el("section", { class: "panel lg play-card", "aria-labelledby": "cont-h" }, [
      el("a", { class: "key big primary", href: "break.html", "aria-label": "Play: B2 Break" }, [
        glyph("play", "glyph"),
        el("span", { text: "Play" }),
      ]),
      el("div", {}, [
        el("p", { class: "label small-ink", text: "Continue" }),
        el("h2", { id: "cont-h", text: "B2 · The agent loop" }),
        el("p", { text: "Next: 1 Break. A loop that never stops, and the moment it went wrong." }),
      ]),
    ]);
  }

  shiftCard() {
    return el("section", { class: "panel lg shift-card", "aria-labelledby": "shift-h" }, [
      el("p", { class: "label small-ink", text: "Today's on-call shift · about 10 min" }),
      el("h2", { id: "shift-h", text: "One incident, six cards" }),
      el("ul", { class: "shift-list" }, [
        el("li", {}, [el("span", { class: "led on", style: "--c:#D23A4A", "aria-hidden": "true" }), el("span", { text: "1 incident: the almost-done spiral" })]),
        el("li", {}, [el("span", { class: "led on", style: "--c:#7457E6", "aria-hidden": "true" }), el("span", { text: "6 spaced-repetition cards due" })]),
        el("li", {}, [el("span", { class: "led on", style: "--c:#187A6D", "aria-hidden": "true" }), el("span", { text: "1 say-it drill" })]),
      ]),
      el("div", { class: "cta-row" }, [
        el("a", { class: "key primary", href: "break.html" }, [glyph("play", "glyph sm"), el("span", { text: "Start shift" })]),
      ]),
    ]);
  }

  drawCables() {
    const svg = this.svg;
    if (!svg || !this.rack) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const desktop = window.matchMedia("(min-width: 960px)").matches;
    if (!desktop) return;
    const rackBox = this.rack.getBoundingClientRect();
    const jack = this.querySelector(".model-jack");
    if (!jack) return;
    const from = jack.getBoundingClientRect();
    const x0 = from.left + from.width / 2 - rackBox.left;
    const y0 = from.bottom - rackBox.top;
    svg.setAttribute("viewBox", `0 0 ${rackBox.width} ${rackBox.height}`);
    svg.setAttribute("width", String(rackBox.width));
    svg.setAttribute("height", String(rackBox.height));
    this.paths = {};
    for (const w of WIRES) {
      const target = this.querySelector(`[data-slot="${w.id}"] .jack`);
      if (!target) continue;
      const to = target.getBoundingClientRect();
      const x1 = to.left + to.width / 2 - rackBox.left;
      const y1 = to.top - rackBox.top;
      const sag = Math.max(40, (y1 - y0) * 0.5);
      const d = `M ${x0.toFixed(1)} ${y0.toFixed(1)} C ${x0.toFixed(1)} ${(y0 + sag).toFixed(1)} ${x1.toFixed(1)} ${(y1 - sag).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
      const shadow = document.createElementNS(SVG_NS, "path");
      shadow.setAttribute("d", d);
      shadow.setAttribute("fill", "none");
      shadow.setAttribute("stroke", "rgba(30,34,38,0.16)");
      shadow.setAttribute("stroke-width", "9");
      shadow.setAttribute("stroke-linecap", "round");
      shadow.setAttribute("transform", "translate(0 3)");
      const cable = document.createElementNS(SVG_NS, "path");
      cable.setAttribute("d", d);
      cable.setAttribute("fill", "none");
      cable.setAttribute("stroke", COLORS[w.id]);
      cable.setAttribute("stroke-width", "6");
      cable.setAttribute("stroke-linecap", "round");
      cable.setAttribute("data-cable", w.id);
      svg.append(shadow, cable);
      this.paths[w.id] = cable;
    }
    if (!this.pulsed && !reducedMotion()) {
      this.pulsed = true;
      for (const id of Object.keys(MODULES)) this.pulseCable(id, 520);
    }
  }

  // One pulse travels a populated module's cable once on load (about half a second).
  pulseCable(id, duration) {
    const path = this.paths && this.paths[id];
    if (!path) return;
    const svg = this.svg;
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("r", "5");
    dot.setAttribute("fill", COLORS[id]);
    dot.setAttribute("stroke", "#FFFFFF");
    dot.setAttribute("stroke-width", "1.5");
    svg.append(dot);
    const total = path.getTotalLength();
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / duration);
      const p = path.getPointAtLength(total * k);
      dot.setAttribute("cx", p.x.toFixed(1));
      dot.setAttribute("cy", p.y.toFixed(1));
      if (k < 1) window.requestAnimationFrame(step);
      else dot.remove();
    };
    window.requestAnimationFrame(step);
  }

  check() {
    const slots = this.querySelectorAll(".slot");
    if (slots.length !== 8) return false;
    const link = this.querySelector('a.key[href="break.html"]');
    if (!link || link.getAttribute("href") !== "break.html") return false;
    const sockets = this.querySelectorAll(".slot .jack").length;
    if (sockets !== 8) return false;
    announce("Harness board: 8 slots, 2 modules in.");
    return true;
  }
}

customElements.define("hx-proto-home", HomeElement);
