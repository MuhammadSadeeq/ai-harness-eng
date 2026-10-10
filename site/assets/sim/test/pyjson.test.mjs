import { test } from "node:test";
import assert from "node:assert/strict";
import { pyjson, traceLine, parseStrictJson } from "../pyjson.js";
import { readRepo } from "./helpers.mjs";

const fixture = JSON.parse(readRepo("scenarios/fixtures/pyjson.json"));

test("pyjson matches every shared fixture case", () => {
  assert.equal(fixture.cases.length, 20);
  for (const c of fixture.cases) {
    assert.equal(pyjson(c.value), c.expected, JSON.stringify(c.value));
  }
});

test("traceLine sorts keys at every depth and uses compact separators", () => {
  assert.equal(traceLine({ b: 1, a: [{ d: true, c: null }] }), '{"a":[{"c":null,"d":true}],"b":1}');
  assert.equal(traceLine([]), "[]");
  assert.equal(traceLine({}), "{}");
});

test("non-ASCII and DEL are escaped the way Python does", () => {
  assert.equal(traceLine("café"), '"caf\\u00e9"');
  assert.equal(pyjson("\u007f"), '"\\u007f"');
});

test("non-integer numbers are refused", () => {
  assert.throws(() => pyjson(1.5), /not an integer/);
  assert.throws(() => traceLine([0.25]), /not an integer/);
});

test("undefined is refused rather than written as null", () => {
  assert.throws(() => pyjson({ a: undefined }), /unsupported value/);
});

test("parseStrictJson refuses float and exponent literals outside strings", () => {
  assert.throws(() => parseStrictJson('{"a": 1.5}'), /integers only/);
  assert.throws(() => parseStrictJson('{"a": 2e3}'), /integers only/);
  assert.deepEqual(parseStrictJson('{"a": "1.5", "b": -3}'), { a: "1.5", b: -3 });
});
