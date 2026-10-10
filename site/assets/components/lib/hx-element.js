// The base class of every hx-* component: the contract in docs/COMPONENTS.md, written once.
//
//   class HxThing extends HxElement {
//     static observedAttributes = ["tape"];
//     async setup() { ... fetch data, build the initial state ... }   // may throw: the fallback stays
//     render() { ... draw this.ui from this.state ... }                // the only place UI is drawn
//     async selfTest() { ... drive the real UI, return true/false ... } // QA calls it (§7)
//   }
//   customElements.define("hx-thing", HxThing);
//
// What the base does for you:
// - Moves the authored children (the no-JS fallback) into .hx-fallback, which stays visible while
//   setup() loads data, and gives you this.ui (hidden until then). After setup the UI is shown and the
//   fallback hidden. If setup() or the first render() throws, the UI is removed, the fallback shows
//   again, data-hx-error is set, and nothing is logged.
// - this.ready resolves to true once the first render succeeds (false on failure).
// - setState(patch) merges and re-renders. Focus survives re-renders: give focusable elements a
//   data-key and the element with the same key is focused again after render().
// - live(text) sets the component's one polite live region (only when the text changes).
// - evidence(kind, detail) dispatches the bubbling hx-evidence event (§5).
// - reducedMotion reads the stored motion setting, else the system setting (DESIGN §8.4).
// - static styles = new URL("./hx-thing.css", import.meta.url).href: the component's stylesheet is
//   added once per page and awaited before the first render (no flash of unstyled UI).
import { hxContext } from "../../core/context.js";

const sheets = new Map();

/** Adds a stylesheet to the page once; resolves when it has loaded (or failed: the UI still works). */
export function loadStyles(href) {
  if (!sheets.has(href)) {
    sheets.set(href, new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.addEventListener("load", () => resolve(true), { once: true });
      link.addEventListener("error", () => resolve(false), { once: true });
      document.head.append(link);
    }));
  }
  return sheets.get(href);
}

export class HxElement extends HTMLElement {
  #started = false;
  #resolveReady = () => {};
  #liveText = "";

  constructor() {
    super();
    this.state = {};
    this.ui = null;
    this.ready = new Promise((resolve) => {
      this.#resolveReady = resolve;
    });
    this.__test = {
      run: async () => {
        if (!(await this.ready)) return false;
        return (await this.selfTest()) === true;
      },
    };
  }

  connectedCallback() {
    if (this.#started) return;
    this.#started = true;
    this.#upgrade();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.hasAttribute("data-hx-ready")) return;
    this.attributeChanged(name, oldValue, newValue);
  }

  /** Override to react to an attribute change after the first render (default: render again). */
  attributeChanged() {
    this.#safeRender();
  }

  async setup() {}

  render() {}

  async selfTest() {
    throw new Error(`${this.localName} has no selfTest()`);
  }

  setState(patch) {
    this.state = { ...this.state, ...(typeof patch === "function" ? patch(this.state) : patch) };
    this.#safeRender();
  }

  live(text) {
    if (!this.liveRegion || text === this.#liveText) return;
    this.#liveText = text;
    this.liveRegion.textContent = text;
  }

  /** objectives: the element's data-objective by default; pass a list for per-item objectives (cards, say). */
  evidence(kind, detail = {}, objectives = null) {
    const module = document.documentElement.dataset.module ?? null;
    objectives ??= (this.dataset.objective ?? "").split(/\s+/).filter(Boolean);
    this.dispatchEvent(new CustomEvent("hx-evidence", {
      bubbles: true,
      detail: { module, objectives, kind, detail },
    }));
  }

  get store() {
    return hxContext().store;
  }

  get reducedMotion() {
    const stored = this.store?.state?.prefs?.motion ?? null;
    if (stored === "reduced") return true;
    if (stored === "full") return false;
    return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }

  async #upgrade() {
    // The fallback stays visible until the first render succeeds (no empty figure while data loads);
    // the UI is built hidden and swapped in at once.
    const fallback = document.createElement("div");
    fallback.className = "hx-fallback";
    fallback.append(...this.childNodes);
    const ui = document.createElement("div");
    ui.className = "hx-ui";
    ui.hidden = true;
    const liveRegion = document.createElement("p");
    liveRegion.className = "hx-live sr-only";
    liveRegion.setAttribute("aria-live", "polite");
    this.append(fallback, ui, liveRegion);
    this.ui = ui;
    this.liveRegion = liveRegion;
    try {
      const styles = this.constructor.styles;
      await Promise.all([styles ? loadStyles(styles) : null, this.setup()]);
      ui.hidden = false;
      fallback.hidden = true;
      this.render();
      this.setAttribute("data-hx-ready", "");
      this.#resolveReady(true);
    } catch (error) {
      this.#fail(error);
    }
  }

  #safeRender() {
    const active = this.contains(document.activeElement) ? document.activeElement : null;
    const key = active?.dataset?.key ?? null;
    try {
      this.render();
    } catch (error) {
      this.#fail(error);
      return;
    }
    if (key !== null && !this.contains(document.activeElement)) {
      this.ui?.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
    }
  }

  #fail(error) {
    this.ui?.remove();
    this.liveRegion?.remove();
    this.ui = null;
    this.liveRegion = null;
    this.querySelector(":scope > .hx-fallback")?.removeAttribute("hidden");
    this.setAttribute("data-hx-error", String(error?.message ?? error).slice(0, 200));
    this.#resolveReady(false);
  }
}
