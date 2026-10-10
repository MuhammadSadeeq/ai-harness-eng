// Home: the Turn Clock board is the hero (the Harness Board), Continue is the one primary action, the
// on-call card follows the theme (day: today's shift; night: the page), and path progress is compact.
import { PARTS, PROGRESS, PLUGGED, SOCKETS } from "./data.js";
import { drawClock, legendList, wireStates } from "./clock.js";
import { el, glyph, svgEl } from "./common.js";
import { resolvedTheme } from "./prefs.js";

const BREAK_HREF = "break.html";

function partSummary(part) {
  const done = part.modules.filter((m) => PROGRESS.done.includes(m.id)).length;
  const now = part.modules.some((m) => m.id === PROGRESS.current);
  const status = done === part.modules.length ? "done" : now ? "in progress" : done ? "started" : "ahead";
  return { done, total: part.modules.length, status, now };
}

// UI marks are drawn shapes (DESIGN §4), each paired with its word in the row.
function progMark(status) {
  const svg = svgEl("svg", { class: `path-mark is-${status.replace(" ", "-")}`, viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" });
  if (status === "done") {
    svg.append(svgEl("circle", { cx: 12, cy: 12, r: 9 }), svgEl("path", { d: "M8 12.5l2.6 2.6L16 9.5" }));
  } else if (status === "in progress" || status === "started") {
    svg.append(svgEl("circle", { cx: 12, cy: 12, r: 9 }), svgEl("path", { d: "M12 3a9 9 0 0 1 0 18z", class: "half" }));
  } else {
    svg.append(svgEl("circle", { cx: 12, cy: 12, r: 9 }));
  }
  return svg;
}

export class HomeElement extends HTMLElement {
  connectedCallback() {
    if (this.built) return;
    this.built = true;
    this.boardHost = this.querySelector("[data-board]");
    this.legendHost = this.querySelector("[data-legend]");
    this.legendHost?.replaceChildren(legendList(wireStates()));
    this.oncallHost = this.querySelector("[data-oncall]");
    this.progressHost = this.querySelector("[data-progress]");
    this.lastWidth = 0;
    this.paged = false;
    this.renderBoard();
    this.renderOnCall();
    this.renderProgress();
    this.resizer = new ResizeObserver(() => this.renderBoard());
    this.resizer.observe(this.boardHost);
    this.themeListener = () => this.renderOnCall();
    document.addEventListener("hx:theme", this.themeListener);
    this.__test = { run: () => this.selfTest() };
  }

  disconnectedCallback() {
    this.resizer?.disconnect();
    document.removeEventListener("hx:theme", this.themeListener);
  }

  // The board is drawn at the measured width, so its text keeps real sizes at 375 px and 1280 px.
  renderBoard() {
    const width = Math.floor(this.boardHost.getBoundingClientRect().width);
    if (width < 300 || width === this.lastWidth) return;
    this.lastWidth = width;
    this.boardHost.replaceChildren(drawClock(width, { states: wireStates() }));
  }

  renderOnCall() {
    if (resolvedTheme() === "night") {
      const started = this.paged;
      this.oncallHost.replaceChildren(
        el("p", { class: "kicker", text: "PAGE · night shift" }),
        el("h2", { text: "Run b2-spiral has called tools 14 times and hasn't stopped." }),
        el("p", { class: "lede", text: "Nothing in the loop will end it. Take the page, then open the incident and find the first event that went wrong." }),
        started
          ? el("p", { class: "card-note", "data-state": "paged", text: "You have the page. Open the incident to start." })
          : el("button", { class: "btn btn-primary", type: "button", "aria-pressed": "false", text: "Take the page", onclick: () => { this.paged = true; this.renderOnCall(); } }),
        started ? el("a", { class: "btn btn-primary", href: BREAK_HREF, text: "Open the incident" }) : null);
    } else {
      this.oncallHost.replaceChildren(
        el("p", { class: "kicker", text: "Today's shift · about 10 min" }),
        el("h2", { text: "Today's shift" }),
        el("ul", { class: "shift-list" },
          el("li", { text: "1 incident: the “almost done” spiral" }),
          el("li", { text: "6 cards due" }),
          el("li", { text: "1 say-it drill" })),
        el("a", { class: "btn", href: BREAK_HREF, text: "Start shift" }));
    }
  }

  renderProgress() {
    const rows = PARTS.map((part) => {
      const s = partSummary(part);
      const label = s.status === "done" ? "done" : s.status === "in progress" ? "in progress" : s.status === "started" ? "started" : "ahead";
      return el("li", { class: `path-row ${s.now ? "is-now" : ""}` },
        progMark(s.status),
        el("span", { class: "path-name", text: `Part ${part.id} · ${part.title}` }),
        el("span", { class: "path-count", text: `${s.done} of ${s.total} · ${label}${s.now ? " · B2 now" : ""}` }));
    });
    this.progressHost.replaceChildren(el("ol", { class: "path" }, rows));
  }

  selfTest() {
    // Eight wires draw on the board, the primary action goes to the break page, and the plugged modules show.
    const spokes = this.boardHost.querySelectorAll(".spoke-group").length;
    const tags = this.boardHost.querySelectorAll("[data-tag]").length;
    const primary = this.querySelector('a[href="break.html"]');
    return spokes === 8 && tags === Object.keys(PLUGGED).length && Boolean(primary) && Boolean(SOCKETS.loop);
  }
}
