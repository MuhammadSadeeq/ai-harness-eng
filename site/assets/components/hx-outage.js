// hx-outage (BP-3.3 §2, C6, D-051): the course's model of a provider and its clients, seeded, not a measurement.
// Each client sends one request at a time and retries a failure with ENGINE §7.3's backoff, drawing from its own PRNG
// stream (seed * 1000 + index, the simulator's mulberry32). The provider serves at most `capacity` requests per slot and
// none inside the outage window; requests in a slot are served in arrival order, then client index.
//   <hx-outage src="data/outage-demo.json" seed="1"></hx-outage>
// Knob changes wait for Run; a preset and New seed run at once. Evidence: "outage" on each pin, {policy, recovered_ms,
// failed}. Values: recovered_ms (null when the run does not recover), requests, failed; read-only.
import { HxElement } from "./lib/hx-element.js";
import { formatInt, formatMs, plural } from "./lib/format.js";
import { createPrng } from "../sim/prng.js";
import { backoffWait } from "../sim/backoff.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const PROVIDER_KEYS = ["clients", "think_ms", "slot_ms", "capacity", "outage_from_ms", "outage_to_ms", "duration_ms", "error_ms"];
const RECOVERY_SLOTS = 10;
const RECOVERY_SHARE = 10; // percent: a slot counts as recovered below this share of failures
let uidCount = 0;

const isInt = (n) => Number.isInteger(n);

/** The provider's numbers (integers, times in ms). Throws with the first problem. */
export function validProvider(p) {
  for (const key of PROVIDER_KEYS) {
    if (!isInt(p?.[key]) || p[key] < 0) throw new Error(`hx-outage: provider.${key} must be a whole number`);
  }
  if (p.clients < 1 || p.clients > 999) throw new Error("hx-outage: clients must be 1 to 999");
  if (p.think_ms < 1 || p.slot_ms < 1 || p.capacity < 1) throw new Error("hx-outage: think_ms, slot_ms and capacity must be at least 1");
  if (p.duration_ms < p.slot_ms) throw new Error("hx-outage: duration_ms must cover at least one slot");
  if (p.error_ms > 5000) throw new Error("hx-outage: error_ms is 0 to 5000");
  if (p.start !== undefined && p.start !== "spread" && p.start !== "together") throw new Error('hx-outage: provider.start is "spread" or "together"');
  if (p.arrivals_per_slot !== undefined && (!isInt(p.arrivals_per_slot) || p.arrivals_per_slot < 0 || p.arrivals_per_slot > 100)) {
    throw new Error("hx-outage: provider.arrivals_per_slot is a whole number, 0 to 100");
  }
  if (p.outage_from_ms > p.outage_to_ms) throw new Error("hx-outage: the outage must end after it starts");
  return p;
}

/** A retry policy (ENGINE §7.3 knobs; breaker null when off). Throws with the first problem. */
export function validPolicy(p, where = "policy") {
  if (!isInt(p?.max_attempts) || p.max_attempts < 1 || p.max_attempts > 10) throw new Error(`hx-outage: ${where} needs max_attempts 1 to 10`);
  if (!isInt(p.base_ms) || p.base_ms < 0 || p.base_ms > 2000) throw new Error(`hx-outage: ${where} needs base_ms 0 to 2000`);
  if (!isInt(p.cap_ms) || p.cap_ms < 100 || p.cap_ms > 20000) throw new Error(`hx-outage: ${where} needs cap_ms 100 to 20000`);
  if (p.jitter !== "none" && p.jitter !== "full") throw new Error(`hx-outage: ${where} needs jitter none or full`);
  if (p.breaker !== null) {
    if (!isInt(p.breaker?.threshold) || p.breaker.threshold < 2 || p.breaker.threshold > 10) throw new Error(`hx-outage: ${where} breaker threshold is 2 to 10`);
    if (!isInt(p.breaker.cooldown_ms) || p.breaker.cooldown_ms < 1000 || p.breaker.cooldown_ms > 10000) throw new Error(`hx-outage: ${where} breaker cooldown is 1000 to 10000 ms`);
  }
  return p;
}

