import { test } from "node:test";
import assert from "node:assert/strict";
import { createPrng } from "../prng.js";
import { readJsonRepo } from "./helpers.mjs";

const fixture = readJsonRepo("scenarios/fixtures/prng.json");

test("mulberry32 matches all 3,000 fixture outputs (seeds 0, 1, 20261010)", () => {
  let checked = 0;
  for (const name of ["seed_0", "seed_1", "seed_20261010"]) {
    const seed = Number(name.slice("seed_".length));
    const g = createPrng(seed);
    const expected = fixture.seeds[name];
    assert.equal(expected.length, 1000, name);
    for (const v of expected) {
      assert.equal(g.next(), v, `${name} output ${checked}`);
      checked += 1;
    }
  }
  assert.equal(checked, 3000);
});

test("percent() is 0 to 99 and below(n) is 0 to n-1; every call counts as a draw", () => {
  const g = createPrng(7);
  for (let i = 0; i < 500; i += 1) {
    const p = g.percent();
    assert.ok(p >= 0 && p <= 99);
    const b = g.below(6);
    assert.ok(b >= 0 && b <= 5);
  }
  assert.equal(g.draws, 1000);
});

test("below(n) refuses n below 1", () => {
  assert.throws(() => createPrng(1).below(0), RangeError);
});
