// The component loader. The registry (site/assets/components/registry.js, director-owned) maps a tag to its
// module. Only registered tags that the page contains are loaded, and only when needed: a tag with an element that
// starts within 1.5 viewport heights of the page top loads at once; the others load when an element comes within
// 600 px of the viewport. Every other hx-* element, and each one still waiting, keeps its no-JS fallback until then.
import { filterRegistry, splitLoads } from "./pure.js";
import { REGISTRY } from "../../components/registry.js";

const LAZY_MARGIN = "600px 0px 600px 0px";

export function presentTags(root = document) {
  const tags = new Set();
  for (const el of root.querySelectorAll("*")) {
    if (el.localName.startsWith("hx-")) tags.add(el.localName);
  }
  return [...tags];
}

/**
 * Starts the registered components this page uses. Returns a promise for the tags of the components that load at
 * once; the rest load later, as their elements approach the viewport. A component that cannot load is left out.
 */
export function loadComponents({ root = document, registry = REGISTRY, importer = (url) => import(url), view = window } = {}) {
  const plan = filterRegistry(registry, presentTags(root));
  if (plan.length === 0) return Promise.resolve([]);
  const urlOf = new Map(plan.map(({ tag, url }) => [tag, url]));
  const elements = [];
  for (const tag of urlOf.keys()) {
    for (const el of root.querySelectorAll(tag)) {
      elements.push({ tag, el, top: el.getBoundingClientRect().top + (view.scrollY || 0) });
    }
  }
  const { eager, lazy } = splitLoads(elements, view.innerHeight || 900);
  const started = new Map();
  const load = (tag) => {
    if (!started.has(tag)) {
      const href = new URL(urlOf.get(tag), import.meta.url).href;
      started.set(tag, Promise.resolve().then(() => importer(href)).then(() => tag, () => null));
    }
    return started.get(tag);
  };
  if (lazy.length > 0) {
    const waiting = new Set(lazy);
    const later = elements.filter(({ tag }) => waiting.has(tag)).map(({ el }) => el);
    if (typeof view.IntersectionObserver !== "function") {
      for (const tag of lazy) load(tag);
    } else {
      const observer = new view.IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          load(entry.target.localName);
        }
      }, { rootMargin: LAZY_MARGIN });
      for (const el of later) observer.observe(el);
    }
  }
  return Promise.all(eager.map(load)).then((tags) => tags.filter(Boolean));
}
