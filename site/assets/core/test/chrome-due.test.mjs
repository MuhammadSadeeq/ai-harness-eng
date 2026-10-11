// The Board button's due count (shell/chrome.js paintDue): the count, the words (hidden below 360 px by CSS), and the
// link's aria-label, which keeps the full name at every width. The stand-in document has only the elements paintDue
// writes. Run: node --test "site/assets/**/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { mountChrome } from "../shell/chrome.js";

class FakeEl {
  constructor() {
    this.textContent = "";
    this.attrs = new Map();
  }

  setAttribute(name, value) {
    this.attrs.set(name, String(value));
  }

  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
}

function fakeDoc(elements) {
  return {
    documentElement: { dataset: {} },
    querySelector: () => null,
    querySelectorAll: (selector) => elements[selector] ?? [],
  };
}

function fakeStore(cards) {
  const store = {
    state: { cards },
    listeners: [],
    subscribe(fn) {
      this.listeners.push(fn);
    },
    notify() {
      for (const fn of this.listeners) fn();
    },
  };
  return store;
}

const pastCard = { due: "2000-01-01" };
const futureCard = { due: "2999-01-01" };

function board() {
  return {
    "[data-due-num]": [new FakeEl()],
    "[data-due-words]": [new FakeEl()],
    "[data-due-label]": [new FakeEl()],
  };
}

test("no card due: the count is 0, the words say cards, the name says the same", () => {
  const els = board();
  mountChrome(fakeStore({ a: futureCard }), fakeDoc(els));
  assert.equal(els["[data-due-num]"][0].textContent, "0");
  assert.equal(els["[data-due-words]"][0].textContent, " cards due");
  assert.equal(els["[data-due-label]"][0].getAttribute("aria-label"), "Board, 0 cards due");
});

test("one card due: the singular", () => {
  const els = board();
  mountChrome(fakeStore({ a: pastCard, b: futureCard }), fakeDoc(els));
  assert.equal(els["[data-due-num]"][0].textContent, "1");
  assert.equal(els["[data-due-words]"][0].textContent, " card due");
  assert.equal(els["[data-due-label]"][0].getAttribute("aria-label"), "Board, 1 card due");
});

test("a large count is grouped the way the rest of the site groups numbers, in the name too", () => {
  const cards = {};
  for (let i = 0; i < 1234; i += 1) cards[`c${i}`] = pastCard;
  const els = board();
  mountChrome(fakeStore(cards), fakeDoc(els));
  assert.equal(els["[data-due-num]"][0].textContent, "1,234");
  assert.equal(els["[data-due-label]"][0].getAttribute("aria-label"), "Board, 1,234 cards due");
});

test("a store change repaints the count and the name", () => {
  const els = board();
  const store = fakeStore({ a: futureCard });
  mountChrome(store, fakeDoc(els));
  store.state = { cards: { a: pastCard, b: pastCard } };
  store.notify();
  assert.equal(els["[data-due-num]"][0].textContent, "2");
  assert.equal(els["[data-due-words]"][0].textContent, " cards due");
  assert.equal(els["[data-due-label]"][0].getAttribute("aria-label"), "Board, 2 cards due");
});
