// Path to 5 (the reviewer's four small changes to hx-cards, hx-kata, hx-wire and hx-incident). The pure
// text rules of the practice pass line are tested here; the page behaviour is in each component's selfTest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { captionTitle, passLine } from "../lib/next-step.js";
import { formatMs } from "../lib/format.js";

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

// ---------- hx-kata: the practice pass line names what comes next

test("captionTitle takes the title after the figure label, up to the first sentence", () => {
  assert.equal(captionTitle("FIG B2.4 · Old board against new board. Try this: run the bench and read the honest sentence under it."),
    "Old board against new board");
  assert.equal(captionTitle("FIG B2.1 · One turn, around the clock. Try this: tap the loop spoke."), "One turn, around the clock");
  assert.equal(captionTitle("FIG B2.3 · The bench."), "The bench");
});

test("captionTitle of a caption with no label keeps the first sentence", () => {
  assert.equal(captionTitle("A plain caption. More text."), "A plain caption");
  assert.equal(captionTitle("No full stop here"), "No full stop here");
  assert.equal(captionTitle(""), "");
  assert.equal(captionTitle(null), "");
});

test("passLine: the count, then what comes next; the count alone when nothing is next", () => {
  assert.equal(passLine("9 of 9 tests pass", "Prove it on the same seeds"), "9 of 9 tests pass. Next: Prove it on the same seeds");
  assert.equal(passLine("9 of 9 tests pass", ""), "9 of 9 tests pass");
  assert.equal(passLine("9 of 9 tests pass", null), "9 of 9 tests pass");
});

// ---------- hx-incident: one meaning for "par"

test("hx-incident says A good time for the hunt's time, not Par (par means the bench's cheapest limit)", () => {
  const src = read("../hx-incident.js");
  assert.ok(src.includes("A good time is ${formatMs(inc.par_s * 1000)}."), "the hunt's line");
  assert.ok(!/Par is/.test(src), "no Par is in the incident component");
  assert.equal(formatMs(60 * 1000), "60 s", "the time reads as 60 s");
});

test("the incident's copy has no par wording outside the field name", () => {
  const src = read("../hx-incident.js");
  const copy = src.match(/`[^`]*`|"[^"]*"/g) ?? [];
  assert.ok(copy.every((s) => !/\bpar\b/i.test(s)), "no par in any string the incident shows");
});

// ---------- hx-wire: the inner box only from 700 px up

test("hx-wire keeps the JSON box at 700 px and up, and has no box below it", () => {
  const css = read("../hx-wire.css");
  assert.match(css, /@media \(min-width: 700px\) \{\s*hx-wire \.wire-json-scroll \{ max-height: 26rem; overflow: auto; \}\s*\}/);
  const outside = css.replace(/@media \(min-width: 700px\) \{[\s\S]*?\n\}/, "");
  assert.ok(!/max-height:\s*26rem/.test(outside), "no 416 px box outside the 700 px query");
  assert.ok(!/\.wire-json-scroll\s*\{[^}]*overflow:\s*auto/.test(outside), "no inner scroll outside the 700 px query");
});

// ---------- hx-cards: recall first, Enter reveals

test("hx-cards shows the front first and its key line names Enter as well as Space", () => {
  const src = read("../hx-cards.js");
  assert.ok(src.includes('const KEY_LINE = "Space or Enter shows the answer. 1 is Again, 2 is Got it.";'));
  assert.ok(src.includes('(event.key === " " || event.key === "Enter") && !s.reveal'), "Enter reveals as Space does");
  assert.ok(src.includes('"Show answer"'), "the front carries Show answer");
});
