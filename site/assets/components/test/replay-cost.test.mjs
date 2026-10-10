// B-18: the replay's readout tiles (hx-replay.css). The cost value must read in full at 1280: no ellipsis,
// and the cost column sized to its full value from 700 px up. A CSS-level regression check; QA shows the render.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../hx-replay.css", import.meta.url), "utf8");

// The readout value rule only (the phone bar's own rule is not a readout).
const readoutRule = css.match(/\.replay \.readout-value \{[^}]*\}/)?.[0] ?? "";

test("B-18: a replay readout value is never cut with an ellipsis", () => {
  assert.ok(readoutRule !== "", "the readout value rule exists");
  assert.doesNotMatch(readoutRule, /text-overflow/);
  assert.match(readoutRule, /white-space:\s*nowrap/);
});

test("B-18: from 700 px the readouts are their own size container, and the value scales to fit a tile", () => {
  assert.match(css, /\.replay \.readouts \{[^}]*container-type:\s*inline-size/);
  assert.match(readoutRule, /4\.2cqi/);
});

// The bench's readout rules are scoped to hx-bench: a bare .readout .readout-value would reach the replay's tiles too.
const benchCss = readFileSync(new URL("../hx-bench.css", import.meta.url), "utf8");

test("B-18: the bench's readout value rules do not reach other components' readouts", () => {
  assert.doesNotMatch(benchCss, /^\.readout \.readout-value/m);
  assert.match(benchCss, /hx-bench \.readout \.readout-value/);
});