/** The src: the provider, the default policy and the presets. Throws with the first problem. */
export function validOutage(src) {
  validProvider(src?.provider);
  if (src.story !== undefined && typeof src.story !== "string") throw new Error("hx-outage: story must be text");
  if (src.models !== undefined) {
    if (!Array.isArray(src.models) || src.models.length === 0) throw new Error("hx-outage: models must be a list");
    src.models.forEach((model, i) => {
      if (typeof model?.label !== "string") throw new Error(`hx-outage: model ${i + 1} needs a label`);
      validProvider({ ...src.provider, ...(model.provider ?? {}) });
    });
  }
  validPolicy(src.policy);
  if (!Array.isArray(src.presets) || src.presets.length === 0) throw new Error("hx-outage: needs presets");
  src.presets.forEach((preset, i) => {
    if (typeof preset?.label !== "string") throw new Error(`hx-outage: preset ${i + 1} needs a label`);
    validPolicy(preset.policy, `preset ${i + 1}`);
  });
  return src;
}

export const clonePolicy = (p) => ({ ...p, breaker: p.breaker ? { ...p.breaker } : null });

export function samePolicy(a, b) {
  if (!a || !b) return false;
  if (a.max_attempts !== b.max_attempts || a.base_ms !== b.base_ms || a.cap_ms !== b.cap_ms || a.jitter !== b.jitter) return false;
  if (a.breaker === null || b.breaker === null) return a.breaker === b.breaker;
  return a.breaker.threshold === b.breaker.threshold && a.breaker.cooldown_ms === b.breaker.cooldown_ms;
}


/** The first slot from which RECOVERY_SLOTS slots in a row have fewer than 10% of requests failing; null if none. */
export function recoveredAt(sent, failedAt, outageToMs, slotMs) {
  const first = Math.ceil(outageToMs / slotMs);
  for (let s = first; s + RECOVERY_SLOTS <= sent.length; s += 1) {
    let ok = true;
    for (let k = s; k < s + RECOVERY_SLOTS && ok; k += 1) {
      if (sent[k] > 0 && failedAt[k] * 100 >= sent[k] * RECOVERY_SHARE) ok = false;
    }
    if (ok) return s * slotMs;
  }
  return null;
}

/** A binary min-heap of numbers (event keys: time * 1000 + client index). */
class MinHeap {
  constructor() {
    this.a = [];
  }

  get size() {
    return this.a.length;
  }

