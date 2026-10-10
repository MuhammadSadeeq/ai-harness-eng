// Patch Bay (D1) shell: motion and clicks preferences, header toggles, the live region.
// Preferences default to the system's reduced-motion setting. Storage failures are ignored.

const KEY = "proto-d1:v1";
const query = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
const prefs = { reduced: query ? query.matches : false, clicks: false };

function load() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && typeof data.reduced === "boolean") prefs.reduced = data.reduced;
    if (data && typeof data.clicks === "boolean") prefs.clicks = data.clicks;
  } catch {
    // Storage is blocked or unavailable: keep the defaults.
  }
}

function save() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ reduced: prefs.reduced, clicks: prefs.clicks }));
  } catch {
    // Not persisted; the choice still applies for this page view.
  }
}

function paint() {
  document.documentElement.setAttribute("data-motion", prefs.reduced ? "reduced" : "full");
  for (const button of document.querySelectorAll('[data-toggle="motion"]')) {
    button.setAttribute("aria-pressed", prefs.reduced ? "true" : "false");
  }
  for (const button of document.querySelectorAll('[data-toggle="clicks"]')) {
    button.setAttribute("aria-pressed", prefs.clicks ? "true" : "false");
  }
}

export function reducedMotion() {
  return prefs.reduced;
}

export function clicksOn() {
  return prefs.clicks;
}

export function setReduced(value) {
  prefs.reduced = Boolean(value);
  save();
  paint();
  document.dispatchEvent(new CustomEvent("proto:motion", { detail: { reduced: prefs.reduced } }));
}

export function setClicks(value) {
  prefs.clicks = Boolean(value);
  save();
  paint();
}

let audio = null;
// Optional click sound (off by default), generated in code. kind: "key" or "detent".
export function click(kind = "key") {
  if (!prefs.clicks) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const now = audio.currentTime;
    osc.type = "square";
    osc.frequency.value = kind === "detent" ? 1900 : 1100;
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + 0.025);
  } catch {
    // No audio available: the click is silently skipped.
  }
}

// Polite announcement. Callers throttle (at most one per turn or per result).
export function announce(message) {
  const region = document.getElementById("live");
  if (!region) return;
  region.textContent = "";
  window.setTimeout(() => {
    region.textContent = message;
  }, 20);
}

function wire() {
  for (const button of document.querySelectorAll('[data-toggle="motion"]')) {
    button.addEventListener("click", () => setReduced(!prefs.reduced));
  }
  for (const button of document.querySelectorAll('[data-toggle="clicks"]')) {
    button.addEventListener("click", () => {
      setClicks(!prefs.clicks);
      if (prefs.clicks) click("detent");
    });
  }
}

load();
paint();
wire();
