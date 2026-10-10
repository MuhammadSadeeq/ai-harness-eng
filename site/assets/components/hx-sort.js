// hx-sort (BP-3.2 §1, B3, B4, G1–G3): sort items into buckets. Items start in a tray. Move one by drag, or focus it
// and pick its bucket from its "Move to" menu (keyboard and touch). Check marks each item right or wrong with its why.
//   <hx-sort src="data/sort-demo.json"></hx-sort>
// Values: right (read-only: right items at the last check, or null).
import { HxElement } from "./lib/hx-element.js";
import { plural } from "./lib/format.js";

const SPRITE = new URL("../core/glyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";

/** Checks a placement: the item is right when its bucket is its bucket. Unplaced items are wrong. */
export function scorePlacement(items, placed) {
  const results = {};
  for (const item of items) results[item.id] = placed[item.id] === item.bucket;
  const right = Object.values(results).filter(Boolean).length;
  return { results, right, total: items.length };
}

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key === "text") node.textContent = value;
    else node.setAttribute(key, String(value));
  }
  node.append(...children);
  return node;
};

const glyph = (name) => {
  const icon = document.createElementNS(SVG_NS, "svg");
  icon.setAttribute("class", "glyph");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `${SPRITE}#g-${name}`);
  icon.append(use);
  return icon;
};

export class HxSort extends HxElement {
  static observedAttributes = ["src"];
  static styles = new URL("./hx-sort.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    if (!src) throw new Error("hx-sort needs src");
    const response = await fetch(new URL(src, document.baseURI));
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
    const data = await response.json();
    if (typeof data.prompt !== "string" || !Array.isArray(data.buckets) || !Array.isArray(data.items)) throw new Error("hx-sort: bad data");
    if (data.buckets.length < 2) throw new Error("hx-sort: 2 or more buckets");
    const ids = new Set(data.buckets.map((b) => b.id));
    for (const item of data.items) {
      if (typeof item.text !== "string" || !ids.has(item.bucket) || typeof item.why !== "string") throw new Error("hx-sort: bad item");
    }
    this.src = src;
    this.data = data;
    this.state = { placed: {}, checked: null, shown: false, nudge: false };
  }

  hxValue(name) {
    if (name !== "right") return null;
    return this.state.checked ? this.state.checked.right : null;
  }

  hxRange() {
    return null;
  }

  move(itemId, bucket) {
    if (this.state.placed[itemId] === bucket) return;
    this.setState({ placed: { ...this.state.placed, [itemId]: bucket }, checked: null, shown: false, nudge: false });
  }

  check() {
    const { items } = this.data;
    const result = scorePlacement(items, this.state.placed);
    this.setState({ checked: result });
    this.evidence("sort", { src: this.src, right: result.right, total: result.total });
  }

  showAnswer() {
    if (this.state.checked) this.setState({ shown: true });
  }

  build() {
    const dom = { items: new Map(), buckets: new Map() };
    this.dom = dom;
    dom.prompt = el("p", { class: "sort-prompt", text: this.data.prompt });
    dom.tray = el("ul", { class: "sort-tray", "aria-label": "Items to sort" });
    dom.bucketList = el("div", { class: "sort-buckets" });
    dom.check = el("button", { class: "key key-primary", type: "button", "data-key": "check", text: "Check" });
    dom.check.addEventListener("click", () => this.onCheck());
    dom.answer = el("button", { class: "key", type: "button", "data-key": "answer", text: "Show the answer" });
    dom.answer.addEventListener("click", () => this.showAnswer());
    dom.line = el("p", { class: "sort-line" });
    for (const bucket of this.data.buckets) {
      const zone = el("ul", { class: "sort-zone", "data-bucket": bucket.id, "aria-label": bucket.label });
      zone.addEventListener("dragover", (event) => event.preventDefault());
      zone.addEventListener("drop", (event) => {
        event.preventDefault();
        const id = event.dataTransfer?.getData("text/plain");
        if (id) this.move(id, bucket.id);
      });
      dom.buckets.set(bucket.id, zone);
      dom.bucketList.append(el("section", { class: "sort-bucket" },
        el("h3", { class: "sort-bucket-title", text: bucket.label }),
        bucket.hint ? el("p", { class: "sort-hint", text: bucket.hint }) : null,
        zone));
    }
    for (const item of this.data.items) {
      const select = el("select", { class: "sort-move", "aria-label": `Move "${item.text}" to`, "data-key": `move-${item.id}` });
      select.addEventListener("change", () => this.move(item.id, select.value === "" ? null : select.value));
      const li = el("li", { class: "sort-item", draggable: "true", "data-id": item.id });
      li.addEventListener("dragstart", (event) => event.dataTransfer?.setData("text/plain", item.id));
      const mark = el("span", { class: "sort-mark" });
      const why = el("span", { class: "sort-why" });
      li.append(el("span", { class: "sort-text", text: item.text }), mark,
        el("label", { class: "sort-menu" }, el("span", { class: "sort-menu-label", text: "Move to" }), select), why);
      dom.items.set(item.id, { li, select, mark, why, item });
    }
    this.ui.append(el("section", { class: "sort" }, dom.prompt, dom.tray, dom.bucketList,
      el("div", { class: "sort-actions" }, dom.check, dom.answer), dom.line));
  }