  push(value) {
    const a = this.a;
    a.push(value);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent] <= a[i]) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }

  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let m = i;
        if (left < a.length && a[left] < a[m]) m = left;
        if (right < a.length && a[right] < a[m]) m = right;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Runs the model for duration_ms (the course's model, not a measurement). Closed loop (arrivals_per_slot 0): each client
 * sends one request at a time and starts its next task after think_ms; `start` "spread" begins client c at
 * floor(c * think_ms / clients), "together" at 0. Open arrivals (arrivals_per_slot A > 0): task j arrives at
 * floor(j * slot_ms / A) and belongs to client j mod clients; clients do not wait for their own answers.
 * A served request is answered at once. A failed request is answered after error_ms, and its retry (or, closed loop,
 * the next task) starts then. The breaker is per client: after `threshold` failures in a row it holds that client's
 * attempts until the cooldown ends, and the first attempt released is the trial.
 * Returns per-slot requests sent and failed, and the totals: requests, failed (tasks given up on), peak (requests in
 * the busiest slot), recovered_ms (or null), slowest_ms (the longest task, from the moment its first attempt fell due
 * to its final answer) and slowest_open (true when that task was still open at the end, so it is a lower bound).
 */
export function simulate(provider, policy, seed) {
  const {
    clients, think_ms: think, slot_ms: slotMs, capacity, outage_from_ms: from, outage_to_ms: to,
    duration_ms: duration, error_ms: errorMs, start = "spread", arrivals_per_slot: arrivals = 0,
  } = provider;
  const open = arrivals > 0;
  const slots = Math.ceil(duration / slotMs);
  const sent = new Array(slots).fill(0);
  const failedAt = new Array(slots).fill(0);
  const used = new Array(slots).fill(0);
  const taskCount = open ? Math.ceil((duration * arrivals) / slotMs) + 1 : clients;
  const clientOf = (task) => (open ? task % clients : task);
  const streams = [];
  for (let c = 0; c < clients; c += 1) streams.push(createPrng(seed * 1000 + c));
  const streak = new Array(clients).fill(0);
  const openUntil = new Array(clients).fill(0);
  const attempt = new Array(taskCount).fill(0);
  const started = new Array(taskCount).fill(0);
  const done = new Array(taskCount).fill(false);
  const heap = new MinHeap();
  // Heap key: time * 1e8 + client * 1e5 + task, so events at one time run in client order.
  const KEY = 1e8;
  const keyOf = (time, task) => time * KEY + clientOf(task) * 1e5 + task;
  const startTask = (task, at) => {
    started[task] = at;
    done[task] = false;
    heap.push(keyOf(at, task));
  };
  if (open) {
    for (let j = 0; j < taskCount; j += 1) startTask(j, Math.floor((j * slotMs) / arrivals));
  } else {
    for (let c = 0; c < clients; c += 1) startTask(c, start === "together" ? 0 : Math.floor((c * think) / clients));
  }
  let requests = 0;
  let failed = 0;
  let slowest = 0;
  let slowestOpen = false;
  let lastFailure = null;
  const note = (ms, isOpen) => {
    if (ms > slowest) {
      slowest = ms;
      slowestOpen = isOpen;
    }
  };
  while (heap.size > 0) {
    const key = heap.pop();
    const t = Math.floor(key / KEY);
    if (t >= duration) break;
    const task = (key % KEY) % 1e5;
    const c = clientOf(task);
    if (policy.breaker && t < openUntil[c]) {
      heap.push(keyOf(openUntil[c], task));
      continue;
    }
    const slot = Math.floor(t / slotMs);
    attempt[task] += 1;
    requests += 1;
    sent[slot] += 1;
    const down = t >= from && t < to;
    if (!down && used[slot] < capacity) {
      used[slot] += 1;
      streak[c] = 0;
      openUntil[c] = 0;
      note(t - started[task], false);
      done[task] = true;
      attempt[task] = 0;
      if (!open) startTask(task, t + think);
      continue;
    }
    failedAt[slot] += 1;
    streak[c] += 1;
    lastFailure = t;
    const answer = t + errorMs;
    if (attempt[task] >= policy.max_attempts) {
      failed += 1;
      if (answer < duration) note(answer - started[task], false);
      else note(duration - started[task], true);
      done[task] = true;
      attempt[task] = 0;
      if (policy.breaker && streak[c] >= policy.breaker.threshold) openUntil[c] = answer + policy.breaker.cooldown_ms;
      if (!open) startTask(task, answer + think);
    } else {
      if (policy.breaker && streak[c] >= policy.breaker.threshold) openUntil[c] = answer + policy.breaker.cooldown_ms;
      heap.push(keyOf(answer + backoffWait(attempt[task], policy, streams[c], 0), task));
    }
  }
  for (let task = 0; task < taskCount; task += 1) {
    if (!done[task] && started[task] < duration) note(duration - started[task], true);
  }
  let peak = 0;
  for (const value of sent) peak = Math.max(peak, value);
  return {
    sent,
    failedAt,
    requests,
    failed,
    peak,
    recovered_ms: recoveredAt(sent, failedAt, to, slotMs),
    slowest_ms: slowest,
    slowest_open: slowestOpen,
    last_failure_ms: lastFailure,
  };
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

const svgNode = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key === "text") node.textContent = String(value);
    else node.setAttribute(key, String(value));
  }
  return node;
};

