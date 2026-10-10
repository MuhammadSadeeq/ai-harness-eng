// HARNESSED shell (Phase 1). Every page loads this module. It opens the progress store once, applies the stored
// theme and motion, draws the top bar, the Menu sheet, the course map, the footer and (on the home page) the
// progress marks and Continue. It also wires term popovers and fact chips, and loads only the registered
// components a page uses. Nothing here reads course.json: the course map is the page's own static fallback.
import { createStore, browserStorage } from "./store.js";
import { announcer } from "./shell/announce.js";
import { applySettings, mountSettings } from "./shell/settings.js";
import { mountChrome } from "./shell/chrome.js";
import { mountFooter } from "./shell/footer.js";
import { renderHome } from "./shell/home.js";
import { mountClock } from "./shell/clock.js";
import { mountTerms } from "./shell/terms.js";
import { mountFacts } from "./shell/facts.js";
import { loadComponents } from "./shell/loader.js";
import { mountEvidence } from "./shell/evidence.js";
import { setContext } from "./context.js";

// Scripts are running: CSS shows the drawn parts of the page only from here on.
document.documentElement.classList.add("js");

const announce = announcer();
const store = createStore({ storage: browserStorage(), onNotice: (message) => announce(message) });
store.load();
applySettings(store.state.prefs);
mountSettings(store);
mountChrome(store);
mountClock();
mountFooter(store, announce);
if (document.querySelector("[data-continue-link]")) renderHome(store);
mountFacts();
if (document.querySelector("[data-term]")) {
  fetch(new URL("../../data/terms.json", import.meta.url))
    .then((response) => (response.ok ? response.json() : []))
    .then((terms) => mountTerms(terms))
    .catch(() => mountTerms([]));
}
// Components read the store and the announcer through hxContext(); evidence they report is written here.
setContext({ store, announce });
mountEvidence(store);
loadComponents();
