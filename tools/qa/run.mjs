#!/usr/bin/env node
// HARNESSED browser QA (BP-0.5A section 7). Serves site/ on 127.0.0.1, then per page:
//   width x theme: console errors, page errors, failed requests, HTTP >= 400, horizontal
//   scroll, design tokens and fonts loaded, (1280) same-origin links resolve, text under 14 px (SVG text
//   at its rendered size), hx-* self-tests, full-page screenshot;
//   375 and 1280, every theme: axe (serious/critical fail, moderate warn);
//   1280 light: page weight, CVD screenshots;
//   reduced motion: no running animation longer than 150 ms.
// Usage: node tools/qa/run.mjs [--only <path>...] [--out <dir>] [--widths 375,768,1280]
//        [--themes light,dark] [--cvd] [--no-axe]
// The last stdout line is "qa: <pages> pages, <shots> screenshots, <n> failures".

import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SITE = path.join(ROOT, "site");
const WEIGHT_BUDGET_BYTES = 300 * 1000;
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const MIN_FONT_PX = 14;
const hookCounts = []; // self-tests run per page view (reset per page)
const ACCEPTED_LABS = new URL("./accepted-labs.txt", import.meta.url);
const CVD_TYPES = ["protan", "deutan", "tritan"];
// Machado et al. 2009, severity 1.0, applied in linearRGB (same as check_palette.py).
const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};
const GZIP_TYPES = new Set([".html", ".css", ".js", ".mjs", ".json", ".svg", ".txt", ".wasm"]);

function parseArgs(argv) {
  const opts = {
    only: null,
    out: path.join(ROOT, "tools", "qa", "out"),
    widths: [375, 768, 1280],
    themes: ["light", "dark"],
    cvd: false,
    axe: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--only") {
      opts.only = [];
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        i += 1;
        opts.only.push(argv[i]);
      }
    } else if (arg === "--out") {
      i += 1;
      opts.out = path.resolve(argv[i]);
    } else if (arg === "--widths") {
      i += 1;
      opts.widths = argv[i].split(",").map((w) => Number(w));
    } else if (arg === "--themes") {
      i += 1;
      opts.themes = argv[i].split(",");
    } else if (arg === "--cvd") {
      opts.cvd = true;
    } else if (arg === "--no-axe") {
      opts.axe = false;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (opts.widths.some((w) => !Number.isInteger(w) || w < 200)) throw new Error("bad --widths");
  if (opts.themes.some((t) => t !== "light" && t !== "dark")) throw new Error("bad --themes");
  return opts;
}

