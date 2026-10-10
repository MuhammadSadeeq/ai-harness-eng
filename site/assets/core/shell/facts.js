// Fact chips (AUTHORING §7). A claim marked data-fact gets a chip with the month its fact was last verified.
// The date comes from data-verified on the page (a build-time copy of the registry) or, when absent, from the
// facts registry. A fact that is not verified gets no chip, and the page must not state its claim.
import { factChipLabel } from "./pure.js";

export function mountFacts(facts = null, doc = document) {
  for (const el of doc.querySelectorAll("[data-fact]")) {
    const verified = el.dataset.verified || facts?.[el.dataset.fact]?.verified_on;
    if (!verified || el.querySelector(".fact-chip")) continue;
    const chip = doc.createElement("span");
    chip.className = "fact-chip";
    chip.textContent = factChipLabel(verified);
    el.append(chip);
  }
}
