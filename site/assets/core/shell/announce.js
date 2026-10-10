// One polite live region per page. A message replaces the last one; an empty message clears the region.
// Callers derive every message from the current state and send it again when the state changes (D-037).
export function announcer(doc = document) {
  let region = doc.getElementById("live-polite");
  if (!region) {
    region = doc.createElement("div");
    region.id = "live-polite";
    region.className = "sr-only";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    doc.body.append(region);
  }
  let last = "";
  return function announce(message) {
    if (!message) {
      region.textContent = "";
      last = "";
      return;
    }
    if (message === last) return;
    last = message;
    region.textContent = "";
    setTimeout(() => {
      region.textContent = message;
    }, 20);
  };
}
