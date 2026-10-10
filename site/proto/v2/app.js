// Shell for every v2 page: the menu sheet (phones), the stored theme and motion settings in the top bar and
// in the sheet. Each page loads its own entry module (entry-home.js, entry-break.js, entry-prove.js).
import { mountSettings } from "./prefs.js";

const menuButton = document.querySelector("[data-menu-btn]");
const sheet = document.querySelector("[data-menu-sheet]");
if (menuButton && sheet) {
  menuButton.addEventListener("click", () => {
    sheet.showModal();
    menuButton.setAttribute("aria-expanded", "true");
  });
  sheet.addEventListener("close", () => menuButton.setAttribute("aria-expanded", "false"));
  sheet.querySelector("[data-close]")?.addEventListener("click", () => sheet.close());
}

mountSettings(document.querySelector("[data-theme-slot]"), document.querySelector("[data-motion-slot]"));
mountSettings(document.querySelector("[data-theme-slot-sheet]"), document.querySelector("[data-motion-slot-sheet]"));
