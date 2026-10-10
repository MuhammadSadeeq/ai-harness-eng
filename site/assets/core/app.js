// HARNESSED shell, phase 0: preferences (theme, motion) and the clock pause control.
// Logs nothing and never throws when storage is unavailable (private windows, blocked data).

const KEY = "harnessed:v1";
const THEMES = ["light", "dark", "auto"];
const MOTIONS = ["full", "reduced", "auto"];
const DEFAULTS = { schema: 1, prefs: { theme: "auto", motion: "auto" } };

const state = { theme: "auto", motion: "auto" };

function readStored() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === "object" && data.prefs ? data.prefs : null;
  } catch {
    return null;
  }
}

function writeStored() {
  try {
    const doc = { schema: DEFAULTS.schema, prefs: { theme: state.theme, motion: state.motion } };
    window.localStorage.setItem(KEY, JSON.stringify(doc));
  } catch {
    // Storage is unavailable: the choice still applies for this page view.
  }
}

function apply() {
  const root = document.documentElement;
  if (state.theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", state.theme);
  if (state.motion === "auto") root.removeAttribute("data-motion");
  else root.setAttribute("data-motion", state.motion);
  markPressed();
}

function markPressed() {
  for (const button of document.querySelectorAll("[data-set-theme]")) {
    const on = button.getAttribute("data-set-theme") === state.theme;
    button.setAttribute("aria-pressed", on ? "true" : "false");
  }
  for (const button of document.querySelectorAll("[data-set-motion]")) {
    const on = button.getAttribute("data-set-motion") === state.motion;
    button.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

/** Save and apply one preference. name is "theme" or "motion". */
export function setPref(name, value) {
  if (name === "theme" && THEMES.includes(value)) state.theme = value;
  else if (name === "motion" && MOTIONS.includes(value)) state.motion = value;
  else return;
  writeStored();
  apply();
}

function init() {
  const stored = readStored();
  if (stored) {
    if (THEMES.includes(stored.theme)) state.theme = stored.theme;
    if (MOTIONS.includes(stored.motion)) state.motion = stored.motion;
  }
  apply();

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const theme = target.closest("[data-set-theme]");
    if (theme) {
      setPref("theme", theme.getAttribute("data-set-theme"));
      return;
    }
    const motion = target.closest("[data-set-motion]");
    if (motion) {
      setPref("motion", motion.getAttribute("data-set-motion"));
      return;
    }
    const pause = target.closest("[data-toggle-pause]");
    if (pause) {
      const clock = pause.closest(".clock");
      if (!clock) return;
      const paused = clock.classList.toggle("is-paused");
      pause.setAttribute("aria-pressed", paused ? "true" : "false");
      pause.textContent = paused ? "Play pulse" : "Pause pulse";
    }
  });
}

init();
