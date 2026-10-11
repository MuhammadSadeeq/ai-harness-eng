// tools/fill_nums.mjs (Phase 6 accuracy): the static fallback of each hx-num is the value its bench shows after a run.
// The unit tests check the formats, the one-call-per-board equivalence the generator relies on, and the skip rules. The
// browser test runs one bench for real and compares what it shows with the fallback the page has.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const fill = await import(pathToFileURL(path.join(ROOT, "tools/fill_nums.mjs")).href);
const sim = await import(pathToFileURL(path.join(ROOT, "site/assets/sim/index.js")).href);
const stats = await import(pathToFileURL(path.join(ROOT, "site/assets/components/lib/stats.js")).href);

const CAP = { tape: "c2-flood", old: "c2-old", new: "c2-new", trials: "20" };

test("a bench's values are the same whether its trials come in one call or one trial at a time", () => {
  const tape = sim.parseStrictJson(readFileSync(path.join(ROOT, "site/data/scenarios/c2-flood.json"), "utf8"));
  const board = (id) => sim.parseStrictJson(readFileSync(path.join(ROOT, "site/data/scenarios/boards", `${id}.json`), "utf8"));
  const facts = JSON.parse(readFileSync(path.join(ROOT, "site/data/facts-core.json"), "utf8"));
  const whole = sim.runBench(tape, board("c2-old"), 20, { facts }).trials;
  const oneByOne = Array.from({ length: 20 }, (_, i) =>
    sim.runBench({ ...tape, seed_base: tape.seed_base + i }, board("c2-old"), 1, { facts }).trials[0]);
  assert.deepEqual(oneByOne, whole);
  assert.deepEqual(stats.summarize(oneByOne), stats.summarize(whole));
});

test("the value of a bench is what its component's values() reports, formatted by formatText", () => {
  const bench = fill.benchValues(CAP);
  assert.equal(typeof bench.values["passed.old"], "number");
  assert.equal(fill.numText("passed.old", "", bench, bench.values["passed.old"]), String(bench.values["passed.old"]));
  assert.equal(fill.numText("trials", "", bench, 20), "20");
  assert.equal(fill.numText("worst_cost.old", "usd", { pricedOld: true, pricedNew: true }, 115000000), "$0.1150");
  assert.equal(fill.numText("cost_per_pass.old", "money", { pricedOld: true, pricedNew: false }, 3800), "≈ $0.0000");
  assert.equal(fill.numText("cost_per_pass.old", "money", { pricedOld: false, pricedNew: false }, 3800), "≈ 0.0000 units");
});

test("a fallback that differs from the run is reported, and the fill makes it match", () => {
  const html = `<p><hx-bench id="cap" tape="c2-flood" old="c2-old" new="c2-new" trials="20"></hx-bench>` +
    `<hx-num for="cap" name="passed.old">5</hx-num></p>`;
  const [row] = fill.scanPage(html, "page.html");
  assert.equal(row.reason, undefined);
  assert.notEqual(row.inner.trim(), row.expected, "5 is not the run's value");
  const filled = fill.fillPage(html, "modules/x.html");
  const [after] = fill.scanPage(filled, "page.html");
  assert.equal(after.inner.trim(), after.expected);
  assert.equal(fill.fillPage(filled, "modules/x.html"), filled, "filling twice changes nothing");
});

test("a knob bench starts at the new board's knob value; a dice shows its formulas; an evalbench runs its start tasks", () => {
  const knob = fill.benchValues({ tape: "b2-spiral", old: "b2-old", new: "b2-new", knob: "turn_limit.max_turns", "knob-min": "4", "knob-max": "30", trials: "20" });
  assert.equal(knob.values.knob, 12, "the default knob is the new board's turn limit");
  assert.equal(typeof knob.values["passed.new"], "number");
  const dice = fill.diceValues({ p: "80", k: "3" });
  assert.equal(dice.values.pass_at_k, 99, "1 - 0.2^3 = 99.2%");
  assert.equal(dice.values.pass_hat_k, 51, "0.8^3 = 51.2%");
  const e1 = fill.evalbenchValues("../data/labs/E1/evalbench.json", path.join(ROOT, "site/modules/x.html"));
  assert.equal(e1.values["leaked.old"], 16, "the default run leaks 16 of 20 on the open board");
  assert.equal(e1.values["runs.old"], 20);
  assert.equal(e1.values["leaked.new"], 0, "and none on the egress board");
});

test("the demo page is not filled, and no module page has a value left alone", () => {
  const rows = fill.scanSite();
  assert.ok(!rows.some((row) => row.page === "site/labs/bench.html"), "labs/bench.html is left as it is");
  assert.deepEqual(rows.filter((row) => row.reason).map((row) => `${row.page}:${row.line}`), []);
});

