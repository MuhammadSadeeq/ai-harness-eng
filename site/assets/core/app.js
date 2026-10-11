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
import { mountTerms } from "./shell/terms.js";
import { mountFacts } from "./shell/facts.js";
import { mountModule } from "./shell/module.js";
import { mountStartMark } from "./shell/start-mark.js";
import { loadComponents } from "./shell/loader.js";
import { getFactsCore, getTerms } from "../components/lib/data.js";
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
mountFooter(store, announce);
if (document.querySelector("[data-continue-link]")) renderHome(store);
mountModule(store);
mountStartMark(store);
// Facts without a build-time date (module pages) read the registry; a page that carries its dates (the design page) does not.
// The data comes through lib/data.js, which fetches each file once per page (a component's facts and the shell's
// are the same request; a second download of facts.json is 77 KB on a page that has a 300 KB budget).
if (document.querySelector("[data-fact]:not([data-verified])")) {
  getFactsCore().then((facts) => mountFacts(facts)).catch(() => mountFacts(null));
} else {
  mountFacts(null);
}
// Terms are marked now and defined on the first open (the glossary loads then, once per page; see shell/terms.js).
if (document.querySelector("[data-term]")) mountTerms(getTerms);
// Components read the store and the announcer through hxContext(); evidence they report is written here.
setContext({ store, announce });
mountEvidence(store);
// The stations (Interview Room) and today's shift (oncall) build their components themselves, on open or on load.
// Each is imported only on its own page: on every other page it would be dead weight against the 300 KB budget.
if (document.querySelector("[data-station]")) {
  import("./shell/stations.js").then(({ mountStations }) => mountStations(store));
}
if (document.querySelector("[data-shift-page]")) {
  import("./shell/shift.js").then(({ mountShift }) => mountShift(store));
}
loadComponents();
