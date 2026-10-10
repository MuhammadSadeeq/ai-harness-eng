// The slim facts (site/data/facts-core.json, from tools/gen_data.py): what the page reads from a fact, and no claim.
// getFactsCore() fetches it once per page. Nothing in the site reads a fact's claim or volatility, so nothing needs
// the full facts.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

const DATA = new URL("../../../data/", import.meta.url);
const core = JSON.parse(readFileSync(new URL("facts-core.json", DATA), "utf8"));
const full = JSON.parse(readFileSync(new URL("facts.json", DATA), "utf8"));

test("the slim facts cover every fact, with id, status, verified_on and source, and no claim", () => {
  assert.deepEqual(Object.keys(core).sort(), Object.keys(full).sort());
  for (const [id, entry] of Object.entries(core)) {
    assert.equal(entry.id, id);
    assert.equal(entry.status, full[id].status);
    assert.equal(entry.verified_on, full[id].verified_on);
    assert.equal(entry.source, full[id].source);
    for (const key of Object.keys(entry)) {
      assert.ok(["id", "status", "verified_on", "source", "value"].includes(key), `${id} has ${key}`);
    }
  }
});

test("only the price facts carry a value, and it is the full value", () => {
  for (const [id, entry] of Object.entries(core)) {
    assert.equal("value" in entry, "value" in full[id], `${id} value`);
    if ("value" in entry) assert.deepEqual(entry.value, full[id].value);
  }
});

test("the slim facts are much smaller than the full registry", () => {
  const size = statSync(new URL("facts-core.json", DATA)).size;
  assert.ok(size < statSync(new URL("facts.json", DATA)).size * 0.75, `facts-core.json is ${size} bytes`);
});

test("getFactsCore fetches facts-core.json once per page", async () => {
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    return { ok: true, text: async () => JSON.stringify(core) };
  };
  const { getFactsCore } = await import("../lib/data.js");
  const first = await getFactsCore();
  const second = await getFactsCore();
  assert.equal(requested.length, 1);
  assert.match(requested[0], /\/data\/facts-core\.json$/);
  assert.deepEqual(first, core);
  assert.deepEqual(second, core);
});

test("no component reads a fact's claim or volatility, and none imports the full getFacts()", () => {
  const dir = new URL("../", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".js") && f.startsWith("hx-"));
  for (const file of files) {
    const text = readFileSync(new URL(file, dir), "utf8");
    assert.doesNotMatch(text, /\.claim\b/, `${file} reads a claim`);
    assert.doesNotMatch(text, /\.volatility\b/, `${file} reads a volatility`);
    assert.doesNotMatch(text, /\bgetFacts\b/, `${file} imports getFacts`);
  }
});
