// Theme (day, night, auto) and motion (reduced, full, system) from the store's prefs. Every control on the page
// (top bar, menu sheet, footer) is drawn from the one stored choice and follows it.
import { THEMES } from "../store.js";

const THEME_LABEL = { day: "Day", night: "Night", auto: "Auto" };

/** The data-theme value for a choice: day forces light, night forces dark, auto follows the system. */
export function themeAttribute(choice) {
  if (choice === "day") return "light";
  if (choice === "night") return "dark";
  return null;
}

export function resolvedTheme(choice = "auto", systemDark = matchMedia("(prefers-color-scheme: dark)").matches) {
  if (choice === "day") return "day";
  if (choice === "night") return "night";
  return systemDark ? "night" : "day";
}

export function motionReduced(motion, systemReduced = matchMedia("(prefers-reduced-motion: reduce)").matches) {
  if (motion === "reduced") return true;
  if (motion === "full") return false;
  return systemReduced;
}

export function applySettings(prefs) {
  const root = document.documentElement;
  const forced = themeAttribute(prefs.theme);
  if (forced) root.dataset.theme = forced;
  else delete root.dataset.theme;
  if (prefs.motion === "reduced" || prefs.motion === "full") root.dataset.motion = prefs.motion;
  else delete root.dataset.motion;
  document.dispatchEvent(new CustomEvent("hx:theme", { detail: { choice: prefs.theme, theme: resolvedTheme(prefs.theme) } }));
  document.dispatchEvent(new CustomEvent("hx:motion", { detail: { reduced: motionReduced(prefs.motion) } }));
}

/** Draws the theme and motion controls into every slot on the page, and keeps them in step with the store. */
export function mountSettings(store) {
  const themeSlots = [...document.querySelectorAll("[data-theme-slot]")];
  const motionSlots = [...document.querySelectorAll("[data-motion-slot]")];

  const paint = () => {
    const prefs = store.state.prefs;
    const reduced = motionReduced(prefs.motion);
    for (const group of document.querySelectorAll("[data-theme-group]")) {
      for (const button of group.querySelectorAll("button[data-theme]")) {
        button.setAttribute("aria-pressed", String(button.dataset.theme === prefs.theme));
      }
    }
    for (const toggle of document.querySelectorAll("[data-motion-toggle]")) {
      toggle.setAttribute("aria-pressed", String(reduced));
      toggle.textContent = reduced ? "Reduce motion: on" : "Reduce motion: off";
    }
  };

  for (const slot of themeSlots) {
    const group = document.createElement("div");
    group.className = "seg";
    group.dataset.themeGroup = "";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Theme");
    for (const name of THEMES) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.theme = name;
      button.textContent = THEME_LABEL[name];
      button.addEventListener("click", () => {
        store.update((draft) => { draft.prefs.theme = name; });
        applySettings(store.state.prefs);
      });
      group.append(button);
    }
    slot.replaceChildren(group);
  }

  for (const slot of motionSlots) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "toggle-btn";
    toggle.dataset.motionToggle = "";
    toggle.addEventListener("click", () => {
      const next = motionReduced(store.state.prefs.motion) ? "full" : "reduced";
      store.update((draft) => { draft.prefs.motion = next; });
      applySettings(store.state.prefs);
    });
    slot.replaceChildren(toggle);
  }

  paint();
  store.subscribe(() => {
    applySettings(store.state.prefs);
    paint();
  });
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", paint);
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => applySettings(store.state.prefs));
}