const policyWords = (p) => `${plural(p.max_attempts, "attempt")}, base ${formatMs(p.base_ms)}, cap ${formatMs(p.cap_ms)}, jitter ${p.jitter}, ${
  p.breaker ? `breaker after ${p.breaker.threshold} in a row, cooldown ${formatMs(p.breaker.cooldown_ms)}` : "no breaker"}`;

const failureWords = (ms) => (ms === null ? "no failures" : `last failure at ${formatMs(ms)}`);

/** The slowest task, from its first attempt to its final answer; "at least" when it is still open at the end. */
const slowestText = (r) => `${r.slowest_open ? "at least " : ""}${formatMs(r.slowest_ms)}`;
const slowestWords = (r) => (r.slowest_ms === 0 ? "No task finished" : slowestText(r));

const STEPPERS = [
  { key: "max_attempts", label: "Attempts per request", min: 1, max: 10, step: 1, ms: false },
  { key: "base_ms", label: "Base delay", min: 0, max: 2000, step: 50, ms: true },
  { key: "cap_ms", label: "Cap on the delay", min: 100, max: 20000, step: 100, ms: true },
];
const BREAKER_STEPPERS = [
  { key: "threshold", label: "Failures in a row before the breaker opens", min: 2, max: 10, step: 1, ms: false },
  { key: "cooldown_ms", label: "Breaker cooldown", min: 1000, max: 10000, step: 500, ms: true },
];

export class HxOutage extends HxElement {
  static observedAttributes = ["src", "seed"];
  static styles = new URL("./hx-outage.css", import.meta.url).href;

  async setup() {
    const src = this.getAttribute("src");
    if (!src) throw new Error("hx-outage needs src");
    const response = await fetch(new URL(src, document.baseURI));
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
    this.data = validOutage(await response.json());
    this.models = this.data.models ?? [{ label: "Clients pace themselves", provider: {} }];
    this.presets = this.data.presets;
    this.uid = `hxo${++uidCount}`;
    const seed = parseSeed(this.getAttribute("seed"));
    const policy = clonePolicy(this.data.policy);
    this.state = { seed, policy, model: 0, result: null, pins: [] };
    this.state.result = this.compute(policy, seed, 0);
  }

  /** The provider of one model: the base provider with that model's overrides. */
  providerFor(index) {
    return { ...this.data.provider, ...(this.models[index].provider ?? {}) };
  }

  /** The provider of the model the learner has chosen. */
  get provider() {
    return this.providerFor(this.state?.model ?? 0);
  }

  compute(policy, seed, model = this.state.model) {
    return { policy: clonePolicy(policy), seed, model, ...simulate(this.providerFor(model), policy, seed) };
  }

  setModel(index) {
    if (index === this.state.model) return;
    this.setState({ model: index, result: this.compute(this.state.policy, this.state.seed, index) });
  }

  setPolicy(patch) {
    this.setState({ policy: { ...this.state.policy, ...patch } });
  }

  setBreaker(on) {
    const breaker = on ? { threshold: 3, cooldown_ms: 5000 } : null;
    this.setState({ policy: { ...this.state.policy, breaker } });
  }

  setBreakerValue(key, value) {
    if (!this.state.policy.breaker) return;
    this.setState({ policy: { ...this.state.policy, breaker: { ...this.state.policy.breaker, [key]: value } } });
  }

  run() {
    this.setState({ result: this.compute(this.state.policy, this.state.seed) });
  }

  newSeed() {
    const seed = this.state.seed >= 999 ? 1 : this.state.seed + 1;
    this.setState({ seed, result: this.compute(this.state.policy, seed) });
  }

  usePreset(index) {
    const policy = clonePolicy(this.presets[index].policy);
    this.setState({ policy, result: this.compute(policy, this.state.seed) });
  }

