// The Interview Room's stations (BP-5.4 §3). A station is a <details name="station" data-station="..."> with a
// [data-station-slot]. It builds its one component the first time it opens, so a station the learner has not opened
// loads nothing. The loader cannot tell a closed details is hidden (a closed station reads as top 0), so the
// components are made here, on open, and then loaded.
import { loadComponents } from "./loader.js";
import { seedOf, unhuntedIncidents, loadShift } from "./shift.js";
import { todayIso } from "./chrome.js";

function element(tag, attrs = {}) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

function caption(text) {
  const para = document.createElement("p");
  para.className = "meta";
  para.textContent = text;
  return para;
}

function mountInto(slot, node) {
  slot.replaceChildren(node);
  loadComponents({ root: slot });
}

/** Builders run once, on the first open. Each receives the station's slot and the store. */
const BUILDERS = {
  say(slot) {
    mountInto(slot, element("hx-say", { src: "bank" }));
  },

  design(slot) {
    mountInto(slot, element("hx-design", { src: "I5" }));
  },

  // The picker lives in the station's own markup; a memory-ready kata is mounted on choice, never before.
  memory(slot, details) {
    const pick = details.querySelector("[data-memory-pick]");
    if (!pick) return;
    pick.addEventListener("change", () => {
      if (!pick.value) {
        slot.replaceChildren();
        return;
      }
      mountInto(slot, element("hx-kata", { kata: pick.value, mode: "memory" }));
    });
  },

  // An incident the learner has not hunted yet, from the built modules; the day's seed picks one of them.
  async trace(slot, _details, store) {
    const doc = await loadShift();
    const open = unhuntedIncidents(doc.incidents ?? [], store.state.evidence);
    if (open.length === 0) {
      slot.replaceChildren(caption("You have hunted every incident in the built modules. Come back when another module is built."));
      return;
    }
    const incident = open[seedOf(todayIso()) % open.length];
    mountInto(slot, element("hx-incident", { tape: incident.tape }));
    slot.prepend(caption(`From ${incident.module} · ${incident.title}. The clock starts when the incident loads.`));
  },
};

/**
 * Wires every station on the page: the first open of each builds its component. Returns the number of stations.
 */
export function mountStations(store, root = document) {
  const stations = [...root.querySelectorAll("details[data-station]")];
  for (const details of stations) {
    const build = BUILDERS[details.dataset.station];
    const slot = details.querySelector("[data-station-slot]");
    if (!build || !slot) continue;
    const fill = () => {
      if (!details.open || details.dataset.built === "true") return;
      details.dataset.built = "true";
      Promise.resolve(build(slot, details, store)).catch(() => {
        slot.replaceChildren(caption("This station could not load. Reload the page to try again."));
      });
    };
    details.addEventListener("toggle", fill);
    fill();
  }
  return stations.length;
}
