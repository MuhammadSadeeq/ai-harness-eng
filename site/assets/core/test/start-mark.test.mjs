// The course map's "Suggested start" mark (BP-3.1b §1): it follows the store's placement, and only one item has it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { markSuggestedStart } from "../shell/start-mark.js";

function item(moduleId) {
  const node = { dataset: { moduleId }, kids: [] };
  node.querySelector = () => node.kids.find((k) => k.className === "start-mark") ?? null;
  node.append = (child) => { child.parent = node; node.kids.push(child); };
  return node;
}

function fakeRoot(ids) {
  const items = ids.map(item);
  return {
    items,
    querySelectorAll: () => items,
    createElement: () => {
      const mark = { className: "", textContent: "", parent: null };
      mark.remove = () => { mark.parent.kids = mark.parent.kids.filter((k) => k !== mark); };
      return mark;
    },
  };
}

const marked = (root) => root.items.filter((i) => i.querySelector()).map((i) => i.dataset.moduleId);

test("the mark goes on the suggested start, and only there", () => {
  const root = fakeRoot(["A1", "B1", "B2"]);
  markSuggestedStart({ placement: { start: "B1", at: "2026-10-10", right: 6 } }, root);
  assert.deepEqual(marked(root), ["B1"]);
  assert.equal(root.items[1].querySelector().textContent, "Suggested start");
});

test("a new placement moves the mark; no placement removes it", () => {
  const root = fakeRoot(["A1", "B1"]);
  markSuggestedStart({ placement: { start: "B1" } }, root);
  markSuggestedStart({ placement: { start: "A1" } }, root);
  assert.deepEqual(marked(root), ["A1"]);
  markSuggestedStart({}, root);
  assert.deepEqual(marked(root), []);
});

test("marking twice does not add a second mark", () => {
  const root = fakeRoot(["A1"]);
  markSuggestedStart({ placement: { start: "A1" } }, root);
  markSuggestedStart({ placement: { start: "A1" } }, root);
  assert.equal(root.items[0].kids.length, 1);
});