  pin() {
    const r = this.state.result;
    if (this.state.pins.length >= 2) return;
    const pin = {
      model: r.model, policy: clonePolicy(r.policy), recovered_ms: r.recovered_ms, last_failure_ms: r.last_failure_ms,
      requests: r.requests, failed: r.failed, peak: r.peak,
      slowest_ms: r.slowest_ms, slowest_open: r.slowest_open,
    };
    this.setState({ pins: [...this.state.pins, pin] });
    this.evidence("outage", {
      policy: clonePolicy(r.policy), recovered_ms: r.recovered_ms, last_failure_ms: r.last_failure_ms, failed: r.failed,
    });
  }

  attributeChanged(name) {
    if (name !== "seed" || !this.data) return;
    const seed = parseSeed(this.getAttribute("seed"));
    this.setState({ seed, result: this.compute(this.state.policy, seed) });
  }

  stepper(spec, read, write) {
    const value = el("span", { class: "readout-value" });
    const minus = el("button", { class: "key key-icon", type: "button", "aria-label": `Lower ${spec.label}`, "data-key": `${spec.key}-minus`, text: "−" });
    const plus = el("button", { class: "key key-icon", type: "button", "aria-label": `Raise ${spec.label}`, "data-key": `${spec.key}-plus`, text: "+" });
    minus.addEventListener("click", () => write(Math.max(spec.min, read() - spec.step)));
    plus.addEventListener("click", () => write(Math.min(spec.max, read() + spec.step)));
    this.dom.steppers[spec.key] = { spec, read, value, minus, plus };
    return el("div", { class: "ou-row" },
      el("p", { class: "ou-label", text: spec.label }),
      el("div", { class: "ou-stepper" }, minus, el("span", { class: "readout ou-readout" }, value), plus));
  }

