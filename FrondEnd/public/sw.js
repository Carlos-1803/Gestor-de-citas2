const cachePrefix = "entrecortes-pwa-offline-";
const cacheName = cachePrefix + "v1";
const offlinePage = "/pwa/sin-conexion.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) =>
      cache.add(new Request(offlinePage, { cache: "reload", credentials: "omit" })),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(activateOfflinePage());
});

async function activateOfflinePage() {
  const names = await caches.keys();
  const previous = names.filter((name) => name.startsWith(cachePrefix) && name !== cacheName);
  await Promise.all(previous.map((name) => caches.delete(name)));
  await self.clients.claim();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.mode !== "navigate") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // React cambia de pantalla dentro del mismo documento.
  if (url.pathname !== "/" && url.pathname !== "/index.html") return;

  event.respondWith(loadHome(request));
});

async function loadHome(request) {
  try {
    return await fetch(request);
  } catch {
    const page = await caches.match(offlinePage, { cacheName });
    return page || new Response("EntreCortes está sin conexión. Vuelve a intentarlo al conectarte.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
