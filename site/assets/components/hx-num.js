// hx-num: a number in prose that reads a component's value or drives it (DESIGN §7.7, COMPONENTS §10).
//   <hx-num for="bench1" name="knob" format="int">12</hx-num>
// Reading (the target's hxRange(name) is null): plain text that follows the target's hx-change.
// Driving (hxRange is not null): a spinbutton with arrow keys, PageUp/PageDown (±10 steps), Home/End, horizontal
// drag (one step per 8 px) and − / + keys that show on hover or focus. Use at most one driving hx-num per paragraph.
// pointer-only: the figure already has a keyboard control for this value, so the number is aria-hidden and not
// focusable. The − / + keys are never in the tab order.
import { HxElement } from "./lib/hx-element.js";
import { formatValue } from "./lib/stats.js";

const DRAG_PX_PER_STEP = 8;
const PAGE_STEPS = 10;

/** The value `steps` steps from `current`, on the target's grid (min + k * step) and inside [min, max]. */
export function nextValue(current, range, steps) {
  const { min, max, step } = range;
  const onGrid = min + Math.round((current - min) / step) * step;
  return Math.min(max, Math.max(min, onGrid + steps * step));
}

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
};

export class HxNum extends HxElement {
  static observedAttributes = ["for", "name", "format", "pointer-only"];
  static styles = new URL("./hx-num.css", import.meta.url).href;

  async setup() {
    const forId = this.getAttribute("for");
    const name = this.getAttribute("name");
    if (!forId || !name) throw new Error("hx-num needs for and name");
    const target = document.getElementById(forId);
    if (!target) throw new Error(`hx-num: no element with id ${forId}`);
    if (typeof target.hxValue !== "function") await customElements.whenDefined(target.localName);
    if (target.ready && (await target.ready) === false) throw new Error(`hx-num: ${forId} failed to load`);
    if (typeof target.hxValue !== "function") throw new Error(`hx-num: ${forId} has no values`);
    this.target = target;
    this.name = name;
    this.format = this.getAttribute("format") ?? "";
    this.range = target.hxRange(name) ?? null;
    // A derived value (pass@k depends on p and k) can change when a different setting of the target changes, so every
    // hx-change from the target re-reads this value, not only one named after it.
    this.onTargetChange = () => this.render();
    target.addEventListener("hx-change", this.onTargetChange);
  }

  render() {
    if (!this.dom) this.build();
    const value = this.target.hxValue(this.name);
    const text = formatValue(value, this.format);
    this.dom.value.textContent = text;
    if (this.range) {
      const { min, max } = this.range;
      this.dom.spin.setAttribute("aria-valuemin", String(min));
      this.dom.spin.setAttribute("aria-valuemax", String(max));
      this.dom.spin.setAttribute("aria-valuetext", text);
      if (value === null) this.dom.spin.removeAttribute("aria-valuenow");
      else this.dom.spin.setAttribute("aria-valuenow", String(value));
      this.dom.minus.disabled = value !== null && value <= min;
      this.dom.plus.disabled = value !== null && value >= max;
    }
  }

  build() {
    this.dom = {};
    const pointerOnly = this.hasAttribute("pointer-only");
    if (!this.range) {
      this.dom.value = el("span", { class: "hx-num-text" });
      this.ui.append(this.dom.value);
      return;
    }
    const label = this.target.hxLabel?.(this.name) ?? this.name;
    this.dom.value = el("span", { class: "hx-num-value" });
    this.dom.spin = el("span", {
      class: "hx-num-spin scrub",
      role: "spinbutton",
      tabindex: pointerOnly ? "-1" : "0",
      "aria-label": label,
      "aria-hidden": pointerOnly ? "true" : null,
      "data-key": "spin",
    }, this.dom.value);
    this.dom.minus = el("button", {
      class: "key key-icon hx-num-key", type: "button", tabindex: "-1", "aria-label": `Lower ${label}`,
      "aria-hidden": pointerOnly ? "true" : null, text: "−",
    });
    this.dom.plus = el("button", {
      class: "key key-icon hx-num-key", type: "button", tabindex: "-1", "aria-label": `Raise ${label}`,
      "aria-hidden": pointerOnly ? "true" : null, text: "+",
    });
    this.dom.minus.addEventListener("click", () => this.stepBy(-1));
    this.dom.plus.addEventListener("click", () => this.stepBy(1));
    this.dom.spin.addEventListener("keydown", (event) => this.onKey(event));
    this.dom.spin.addEventListener("pointerdown", (event) => {
      this.drag = { x: event.clientX, start: this.target.hxValue(this.name) ?? this.range.min };
      this.dom.spin.setPointerCapture?.(event.pointerId);
    });
    this.dom.spin.addEventListener("pointermove", (event) => {
      if (!this.drag) return;
      this.setTo(nextValue(this.drag.start, this.range, Math.round((event.clientX - this.drag.x) / DRAG_PX_PER_STEP)));
    });
    const endDrag = () => {
      this.drag = null;
    };
    this.dom.spin.addEventListener("pointerup", endDrag);
    this.dom.spin.addEventListener("pointercancel", endDrag);
    this.ui.append(el("span", { class: "hx-num-wrap" }, this.dom.spin,
      el("span", { class: "hx-num-steps", "aria-hidden": pointerOnly ? "true" : null }, this.dom.minus, this.dom.plus)));
  }

  onKey(event) {
    const steps = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: PAGE_STEPS, PageDown: -PAGE_STEPS };
    if (event.key in steps) {
      event.preventDefault();
      this.stepBy(steps[event.key]);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      this.setTo(event.key === "Home" ? this.range.min : this.range.max);
    }
  }

  stepBy(steps) {
    const current = this.target.hxValue(this.name) ?? this.range.min;
    this.setTo(nextValue(current, this.range, steps));
  }

  setTo(value) {
    if (value === this.target.hxValue(this.name)) return;
    this.target.hxSetValue(this.name, value);
    this.render();
  }

  async selfTest() {
    const before = this.target.hxValue(this.name);
    if (!this.range) {
      return this.dom.value.textContent === formatValue(before, this.format);
    }
    this.dom.spin.focus({ preventScroll: true });
    this.dom.spin.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    const after = this.target.hxValue(this.name);
    const expected = nextValue(before ?? this.range.min, this.range, 1);
    return after === expected && this.dom.spin.getAttribute("aria-valuenow") === String(after);
  }

  disconnectedCallback() {
    this.target?.removeEventListener("hx-change", this.onTargetChange);
  }
}

customElements.define("hx-num", HxNum);
