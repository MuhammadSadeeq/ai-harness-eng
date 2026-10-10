// Footer actions: export, import and reset progress, and the one status line. Every message is derived from the
// store's state and replaced on each change.
import { formatDay } from "./pure.js";
import { UNAVAILABLE_NOTICE, UNREADABLE_NOTICE, NEWER_NOTICE, exportFilename } from "../store.js";

export function statusText(store) {
  if (!store.persistent) return UNAVAILABLE_NOTICE;
  if (store.blocked) return store.blockReason === "newer" ? NEWER_NOTICE : UNREADABLE_NOTICE;
  return "";
}

export function mountFooter(store, announce, doc = document) {
  const status = doc.querySelector("[data-store-status]");
  const paint = () => {
    const text = statusText(store);
    if (status) status.textContent = text;
    announce(text);
  };
  doc.querySelector("[data-export]")?.addEventListener("click", () => {
    const name = store.downloadExport();
    announce(`Progress exported as ${name ?? exportFilename(new Date())}.`);
  });
  doc.querySelector("[data-import]")?.addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const result = store.importJSON(await file.text());
    announce(result.ok ? "Progress imported." : result.error);
    ev.target.value = "";
  });
  doc.querySelector("[data-reset]")?.addEventListener("click", () => {
    if (!globalThis.confirm?.("Clear all progress? Your settings are kept.")) return;
    store.reset({ keepPrefs: true });
    announce("Progress cleared. Settings are kept.");
  });
  const oldest = doc.querySelector("[data-facts-oldest-iso]");
  if (oldest) {
    const text = doc.querySelector("[data-facts-oldest]");
    if (text) text.textContent = formatDay(oldest.dataset.factsOldestIso);
  }
  paint();
  store.subscribe(paint);
}
