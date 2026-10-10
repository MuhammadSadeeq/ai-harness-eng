// Fact chips (AUTHORING §7, BP-2.1 §1). A claim marked data-fact gets a chip with the month its fact was verified and a
// link to its source. With the facts registry loaded, an unknown or unverified fact gets no chip and data-hx-error (the
// checker fails the page too). Without the registry (the design page), a page's own data-verified dates the chip.
import { factChipLabel } from "./pure.js";

export function mountFacts(facts = null, doc = document) {
  for (const el of doc.querySelectorAll("[data-fact]")) {
    if (el.querySelector(".fact-chip")) continue;
    const id = el.dataset.fact;
    if (facts) {
      const fact = facts[id];
      if (!fact || fact.status !== "verified" || typeof fact.verified_on !== "string") {
        el.setAttribute("data-hx-error", `fact ${id} is unknown or not verified`);
        continue;
      }
      el.append(chip(doc, factChipLabel(el.dataset.verified || fact.verified_on), fact.source));
      continue;
    }
    const verified = el.dataset.verified;
    if (!verified) continue;
    el.append(chip(doc, factChipLabel(verified), null));
  }
}

function chip(doc, label, source) {
  const node = doc.createElement(source ? "a" : "span");
  node.className = "fact-chip";
  node.textContent = label;
  if (source) {
    // the source opens beside the lesson, so the learner keeps their place
    node.setAttribute("href", source);
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
    let host = "";
    try { host = new URL(source).host; } catch { host = ""; }
    if (host) node.setAttribute("title", `Source: ${host}`);
    const hint = doc.createElement("span");
    hint.className = "sr-only";
    hint.textContent = host ? ` (source: ${host}, opens in a new tab)` : " (source, opens in a new tab)";
    node.append(hint);
  }
  return node;
}
