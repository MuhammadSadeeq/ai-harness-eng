// The component loader. The registry (site/assets/components/registry.js, director-owned) maps a tag to its
// module. Only registered tags that the page contains are loaded. Every other hx-* element stays as its no-JS
// fallback, without an error.
import { filterRegistry } from "./pure.js";
import { REGISTRY } from "../../components/registry.js";

export function presentTags(root = document) {
  const tags = new Set();
  for (const el of root.querySelectorAll("*")) {
    if (el.localName.startsWith("hx-")) tags.add(el.localName);
  }
  return [...tags];
}

/** Imports the registered components this page uses. Returns the tags that loaded. */
export async function loadComponents({ root = document, registry = REGISTRY, importer = (url) => import(url) } = {}) {
  const plan = filterRegistry(registry, presentTags(root));
  const loaded = [];
  for (const { tag, url } of plan) {
    try {
      await importer(new URL(url, import.meta.url).href);
      loaded.push(tag);
    } catch {
      // A component that cannot load leaves its fallback in place.
    }
  }
  return loaded;
}
