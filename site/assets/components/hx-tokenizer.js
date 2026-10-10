// hx-tokenizer (BP-3.1 §2, A2): tokens and the window. A textarea, with live counts, the course estimate
// (the simulator's tokens() rule, about 4 characters per token), an approximate split and the window's share.
//   <hx-tokenizer src="data/tokenizer-demo.json" window="8000" text="…"></hx-tokenizer>
// Values: tokens (read-only, the estimate), window (settable).
import { HxElement } from "./lib/hx-element.js";
import { tokens } from "../sim/index.js";
import { formatInt, plural } from "./lib/format.js";

const SPLIT_CAP = 200;
const CHUNK = 4;
let uidCount = 0;

/** An approximate split: words and punctuation, long words cut into 4-character pieces. */
export function approximateSplit(text) {
  const pieces = text.match(/\s*[A-Za-z0-9_]+|\s*[^\sA-Za-z0-9_]|\s+/g) ?? [];
  const out = [];
  for (const piece of pieces) {
    const lead = piece.match(/^\s*/)[0];
    const body = piece.slice(lead.length);
    if (body.length <= CHUNK) {
      out.push(piece);
      continue;
    }
    out.push(lead + body.slice(0, CHUNK));
    for (let i = CHUNK; i < body.length; i += CHUNK) out.push(body.slice(i, i + CHUNK));
  }
  return out;
}

/** The share of the window as words: "less than 1%" above 0 and under 1, else the integer percent. */
export function shareText(toks, window) {
  const pct = Math.floor((toks * 100) / window);
  return toks > 0 && pct < 1 ? "less than 1%" : `${formatInt(pct)}%`;
}

/** The course estimate: tokens() of the text, as the simulator counts a request. */
export function estimate(text) {
  return tokens(text);
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

export class HxTokenizer extends HxElement {
  static observedAttributes = ["src", "window", "text"];
  static styles = new URL("./hx-tokenizer.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    let presets = [];
    if (src) {
      const response = await fetch(new URL(src, document.baseURI));
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
      const data = await response.json();
      presets = (data.presets ?? []).map((p) => ({
        label: p.label,
        text: typeof p.text === "string" ? p.text : Array(p.repeat.times).fill(p.repeat.line).join("\n"),
      }));
    }
    this.presets = presets;
    const win = this.getAttribute("window") ?? "8000";
    if (!/^\d+$/.test(win) || Number(win) < 1) throw new Error("hx-tokenizer: window must be a positive integer");
    this.state = { text: this.getAttribute("text") ?? "", window: Number(win) };
  }

  hxValue(name) {
    if (name === "tokens") return estimate(this.state.text);
    if (name === "window") return this.state.window;
    return null;
  }

  hxSetValue(name, value) {
    if (name === "window" && Number.isInteger(value) && value >= 1) this.setState({ window: value });
  }

  hxRange() {
    return null;
  }

  build() {
    const dom = {};
    this.dom = dom;
    const id = `hxt${++uidCount}`;
    dom.area = el("textarea", { id, rows: "6", "data-key": "text" });
    dom.area.addEventListener("input", () => this.setState({ text: dom.area.value }));
    dom.label = el("label", { class: "tok-label", for: id, text: "Your text" });
    dom.counts = el("p", { class: "tok-counts" });
    dom.rule = el("p", { class: "tok-rule", text: "The estimate uses about 4 characters per token." });
    dom.est = el("p", { class: "tok-est" });
    dom.split = el("div", { class: "tok-chips" });
    dom.splitNote = el("p", { class: "tok-note", text: "An approximate split. Real tokenizers differ." });
    dom.splitCount = el("p", { class: "tok-cap" });
    dom.desk = el("span", { class: "tok-desk-fill" });
    dom.deskText = el("p", { class: "tok-desk-text" });
    dom.presetButtons = this.presets.map((preset, i) => {
      const button = el("button", { class: "key", type: "button", "data-key": `preset-${i}`, text: preset.label });
      button.addEventListener("click", () => {
        dom.area.value = preset.text;
        this.setState({ text: preset.text });
      });
      return button;
    });
    this.ui.append(el("section", { class: "tok" },
      el("div", { class: "tok-presets" }, ...dom.presetButtons),
      dom.label,
      dom.area,
      dom.counts,
      dom.rule,
      dom.est,
      el("p", { class: "tok-label2", text: "Approximate split" }),
      dom.split,
      dom.splitCount,
      dom.splitNote,
      el("div", { class: "tok-desk" }, el("span", { class: "tok-desk-bar" }, dom.desk), dom.deskText)));
  }

  render() {
    if (!this.dom) this.build();
    const { dom, state: s } = this;
    if (dom.area.value !== s.text) dom.area.value = s.text;
    const chars = [...s.text].length;
    const words = s.text.trim() === "" ? 0 : s.text.trim().split(/\s+/).length;
    dom.counts.textContent = `${plural(chars, "character")} · ${plural(words, "word")}`;
    const toks = estimate(s.text);
    dom.est.textContent = `≈ ${formatInt(toks)} ${toks === 1 ? "token" : "tokens"}`;
    const pieces = approximateSplit(s.text);
    dom.split.replaceChildren(...pieces.slice(0, SPLIT_CAP).map((piece) => el("span", { class: "tok-chip", text: piece.replace(/\s+/g, "␠") || "␠" })));
    dom.splitCount.textContent = pieces.length > SPLIT_CAP ? `Showing the first ${formatInt(SPLIT_CAP)} of ${formatInt(pieces.length)} pieces.` : "";
    const pct = Math.floor((toks * 100) / s.window);
    dom.desk.style.width = `${Math.min(100, pct)}%`;
    dom.deskText.textContent = `${shareText(toks, s.window)} of the ${formatInt(s.window)}-token window`;
  }

  async selfTest() {
    const { dom } = this;
    if (this.presets.length > 0) dom.presetButtons[0].click();
    else {
      dom.area.value = "The model has no memory of this text.";
      dom.area.dispatchEvent(new Event("input"));
    }
    const shown = this.state.text;
    if (shown.length === 0) return false;
    return this.hxValue("tokens") === estimate(shown) && dom.est.textContent.includes(formatInt(estimate(shown)));
  }
}

customElements.define("hx-tokenizer", HxTokenizer);