async function listHtml(dir, base = "") {
  const found = [];
  for (const entry of await readdir(path.join(dir, base), { withFileTypes: true })) {
    // vendor/: third-party files; proto/: design-exploration prototypes, QA'd
    // explicitly with --only by their builders (DECISIONS D-031).
    if (entry.name === "vendor" || (!base && entry.name === "proto")) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...(await listHtml(dir, rel)));
    else if (entry.name.endsWith(".html")) found.push(rel);
  }
  return found.sort();
}

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith("/")) rel += "index.html";
      const file = path.normalize(path.join(SITE, rel));
      if (!file.startsWith(SITE + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const data = await readFile(file);
      const ext = path.extname(file).toLowerCase();
      const headers = { "Content-Type": MIME[ext] ?? "application/octet-stream", "Cache-Control": "no-cache" };
      let body = data;
      if (GZIP_TYPES.has(ext) && String(req.headers["accept-encoding"] ?? "").includes("gzip")) {
        body = gzipSync(data);
        headers["Content-Encoding"] = "gzip";
        headers.Vary = "Accept-Encoding";
      }
      headers["Content-Length"] = String(body.length);
      res.writeHead(200, headers).end(body);
    } catch (error) {
      const missing = error && (error.code === "ENOENT" || error.code === "EISDIR");
      res.writeHead(missing ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" }).end("not found");
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const SMALL_TEXT_JS = () => {
  const selectorOf = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" && el.className.trim()
      ? `.${el.className.trim().split(/\s+/).join(".")}` : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const ownText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim() !== "");
    if (!ownText) continue;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (rect.width === 0 || rect.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
    // SVG text renders at its font size times the figure's scale (a 600-unit
    // viewBox drawn 300 px wide halves it), so measure what the reader sees.
    let px = parseFloat(cs.fontSize);
    if (el instanceof SVGGraphicsElement && el.getScreenCTM()) {
      const m = el.getScreenCTM();
      px = Math.round(px * Math.hypot(m.a, m.b) * 10) / 10;
    }
    if (px < 14) out.push(`${selectorOf(el)} ${px}px`);
  }
  return out;
};

async function checkPageLoad(page, url, width, screenshotPath) {
  const failures = [];
  let shot = false;
  const onConsole = (msg) => {
    if (msg.type() === "error") failures.push(`console error: ${msg.text()}`);
  };
  const onPageError = (error) => failures.push(`page error: ${error.message}`);
  const onFailed = (request) => failures.push(`request failed: ${request.url()} (${request.failure()?.errorText ?? "?"})`);
  const onResponse = (response) => {
    if (response.status() >= 400) failures.push(`HTTP ${response.status()}: ${response.url()}`);
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("requestfailed", onFailed);
  page.on("response", onResponse);
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    // Audit the upgraded UI, not the loading state: wait until every hx-* element has settled
    // (ready or failed; a failure is reported by its self-test), at most 60 s (Python in a kata).
    await page.evaluate(async () => {
      const { REGISTRY } = await import("/assets/components/registry.js");
      // Components below the fold load as their element nears the viewport (shell/loader.js): visit each one,
      // then return to the top, so every registered element can settle.
      for (const el of [...document.querySelectorAll("*")].filter((e) => Object.hasOwn(REGISTRY, e.localName))) {
        el.scrollIntoView({ block: "center" });
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      window.scrollTo(0, 0);
      const settle = async () => {
        const tags = new Set([...document.querySelectorAll("*")].map((el) => el.localName)
          .filter((tag) => Object.hasOwn(REGISTRY, tag)));
        await Promise.all([...tags].map((tag) => customElements.whenDefined(tag)));
        await Promise.all([...document.querySelectorAll([...tags].join(",") || "hx-none")]
          .map((el) => el.ready));
      };
      await Promise.race([settle(), new Promise((resolve) => setTimeout(resolve, 60000))]);
    });
    // A registered component that never upgraded, or that fell back to its no-JS content, fails.
    const unready = await page.evaluate(async () => {
      const { REGISTRY } = await import("/assets/components/registry.js");
      return [...document.querySelectorAll("*")]
        .filter((el) => Object.hasOwn(REGISTRY, el.localName))
        .filter((el) => !el.hasAttribute("data-hx-ready") || el.hasAttribute("data-hx-error"))
        .map((el) => `${el.localName}${el.id ? "#" + el.id : ""}: ${el.getAttribute("data-hx-error") ?? "not ready after 60 s"}`);
    });
    for (const item of unready) failures.push(`component not ready: ${item}`);
    // The token sheet and the fonts must actually load (a page once passed QA
    // with tokens.css unlinked and every colour and font token undefined).
    const sheet = await page.evaluate(() => ({
      paper: getComputedStyle(document.documentElement).getPropertyValue("--hx-paper").trim(),
      failedFonts: [...document.fonts].filter((f) => f.status === "error").map((f) => f.family),
    }));
    if (!sheet.paper) failures.push("design tokens missing: --hx-paper is undefined (is tokens.css linked?)");
    for (const family of sheet.failedFonts) failures.push(`font failed to load: ${family}`);
    const dims = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    if (dims.scrollWidth > dims.innerWidth) {
      failures.push(`horizontal scroll: scrollWidth ${dims.scrollWidth} > innerWidth ${dims.innerWidth}`);
    }
    // DESIGN §9: nothing under 14 px at any width.
    const small = await page.evaluate(SMALL_TEXT_JS);
    for (const item of small) failures.push(`text under ${MIN_FONT_PX}px at ${width}: ${item}`);
    if (width === 1280) {
      // Every same-origin link must resolve: pages that do not exist yet are not links.
      const hrefs = await page.evaluate(() => [...new Set([...document.querySelectorAll("a[href]")]
        .map((a) => new URL(a.getAttribute("href"), location.href))
        .filter((u) => u.origin === location.origin)
        .map((u) => u.origin + u.pathname))]);
      for (const href of hrefs) {
        const response = await page.request.get(href);
        if (response.status() >= 400) failures.push(`broken link: ${href.replace(/^https?:\/\/[^/]+/, "")} (HTTP ${response.status()})`);
      }
    }
    const tests = await runHooks(page);
    for (const item of tests.failures) failures.push(item);
    hookCounts.push(tests.count);
    await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled", caret: "hide" });
    shot = true;
  } catch (error) {
    failures.push(`navigation or capture failed: ${error.message.split("\n")[0]}`);
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("requestfailed", onFailed);
    page.off("response", onResponse);
  }
  return { failures, shot };
}

// Runs every hx-* element's __test.run() (it drives the real UI). Returns the
// number of hooks run and any failures.
async function runHooks(page) {
  return page.evaluate(async () => {
    const failures = [];
    let count = 0;
    for (const el of document.querySelectorAll("*")) {
      const name = el.tagName.toLowerCase();
      if (!name.startsWith("hx-") || !el.__test || typeof el.__test.run !== "function") continue;
      count += 1;
      try {
        const ok = await el.__test.run();
        if (ok === false) failures.push(`${name}: self-test returned false`);
      } catch (error) {
        failures.push(`${name}: self-test threw ${error.message}`);
      }
    }
    return { count, failures };
  });
}

async function checkAxe(page) {
  const failures = [];
  const warnings = [];
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  for (const violation of results.violations) {
    const nodes = violation.nodes.length;
    // name the first offending node, so an intermittent failure can be traced from the log alone
    const first = violation.nodes[0];
    const where = first ? ` at ${first.target.join(" ")} ${first.html.slice(0, 120).replace(/\s+/g, " ")}` : "";
    const line = `axe ${violation.impact ?? "unknown"} ${violation.id}: ${violation.help} (${nodes} nodes)${where}`;
    if (violation.impact === "serious" || violation.impact === "critical") failures.push(line);
    else if (violation.impact === "moderate") warnings.push(line);
  }
  return { failures, warnings, violations: results.violations.length };
}

async function checkWeight(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
  const page = await context.newPage();
  const responses = [];
  const onResponse = (response) => responses.push(response);
  page.on("response", onResponse);
  let total = 0;
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForLoadState("networkidle");
    for (const response of responses) {
      const u = response.url();
      if (u.includes("/vendor/pyodide/") || u.includes("/vendor/codemirror")) continue;
      const sizes = await response.request().sizes();
      total += sizes.responseBodySize + sizes.responseHeadersSize;
    }
  } finally {
    page.off("response", onResponse);
    await context.close();
  }
  return total;
}

async function checkReducedMotion(browser, url) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const long = await page.evaluate(() =>
      document.getAnimations()
        .filter((a) => a.playState === "running")
        .map((a) => {
          const timing = a.effect ? a.effect.getComputedTiming() : null;
          const duration = timing && typeof timing.duration === "number" ? timing.duration : 0;
          const target = a.effect && a.effect.target ? a.effect.target : null;
          const name = target && target.tagName ? target.tagName.toLowerCase() : "?";
          return { name, duration };
        })
        .filter((item) => item.duration > 150)
    );
    return long.map((item) => `reduced motion: running animation ${item.duration} ms on ${item.name}`);
  } finally {
    await context.close();
  }
}

