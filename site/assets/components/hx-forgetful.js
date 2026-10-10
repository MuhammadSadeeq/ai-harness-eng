// hx-forgetful (BP-3.1 §3, A3): the model has no memory. A scripted stand-in answers only from the messages in the
// request it is given. "Resend the history" decides whether a request holds every earlier message or only the new one.
//   <hx-forgetful src="data/forgetful-demo.json" resend="1"></hx-forgetful>   (resend absent or "0": off)
// Values: messages_sent (read-only, messages in the last request), resend (settable, 0 or 1).
import { HxElement } from "./lib/hx-element.js";
import { tokens } from "../sim/index.js";
import { formatInt, plural } from "./lib/format.js";

const NO_RULE = "I don't have a rule for that in this demo.";

/**
 * The stand-in's answer to the newest message in `request`. It remembers only what an earlier user message in
 * this request set with a rule's `remembers` key. A placeholder with nothing remembered gives "I don't know …".
 */
export function standIn(request, rules) {
  const latest = request[request.length - 1];
  const memory = {};
  for (const message of request) {
    if (message.role !== "user") continue;
    for (const rule of rules) {
      if (!rule.remembers) continue;
      const hit = new RegExp(rule.match, "i").exec(message.text);
      if (hit) memory[rule.remembers] = hit[1];
    }
  }
  for (const rule of rules) {
    const hit = new RegExp(rule.match, "i").exec(latest.text);
    if (!hit) continue;
    let missing = null;
    const reply = rule.reply.replace(/\$(\w+)/g, (_, key) => {
      if (/^\d+$/.test(key)) return hit[Number(key)] ?? "";
      if (key in memory) return memory[key];
      missing = key;
      return "";
    });
    return missing ? `I don't know your ${missing}.` : reply;
  }
  return NO_RULE;
}

/** The messages a request holds: all of them with the history resent, else only the newest. */
export function requestOf(messages, resend) {
  return resend ? messages : messages.slice(-1);
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

export class HxForgetful extends HxElement {
  static observedAttributes = ["src", "resend"];
  static styles = new URL("./hx-forgetful.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    if (!src) throw new Error("hx-forgetful needs src");
    const response = await fetch(new URL(src, document.baseURI));
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
    const data = await response.json();
    if (!Array.isArray(data.rules) || data.rules.length === 0) throw new Error("hx-forgetful: no rules");
    for (const rule of data.rules) {
      if (typeof rule.match !== "string" || typeof rule.reply !== "string") throw new Error("hx-forgetful: bad rule");
      new RegExp(rule.match, "i");
    }
    this.rules = data.rules;
    const raw = this.getAttribute("resend");
    this.state = { messages: [], resend: raw !== null && raw !== "0", request: [] };
  }

  hxValue(name) {
    if (name === "messages_sent") return this.state.request.length;
    if (name === "resend") return this.state.resend ? 1 : 0;
    return null;
  }

  hxSetValue(name, value) {
    if (name === "resend" && (value === 0 || value === 1)) this.setResend(value === 1);
  }

  hxRange() {
    return null;
  }

  setResend(on) {
    if (on === this.state.resend) return;
    this.setState({ resend: on });
    this.dispatchEvent(new CustomEvent("hx-change", { bubbles: true, detail: { name: "resend", value: on ? 1 : 0 } }));
  }

  send(text) {
    const clean = text.trim();
    if (clean === "") return;
    const user = { role: "user", text: clean };
    const messages = [...this.state.messages, user];
    const request = requestOf(messages, this.state.resend);
    const reply = { role: "assistant", text: standIn(request, this.rules) };
    this.setState({ messages: [...messages, reply], request });
  }

  build() {
    const dom = {};
    this.dom = dom;
    dom.toggle = el("input", { type: "checkbox", "data-key": "resend" });
    dom.toggle.addEventListener("change", () => this.setResend(dom.toggle.checked));
    dom.log = el("ol", { class: "fg-log", "aria-label": "Chat" });
    dom.input = el("input", { type: "text", "aria-label": "Your message", "data-key": "message", maxlength: "200" });
    dom.send = el("button", { class: "key key-primary", type: "button", "data-key": "send", text: "Send" });
    dom.send.addEventListener("click", () => this.onSend(dom.input.value));
    dom.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.onSend(dom.input.value);
      }
    });
    dom.suggest = ["My name is Sam.", "What is my name?"].map((text) => {
      const button = el("button", { class: "key", type: "button", text });
      button.addEventListener("click", () => this.send(text));
      return button;
    });
    dom.note = el("p", { class: "fg-note", text: "A scripted stand-in: it only knows what is in the request." });
    dom.requestList = el("ol", { class: "fg-request" });
    dom.count = el("p", { class: "fg-count" });
    dom.tokens = el("p", { class: "fg-tokens" });
    this.ui.append(el("section", { class: "fg" },
      dom.note,
      el("label", { class: "fg-toggle" }, dom.toggle, el("span", { text: "Resend the history" })),
      el("div", { class: "fg-grid" },
        el("div", { class: "fg-chat" },
          dom.log,
          el("div", { class: "fg-suggest" }, ...dom.suggest),
          el("div", { class: "fg-compose" }, dom.input, dom.send)),
        el("div", { class: "fg-req" },
          el("p", { class: "fg-label", text: "The request" }),
          dom.requestList,
          dom.count,
          dom.tokens))));
  }

  onSend(text) {
    this.send(text);
    this.dom.input.value = "";
  }

  render() {
    if (!this.dom) this.build();
    const { dom, state: s } = this;
    dom.toggle.checked = s.resend;
    dom.log.replaceChildren(...s.messages.map((m) => el("li", { class: `fg-turn is-${m.role}` },
      el("span", { class: "fg-who", text: m.role === "user" ? "You" : "Stand-in" }),
      el("span", { class: "fg-text", text: m.text }))));
    dom.requestList.replaceChildren(...s.request.map((m) => el("li", {},
      el("span", { class: "fg-role", text: m.role }), el("span", { class: "fg-text", text: m.text }))));
    dom.count.textContent = s.request.length === 0 ? "No request yet." : `${plural(s.request.length, "message")} sent.`;
    dom.tokens.textContent = s.request.length === 0 ? "" : `≈ ${formatInt(tokens(s.request))} tokens in the request`;
  }

  async selfTest() {
    const { dom } = this;
    const saved = this.state.messages;
    dom.suggest[0].click();
    dom.suggest[1].click();
    const reply = this.state.messages.at(-1).text;
    const expected = this.state.resend ? "Your name is Sam." : "I don't know your name.";
    const ok = reply === expected;
    this.setState({ messages: saved, request: [] });
    return ok;
  }
}

customElements.define("hx-forgetful", HxForgetful);
