// hx-count (BP-1.5 §4): a number from course.json's counts, with thousands separators. The typed number is the
// fallback. An unknown key sets data-hx-error and keeps the fallback (the base does that when setup() throws).
import { HxElement } from "./lib/hx-element.js";
import { getCourseCore } from "./lib/data.js";
import { formatInt, plural } from "./lib/format.js";

/** The count named by `key`: a course.json counts key, or modules.<kind>. Throws on an unknown key. */
export function countOf(course, key) {
  const counts = course.counts ?? {};
  if (typeof key === "string" && key.startsWith("modules.")) {
    const kind = key.slice("modules.".length);
    const value = counts.modules_by_kind?.[kind];
    if (typeof value === "number") return value;
    throw new Error(`unknown count: ${key}`);
  }
  const value = counts[key];
  if (typeof value === "number") return value;
  throw new Error(`unknown count: ${String(key)}`);
}

export class HxCount extends HxElement {
  async setup() {
    this.course = await getCourseCore();
    this.key = this.getAttribute("of");
    this.value = countOf(this.course, this.key);
  }

  render() {
    const text = document.createElement("span");
    text.className = "hx-count";
    text.textContent = formatInt(this.value);
    this.ui.replaceChildren(text);
  }

  async selfTest() {
    const shown = this.ui?.textContent ?? "";
    return shown === formatInt(countOf(this.course, this.key));
  }
}

customElements.define("hx-count", HxCount);