  build() {
    const dom = { steppers: {}, presets: [] };
    this.dom = dom;
    dom.line = el("p", { class: "ou-line", text: "The course's model of a provider and its clients, not a measurement." });
    dom.story = el("p", { class: "ou-story" });
    dom.model = el("select", { "data-key": "model" },
      ...this.models.map((model, i) => el("option", { value: String(i), text: model.label })));
    dom.model.addEventListener("change", () => this.setModel(Number(dom.model.value)));
    dom.modelField = el("label", { class: "ou-field ou-model" }, el("span", { text: "Load model" }), dom.model);
    dom.presets = this.presets.map((preset, i) => {
      const button = el("button", { class: "btn ou-preset", type: "button", "aria-pressed": "false", "data-key": `preset-${i}`, text: preset.label });
      button.addEventListener("click", () => this.usePreset(i));
      return button;
    });
    const policyRead = (key) => () => this.state.policy[key];
    const breakerRead = (key) => () => this.state.policy.breaker?.[key] ?? 0;
    dom.jitter = el("select", { "data-key": "jitter" },
      el("option", { value: "none", text: "none" }),
      el("option", { value: "full", text: "full" }));
    dom.jitter.addEventListener("change", () => this.setPolicy({ jitter: dom.jitter.value }));
    dom.breakerOn = el("select", { "data-key": "breaker" },
      el("option", { value: "off", text: "Off" }),
      el("option", { value: "on", text: "On" }));
    dom.breakerOn.addEventListener("change", () => this.setBreaker(dom.breakerOn.value === "on"));
    const knobs = STEPPERS.map((spec) => this.stepper(spec, policyRead(spec.key), (v) => this.setPolicy({ [spec.key]: v })));
    dom.breakerRows = el("div", { class: "ou-breaker" },
      ...BREAKER_STEPPERS.map((spec) => this.stepper(spec, breakerRead(spec.key), (v) => this.setBreakerValue(spec.key, v))));
    dom.chart = el("div", { class: "ou-chart" });
    dom.capLegend = el("span", {});
    dom.figure = el("figure", { class: "plate instrument ou-plate" },
      el("figcaption", { class: "fig-label" }),
      dom.chart,
      el("ul", { class: "ou-legend" },
        el("li", {}, el("span", { class: "ou-swatch is-served", "aria-hidden": "true" }), "Served"),
        el("li", {}, el("span", { class: "ou-swatch is-failed", "aria-hidden": "true" }), "Failed"),
        el("li", {}, el("span", { class: "ou-swatch is-cap", "aria-hidden": "true" }), dom.capLegend),
        el("li", {}, el("span", { class: "ou-swatch is-down", "aria-hidden": "true" }), "Provider down")));
    dom.caption = dom.figure.querySelector(".fig-label");
    dom.run = el("button", { class: "key key-primary", type: "button", "data-key": "run", text: "Run" });
    dom.run.addEventListener("click", () => this.run());
    dom.newSeed = el("button", { class: "key", type: "button", "data-key": "new-seed", text: "New seed" });
    dom.newSeed.addEventListener("click", () => this.newSeed());
    dom.seed = el("p", { class: "ou-seed" });
    dom.stale = el("p", { class: "ou-stale", text: "Settings changed since the last run. Run to update." });
    dom.recovery = el("p", { class: "readout-value" });
    dom.requests = el("p", { class: "readout-value" });
    dom.failed = el("p", { class: "readout-value" });
    dom.peak = el("p", { class: "readout-value" });
    dom.slowest = el("p", { class: "readout-value" });
    dom.pin = el("button", { class: "key", type: "button", "data-key": "pin", text: "Pin this" });
    dom.pin.addEventListener("click", () => this.pin());
    dom.pins = el("ol", { class: "ou-pins" });
    dom.compare = el("p", { class: "ou-compare" });
    this.ui.append(el("section", { class: "ou" },
      dom.line,
      dom.story,
      dom.modelField,
      el("div", { class: "ou-presets", role: "group", "aria-label": "Presets" }, ...dom.presets),
      el("div", { class: "ou-knobs" },
        ...knobs,
        el("label", { class: "ou-field" }, el("span", { text: "Jitter" }), dom.jitter),
        el("label", { class: "ou-field" }, el("span", { text: "Breaker" }), dom.breakerOn),
        dom.breakerRows),
      el("div", { class: "ou-run" }, dom.run, dom.newSeed, dom.seed),
      dom.stale,
      dom.figure,
      el("div", { class: "ou-readouts" },
        el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Last failure" }), dom.recovery),
        el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Traffic" }), dom.requests),
        el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Failures" }), dom.failed),
        el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Peak" }), dom.peak),
        el("div", { class: "readout" }, el("p", { class: "readout-label", text: "Slowest task" }), dom.slowest)),
      el("div", { class: "ou-actions" }, dom.pin),
      dom.pins,
      dom.compare));
    this.ro = new ResizeObserver(() => {
      if (this.dom && chartWidth(dom.chart) !== this.drawnWidth) this.drawChart();
    });
    this.ro.observe(dom.chart);
  }

  render() {
    if (!this.dom) this.build();
    const { dom, state: s, provider: p } = this;
    const r = s.result;
    dom.presets.forEach((button, i) => button.setAttribute("aria-pressed", String(samePolicy(this.presets[i].policy, s.policy))));
    for (const view of Object.values(dom.steppers)) {
      const v = view.read();
      view.value.textContent = view.spec.ms ? formatMs(v) : formatInt(v);
      view.minus.setAttribute("aria-disabled", String(v <= view.spec.min));
      view.plus.setAttribute("aria-disabled", String(v >= view.spec.max));
    }
    dom.jitter.value = s.policy.jitter;
    dom.model.value = String(s.model);
    dom.capLegend.textContent = `Capacity ${formatInt(p.capacity)} per slot`;
    dom.breakerOn.value = s.policy.breaker ? "on" : "off";
    dom.breakerRows.hidden = !s.policy.breaker;
    dom.stale.hidden = samePolicy(s.policy, r.policy);
    dom.seed.textContent = `Seed ${formatInt(s.seed)}`;
    dom.caption.textContent = `Requests per ${formatMs(p.slot_ms)} slot`;
    dom.recovery.textContent = r.last_failure_ms === null ? "No failures" : `at ${formatMs(r.last_failure_ms)}`;
    dom.modelField.hidden = this.models.length < 2;
    dom.story.textContent = this.data.story ?? "";
    dom.story.hidden = !this.data.story;
    dom.requests.textContent = `${plural(r.requests, "request")} sent`;
    dom.failed.textContent = `${plural(r.failed, "task")} failed`;
    dom.peak.textContent = `${plural(r.peak, "request")} in one slot`;
    dom.slowest.textContent = slowestWords(r);
    dom.pin.setAttribute("aria-disabled", String(s.pins.length >= 2));
    dom.pins.replaceChildren(...s.pins.map((pin, i) => el("li", { class: "ou-pin", text:
      `${"AB"[i]}: ${this.models[pin.model].label}; ${policyWords(pin.policy)}: ${failureWords(pin.last_failure_ms)}, ${plural(pin.failed, "task")} failed, slowest task ${slowestText(pin)}.` })));
    dom.compare.textContent = s.pins.length === 2 ? this.comparison(s.pins[0], s.pins[1]) : "";
    this.drawChart();
  }

