// The slim course (site/data/course-core.json, from tools/gen_data.py): what the components read, nothing more.
// getCourseCore() fetches it once per page. Only hx-kata (on module pages) and hx-readiness (on its own page) read
// module objectives, so only they keep getCourse().
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

const DATA = new URL("../../../data/", import.meta.url);
const core = JSON.parse(readFileSync(new URL("course-core.json", DATA), "utf8"));
const full = JSON.parse(readFileSync(new URL("course.json", DATA), "utf8"));

test("the slim course has the components' top-level keys and no module objectives", () => {
  assert.deepEqual(Object.keys(core).sort(), ["counts", "failure_families", "modules", "parts", "path", "wires"]);
  assert.deepEqual(core.modules.map((m) => m.id), full.modules.map((m) => m.id));
  for (const module of core.modules) assert.equal("objectives" in module, false, `${module.id} has objectives`);
  assert.deepEqual(core.wires, full.wires);
  assert.deepEqual(core.failure_families, full.failure_families);
  assert.deepEqual(core.counts, full.counts);
});

test("the slim course is much smaller than the full one", () => {
  const size = statSync(new URL("course-core.json", DATA)).size;
  assert.ok(size < 40000, `course-core.json is ${size} bytes`);
  assert.ok(size < statSync(new URL("course.json", DATA)).size / 3);
});

test("getCourseCore fetches course-core.json once per page", async () => {
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    return { ok: true, text: async () => JSON.stringify(core) };
  };
  const { getCourseCore } = await import("../lib/data.js");
  const first = await getCourseCore();
  const second = await getCourseCore();
  assert.equal(requested.length, 1);
  assert.match(requested[0], /\/data\/course-core\.json$/);
  assert.deepEqual(first, core);
  assert.deepEqual(second, core);
});

test("only hx-kata and hx-readiness read a module's objectives, so only they keep getCourse()", () => {
  const dir = new URL("../", import.meta.url);
  const users = readdirSync(dir).filter((f) => f.endsWith(".js") && f.startsWith("hx-")).filter((f) => {
    const text = readFileSync(new URL(f, dir), "utf8");
    return /\bgetCourse\b/.test(text);
  });
  assert.deepEqual(users.sort(), ["hx-kata.js", "hx-readiness.js"]);
});