async function runCvd(page, pageSlug, outDir, shots) {
  const failures = [];
  await page.evaluate((matrices) => {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.id = "qa-cvd-defs";
    svg.style.position = "absolute";
    const defs = document.createElementNS(ns, "defs");
    for (const [type, m] of Object.entries(matrices)) {
      const filter = document.createElementNS(ns, "filter");
      filter.id = `cvd-${type}`;
      filter.setAttribute("color-interpolation-filters", "linearRGB");
      const matrix = document.createElementNS(ns, "feColorMatrix");
      matrix.setAttribute("type", "matrix");
      const rows = [...m.map((r) => [...r, 0, 0]), [0, 0, 0, 1, 0]];
      matrix.setAttribute("values", rows.flat().join(" "));
      filter.append(matrix);
      defs.append(filter);
    }
    svg.append(defs);
    document.body.append(svg);
  }, MACHADO);
  for (const type of CVD_TYPES) {
    await page.evaluate((id) => {
      document.documentElement.style.filter = `url(#cvd-${id})`;
    }, type);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const file = path.join(outDir, `${pageSlug}-cvd-${type}.png`);
    try {
      await page.screenshot({ path: file, fullPage: true, animations: "disabled", caret: "hide" });
      shots.push(file);
    } catch (error) {
      failures.push(`cvd ${type} screenshot failed: ${error.message.split("\n")[0]}`);
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.filter = "";
    document.getElementById("qa-cvd-defs")?.remove();
  });
  return failures;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  // Demo pages under labs/ are QA'd by default only once the director has accepted
  // them (tools/qa/accepted-labs.txt): builders' unreviewed pages may be committed
  // as work in progress, and builders check them with --only.
  const accepted = new Set((await readFile(ACCEPTED_LABS, "utf8").catch(() => ""))
    .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
  const all = (await listHtml(SITE)).filter((p) => !p.startsWith("labs/") || accepted.has(p));
  let pages = all;
  if (opts.only) {
    pages = opts.only.map((p) => p.replace(/^\.\//, "").replace(/\\/g, "/"));
    for (const p of pages) {
      // --only may name any existing page under site/, including ones that default
      // discovery skips (proto/); it must stay inside site/ and end in .html.
      const abs = path.resolve(SITE, p);
      const inside = abs.startsWith(path.resolve(SITE) + path.sep);
      if (!inside || !p.endsWith(".html") || !existsSync(abs)) {
        throw new Error(`--only: not a page under site/: ${p}`);
      }
    }
  }
  await mkdir(opts.out, { recursive: true });
  const server = await startServer();
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true });
  const report = { generated: new Date().toISOString(), screens: [], pages: [], weights: {}, reducedMotion: {}, axe: {}, cvd: [] };
  const shots = [];
  let failureCount = 0;

  try {
    for (const pagePath of pages) {
      const slug = pagePath.replace(/\.html$/, "").replace(/\//g, "__");
      const url = `${base}/${pagePath}`;
      const pageFailures = [];
      const pageWarnings = [];

      for (const width of opts.widths) {
        for (const theme of opts.themes) {
          const context = await browser.newContext({
            viewport: { width, height: 900 },
            colorScheme: theme,
          });
          const page = await context.newPage();
          const file = path.join(opts.out, `${slug}-${width}-${theme}.png`);
          const result = await checkPageLoad(page, url, width, file);
          if (result.shot) shots.push(file);
          report.screens.push({ page: pagePath, width, theme, screenshot: file, failures: result.failures });
          for (const f of result.failures) pageFailures.push(`${width}/${theme}: ${f}`);
          await context.close();
        }
      }

      if (opts.axe) {
        // axe runs at phone and desktop width in every theme: phone layouts swap in
        // different controls (a V2-01 slider error was invisible at 1280 only).
        const axeWidths = [375, 1280].filter((w) => opts.widths.includes(w));
        if (axeWidths.length === 0) axeWidths.push(opts.widths[0]);
        report.axe[pagePath] = {};
        for (const width of axeWidths) {
          for (const theme of opts.themes) {
            const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
            const page = await context.newPage();
            await page.goto(url, { waitUntil: "load" });
            await page.evaluate(() => document.fonts.ready);
            const where = `${width}/${theme}`;
            const axe = await checkAxe(page);
            report.axe[pagePath][where] = { violations: axe.violations, failures: axe.failures, warnings: axe.warnings };
            for (const f of axe.failures) pageFailures.push(`${where}: ${f}`);
            for (const w of axe.warnings) pageWarnings.push(`${where}: ${w}`);
            // Audit again after the hooks drove the UI: controls that only appear after
            // interaction (an unlocked replay, results, par states) must pass too.
            const hooks = await runHooks(page);
            if (hooks.count > 0) {
              const after = await checkAxe(page);
              const whereAfter = `${where} after interaction`;
              report.axe[pagePath][whereAfter] = { violations: after.violations, failures: after.failures, warnings: after.warnings };
              for (const f of after.failures) pageFailures.push(`${whereAfter}: ${f}`);
              for (const w of after.warnings) pageWarnings.push(`${whereAfter}: ${w}`);
            }
            if (opts.cvd && width === 1280 && theme === "light") {
              const cvdFailures = await runCvd(page, slug, opts.out, shots);
              for (const f of cvdFailures) pageFailures.push(`${where}: ${f}`);
              report.cvd.push({ page: pagePath, types: CVD_TYPES });
            }
            await context.close();
          }
        }
      }

      const bytes = await checkWeight(browser, url);
      report.weights[pagePath] = bytes;
      if (bytes > WEIGHT_BUDGET_BYTES) {
        pageFailures.push(`page weight ${bytes} bytes > ${WEIGHT_BUDGET_BYTES} budget`);
      }

      const motion = await checkReducedMotion(browser, url);
      report.reducedMotion[pagePath] = motion;
      for (const m of motion) pageFailures.push(`1280/reduced: ${m}`);

      failureCount += pageFailures.length;
      for (const w of pageWarnings) console.log(`warn: ${pagePath}: ${w}`);
      for (const f of pageFailures) console.log(`fail: ${pagePath}: ${f}`);
      const selfTests = Math.max(0, ...hookCounts);
      hookCounts.length = 0;
      console.log(`page ${pagePath}: weight ${(bytes / 1000).toFixed(1)} KB, ${selfTests} self-tests, ${pageFailures.length} failures`);
      report.pages.push({ page: pagePath, weightBytes: bytes, failures: pageFailures, warnings: pageWarnings });
    }
  } finally {
    await browser.close();
    server.close();
  }

  const shotCount = new Set(shots).size;
  report.summary = { pages: pages.length, screenshots: shotCount, failures: failureCount };
  await writeFile(path.join(opts.out, "report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`qa: ${pages.length} pages, ${shotCount} screenshots, ${failureCount} failures`);
  process.exitCode = failureCount > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
