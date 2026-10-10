import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = path.resolve("site");
const types = {".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".woff2":"font/woff2"};
const srv = http.createServer((q,r)=>{ let p = path.join(root, decodeURIComponent(q.url.split("?")[0])); fs.readFile(p,(e,d)=>{ if(e){r.writeHead(404);r.end();return;} r.writeHead(200,{"content-type":types[path.extname(p)]||"application/octet-stream"}); r.end(d);});}).listen(0);
const out = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 375, height: 812 }, colorScheme: "dark" });
await p.goto(`http://localhost:${srv.address().port}/labs/incident.html`); await p.waitForLoadState("networkidle");
const inc = await p.$("hx-incident"); await p.evaluate((e) => e.ready, inc);
await inc.scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/inc-0.png` });
// tap an early row (seq 5), then a late row (seq 23 = run_end on s0), then seq 13 (note), then 21 (found)
const tap = async (seq) => { const row = await inc.$(`button.ev-main[data-index="${seq}"]`); if (!row) { console.log("no row for seq", seq); return; } await row.scrollIntoViewIfNeeded(); await row.click(); };
await tap(5); await p.screenshot({ path: `${out}/inc-1.png` });
await tap(13); await p.screenshot({ path: `${out}/inc-2.png` });
await tap(21); await p.screenshot({ path: `${out}/inc-3.png` });
const txt = await inc.evaluate((e) => e.innerText); console.log(txt.slice(txt.indexOf("Found") - 200));
await b.close(); srv.close();
