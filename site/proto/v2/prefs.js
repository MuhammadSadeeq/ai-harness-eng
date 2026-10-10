// Stored learner settings (theme and motion). Every storage access is guarded: private windows and
// blocked storage fall back to the system settings and the toggles still work for the page view.
const KEY = "harnessed.v2.prefs";
const THEMES = ["day", "night", "auto"];

export function readPrefs() {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export function writePrefs(patch) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readPrefs(), ...patch }));
  } catch {
    // Storage is blocked: the choice applies to this page view only.
  }
}

/** "day" | "night" from the data-theme attribute, or from the system when the learner chose auto. */
export function resolvedTheme() {
  const forced = document.documentElement.dataset.theme;
  if (forced === "dark") return "night";
  if (forced === "light") return "day";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day";
}

export function applyTheme(choice) {
  const root = document.documentElement;
  if (choice === "day") root.dataset.theme = "light";
  else if (choice === "night") root.dataset.theme = "dark";
  else delete root.dataset.theme;
  document.dispatchEvent(new CustomEvent("hx:theme", { detail: { theme: resolvedTheme(), choice } }));
}

/** choice: "reduced" | "full" | null (follow the system). */
export function applyMotion(choice) {
  const root = document.documentElement;
  if (choice === "reduced" || choice === "full") root.dataset.motion = choice;
  else delete root.dataset.motion;
  document.dispatchEvent(new CustomEvent("hx:motion", { detail: { reduced: motionIsReduced() } }));
}

export function motionIsReduced() {
  const choice = readPrefs().motion;
  if (choice === "reduced") return true;
  if (choice === "full") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Wires the theme and motion controls in the top bar. Choices are stored and applied at once. */
export function mountSettings(themeSlot, motionSlot) {
  const prefs = readPrefs();
  const themeChoice = THEMES.includes(prefs.theme) ? prefs.theme : "auto";
  applyTheme(themeChoice);
  applyMotion(prefs.motion === "reduced" || prefs.motion === "full" ? prefs.motion : null);

  if (themeSlot) {
    const buttons = THEMES.map((name) => {
      const label = name === "day" ? "Day" : name === "night" ? "Night" : "Auto";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "seg-btn";
      button.dataset.theme = name;
      button.textContent = label;
      button.setAttribute("aria-pressed", String(name === themeChoice));
      button.addEventListener("click", () => {
        writePrefs({ theme: name });
        applyTheme(name);
        buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.theme === name)));
      });
      return button;
    });
    const group = document.createElement("div");
    group.className = "seg";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Theme");
    group.append(...buttons);
    themeSlot.replaceChildren(group);
  }

  if (motionSlot) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toggle-btn";
    const paint = () => {
      const reduced = motionIsReduced();
      button.setAttribute("aria-pressed", String(reduced));
      button.textContent = reduced ? "Reduce motion: on" : "Reduce motion: off";
    };
    button.addEventListener("click", () => {
      const next = motionIsReduced() ? "full" : "reduced";
      writePrefs({ motion: next });
      applyMotion(next);
      paint();
    });
    window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", paint);
    document.addEventListener("hx:motion", paint);
    motionSlot.replaceChildren(button);
    paint();
  }

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!document.documentElement.dataset.theme) applyTheme("auto");
  });
}
