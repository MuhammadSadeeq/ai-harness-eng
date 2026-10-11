// B-16 bench label: a retry that waits the same time every try (base equals cap, no jitter) says so; any other
// retry keeps the knob words. Imports hx-bench.js with the same customElements stubs as the wave 3.1 tests.
import { test } from "node:test";
import assert from "node:assert/strict";
globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { modulesText, rackModulesLine } = await import("../hx-bench.js");

const board = (modules) => ({ id: "b", modules });

test("a fixed wait says it is a fixed wait", () => {
  assert.equal(
    modulesText(board({ retry: { max_attempts: 30, base_ms: 200, cap_ms: 200, jitter: "none" } })),
    "retry every 200 ms, up to 30 tries",
  );
});

test("a single try is said in the singular", () => {
  assert.equal(modulesText(board({ retry: { max_attempts: 1, base_ms: 200, cap_ms: 200, jitter: "none" } })), "retry every 200 ms, up to 1 try");
});

test("a backoff with jitter keeps the knob words", () => {
  const text = modulesText(board({ retry: { max_attempts: 10, base_ms: 1000, cap_ms: 8000, jitter: "full" } }));
  assert.match(text, /backoff base \(ms\) 1,000/);
  assert.doesNotMatch(text, /every/);
});

test("the same base and cap with jitter is not a fixed wait", () => {
  const text = modulesText(board({ retry: { max_attempts: 10, base_ms: 200, cap_ms: 200, jitter: "full" } }));
  assert.doesNotMatch(text, /every/);
});

test("no modules says so", () => {
  assert.equal(modulesText(board({})), "no modules plugged");
});

test("a rack's modules line is left out when its title already names the module (F2: Sessions, progress file)", () => {
  const withFile = { label: "Sessions, progress file", modules: { progress_file: { path: "progress.md" } } };
  assert.equal(modulesText(withFile), "progress file");
  assert.equal(rackModulesLine(withFile), "", "the title says progress file; the line would repeat it");
  const without = { label: "Sessions, no progress file", modules: {} };
  assert.equal(rackModulesLine(without), "no modules plugged", "a title that does not name the module keeps the line");
});
