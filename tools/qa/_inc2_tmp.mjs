import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = path.resolve("site");
const types = {".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".woff2":"font/woff2"};
const srv = http.createServer((q,r)=>{ let p = path.join(root, decodeURIComponent(q.url.split("?")[0])); fs.readFile(p,(e,d)=>{ if(e){r.writeHead(404);r.end();return;} r.writeHead(200,{"content-type":types[path.extname(p)]||"application/octet-stream"}); r.end(d);});}).listen(0);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 375, height: 812 } });
await p.goto(`http://localhost:${srv.address().port}/labs/incident.html`); await p.waitForLoadState("networkidle");
const inc = await p.$("hx-incident"); await p.evaluate((e) => e.ready, inc);
for (const seq of [13, 23, 21]) {
  const row = await inc.$(`button.ev-main[data-index="${seq}"]`);
  await row.scrollIntoViewIfNeeded();
  const before = await p.evaluate((e) => { const box = e.querySelector("ol, ul, .transcript, [class*=transcript]"); return { page: scrollY, box: box?.scrollTop, cls: box?.className }; }, inc);
  await row.click();
  await p.waitForTimeout(100);
  const after = await p.evaluate((e) => {
    const box = e.querySelector("ol, ul, .transcript, [class*=transcript]");
    const focused = document.activeElement; const fr = focused?.getBoundingClientRect();
    const fb = [...e.querySelectorAll(".feedback, [class*=feedback], [class*=note], [class*=hint], [class*=found]")].map(x => ({ cls: x.className, text: x.innerText.slice(0, 80), top: Math.round(x.getBoundingClientRect().top) })).filter(x => x.text);
    return { page: scrollY, box: box?.scrollTop, focusedTop: fr && Math.round(fr.top), focused: focused?.getAttribute("data-index"), fb };
  }, inc);
  console.log("seq", seq, "before", JSON.stringify(before), "after", JSON.stringify(after));
}
await b.close(); srv.close();
