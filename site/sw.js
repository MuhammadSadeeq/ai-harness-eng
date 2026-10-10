// The service worker for the kata page (BP-1.6 §2). Cache-first for the vendored Pyodide and
// CodeMirror files only; every other request goes to the network untouched. The cache name carries
// a version: a new version drops the old cache when the worker activates.
const CACHE = "harnessed-vendor-v1";
const CACHED_PATHS = [/\/vendor\/pyodide\//, /\/vendor\/codemirror\//];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith("harnessed-vendor-") && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (!CACHED_PATHS.some((pattern) => pattern.test(url.pathname))) return;
  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.status === 200) await cache.put(request, response.clone());
  return response;
}
