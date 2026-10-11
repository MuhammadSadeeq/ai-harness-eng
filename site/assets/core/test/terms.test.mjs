// The term popovers (shell/terms.js): nothing is fetched at load; the first open loads terms.json once for the page; the
// popover says so when the load fails or an id has no entry; the Close button and the keys work. The stand-in document
// below has only what terms.js uses. Run: node --test "site/assets/**/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { definitionFor, LOAD_FAILED_TEXT, LOADING_TEXT, mountTerms } from "../shell/terms.js";

const camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

class FakeNode {
  constructor(doc, tag) {
    this.doc = doc;
    this.tagName = tag.toUpperCase();
    this.attrs = new Map();
    this.listeners = new Map();
    this.dataset = {};
    this.className = "";
    this.textContent = "";
    this.tabIndex = -1;
    this.type = "";
    this.children = [];
  }

  setAttribute(name, value) {
    this.attrs.set(name, String(value));
    if (name.startsWith("data-")) this.dataset[camel(name.slice(5))] = String(value);
  }

  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  dispatch(type, event = {}) {
    for (const fn of this.listeners.get(type) ?? []) fn({ preventDefault() {}, ...event });
  }

  click() {
    this.dispatch("click");
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  after(node) {
    this.doc.insertAfter(this, node);
  }

  remove() {
    this.doc.detach(this);
  }

  focus() {
    this.doc.focused = this;
  }
}

class FakeDocument {
  constructor() {
    this.nodes = [];
    this.focused = null;
  }

  createElement(tag) {
    return new FakeNode(this, tag);
  }

  addTerm(id, text) {
    const el = this.createElement("span");
    el.setAttribute("data-term", id);
    el.textContent = text;
    this.nodes.push(el);
    return el;
  }

  querySelectorAll(selector) {
    assert.equal(selector, "[data-term]");
    return this.nodes.filter((node) => node.attrs.has("data-term"));
  }

  querySelector(selector) {
    assert.equal(selector, ".term-pop");
    return this.nodes.find((node) => node.className === "term-pop") ?? null;
  }

  insertAfter(ref, node) {
    this.nodes.splice(this.nodes.indexOf(ref) + 1, 0, node);
  }

  detach(node) {
    this.nodes = this.nodes.filter((other) => other !== node);
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const popover = (doc) => doc.querySelector(".term-pop");
const popBody = (doc) => popover(doc).children[1].textContent;
const popTitle = (doc) => popover(doc).children[0].textContent;
const terms = {
  "rate-limit": { id: "rate-limit", term: "rate limit", definition: "A cap on how much a client may use in a period." },
  agent: { id: "agent", term: "agent", definition: "A model called in a loop with tools." },
};

test("definitionFor: the entry's term and definition, or null when the id has no entry", () => {
  assert.deepEqual(definitionFor(terms, "agent"), { term: "agent", body: "A model called in a loop with tools." });
  assert.equal(definitionFor(terms, "nope"), null);
  assert.equal(definitionFor([], "agent"), null);
});

test("at load every tagged term is a focus stop and a button, and nothing is fetched", async () => {
  const doc = new FakeDocument();
  const a = doc.addTerm("rate-limit", "rate limit");
  const b = doc.addTerm("agent", "agent");
  let calls = 0;
  mountTerms(() => {
    calls += 1;
    return Promise.resolve(terms);
  }, doc);
  await flush();
  assert.equal(calls, 0, "no fetch before the first open");
  for (const el of [a, b]) {
    assert.equal(el.tabIndex, 0);
    assert.equal(el.getAttribute("role"), "button");
    assert.equal(el.getAttribute("aria-expanded"), "false");
  }
});

test("the first open fetches once; the second open, of another term, reuses that load", async () => {
  const doc = new FakeDocument();
  const a = doc.addTerm("rate-limit", "rate limit");
  const b = doc.addTerm("agent", "agent");
  let calls = 0;
  mountTerms(() => {
    calls += 1;
    return Promise.resolve(terms);
  }, doc);
  a.click();
  assert.equal(popTitle(doc), "rate limit", "the page's own text is the title until the entry arrives");
  assert.equal(popBody(doc), LOADING_TEXT);
  await flush();
  assert.equal(calls, 1);
  assert.equal(popBody(doc), "A cap on how much a client may use in a period.");
  assert.equal(a.getAttribute("aria-expanded"), "true");
  a.click();
  assert.equal(popover(doc), null, "a second click on the same term closes it");
  b.click();
  await flush();
  assert.equal(calls, 1, "a second open does not fetch again");
  assert.equal(popTitle(doc), "agent");
  assert.equal(popBody(doc), "A model called in a loop with tools.");
  assert.equal(a.getAttribute("aria-expanded"), "false");
});

test("when the list fails to load, the popover says so and keeps its Close button", async () => {
  const doc = new FakeDocument();
  const a = doc.addTerm("agent", "agent");
  mountTerms(() => Promise.reject(new Error("HTTP 500 for data/terms.json")), doc);
  a.click();
  await flush();
  assert.equal(popBody(doc), LOAD_FAILED_TEXT);
  assert.equal(LOAD_FAILED_TEXT, "The definition could not load.");
  const close = popover(doc).children[2];
  assert.equal(close.tagName, "BUTTON");
  assert.equal(close.textContent, "Close");
  close.click();
  assert.equal(popover(doc), null, "Close removes the popover");
  assert.equal(a.getAttribute("aria-expanded"), "false");
});

test("an id with no entry in the list gets the same failure line, not a dead button", async () => {
  const doc = new FakeDocument();
  const ghost = doc.addTerm("no-such-term", "ghost");
  mountTerms(() => Promise.resolve(terms), doc);
  ghost.click();
  await flush();
  assert.equal(popBody(doc), LOAD_FAILED_TEXT);
  assert.equal(popTitle(doc), "ghost", "the page's own text stays the title");
});

test("Enter and Space open a term, Escape closes it", async () => {
  const doc = new FakeDocument();
  const a = doc.addTerm("agent", "agent");
  mountTerms(() => Promise.resolve(terms), doc);
  a.dispatch("keydown", { key: "Enter" });
  await flush();
  assert.equal(popBody(doc), "A model called in a loop with tools.");
  a.dispatch("keydown", { key: "Escape" });
  assert.equal(popover(doc), null);
  a.dispatch("keydown", { key: " " });
  assert.ok(popover(doc), "Space opens it again");
});
