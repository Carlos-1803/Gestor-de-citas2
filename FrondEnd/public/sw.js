// Replaced by scripts/build-offline.mjs after Vite creates the hashed bundles.
const BUILD = { version: "development", files: [], bytes: 0 };
const PREFIX = "kiin-ra-shell-";
const CACHE = PREFIX + BUILD.version;
const previousOfflinePrefix = "entrecortes-pwa-offline-";

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    if (!BUILD.files.length) throw new Error("Compila la aplicación antes de instalar el simulador offline.");
    const cache = await caches.open(CACHE);
    let completed = 0;
    const pending = [...BUILD.files];
    async function worker() {
      while (pending.length) {
        const url = pending.shift();
        const response = await fetch(new Request(url, { cache: "reload", credentials: "omit" }));
        if (!response.ok || response.redirected || (!["/index.html", "/pwa/sin-conexion.html"].includes(url) && /text\/html/.test(response.headers.get("content-type") || ""))) {
          throw new Error(`No se pudo preparar ${url}`);
        }
        await cache.put(url, response);
        completed++;
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        clients.forEach(client => client.postMessage({ type: "RA_CACHE_PROGRESS", completed, total: BUILD.files.length }));
      }
    }
    // Do not report ready or activate until every asset has been cached successfully.
    try { await Promise.all([worker(), worker()]); }
    catch (error) {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      clients.forEach(client => client.postMessage({ type: "RA_CACHE_ERROR", message: `${error.name}: ${error.message}` }));
      throw error;
    }
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => (name.startsWith(PREFIX) && name !== CACHE) || name.startsWith(previousOfflinePrefix)).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "RA_STATUS") event.waitUntil((async () => {
    const keys = await (await caches.open(CACHE)).keys();
    const cached = new Set(keys.map(key => new URL(key.url).pathname));
    const count = BUILD.files.filter(path => cached.has(path)).length;
    event.ports[0]?.postMessage({ ready: BUILD.files.length > 0 && count === BUILD.files.length,
      count, total: BUILD.files.length, bytes: BUILD.bytes, version: BUILD.version });
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  // Never cache API responses, private data, maps or photos uploaded by users.
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate" && (url.pathname === "/" || url.pathname === "/index.html")) {
    event.respondWith((async () => {
      const cached = await (await caches.open(CACHE)).match("/index.html");
      return cached || fetch(request);
    })());
  } else if (BUILD.files.includes(url.pathname)) {
    event.respondWith((async () => {
      const cached = await (await caches.open(CACHE)).match(url.pathname);
      return cached || fetch(request);
    })());
  }
});