  /** A line about two pins: failed tasks, the last failure and the slowest task, A against B. */
  comparison(a, b) {
    const parts = [];
    if (a.model !== b.model) parts.push("The two pins use different load models.");
    const d = b.failed - a.failed;
    const count = Math.abs(d);
    parts.push(d === 0
      ? "B fails as many tasks as A."
      : `B fails ${formatInt(count)} ${count === 1 ? "task" : "tasks"} ${d < 0 ? "fewer" : "more"} than A.`);
    if (a.last_failure_ms !== null && b.last_failure_ms !== null) {
      const dl = b.last_failure_ms - a.last_failure_ms;
      parts.push(dl === 0
        ? "B's last failure is at the same time as A's."
        : `B's last failure comes ${formatMs(Math.abs(dl))} ${dl < 0 ? "earlier" : "later"} than A's.`);
    } else if (a.last_failure_ms === null && b.last_failure_ms === null) {
      parts.push("Neither pin has a failure.");
    } else {
      parts.push(a.last_failure_ms === null ? "A has no failures." : "B has no failures.");
    }
    const ds = b.slowest_ms - a.slowest_ms;
    parts.push(ds === 0
      ? "B's slowest task takes as long as A's."
      : `B's slowest task takes ${formatMs(Math.abs(ds))} ${ds < 0 ? "less" : "more"} than A's.`);
    return parts.join(" ");
  }

