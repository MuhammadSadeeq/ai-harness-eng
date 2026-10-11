// B-18: the replay's readout tiles (hx-replay.css). A readout value is never cut with an ellipsis, and each tile sizes
// its own value, so the widest cost ("≈ 1.2345 units", "≈ $0.0000") fits its tile at every width. The phone bar wraps
// rather than cutting. A CSS-level regression check; QA and the replay's self-test show the render.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../hx-replay.css", import.meta.url), "utf8");

// The readout value rule only (the phone bar's own rule is not a readout).
const readoutRule = css.match(/\.replay \.readout-value \{[^}]*\}/)?.[0] ?? "";
const tileRule = css.match(/\.replay \.readout \{[^}]*\}/)?.[0] ?? "";
const barRule = css.match(/\.replay \.bar \{[^}]*\}/)?.[0] ?? "";

test("B-18: a replay readout value is never cut: it wraps inside its tile, with no ellipsis", () => {
  assert.ok(readoutRule !== "", "the readout value rule exists");
  assert.doesNotMatch(readoutRule, /text-overflow/);
  assert.match(readoutRule, /white-space:\s*normal/);
  assert.match(readoutRule, /overflow-wrap:\s*anywhere/);
});

test("B-18: a readout value never goes below 14 px", () => {
  assert.match(readoutRule, /max\(0\.875rem,\s*\d+cqi\)/);
});

test("B-18: each readout tile is its own size container, and its value scales to that tile", () => {
  assert.match(tileRule, /container-type:\s*inline-size/);
  assert.match(readoutRule, /\d+cqi/, "the value's size is a share of its tile");
  assert.doesNotMatch(readoutRule, /4\.2cqi/, "the old share of the whole row is gone");
});

test("B-18: the phone bar wraps instead of cutting its text", () => {
  assert.ok(barRule !== "", "the bar rule exists");
  assert.match(barRule, /white-space:\s*normal/);
  assert.doesNotMatch(barRule, /white-space:\s*nowrap/);
});

// The bench's readout rules are scoped to hx-bench: a bare .readout .readout-value would reach the replay's tiles too.
const benchCss = readFileSync(new URL("../hx-bench.css", import.meta.url), "utf8");

test("B-18: the bench's readout value rules do not reach other components' readouts", () => {
  assert.doesNotMatch(benchCss, /^\.readout \.readout-value/m);
  assert.match(benchCss, /hx-bench \.readout \.readout-value/);
});
