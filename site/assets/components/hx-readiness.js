// hx-readiness: the readiness radar, the levels table with each wire's evidence, and the printable brag sheet (BP-5.2 §2).
// No src: it reads the course (getCourse), the built flags (getCourseCore) and the store's evidence. The levels are pure
// (lib/readiness.js). The radar's names show from 700 px; below that the glyphs mark the wires and the table names them.
//   <hx-readiness></hx-readiness>
// The self-test seeds evidence in memory (this.testEvidence, the test store) and restores the learner's view afterwards.
import { HxElement } from "./lib/hx-element.js";
import { getCourse, getCourseCore } from "./lib/data.js";
import { formatInt, plural } from "./lib/format.js";
import { bragData, LEVEL_WORDS, readiness } from "./lib/readiness.js";
import { continueTarget, formatDay } from "../core/shell/pure.js";

const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const RING = 26; // the L3 ring, in the radar's 0-100 units
const LABEL = 36; // where a wire's glyph and name sit, in percent of the radar box

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key === "text") node.textContent = value;
    else node.setAttribute(key, String(value));
  }
  node.append(...children.filter((child) => child !== null && child !== undefined && child !== false));
  return node;
};

/** A wire's glyph: the shared sprite symbol, coloured by the wire's own token (the class on its parent). */
function glyph(name) {
  const icon = document.createElementNS(SVG_NS, "svg");
  icon.setAttribute("class", "glyph");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `${SPRITE}#g-${name}`);
  icon.append(use);
  return icon;
}

/** An SVG shape with attributes set. */
function shape(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** The angle of turn-order index i: Control at 12 o'clock, then clockwise every 45 degrees (the turn clock's order). */
const angle = (i) => ((-90 + i * 45) * Math.PI) / 180;
const point = (i, radius) => [50 + radius * Math.cos(angle(i)), 50 + radius * Math.sin(angle(i))];

/** The date a row shows: "10 Oct 2026", or a plain note when the entry has none. */
const dateOf = (at) => (typeof at === "string" && at.length >= 10 ? formatDay(at.slice(0, 10)) : "date not recorded");

/** A bench side as "2 of 20" when the trial count is known, else "2 passing". */
const runsOf = (side) => (side.n === null ? `${formatInt(side.passed)} passing` : `${formatInt(side.passed)} of ${formatInt(side.n)}`);

/** The local calendar day as "YYYY-MM-DD". */
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The words for one evidence entry behind a level. */
function entryWords(entry) {
  if (entry.kind === "explained") return `${entry.title} explained`;
  if (entry.kind === "kata") return "kata passed";
  if (entry.kind === "step") return "step passed";
  if (entry.kind === "bench") return "bench run";
  if (entry.kind === "par") return "par reached";
  if (entry.kind === "design") return `design drill ${formatInt(entry.detail?.ticked ?? 0)} of ${formatInt(entry.detail?.total ?? 0)}`;
  return entry.kind;
}

export class HxReadiness extends HxElement {
  static styles = new URL("./hx-readiness.css", import.meta.url).href;

  async setup() {
    const [course, core] = await Promise.all([getCourse(), getCourseCore()]);
    this.course = course;
    this.core = core;
    this.built = new Set(core.modules.filter((mod) => mod.built).map((mod) => mod.id));
    this.testEvidence = null;
  }

  evidence() {
    return this.testEvidence ?? this.store?.state?.evidence ?? [];
  }

  /** The level shown for a wire right now (-1 if the wire has no row). */
  levelOf(wireId) {
    return Number(this.ui?.querySelector(`tr[data-wire="${wireId}"]`)?.dataset.level ?? -1);
  }

  summaryText() {
    return this.ui?.querySelector(".readiness-summary")?.textContent ?? "";
  }

  moduleLink(id) {
    const mod = this.course.modules.find((m) => m.id === id);
    if (!mod || !this.built.has(id)) return null;
    return el("a", { href: `modules/${mod.slug}.html`, text: `Open ${id}` });
  }

