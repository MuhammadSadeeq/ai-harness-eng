#!/usr/bin/env node
// fill_nums: writes the value each static hx-num fallback shows at its component's default state, so a page reads right
// with no JavaScript (Phase 6 accuracy). The value is what a run shows when the learner changes nothing: the component's
// own values() and formatText() on the same runs (runBench, runEval, the dice formulas), so the formats cannot drift.
//
//   node tools/fill_nums.mjs            writes the fallbacks in site/**/*.html
//   node tools/fill_nums.mjs --check    fails when a fallback differs from the default-state value (CI)
//   node tools/fill_nums.mjs --list     lists the hx-nums that are not filled, and why
//
// The defaults: a bench with a knob starts at the new board's current value of the knob; a dice shows its p and k; an
// evalbench runs its start tasks on its boards with its own trials and the code grader. A demo page (DEMO_PAGES) is
// left as it is.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The components import in Node with these stubs (as their unit tests do); the browser parts are never called.
globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(REPO, "site");
const sim = await import(pathToFileURL(path.join(SITE, "assets/sim/index.js")).href);
const { HxBench, pricedOn } = await import(pathToFileURL(path.join(SITE, "assets/components/hx-bench.js")).href);
const { HxNum } = await import(pathToFileURL(path.join(SITE, "assets/components/hx-num.js")).href);
const { HxDice } = await import(pathToFileURL(path.join(SITE, "assets/components/hx-dice.js")).href);
const evalbench = await import(pathToFileURL(path.join(SITE, "assets/components/hx-evalbench.js")).href);
const { summarize } = await import(pathToFileURL(path.join(SITE, "assets/components/lib/stats.js")).href);

const { runBench, runEval, parseStrictJson, loadEval } = sim;
const DEFAULT_TRIALS = 20;
const DEMO_PAGES = new Set(["site/labs/bench.html"]);

