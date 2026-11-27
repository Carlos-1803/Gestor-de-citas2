import localforage from "localforage";
import { DEFAULT_MAP_CONFIG, sourceKey, tileKey, tileUrl, validateConfig, validateSource } from "./mapConfig.js";
import { CAMPECHE, countTiles, enumerateTiles, ESTIMATED_TILE_BYTES } from "./mapRegion.js";

const tiles = localforage.createInstance({ name: "barberst-maps", storeName: "tiles", driver: localforage.INDEXEDDB });
const metadata = localforage.createInstance({ name: "barberst-maps", storeName: "metadata", driver: localforage.INDEXEDDB });
const WEEK = 7 * 24 * 60 * 60 * 1000;
let configuration;
let downloading = false;
const origin = () => globalThis.location?.origin || "http://localhost";

export async function loadMapConfig() {
  if (!configuration) configuration = (async () => {
    try {
      const response = await fetch("/maps/config.json", { signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error("No se pudo consultar la configuración de mapas.");
      const config = validateConfig(await response.json(), origin());
      await metadata.setItem("config", config).catch(() => {});
      return { ...config, error: "" };
    } catch (error) {
      const saved = await metadata.getItem("config").catch(() => null);
      if (saved) {
        try { return { ...validateConfig(saved, origin()), error: "Se utiliza la configuración de mapas guardada en este dispositivo." }; }
        catch { /* Ignore an obsolete or invalid saved provider configuration. */ }
      }
      return { ...DEFAULT_MAP_CONFIG, error: error.message };
    }
  })();
  return configuration;
}

export async function getStoredTile(source, coords) {
  if (!source) return null;
  return tiles.getItem(tileKey(source, coords)).catch(() => null);
}
export async function storeTile(source, coords, blob, { pinned = false, maxAge = WEEK } = {}) {
  const now = Date.now();
  const record = { ...coords, sourceId: sourceKey(source), blob, pinned, storedAt: now, retainUntil: now + WEEK,
    expiresAt: pinned ? Number.MAX_SAFE_INTEGER : now + Math.max(0, maxAge) };
  await tiles.setItem(tileKey(source, coords), record);
  return record;
}
export async function fetchTile(source, coords, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 8000);
  try {
    const response = await fetch(tileUrl(source, coords, origin()), {
      signal: controller.signal, credentials: "omit", referrerPolicy: "strict-origin-when-cross-origin",
    });
    if (!response.ok) throw new Error(`No se pudo descargar la tesela (${response.status}). Comprueba la URL y CORS del proveedor.`);
    const type = response.headers.get("content-type")?.split(";")[0];
    if (!["image/png", "image/jpeg", "image/webp"].includes(type)) throw new Error("La fuente no devolvió una tesela PNG, JPEG o WebP.");
    const blob = await response.blob();
    if (!blob.size || blob.size > 4 * 1024 ** 2) throw new Error("La tesela supera el tamaño permitido o está vacía.");
    const cacheControl = response.headers.get("cache-control") || "";
    const age = /max-age=(\d+)/i.exec(cacheControl);
    const expires = Date.parse(response.headers.get("expires") || "");
    const maxAge = age ? Number(age[1]) * 1000 : Number.isFinite(expires) ? Math.max(0, expires - Date.now()) : WEEK;
    return { blob, maxAge, cacheable: !/no-store|no-cache|private/i.test(cacheControl) };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export async function mapStats() {
  let count = 0, bytes = 0;
  await tiles.iterate((record) => { count++; bytes += record.blob?.size || 0; });
  return { count, bytes, lastPack: await metadata.getItem("lastPack") };
}
export async function clearMapTiles() {
  const clear = async () => {
    if (downloading) throw new Error("Cancela la descarga antes de borrar los mapas.");
    await tiles.clear();
    await metadata.removeItem("lastPack");
  };
  if (navigator.locks?.request) return navigator.locks.request("barberst-map-download", { ifAvailable: true }, (lock) => {
    if (!lock) throw new Error("Hay una descarga de mapas en otra ventana. Cancélala antes de borrar.");
    return clear();
  });
  return clear();
}

export async function downloadMapPack(options) {
  const execute = async () => {
    if (downloading) throw new Error("Ya hay una descarga de mapas en curso.");
    downloading = true;
    try { return await runDownload(options); }
    finally { downloading = false; }
  };
  if (navigator.locks?.request) return navigator.locks.request("barberst-map-download", { ifAvailable: true }, (lock) => {
    if (!lock) throw new Error("Ya hay una descarga de mapas en otra ventana.");
    return execute();
  });
  return execute();
}

async function runDownload({ source, bounds, maxZoom, stateBase = false, maxBytes,
  signal, progress = () => {} }) {
  validateSource(source, true, origin()); // Never bulk-fetch the OSM public tile service.
  if (!Number.isInteger(maxZoom) || maxZoom < 8 || maxZoom > 15 || !bounds
    || bounds.minLat < CAMPECHE.minLat || bounds.maxLat > CAMPECHE.maxLat
    || bounds.minLon < CAMPECHE.minLon || bounds.maxLon > CAMPECHE.maxLon
    || bounds.minLat > bounds.maxLat || bounds.minLon > bounds.maxLon) {
    throw new Error("Elige una cobertura válida de Campeche entre zoom 8 y 15.");
  }
  if (!Number.isFinite(maxBytes) || maxBytes <= 0 || maxBytes > 4 * 1024 ** 3) throw new Error("El límite de almacenamiento no es válido.");
  await tiles.ready();
  const total = countTiles(bounds, maxZoom, stateBase);
  if (!total || total > 150000) throw new Error("El área elegida supera el límite de teselas de Campeche.");
  const estimate = await navigator.storage?.estimate?.();
  const allowedBytes = estimate?.quota ? Math.min(maxBytes, Math.max(0, estimate.quota - (estimate.usage || 0))) : maxBytes;
  const storedKeys = new Set(await tiles.keys());
  let missing = 0;
  for (const coords of enumerateTiles(bounds, maxZoom, stateBase)) if (!storedKeys.has(tileKey(source, coords))) missing++;
  if (missing * ESTIMATED_TILE_BYTES > allowedBytes) throw new Error("La estimación supera tu límite o el espacio disponible. Reduce el detalle o aumenta el presupuesto de almacenamiento.");

  const iterator = enumerateTiles(bounds, maxZoom, stateBase);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  let completed = 0, downloaded = 0, reused = 0, bytes = 0, failure = null, lastUpdate = 0;
  const report = (force = false) => {
    if (force || Date.now() - lastUpdate > 150) {
      lastUpdate = Date.now();
      progress({ completed, total, downloaded, reused, bytes });
    }
  };
  async function worker() {
    while (!controller.signal.aborted) {
      const next = iterator.next();
      if (next.done) return;
      const coords = next.value;
      try {
        const stored = await getStoredTile(source, coords);
        if (stored) {
          if (!stored.pinned) await storeTile(source, coords, stored.blob, { pinned: true });
          reused++;
        }
        else {
          const tile = await fetchTile(source, coords, controller.signal);
          if (!tile.cacheable) throw new Error("El proveedor prohíbe almacenar esta tesela mediante sus encabezados HTTP.");
          // Reserve bytes before awaiting IDB, so both workers share a strict budget.
          if (bytes + tile.blob.size > allowedBytes) throw new Error("Se alcanzó el límite de almacenamiento de esta descarga.");
          bytes += tile.blob.size;
          await storeTile(source, coords, tile.blob, { pinned: true });
          downloaded++;
        }
        completed++;
        report();
      } catch (error) {
        if (!signal?.aborted && !failure) failure = error;
        controller.abort();
      }
    }
  }
  try {
    if (navigator.storage?.persist) await navigator.storage.persist().catch(() => false);
    report(true);
    await Promise.all([worker(), worker()]); // Two requests at a time; no automatic prefetch.
    if (failure) throw failure;
    if (controller.signal.aborted) throw new DOMException("Descarga cancelada; las teselas completadas se conservan.", "AbortError");
    return { completed, total, downloaded, reused, bytes };
  } finally {
    report(true);
    await metadata.setItem("lastPack", { source: source.name || source.id, bounds, maxZoom,
      completed, total, downloaded, reused, bytes, finishedAt: new Date().toISOString(), complete: completed === total }).catch(() => {});
    signal?.removeEventListener("abort", abort);
  }
}