  onCheck() {
    if (!this.allPlaced()) {
      this.setState({ nudge: true });
      return;
    }
    this.check();
  }

  allPlaced() {
    return this.data.items.every((item) => this.state.placed[item.id] !== undefined && this.state.placed[item.id] !== null);
  }

  render() {
    if (!this.dom) this.build();
    const { dom, state: s } = this;
    const { items, buckets } = this.data;
    const bucketLabel = (id) => buckets.find((b) => b.id === id)?.label ?? "";
    dom.tray.replaceChildren(...items.filter((item) => !s.placed[item.id]).map((item) => dom.items.get(item.id).li));
    for (const bucket of buckets) {
      dom.buckets.get(bucket.id).replaceChildren(...items.filter((item) => s.placed[item.id] === bucket.id)
        .map((item) => dom.items.get(item.id).li));
    }
    for (const item of items) {
      const view = dom.items.get(item.id);
      view.select.replaceChildren(el("option", { value: "", text: "Tray" }), ...buckets.map((b) => el("option", { value: b.id, text: b.label })));
      view.select.value = s.placed[item.id] ?? "";
      const result = s.checked ? s.checked.results[item.id] : null;
      view.li.classList.toggle("is-right", result === true);
      view.li.classList.toggle("is-wrong", result === false);
      view.mark.replaceChildren(...(result === null ? [] : [glyph(result ? "check" : "cross"), result ? "right" : "wrong"]));
      view.why.textContent = result === null ? "" : (s.shown || result === false ? item.why : "");
      if (s.shown) view.mark.append(` · answer: ${bucketLabel(item.bucket)}`);
    }
    dom.check.setAttribute("aria-disabled", String(this.allPlaced() === false));
    dom.answer.setAttribute("aria-disabled", String(!s.checked));
    const line = s.checked ? `${s.checked.right} of ${plural(s.checked.total, "item")} right.`
      : s.nudge ? "Move every item into a bucket first." : "";
    dom.line.textContent = line;
    this.live(line);
  }

  // Self-test: place every item (the first one wrong), check, expect one wrong, show the answer, then restore.
  async selfTest() {
    const { dom, data } = this;
    const [first, ...rest] = data.items;
    const other = data.buckets.find((b) => b.id !== first.bucket);
    const place = (item, bucket) => {
      const select = dom.items.get(item.id).select;
      select.value = bucket;
      select.dispatchEvent(new Event("change"));
    };
    place(first, other.id);
    for (const item of rest) place(item, item.bucket);
    if (this.state.placed[first.id] !== other.id) return false;
    dom.check.click();
    if (!this.state.checked || this.state.checked.right !== data.items.length - 1) return false;
    dom.answer.click();
    const shown = this.state.shown === true;
    this.setState({ placed: {}, checked: null, shown: false, nudge: false });
    return shown;
  }
}

customElements.define("hx-sort", HxSort);
