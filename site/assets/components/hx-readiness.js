// hx-readiness: the readiness radar, the levels table with each wire's evidence, and the printable brag sheet (BP-5.2 §2).
// No src: it reads the course (getCourse), the built flags (getCourseCore) and the store's evidence. The levels are pure
// (lib/readiness.js). The radar's names show from 700 px; below that the glyphs mark the wires and the table names them.
//   <hx-readiness></hx-readiness>
// The self-test seeds evidence in memory (this.testEvidence, the test store) and restores the learner's view afterwards.
import { HxElement } from "./lib/hx-element.js";
import { getCourse, getCourseCore } from "./lib/data.js";
import { formatInt, plural } from "./lib/format.js";
import { adjustment, bragData, LEVEL_WORDS, readiness, shownLevel } from "./lib/readiness.js";
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
    // An import of progress (the footer), or a change made elsewhere on the page, changes the evidence: draw it again.
    this.store?.subscribe?.(() => {
      if (this.course) this.render();
    });
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
      const shown = shownLevel(wire, this.adjustments);
      const levelText = shown.adjusted
        ? `L${shown.level}: ${LEVEL_WORDS[shown.level]} (set by you; evidence L${wire.level})`
        : `L${wire.level}: ${wire.word}`;
      rows.push(el("tr", { "data-wire": wire.id, "data-level": shown.level, "data-evidence": wire.level },
        el("th", { scope: "row" }, el("span", { class: `wire w-${wire.id}` }, glyph(wire.glyph), el("span", { text: wire.name }))),
        el("td", { class: "level", text: levelText }),
        el("td", { text: wire.next })));
      rows.push(el("tr", { class: "evidence-row" },
        el("td", { colspan: "3" }, this.evidenceDisclosure(wire))));
      rows.push(el("tr", { class: "adjust-row" },
        el("td", { colspan: "3" }, this.adjustDisclosure(wire, shown))));
    }
    return el("table", { class: "readiness-table" },
      el("caption", { text: "Levels by wire" }),
      el("thead", {}, el("tr", {}, el("th", { scope: "col", text: "Wire" }), el("th", { scope: "col", text: "Level" }), el("th", { scope: "col", text: "Next step" }))),
      el("tbody", {}, ...rows));
  }

  // A learner may set a wire lower than its evidence, never higher, with one line of reason (I2.o2).
  adjustDisclosure(wire, shown) {
    // The evidence is the top of the scale: a learner lowers it, so the choices stop one level below it.
    if (wire.level === 0) {
      return el("details", { class: "adjust" },
        el("summary", { text: `Set ${wire.short} lower than the evidence` }),
        el("p", { class: "adjust-note", text: "The evidence is L0, so there is no lower level to set." }));
    }
    // The default choice is the highest lower level; a set adjustment shows its own level. A false attribute would still
    // count as selected, so the attribute is written only on the chosen option.
    const current = shown.adjusted ? shown.level : wire.level - 1;
    const select = el("select", { "data-key": `adjust-level-${wire.id}`, id: `adj-${wire.id}` },
      ...Array.from({ length: wire.level }, (_, level) => el("option", { value: level, selected: level === current ? "" : null, text: `L${level}: ${LEVEL_WORDS[level]}` })));
    const reason = el("input", { type: "text", maxlength: "140", "data-key": `adjust-reason-${wire.id}`, id: `adj-reason-${wire.id}`, value: shown.adjusted ? shown.reason : "", placeholder: "One line: why you are lower" });
    const error = el("p", { class: "adjust-error", role: "alert" });
    const save = el("button", { type: "button", class: "key", "data-key": `adjust-save-${wire.id}`, text: "Set this level" });
    save.addEventListener("click", () => this.saveAdjust(wire.id, select, reason, error));
    const undo = shown.adjusted ? el("button", { type: "button", class: "key", "data-key": `adjust-undo-${wire.id}`, text: "Back to the evidence" }) : null;
    if (undo) undo.addEventListener("click", () => this.clearAdjust(wire.id));
    // A rebuilt row keeps the disclosure the learner had open (saving must not close the form they just used).
    const open = (this.openAdjusts ??= new Set());
    const details = el("details", { class: "adjust", open: open.has(wire.id) ? "" : null },
      el("summary", { text: `Set ${wire.short} lower than the evidence` }),
      el("p", { class: "adjust-note", text: `You can set L0 to L${wire.level - 1}. A level never goes above the evidence.` }),
      el("label", { class: "adjust-field" }, el("span", { text: "Level" }), select),
      el("label", { class: "adjust-field" }, el("span", { text: "Reason" }), reason),
      error,
      el("div", { class: "adjust-actions" }, save, undo));
    details.addEventListener("toggle", () => (details.open ? open.add(wire.id) : open.delete(wire.id)));
    return details;
  }

  saveAdjust(wireId, select, input, error) {
    const wire = this.model.wires.find((w) => w.id === wireId);
    let next;
    try {
      next = adjustment(wire.level, Number(select.value), input.value);
    } catch (problem) {
      error.textContent = problem.message;
      return;
    }
    try {
      this.store?.update((doc) => {
        doc.prefs = { ...doc.prefs, readiness_adjust: { ...(doc.prefs?.readiness_adjust ?? {}), [wireId]: next } };
      });
    } catch {
      // A store that cannot save keeps the level on this page only.
    }
    this.render();
  }

  clearAdjust(wireId) {
    try {
      this.store?.update((doc) => {
        const rest = { ...(doc.prefs?.readiness_adjust ?? {}) };
        delete rest[wireId];
        doc.prefs = { ...doc.prefs, readiness_adjust: rest };
      });
    } catch {
      // As saveAdjust: on this page only.
    }
    this.render();
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
    // The evidence level and the learner's own level sit side by side, one row per wire (BP-5.4 §5).
    const levelTable = (levels) => (levels.length === 0
      ? el("p", { class: "sheet-empty", text: "No wires yet." })
      : el("div", { class: "sheet-table" }, el("table", { class: "sheet-levels" },
        el("thead", {}, el("tr", {},
          el("th", { scope: "col", text: "Wire" }), el("th", { scope: "col", text: "Evidence" }),
          el("th", { scope: "col", text: "Set by you" }), el("th", { scope: "col", text: "Reason" }))),
        el("tbody", {}, ...levels.map((l) => el("tr", {},
          el("th", { scope: "row", text: l.short }),
          el("td", { text: `L${l.evidence}: ${LEVEL_WORDS[l.evidence]}` }),
          el("td", { text: l.adjusted ? `L${l.level}: ${LEVEL_WORDS[l.level]}` : "not set" }),
          el("td", { text: l.adjusted ? l.reason : "" })))))));
    const dataList = (items, empty) => items.length === 0
      ? el("p", { class: "sheet-empty", text: empty })
      : el("ul", { class: "sheet-list" }, ...items.map((text) => el("li", { text })));
    return el("article", { class: "brag-sheet", "aria-label": "Brag sheet" },
      el("h3", { class: "sheet-title", text: "HARNESSED: what I can show" }),
      sheet.name ? el("p", { class: "sheet-name", text: sheet.name }) : null,
      el("p", { class: "sheet-date", text: `Date: ${sheet.date}` }),
      el("h4", { text: "Levels by wire" }),
      levelTable(sheet.levels),
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
    this.model = model;
    this.adjustments = this.store?.state?.prefs?.readiness_adjust ?? {};
    const name = String(this.store?.state?.prefs?.brag_name ?? "");
    const sheet = bragData(this.course, model, evidence, name, todayIso(), this.adjustments);
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
        el("p", { class: "brag-note", text: "The sheet prints in black on white, with no buttons." }),
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
    // The honest adjustment: the choices stop below the evidence, a lower level needs one line of reason, and undo
    // returns to the evidence. The adjustment is stored in the learner's preferences, so the test clears it at the end.
    const select = () => this.ui.querySelector('select[data-key="adjust-level-loop"]');
    const reason = () => this.ui.querySelector('input[data-key="adjust-reason-loop"]');
    const save = () => this.ui.querySelector('button[data-key="adjust-save-loop"]');
    const undo = () => this.ui.querySelector('button[data-key="adjust-undo-loop"]');
    if (!select() || !reason() || !save()) return false;
    if (select().options.length !== this.levelOf("loop")) return false;
    select().value = "1";
    reason().value = "";
    save().click();
    if (this.levelOf("loop") !== 3 || !save().closest("details").querySelector(".adjust-error")?.textContent) return false;
    reason().value = "The exits are not clear to me yet";
    select().value = "1";
    save().click();
    if (this.levelOf("loop") !== 1) return false;
    if (this.ui.querySelector('tr[data-wire="loop"]')?.dataset.evidence !== "3") return false;
    undo()?.click();
    if (this.levelOf("loop") !== 3) return false;
    this.clearAdjust("loop");
    this.testEvidence = null;
    this.render();
    return this.levelOf("loop") === 0;
  }
}

customElements.define("hx-readiness", HxReadiness);