  radar(model) {
    const label = model.wires.map((wire) => `${wire.short} ${LEVEL_WORDS[wire.level]}`).join("; ");
    const box = el("div", { class: "radar", role: "img", "aria-label": `Readiness by wire: ${label}.` });
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("class", "radar-lines");
    for (const level of [1, 2, 3]) svg.append(shape("circle", { cx: 50, cy: 50, r: (RING * level) / 3, class: "radar-ring" }));
    model.wires.forEach((_, i) => {
      const [x, y] = point(i, RING);
      svg.append(shape("line", { x1: 50, y1: 50, x2: x, y2: y, class: "radar-axis-line" }));
    });
    const vertices = model.wires.map((wire, i) => point(i, (RING * wire.level) / 3));
    svg.append(shape("polygon", { points: vertices.map(([x, y]) => `${x},${y}`).join(" "), class: "radar-shape" }));
    for (const [x, y] of vertices) svg.append(shape("circle", { cx: x, cy: y, r: 1.4, class: "radar-mark" }));
    box.append(svg);
    model.wires.forEach((wire, i) => {
      const cos = Math.cos(angle(i));
      const sin = Math.sin(angle(i));
      const x = 50 + LABEL * cos;
      const y = 50 + LABEL * sin;
      box.append(el("span", { class: `radar-wire w-${wire.id}`, "data-wire": wire.id, style: `left: ${x}%; top: ${y}%;` },
        glyph(wire.glyph),
        el("span", { class: "radar-name", text: `${wire.short} · L${wire.level}` })));
    });
    return box;
  }

  table(model) {
    const rows = [];
    for (const wire of model.wires) {
      rows.push(el("tr", { "data-wire": wire.id, "data-level": wire.level },
        el("th", { scope: "row" }, el("span", { class: `wire w-${wire.id}` }, glyph(wire.glyph), el("span", { text: wire.name }))),
        el("td", { class: "level", text: `L${wire.level}: ${wire.word}` }),
        el("td", { text: wire.next })));
      rows.push(el("tr", { class: "evidence-row" },
        el("td", { colspan: "3" }, this.evidenceDisclosure(wire))));
    }
    return el("table", { class: "readiness-table" },
      el("caption", { text: "Levels by wire" }),
      el("thead", {}, el("tr", {}, el("th", { scope: "col", text: "Wire" }), el("th", { scope: "col", text: "Level" }), el("th", { scope: "col", text: "Next step" }))),
      el("tbody", {}, ...rows));
  }

  evidenceDisclosure(wire) {
    const { entries } = wire;
    const count = entries.explained.length + entries.passing.length + entries.defend.length;
    const items = [...entries.explained, ...entries.passing, ...entries.defend].map((entry) => el("li", {},
      el("span", { class: "ev-what", text: entryWords(entry) }),
      el("span", { class: "ev-module", text: entry.module ?? "" }),
      el("time", { text: dateOf(entry.at) }),
      this.moduleLink(entry.module) ?? ""));
    const summary = count === 0
      ? `No evidence behind ${wire.short} yet`
      : `Evidence behind ${wire.short}: ${plural(count, "entry", "entries")}`;
    return el("details", { class: "evidence" },
      el("summary", { text: summary }),
      count === 0 ? el("p", { text: "Nothing has been recorded for this wire." }) : el("ul", { class: "evidence-list" }, ...items));
  }

  brag(sheet) {
    const dataList = (items, empty) => items.length === 0
      ? el("p", { class: "sheet-empty", text: empty })
      : el("ul", { class: "sheet-list" }, ...items.map((text) => el("li", { text })));
    return el("article", { class: "brag-sheet", "aria-label": "Brag sheet" },
      el("h3", { class: "sheet-title", text: "HARNESSED: what I can show" }),
      sheet.name ? el("p", { class: "sheet-name", text: sheet.name }) : null,
      el("p", { class: "sheet-date", text: `Date: ${sheet.date}` }),
      el("h4", { text: "Levels by wire" }),
      dataList(sheet.levels.map((l) => `${l.short}: L${l.level}, ${l.word}`), "No wires yet."),
      el("h4", { text: `Modules explained (${formatInt(sheet.explained.length)})` }),
      dataList(sheet.explained.map((m) => `${m.id} · ${m.title}`), "No module is explained yet."),
      el("h4", { text: "Katas and steps passed" }),
      el("p", { text: `${plural(sheet.katasPassed, "kata")} and ${plural(sheet.stepsPassed, "step")} passed.` }),
      el("h4", { text: "Bench results (passing runs, before and after)" }),
      dataList(sheet.benches.map((b) => `${b.module || "bench"}: ${runsOf(b.before)} before, ${runsOf(b.after)} after`), "No bench run yet."),
      el("h4", { text: "Design drills" }),
      dataList(sheet.designs.map((d) => `${d.item}: ${formatInt(d.ticked)} of ${formatInt(d.total)} points`), "No design drill yet."));
  }