  /** The figure: requests per slot as bars (served solid, failed hatched), the capacity line and the outage shaded. */
  drawChart() {
    const { dom, provider: p } = this;
    const r = this.state.result;
    const width = chartWidth(dom.chart);
    this.drawnWidth = width;
    const H = 220;
    const left = 40;
    const right = 8;
    const top = 30;
    const bottom = 34;
    const PW = width - left - right;
    const PH = H - top - bottom;
    const S = r.sent.length;
    const yTop = Math.max(10, Math.ceil(Math.max(p.capacity, r.peak) / 10) * 10);
    const x = (slot) => left + (slot * PW) / S;
    const y = (v) => top + PH - (v * PH) / yTop;
    const barW = Math.max(1, PW / S - 1);
    const hatch = `${this.uid}-hatch`;
    const svg = svgNode("svg", {
      class: "ou-svg", width, height: H, viewBox: `0 0 ${width} ${H}`, role: "img",
      "aria-label": `Requests per slot against a capacity of ${p.capacity}. Provider down from ${formatMs(p.outage_from_ms)} to ${formatMs(p.outage_to_ms)}. ${r.failed} tasks failed.`,
    });
    const defs = svgNode("defs");
    const pattern = svgNode("pattern", { id: hatch, width: 5, height: 5, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
    const ground = svgNode("rect", { width: 5, height: 5 });
    ground.setAttribute("style", "fill: var(--hx-panel)");
    const stroke = svgNode("line", { x1: 0, y1: 0, x2: 0, y2: 5 });
    stroke.setAttribute("style", "stroke: var(--hx-ink); stroke-width: 2");
    pattern.append(ground, stroke);
    defs.append(pattern);
    svg.append(defs);
    const from = p.outage_from_ms / p.slot_ms;
    const to = p.outage_to_ms / p.slot_ms;
    svg.append(svgNode("rect", { class: "ou-down", x: x(from), y: top, width: Math.max(0, x(to) - x(from)), height: PH }));
    svg.append(svgNode("text", { class: "ou-tick ou-label-down", x: x(from) + 4, y: top - 10, text: `Provider down, ${formatMs(p.outage_from_ms)} to ${formatMs(p.outage_to_ms)}` }));
    for (let slot = 0; slot < S; slot += 1) {
      const failed = r.failedAt[slot];
      const served = r.sent[slot] - failed;
      if (served > 0) svg.append(svgNode("rect", { class: "ou-served", x: x(slot), y: y(served), width: barW, height: y(0) - y(served) }));
      if (failed > 0) {
        const failedRect = svgNode("rect", { class: "ou-failed", x: x(slot), y: y(r.sent[slot]), width: barW, height: y(served) - y(r.sent[slot]) });
        failedRect.setAttribute("fill", `url(#${hatch})`);
        svg.append(failedRect);
      }
    }
    svg.append(svgNode("line", { class: "ou-cap", x1: left, x2: left + PW, y1: y(p.capacity), y2: y(p.capacity) }));
    svg.append(svgNode("line", { class: "ou-axis", x1: left, x2: left + PW, y1: y(0), y2: y(0) }));
    svg.append(svgNode("text", { class: "ou-tick", x: left - 6, y: y(0) + 5, "text-anchor": "end", text: "0" }));
    svg.append(svgNode("text", { class: "ou-tick", x: left - 6, y: y(p.capacity) + 5, "text-anchor": "end", text: String(p.capacity) }));
    const seconds = p.duration_ms / 1000;
    for (let sec = 0; sec <= seconds; sec += 5) {
      const slot = (sec * 1000) / p.slot_ms;
      const anchor = sec === 0 ? "start" : sec === seconds ? "end" : "middle";
      svg.append(svgNode("text", { class: "ou-tick", x: x(slot), y: H - 10, "text-anchor": anchor, text: `${sec} s` }));
    }
    dom.chart.replaceChildren(svg);
  }

  hxValue(name) {
    const r = this.state.result;
    if (name === "recovered_ms") return r.recovered_ms;
    if (name === "last_failure_ms") return r.last_failure_ms;
    if (name === "requests") return r.requests;
    if (name === "failed") return r.failed;
    if (name === "slowest_ms") return r.slowest_ms;
    return null;
  }

  hxRange() {
    return null;
  }

  async selfTest() {
    const saved = this.state;
    const { dom } = this;
    let evidence = 0;
    const count = (event) => {
      if (event.detail.kind === "outage") evidence += 1;
    };
    this.addEventListener("hx-evidence", count);
    try {
      dom.presets[0].click();
      if (!samePolicy(this.state.result.policy, this.presets[0].policy)) return false;
      if (this.state.result.requests <= 0) return false;
      if (!dom.stale.hidden) return false;
      const attempts = this.state.policy.max_attempts;
      (attempts < 10 ? dom.steppers.max_attempts.plus : dom.steppers.max_attempts.minus).click();
      if (dom.stale.hidden) return false;
      dom.run.click();
      if (!dom.stale.hidden) return false;
      if (this.state.result.policy.max_attempts === attempts) return false;
      dom.pin.click();
      if (this.state.pins.length !== 1 || evidence !== 1) return false;
      return true;
    } finally {
      this.removeEventListener("hx-evidence", count);
      this.restoreAfterTest(saved);
    }
  }
}

/** The chart's width: the host's measured width, never narrower than 240 px (the figure scrolls nothing). */
function chartWidth(host) {
  return Math.max(240, Math.floor(host.getBoundingClientRect().width));
}

function parseSeed(raw) {
  const n = Number(raw ?? 1);
  return Number.isInteger(n) && n >= 1 && n <= 999 ? n : 1;
}

customElements.define("hx-outage", HxOutage);
