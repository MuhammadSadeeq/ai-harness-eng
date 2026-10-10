// Home: the shift console (BP-0.7-common, screen 1). Custom element <hx-proto-home>.
import { WIRES, glyph, initChrome, nowLabel, readStore, esc } from "./app.js";

// Modules already plugged into the harness board (from the brief).
const PLUGGED = {
  context: [{ name: "history resend", from: "A3" }],
  loop: [{ name: "block-aware reply parser", from: "A4" }],
};
// The next empty socket per wire (prototype labels, aligned to course module ids).
const SOCKET = {
  control: "instruction layers · C1",
  context: "context budget · C2",
  loop: "turn limit · B2",
  errors: "retry policy · C6",
  tools: "tool registry · B1",
  permissions: "permission rules · C9",
  verify: "eval harness · D1",
  observe: "trace log · C12",
};
const PATH = [
  { letter: "S", name: "Start here", state: "done", icon: "prog-2", done: true },
  { letter: "A", name: "The model", state: "done", icon: "prog-2", done: true },
  {
    letter: "B",
    name: "From chatbot to agent",
    state: "in progress: B1 done, B2 now",
    icon: "prog-1",
    now: true,
  },
  { letter: "C–I", name: "The eight wires, then the rest", state: "ahead", icon: "prog-0" },
];

class HxProtoHome extends HTMLElement {
  constructor() {
    super();
    this.__test = { run: () => this.selfTest() };
  }

  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "1";
    this.render();
  }

  resolved() {
    return Boolean(readStore().guard?.par);
  }

  guardLimit() {
    return readStore().guard?.limit ?? null;
  }

  tile(wire) {
    const plugged = [...(PLUGGED[wire.id] ?? [])];
    const resolved = this.resolved();
    const guard = this.guardLimit();
    if (wire.id === "loop" && guard !== null) {
      plugged.push({ name: `turn limit ${guard} · guard`, from: "B2" });
    }
    const socket = wire.id === "loop" && guard !== null ? null : SOCKET[wire.id];
    const degraded = wire.id === "context";
    const healthy = wire.id === "loop" && resolved;
    const health = plugged.length ? `${plugged.length} installed` : "no modules yet";
    const modules = plugged
      .map(
        (m) =>
          `<p class="module">${glyph("check", { size: 14 })}<span>${esc(m.name)} · ${esc(m.from)}</span></p>`,
      )
      .join("");
    const badge = degraded
      ? `<span class="badge">${glyph("bang", { size: 14 })}2 cards due</span>`
      : healthy
        ? `<span class="badge ok">${glyph("check", { size: 14 })}healthy</span>`
        : "";
    const cls = ["tile", degraded ? "is-degraded" : "", healthy ? "is-healthy" : ""]
      .filter(Boolean)
      .join(" ");
    return `<li class="${cls}" style="--w:${wire.color}" data-wire="${wire.id}">
      <div class="tile-head">${glyph(wire.glyph, { size: 20 })}<span>${esc(wire.name)}</span></div>
      <p class="tile-health">${health}</p>
      ${badge}
      ${modules}
      ${socket ? `<p class="socket">${glyph("prog-0", { size: 14 })}<span>Empty socket: ${esc(socket)}</span></p>` : ""}
    </li>`;
  }

  pageCard() {
    if (this.resolved()) {
      return `<section class="page-card is-resolved" aria-labelledby="page-title">
          <p class="kicker">RESOLVED · turn-limit guard at ${this.guardLimit()} turns</p>
          <h2 id="page-title">Run b2-spiral can no longer run past the guard.</h2>
          <p class="detail">The guard is on the loop wire. Review the incident or open the canary.</p>
          <div class="actions"><a class="btn btn-quiet" href="break.html">Review the incident</a><a class="btn btn-quiet" href="prove.html">Open the canary</a></div>
        </section>`;
    }
    return `<section class="page-card is-alert" aria-labelledby="page-title">
          <p class="kicker">PAGE · ${esc(nowLabel())} · loop wire</p>
          <h2 id="page-title">Run b2-spiral has called tools 14 times and hasn’t stopped.</h2>
          <p class="detail">Incident: the “almost done” spiral. The agent keeps editing calc.py and running pytest, and nothing in the loop ends it.</p>
          <div class="actions"><a class="btn" href="break.html">Acknowledge</a><span class="small muted">Opens the incident trace</span></div>
        </section>`;
  }

  render() {
    const resolved = this.resolved();
    const path = PATH.map(
      (row) => `<li><button type="button" class="path-row${row.now ? " is-now" : ""}${row.done ? " is-done" : ""}" data-path="${esc(row.letter)}">
        ${glyph(row.icon, { size: 22 })}
        <span><span class="letter">${esc(row.letter)}</span> ${esc(row.name)}<span class="state">${esc(row.state)}</span></span>
      </button></li>`,
    ).join("");

    this.innerHTML = `
<section class="statusbar" aria-label="Shift status">
  <span>Shift <strong>${esc(nowLabel())}</strong></span>
  <span>On call: <strong>you</strong></span>
  <span class="status ${resolved ? "quiet" : "warn"}">${glyph(resolved ? "check" : "bang", { size: 14 })}${resolved ? "0 pages open" : "1 page open"}</span>
</section>
${this.pageCard()}
<div class="home-grid">
  <div class="home-main">
    <section class="panel" aria-labelledby="board-title">
      <div class="board-head">
        <h2 id="board-title">Harness board</h2>
        <div class="board-legend">
          <span>${glyph("check", { size: 14 })}installed</span>
          <span>${glyph("prog-0", { size: 14 })}empty socket</span>
          <span>${glyph("bang", { size: 14 })}needs attention</span>
        </div>
      </div>
      <ol class="tiles" aria-label="The eight wires, in turn order">
        ${WIRES.map((w) => this.tile(w)).join("")}
      </ol>
    </section>
    <section class="panel">
      <h3>Path</h3>
      <ul class="path-list">${path}</ul>
      <p class="path-note" data-path-note role="status"></p>
    </section>
  </div>
  <aside class="runbook" aria-label="Runbook">
    <section class="panel">
      <p class="kicker">Continue</p>
      <h3>B2 · The agent loop</h3>
      <p class="small muted" style="margin:6px 0 12px">Next: 1 Break. Read the trace, find the bad moment, pick the fix.</p>
      <a class="btn btn-quiet btn-small" href="break.html">Continue B2</a>
    </section>
    <section class="panel">
      <p class="kicker">On-call shift · about 10 min</p>
      <ul class="shift-plan" style="margin:8px 0 12px">
        <li>1 incident: the “almost done” spiral</li>
        <li>6 cards due</li>
        <li>1 say-it drill</li>
      </ul>
      <a class="btn btn-quiet btn-small" href="break.html">Start shift</a>
    </section>
  </aside>
</div>`;
    this.querySelectorAll("[data-path]").forEach((button) => {
      button.addEventListener("click", () => {
        this.querySelector("[data-path-note]").textContent =
          "Parts open in the course. This console shows where you are.";
      });
    });
  }

  async selfTest() {
    try {
      const tiles = this.querySelectorAll(".tile");
      if (tiles.length !== 8) return false;
      const primary = this.querySelector('a.btn[href="break.html"]');
      return Boolean(primary) && primary.textContent.trim().length > 0;
    } catch {
      return false;
    }
  }
}

customElements.define("hx-proto-home", HxProtoHome);
initChrome();
