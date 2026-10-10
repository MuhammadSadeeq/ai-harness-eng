// Shell for every v2 page: the stored theme and motion settings. Each page loads its own entry module
// (entry-home.js, entry-break.js, entry-prove.js), so a page only ships the code it runs.
import { mountSettings } from "./prefs.js";

mountSettings(document.querySelector("[data-theme-slot]"), document.querySelector("[data-motion-slot]"));
