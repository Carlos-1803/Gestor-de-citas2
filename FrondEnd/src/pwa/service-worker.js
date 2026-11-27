// Vite incorpora la lista de archivos del build y actualiza el nombre de la caché.
const assets = ["__BUILD_ASSETS__"];
const cacheName = "entrecortes-shell-__BUILD_ID__";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(
    assets.map(path => new Request(path, { cache: "reload", credentials: "omit" }))
  )).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key =>
      (key.startsWith("entrecortes-shell-") && key !== cacheName) || key === "entrecortes-pwa-offline-v1"
    ).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (/^\/uploads\/[a-f\d-]+\.(?:jpe?g|png|webp)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const images = await caches.open("entrecortes-fotos-publicas");
      const cached = await images.match(req);
      if (cached) return cached;
      const response = await fetch(req);
      if (response.ok && response.headers.get("Content-Type")?.startsWith("image/")) {
        try {
          await images.put(req,response.clone());
        } catch { /* La foto en línea sigue disponible si el dispositivo se quedó sin espacio. */ }
      }
      return response;
    })());
    return;
  }
  const home = req.mode === "navigate" && ["/", "/index.html"].includes(url.pathname);
  if (home) {
    event.respondWith((async () => {
      const cache = await caches.open(cacheName);
      const script = "__ENTRY_JS__";
      try {
        const response = await fetch(req,{cache:"no-store",signal:AbortSignal.timeout(2500)});
        if (response.ok && response.headers.get("Content-Type")?.includes("text/html") &&
            (await response.clone().text()).includes(script)) {
          await cache.put("/index.html",response.clone());
          return response;
        }
      } catch { /* El documento y sus archivos ya están guardados. */ }
      return await cache.match("/index.html") || Response.error();
    })());
    return;
  }
  if (!assets.includes(url.pathname)) return;
  event.respondWith(caches.open(cacheName).then(async cache =>
    (await cache.match(url.pathname)) || fetch(req)
  ));
});
