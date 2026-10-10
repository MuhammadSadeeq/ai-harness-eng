// The Wire View's usage line: a plain response reads as before; a response with cache fields names all of them.
import { test } from "node:test";
import assert from "node:assert/strict";
globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {}, whenDefined: () => new Promise(() => {}) };
const { usageWords } = await import("../hx-wire.js");

test("a call with no cache fields reads as before", () => {
  assert.equal(usageWords({ input_tokens: 376, output_tokens: 37 }), "Usage: 376 input tokens, 37 output tokens.");
});

test("a cached call names the cache writes and reads by plain words", () => {
  assert.equal(
    usageWords({ input_tokens: 0, cache_creation_input_tokens: 653, cache_read_input_tokens: 0, output_tokens: 53 }),
    "Usage: 0 input tokens, 653 written to the cache, 0 read from the cache, 53 output tokens.",
  );
});

test("a cache read shows the read tokens with the input and writes", () => {
  assert.equal(
    usageWords({ input_tokens: 40, cache_creation_input_tokens: 0, cache_read_input_tokens: 960, output_tokens: 12 }),
    "Usage: 40 input tokens, 0 written to the cache, 960 read from the cache, 12 output tokens.",
  );
});