  render() {
    const evidence = this.evidence();
    const model = readiness(this.course, this.core, evidence);
    const name = String(this.store?.state?.prefs?.brag_name ?? "");
    const sheet = bragData(this.course, model, evidence, name, todayIso());
    const empty = evidence.length === 0;
    let intro = null;
    if (empty) {
      const doc = { modules: this.store?.state?.modules ?? {} };
      // Only a built module has a page to link to: start at the first built path module not yet done.
      const built = new Set((this.core?.modules ?? []).filter((m) => m.built).map((m) => m.id));
      const next = continueTarget({ ...this.course, path: (this.course.path ?? []).filter((id) => built.has(id)) }, doc);
      intro = el("p", { class: "readiness-empty" },
        "Nothing is recorded yet, so every wire is at not started. ",
        next ? el("a", { href: next.href, text: `Start with ${next.id} · ${next.title}` }) : "The path is done.");
    }
    const nameInput = el("input", { type: "text", "data-key": "brag-name", value: name, autocomplete: "name" });
    nameInput.addEventListener("change", () => this.saveName(nameInput.value));
    const print = el("button", { class: "key key-primary", type: "button", "data-key": "print", text: "Print the brag sheet" });
    print.addEventListener("click", () => globalThis.print?.());
    this.ui.replaceChildren(el("section", { class: "readiness" },
      el("div", { class: "readiness-top" },
        el("figure", { class: "radar-figure" },
          this.radar(model),
          el("p", { class: "readiness-legend", text: "Rings from the centre out: L1 can explain, L2 have built, L3 can defend with data." }),
          el("figcaption", { class: "readiness-summary", text: model.summary })),
        el("div", { class: "readiness-main" }, intro, this.table(model))),
      el("section", { class: "brag", "aria-labelledby": "brag-title" },
        el("h2", { id: "brag-title", text: "Brag sheet" }),
        el("label", { class: "brag-field" }, el("span", { text: "Name for the sheet" }), nameInput),
        el("div", { class: "brag-actions" }, print),
        el("p", { class: "brag-note", text: "The sheet prints on one page in black on white, with no buttons." }),
        this.brag(sheet))));
  }

  saveName(value) {
    try {
      this.store?.update((doc) => {
        doc.prefs = { ...doc.prefs, brag_name: value.trim() };
      });
    } catch {
      // A store that cannot save keeps the name on this page only.
    }
    this.render();
  }

  // Self-test: no evidence leaves every wire at not started; seeded credit on the Loop modules (every built module
  // explained, a passing kata, a credited bench) reaches L3 and lists its evidence; then the learner's view comes back.
  async selfTest() {
    this.testEvidence = [];
    this.render();
    if (this.ui.querySelectorAll('tr[data-level="0"]').length !== this.course.wires.length) return false;
    const onLoop = this.course.modules.filter((mod) => (mod.wires ?? []).includes("loop") && this.built.has(mod.id));
    if (onLoop.length === 0) return false;
    const first = onLoop[0].objectives.map((objective) => objective.id);
    const seeded = onLoop.map((mod) => ({
      kind: "check", module: mod.id, objectives: mod.objectives.map((objective) => objective.id), detail: {}, at: "2026-10-01T10:00:00.000Z",
    }));
    seeded.push({ kind: "kata", module: onLoop[0].id, objectives: first.slice(0, 1), detail: { passed: true }, at: "2026-10-02T10:00:00.000Z" });
    seeded.push({ kind: "bench", module: onLoop[0].id, objectives: first.slice(0, 1), detail: { old_passed: 2, new_passed: 3 }, at: "2026-10-03T10:00:00.000Z" });
    this.testEvidence = seeded;
    this.render();
    if (this.levelOf("loop") !== 3) return false;
    if (!this.summaryText().startsWith("Strongest: Loop (L3)")) return false;
    const listed = this.ui.querySelectorAll('tr[data-wire="loop"] + tr.evidence-row li').length;
    if (listed < 3) return false;
    this.testEvidence = null;
    this.render();
    return this.levelOf("loop") === 0;
  }
}

customElements.define("hx-readiness", HxReadiness);
