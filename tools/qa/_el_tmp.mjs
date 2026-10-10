import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = path.resolve("site");
const types = {".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".woff2":"font/woff2"};
const srv = http.createServer((q,r)=>{ let p = path.join(root, decodeURIComponent(q.url.split("?")[0])); fs.readFile(p,(e,d)=>{ if(e){r.writeHead(404);r.end();return;} r.writeHead(200,{"content-type":types[path.extname(p)]||"application/octet-stream"}); r.end(d);});}).listen(0);
const [out, pageName, width, theme, sel, action] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: Number(width), height: 900 }, colorScheme: theme });
await p.goto(`http://localhost:${srv.address().port}/labs/${pageName}.html`); await p.waitForLoadState("networkidle");
const els = await p.$$(sel);
for (const e of els) await p.evaluate((x) => x.ready, e);
if (action === "plug") { for (const e of els) { const k = await e.$("button:has-text('Plug it in')"); if (k) await k.click(); } await p.waitForTimeout(600); }
if (action === "par") { const e = els[0]; for (const v of [12, 8, 6]) { await p.evaluate(([x, v]) => x.hxSetValue("knob", v), [e, v]); const run = await e.$("button:has-text('Run')"); await run.click(); await p.waitForFunction((x) => !x.textContent.includes("Running"), e, { timeout: 20000 }); } await p.waitForTimeout(2500); }
let i = 0; for (const e of els) { await e.screenshot({ path: `${out}/${pageName}-${width}-${theme}-${i++}.png` }); }
console.log(els.length, "elements");
await b.close(); srv.close();
