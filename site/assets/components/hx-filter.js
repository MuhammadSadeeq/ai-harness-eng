// hx-filter: a search box and a wire list over a target's items (BP-5.2 §1). The target is named by `for` (an element id).
// The items are the [data-filter-item] elements under it: the search matches their text, and the wire list matches their
// data-wire (named by data-wire-name). A [data-filter-group] hides when none of its items shows. The count ("91 terms
// shown") is the visible line and the one polite announcement. Light DOM; nothing moves.
//   <hx-filter for="glossary-list"></hx-filter>
import { HxElement } from "./lib/hx-element.js";
import { plural } from "./lib/format.js";

/** Whether an item shows: its text holds the query (any case) and its wire is the chosen one ("" means any wire). */
export function matches(text, itemWire, query, wire) {
  if (wire !== "" && itemWire !== wire) return false;
  const q = query.trim().toLowerCase();
  return q === "" || String(text).toLowerCase().includes(q);
}

/** The count the page says: "91 terms shown", "1 term shown". */
export function shownText(n) {
  return `${plural(n, "term")} shown`;
}

/** The wires among the items, in name order: [id, name] pairs (an item with no wire is not listed). */
export function wiresIn(items) {
  const seen = new Map();
  for (const item of items) {
    const id = item.dataset.wire ?? "";
    if (id !== "" && !seen.has(id)) seen.set(id, item.dataset.wireName || id);
  }
  return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
}

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key === "text") node.textContent = value;
    else node.setAttribute(key, String(value));
  }
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
};

export class HxFilter extends HxElement {
  static observedAttributes = ["for"];
  static styles = new URL("./hx-filter.css", import.meta.url).href;

  async setup() {
    const id = this.getAttribute("for");
    if (!id) throw new Error("hx-filter needs for");
    this.target = document.getElementById(id);
    if (!this.target) throw new Error(`hx-filter: no element with id ${id}`);
    this.wireOptions = wiresIn(this.items());
    this.state = { query: "", wire: "" };
  }

  items() {
    return [...this.target.querySelectorAll("[data-filter-item]")];
  }

  /** Applies the state to the target: items and groups hide or show. Returns how many items show. */
  apply() {
    let shown = 0;
    for (const item of this.items()) {
      const ok = matches(item.textContent, item.dataset.wire ?? "", this.state.query, this.state.wire);
      item.hidden = !ok;
      if (ok) shown += 1;
    }
    for (const group of this.target.querySelectorAll("[data-filter-group]")) {
      group.hidden = ![...group.querySelectorAll("[data-filter-item]")].some((item) => !item.hidden);
    }
    return shown;
  }

  render() {
    if (!this.dom) this.build();
    const text = shownText(this.apply());
    this.dom.count.textContent = text;
    this.live(text);
  }

  build() {
    const dom = {};
    this.dom = dom;
    dom.input = el("input", { type: "search", "data-key": "query", autocomplete: "off", spellcheck: "false" });
    dom.input.addEventListener("input", () => this.setState({ query: dom.input.value }));
    dom.select = el("select", { "data-key": "wire" },
      el("option", { value: "", text: "All wires" }),
      ...this.wireOptions.map(([id, name]) => el("option", { value: id, text: name })));
    dom.select.addEventListener("change", () => this.setState({ wire: dom.select.value }));
    dom.count = el("p", { class: "filter-count" });
    const form = el("form", { class: "filter", role: "search" },
      el("label", { class: "filter-field" }, el("span", { text: "Find a term or a definition" }), dom.input),
      el("label", { class: "filter-field" }, el("span", { text: "Wire" }), dom.select),
      dom.count);
    form.addEventListener("submit", (event) => event.preventDefault());
    this.ui.append(form);
  }

  // Self-test: type a word from the first item, check the shown items, the groups and the count; pick a wire and check
  // again; then clear both, which restores every item.
  async selfTest() {
    const items = this.items();
    if (items.length === 0) return false;
    const type = (value) => {
      this.dom.input.value = value;
      this.dom.input.dispatchEvent(new Event("input"));
    };
    const choose = (value) => {
      this.dom.select.value = value;
      this.dom.select.dispatchEvent(new Event("change"));
    };
    const expected = (query, wire) => items.filter((item) => matches(item.textContent, item.dataset.wire ?? "", query, wire)).length;
    const visible = () => items.filter((item) => !item.hidden).length;
    const query = String(items[0].textContent).match(/[A-Za-z]{4,}/)?.[0] ?? "";
    type(query);
    if (visible() !== expected(query, "") || this.dom.count.textContent !== shownText(expected(query, ""))) return false;
    const wire = this.wireOptions[0]?.[0];
    if (wire !== undefined) {
      choose(wire);
      if (visible() !== expected(query, wire)) return false;
    }
    for (const group of this.target.querySelectorAll("[data-filter-group]")) {
      const anyShown = [...group.querySelectorAll("[data-filter-item]")].some((item) => !item.hidden);
      if (group.hidden === anyShown) return false;
    }
    type("");
    choose("");
    return visible() === items.length && this.dom.count.textContent === shownText(items.length);
  }
}

customElements.define("hx-filter", HxFilter);
