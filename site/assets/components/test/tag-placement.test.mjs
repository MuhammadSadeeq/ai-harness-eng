// The clock's tag layout (BP-3.1b §2): every tag of the demo board is placed, no two boxes overlap, and no box covers
// the hub or a node, at the narrow (codes, 343 px) and wide (labels, 760 px) face widths.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { faceGeometry, placeTags, tagSize, wrapLines } from "../lib/clockface.js";

const course = JSON.parse(readFileSync(new URL("../../../data/course.json", import.meta.url), "utf8"));
const wires = [...course.wires].sort((a, b) => a.angle - b.angle);
const DEG = Math.PI / 180;

function layout(width, spokes, narrow) {
  const { W, R, nodeR } = faceGeometry(width);
  const c = W / 2;
  const hubR = Math.max(7, R * 0.12);
  const room = R - nodeR - hubR - 8;
  const circles = [{ x: c, y: c, r: hubR }];
  for (const wire of wires) circles.push({ x: c + R * Math.sin(wire.angle * DEG), y: c - R * Math.cos(wire.angle * DEG), r: nodeR });
  const items = [];
  for (const wire of wires) {
    const tags = spokes[wire.id] ?? [];
    const picked = narrow ? tags.slice(0, 2) : tags.slice(0, 1);
    picked.forEach((tag, i) => {
      let lines = [tag.code];
      if (!narrow) {
        const wrapped = wrapLines(tag.text, 16, 2);
        const labelWidth = Math.max(...wrapped.map((l) => l.length)) * 7.8 + 16;
        if (labelWidth <= room) lines = wrapped;
      }
      const parts = { code: tag.code, lines, bug: tag.bug === true };
      items.push({ key: `${wire.id}:${i}`, angle: wire.angle, size: tagSize(parts) });
    });
  }
  const placed = placeTags({
    W, centre: c, items, circles,
    preferred: narrow ? R * 0.36 : hubR + 4 + room / 2,
    from: hubR + 4, to: R - nodeR - 4,
  });
  return { W, items, placed, circles };
}

function boxesOverlap(a, b) {
  const dx = Math.abs(a.left + a.w / 2 - (b.left + b.w / 2));
  const dy = Math.abs(a.top + a.h / 2 - (b.top + b.h / 2));
  return dx < (a.w + b.w) / 2 + 4 && dy < (a.h + b.h) / 2 + 4;
}

function assertClear(result) {
  const boxes = [...result.placed.values()];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) assert.equal(boxesOverlap(boxes[i], boxes[j]), false, "two boxes overlap");
    for (const circle of result.circles) {
      const nx = Math.min(Math.max(circle.x, boxes[i].left), boxes[i].left + boxes[i].w);
      const ny = Math.min(Math.max(circle.y, boxes[i].top), boxes[i].top + boxes[i].h);
      assert.ok(Math.hypot(circle.x - nx, circle.y - ny) >= circle.r + 4, "a box covers the hub or a node");
    }
  }
}

const demo = {
  loop: [{ code: "HR", text: "history not resent", bug: true }, { code: "FB", text: "reads the first block only", bug: true }],
  context: [{ code: "CA", text: "cache-friendly prefix" }, { code: "SC", text: "time at the top of the prompt", bug: true }],
  tools: [{ code: "VI", text: "schema checks" }, { code: "SR", text: "results split across messages", bug: true }],
  control: [{ code: "EF", text: "effort high" }],
};

test("narrow (343 px): every demo code is placed and no two boxes or circles collide", () => {
  const result = layout(343, demo, true);
  assert.equal(result.placed.size, result.items.length, "all codes are placed");
  assertClear(result);
});

test("wide (760 px): every demo label is placed and nothing collides", () => {
  const result = layout(760, demo, false);
  assert.equal(result.placed.size, result.items.length, "all labels are placed");
  assertClear(result);
});

test("a dense board still never overlaps: items that find no room are left out, not drawn over", () => {
  const dense = Object.fromEntries(wires.map((wire) => [wire.id, [
    { code: "XA", text: "a", bug: true }, { code: "XB", text: "b", bug: true },
  ]]));
  const result = layout(343, dense, true);
  assert.ok(result.placed.size >= 8, `at least one code per spoke fits (${result.placed.size} placed)`);
  assertClear(result);
});