test("every computed fallback on the site matches its run, and none is still a dash", () => {
  const rows = fill.scanSite();
  const computed = rows.filter((row) => !row.reason);
  assert.ok(computed.length >= 60, `expected the site's bench fallbacks, found ${computed.length}`);
  const stale = computed.filter((row) => row.inner.trim() !== row.expected);
  assert.deepEqual(stale.map((row) => `${row.page}:${row.line} ${row.name}`), []);
});

// The browser test: one bench runs for real, and the number it shows is the number the page has without JavaScript.
async function serveSite() {
  const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
    ".json": "application/json", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    try {
      const body = readFileSync(path.join(ROOT, "site", p));
      res.writeHead(200, { "content-type": types[path.extname(p)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function launch() {
  const require = createRequire(path.join(ROOT, "package.json"));
  const { chromium } = require("playwright");
  return chromium.launch({ headless: true });
}

test("one bench run in the browser shows the value the page's fallback has", async (t) => {
  let browser;
  try {
    browser = await launch();
  } catch (error) {
    t.skip(`no browser for the run: ${String(error.message).split("\n")[0]}`);
    return;
  }
  const server = await serveSite();
  const base = server.base;
  const page = await browser.newPage();
  try {
    await page.goto(`${base}/modules/context-budget.html`, { waitUntil: "load" });
    const bench = page.locator("hx-bench#cap-bench");
    await bench.scrollIntoViewIfNeeded();
    await bench.locator('[data-key="run"]').first().waitFor({ timeout: 30000 });
    await bench.locator('[data-key="run"]').first().click();
    // What a sighted reader sees: the text without the screen-reader words ("not run yet" while pending).
    const visible = () => page.evaluate(() => {
      const el = document.querySelector('hx-num[for="cap-bench"][name="passed.old"] .hx-num-text');
      if (!el) return null;
      return [...el.childNodes].filter((node) => !node.classList?.contains("sr-only"))
        .map((node) => node.textContent).join("").trim();
    });
    await page.waitForFunction(() => {
      const el = document.querySelector('hx-num[for="cap-bench"][name="passed.old"] .hx-num-text');
      if (!el) return false;
      const text = [...el.childNodes].filter((node) => !node.classList?.contains("sr-only"))
        .map((node) => node.textContent).join("").trim();
      return text !== "" && text !== "—";
    }, null, { timeout: 60000 });
    const ran = await visible();
    const html = readFileSync(path.join(ROOT, "site/modules/context-budget.html"), "utf8");
    const row = fill.scanPage(html, "modules/context-budget.html").find((r) => r.id === "cap-bench" && r.name === "passed.old");
    assert.ok(row && !row.reason, "the page's passed.old is computed");
    assert.equal(row.inner.trim(), ran, "the static fallback is what the run shows");
    assert.equal(row.expected, ran);
  } finally {
    await page.close();
    await browser.close();
    server.server.close();
  }
});

test("a default-state value equals what the bench shows after a real run with no knob moved (B2)", async (t) => {
  let browser;
  try {
    browser = await launch();
  } catch (error) {
    t.skip(`no browser for the run: ${String(error.message).split("\n")[0]}`);
    return;
  }
  const server = await serveSite();
  const page = await browser.newPage();
  try {
    await page.goto(`${server.base}/modules/the-agent-loop.html`, { waitUntil: "load" });
    const bench = page.locator("hx-bench#bench-par");
    await bench.scrollIntoViewIfNeeded();
    await bench.locator('[data-key="run"]').first().waitFor({ timeout: 30000 });
    // No knob is moved: the run is the default state, the starting turn limit.
    await bench.locator('[data-key="run"]').first().click();
    const shown = () => page.evaluate(() => {
      const el = document.querySelector('hx-num[for="bench-par"][name="passed.new"] .hx-num-text');
      if (!el) return "";
      return [...el.childNodes].filter((node) => !node.classList?.contains("sr-only"))
        .map((node) => node.textContent).join("").trim();
    });
    await page.waitForFunction(() => {
      const el = document.querySelector('hx-num[for="bench-par"][name="passed.new"] .hx-num-text');
      if (!el) return false;
      const text = [...el.childNodes].filter((node) => !node.classList?.contains("sr-only"))
        .map((node) => node.textContent).join("").trim();
      return text !== "" && text !== "—";
    }, null, { timeout: 120000 });
    const ran = await shown();
    const html = readFileSync(path.join(ROOT, "site/modules/the-agent-loop.html"), "utf8");
    const row = fill.scanPage(html, "modules/the-agent-loop.html").find((r) => r.id === "bench-par" && r.name === "passed.new");
    assert.ok(row && !row.reason, "the page's passed.new is computed");
    assert.equal(row.inner.trim(), ran, "the default-state value is what the run shows");
    assert.equal(row.expected, ran);
  } finally {
    await page.close();
    await browser.close();
    server.server.close();
  }
});