/** The attributes of an element's start tag, by name (boolean attributes are ""). */
export function attributesOf(attrText) {
  const out = {};
  const pattern = /([A-Za-z_:][-A-Za-z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  for (const match of attrText.matchAll(pattern)) out[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  return out;
}

function escapeText(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Every .html file under dir, except the vendored engines (site/vendor). */
export function pageFiles(dir = SITE) {
  const files = [];
  const walk = (folder) => {
    for (const name of readdirSync(folder).sort()) {
      const full = path.join(folder, name);
      if (statSync(full).isDirectory()) {
        if (!(folder === dir && name === "vendor")) walk(full);
      } else if (name.endsWith(".html")) {
        files.push(full);
      }
    }
  };
  walk(dir);
  return files;
}

const cache = new Map();
const memo = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};
const loadTape = (id) => memo(`tape:${id}`, () => parseStrictJson(readFileSync(path.join(SITE, "data/scenarios", `${id}.json`), "utf8")));
const loadBoard = (id) => memo(`board:${id}`, () => parseStrictJson(readFileSync(path.join(SITE, "data/scenarios/boards", `${id}.json`), "utf8")));
const loadFacts = () => memo("facts", () => JSON.parse(readFileSync(path.join(SITE, "data/facts-core.json"), "utf8")));

/** The knob's default: the new board's current value, snapped to the knob's range (the component's parseKnob). */
function knobConfig(attrs, newBoard) {
  const [module, param] = attrs.knob.split(".");
  const min = Number(attrs["knob-min"]);
  const max = Number(attrs["knob-max"]);
  const step = Number(attrs["knob-step"] ?? 1);
  const current = newBoard.modules?.[module]?.[param];
  const cfg = { name: attrs.knob, module, param, min, max, step };
  const start = HxBench.prototype.snap.call({}, Number.isInteger(current) ? current : min, cfg);
  return { ...cfg, start };
}

/** A bench's values at its default state: the component's values() after one run with its defaults. */
export function benchValues(attrs) {
  return memo(`bench:${JSON.stringify(attrs)}`, () => {
    const tape = loadTape(attrs.tape);
    const oldBoard = loadBoard(attrs.old ?? tape.boards[0]);
    const newBoard = loadBoard(attrs.new ?? tape.boards[1]);
    const trials = Number(attrs.trials ?? DEFAULT_TRIALS);
    const facts = loadFacts();
    const knobCfg = attrs.knob !== undefined ? knobConfig(attrs, newBoard) : null;
    const knob = knobCfg ? knobCfg.start : null;
    const board = HxBench.prototype.boardAt.call({ knobCfg, newBoard }, knob);
    const oldTrials = runBench(tape, oldBoard, trials, { facts }).trials;
    const newTrials = runBench(tape, board, trials, { facts }).trials;
    const run = { value: knob, old: summarize(oldTrials), new: summarize(newTrials), oldTrials, newTrials };
    const values = HxBench.prototype.values.call({ knobCfg, state: { knob, run }, N: trials });
    return { values, pricedOld: pricedOn(tape, oldBoard), pricedNew: pricedOn(tape, newBoard) };
  });
}

/** A dice's values: its formulas on its p and k (the component's hxValue; a dice runs nothing). */
export function diceValues(attrs) {
  const state = { p: Number(attrs.p ?? 90), k: Number(attrs.k ?? 3) };
  const values = {};
  for (const name of ["p", "k", "pass_at_k", "pass_hat_k"]) values[name] = HxDice.prototype.hxValue.call({ state }, name);
  return { values, pricedOld: false, pricedNew: false };
}

/** An evalbench's values at its default state: its start tasks, run on its boards with its trials and the code grader. */
export function evalbenchValues(srcAttr, pageAbs) {
  const srcPath = path.resolve(path.dirname(pageAbs), srcAttr);
  return memo(`evalbench:${srcPath}`, () => {
    const data = evalbench.validEvalbench(JSON.parse(readFileSync(srcPath, "utf8")));
    const evalPath = data.eval.endsWith(".json")
      ? path.resolve(path.dirname(srcPath), data.eval)
      : path.join(SITE, "data/evals", `${data.eval}.json`);
    const E = loadEval(JSON.parse(readFileSync(evalPath, "utf8")));
    const facts = loadFacts();
    const tapeIds = [...new Set(E.tasks.map((t) => t.tape))];
    const tapes = Object.fromEntries(tapeIds.map((id) => [id, loadTape(id)]));
    const sides = evalbench.sidesOf(data.boards);
    const boards = Object.fromEntries(sides.map((side) => [side, loadBoard(data.boards[side])]));
    const leakable = tapeIds.some((id) => (tapes[id]?.canaries ?? []).length > 0);
    const checked = data.start_tasks.slice();
    const indexes = E.tasks.map((t, i) => (checked.includes(t.id) ? i : -1)).filter((i) => i >= 0);
    const trials = data.trials ?? 5;
    const rows = Object.fromEntries(sides.map((side) => [side, []]));
    for (const side of sides) {
      for (const i of indexes) {
        rows[side].push(...runEval(evalbench.taskSpec(E, i, trials), tapes, boards[side], { facts }).results);
      }
    }
    const taskIds = indexes.map((i) => E.tasks[i].id);
    const tallies = Object.fromEntries(sides.map((side) => [side, evalbench.tally(rows[side], taskIds)]));
    const result = { trials, grader: "code", taskIds, sides, leakable, rows, ...tallies };
    const values = {};
    for (const side of ["old", "mid", "new"]) {
      for (const name of ["leaked", "runs", "asr"]) {
        const key = `${name}.${side}`;
        values[key] = evalbench.readoutValue(result, key);
      }
    }
    return { values, pricedOld: false, pricedNew: false };
  });
}

/** The text hx-num shows for a value: the component's own formatText, with the bench's pricing. */
export function numText(name, format, priced, value) {
  const fake = {
    format,
    name,
    target: { hxPriced: (n) => HxBench.prototype.hxPriced.call({ pricedOld: priced.pricedOld, pricedNew: priced.pricedNew }, n) },
  };
  return HxNum.prototype.formatText.call(fake, value);
}

/** The elements of a page that hx-num can name: their kind and attributes, by id. */
function targetsOf(html) {
  const targets = new Map();
  for (const match of html.matchAll(/<hx-(bench|evalbench|dice)\b([^>]*)>/g)) {
    const attrs = attributesOf(match[2]);
    if (attrs.id) targets.set(attrs.id, { kind: match[1], attrs });
  }
  return targets;
}

/** The value and the text for one hx-num, or the reason it has none. */
function resolve(target, name, format, pageAbs) {
  if (!target) return { reason: "no hx-bench, hx-evalbench or hx-dice with that id on the page" };
  const computed =
    target.kind === "bench" ? benchValues(target.attrs)
      : target.kind === "evalbench" ? evalbenchValues(target.attrs.src, pageAbs)
        : diceValues(target.attrs);
  if (!(name in computed.values)) return { reason: `no value named ${name}` };
  const value = computed.values[name];
  if (value === null || value === undefined) return { reason: `no value for ${name} at the default state` };
  return { value, text: numText(name, format, computed, value) };
}

/** The hx-nums of one page, each with its default-state text or the reason it has none. */
export function scanPage(html, pageRel) {
  const pageAbs = path.join(REPO, pageRel);
  const targets = targetsOf(html);
  const rows = [];
  for (const match of html.matchAll(/<hx-num\b([^>]*)>([^<]*)<\/hx-num>/g)) {
    const attrs = attributesOf(match[1]);
    const line = html.slice(0, match.index).split("\n").length;
    const base = { page: pageRel, line, name: attrs.name ?? "", id: attrs.for ?? "", inner: match[2] };
    const result = resolve(targets.get(attrs.for), attrs.name ?? "", attrs.format ?? "", pageAbs);
    rows.push(result.reason ? { ...base, reason: result.reason } : { ...base, expected: result.text });
  }
  return rows;
}

/** Every page under site/ that the fill covers: all of them but the demo pages. */
export function scanSite(dir = SITE) {
  const rows = [];
  for (const file of pageFiles(dir)) {
    const pageRel = path.relative(REPO, file);
    if (DEMO_PAGES.has(pageRel)) continue;
    rows.push(...scanPage(readFileSync(file, "utf8"), pageRel));
  }
  return rows;
}

/** The page text with each filled hx-num's inner text set to its default-state text. */
export function fillPage(html, pageRel) {
  const pageAbs = path.join(REPO, pageRel);
  const targets = targetsOf(html);
  return html.replace(/(<hx-num\b[^>]*>)([^<]*)(<\/hx-num>)/g, (whole, open, inner, close) => {
    const attrs = attributesOf(open.slice("<hx-num".length, -1));
    const result = resolve(targets.get(attrs.for), attrs.name ?? "", attrs.format ?? "", pageAbs);
    return result.reason ? whole : open + escapeText(result.text) + close;
  });
}

function main(argv) {
  const check = argv.includes("--check");
  const list = argv.includes("--list");
  const rows = scanSite();
  const left = rows.filter((r) => r.reason);
  const computed = rows.filter((r) => !r.reason);
  if (list) {
    for (const row of left) console.log(`${row.page}:${row.line} ${row.id} ${row.name}: ${row.reason}`);
    for (const page of DEMO_PAGES) console.log(`${page}: a demo page, left as it is`);
    console.log(`left alone: ${left.length}; computed: ${computed.length}`);
    return 0;
  }
  if (check) {
    const problems = computed.filter((r) => r.inner.trim() !== r.expected);
    for (const p of problems) {
      console.log(`${p.page}:${p.line}: hx-num ${p.id} ${p.name} reads '${p.inner.trim()}', the default state gives '${p.expected}'`);
    }
    if (problems.length) {
      console.log(`fill_nums: FAILED (${problems.length} of ${computed.length} fallbacks differ)`);
      return 1;
    }
    console.log(`fill_nums: ${computed.length} fallbacks OK; ${left.length} left alone (see --list)`);
    return 0;
  }
  let written = 0;
  for (const file of pageFiles()) {
    const pageRel = path.relative(REPO, file);
    if (DEMO_PAGES.has(pageRel)) continue;
    const html = readFileSync(file, "utf8");
    const next = fillPage(html, pageRel);
    if (next !== html) {
      writeFileSync(file, next, "utf8");
      written += 1;
    }
  }
  console.log(`fill_nums: wrote ${written} pages; ${computed.length} fallbacks at the default state; ${left.length} left alone`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
