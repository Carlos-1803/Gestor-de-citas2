export const DEFAULT_MAP_CONFIG = Object.freeze({
  online: { id: "osm-standard-v1", urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    name: "OpenStreetMap", attribution: "© OpenStreetMap contributors", attributionUrl: "https://www.openstreetmap.org/copyright" },
  offline: null,
});

export function validateSource(source, offline = false, origin = "https://barberst.example") {
  if (!source || typeof source.id !== "string" || !/^[a-z0-9_-]{1,80}$/i.test(source.id)
    || typeof source.urlTemplate !== "string" || !["{z}", "{x}", "{y}"].every((part) => source.urlTemplate.includes(part))) {
    throw new Error("La fuente del mapa debe tener un identificador y una URL XYZ con {z}, {x} y {y}.");
  }
  const url = new URL(source.urlTemplate.replace(/\{[zxy]\}/g, "0"), origin);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new Error("La fuente de teselas debe usar HTTPS (HTTP solo se permite en localhost).");
  }
  if (url.username || url.password || (url.origin === origin && /^\/api(?:\/|$)/i.test(url.pathname))) {
    throw new Error("Usa una fuente pública de teselas, sin credenciales de usuario ni rutas privadas de API.");
  }
  if (offline && (source.offlineAllowed !== true || /(^|\.)openstreetmap\.org$/i.test(url.hostname))) {
    throw new Error("Esta fuente no permite descarga regional. El servidor público de OpenStreetMap no admite precarga offline.");
  }
  const attributionUrl = source.attributionUrl || "https://www.openstreetmap.org/copyright";
  if (new URL(attributionUrl).protocol !== "https:") throw new Error("La atribución debe utilizar HTTPS.");
  return { ...source, name: source.name || source.id, attribution: source.attribution || "© OpenStreetMap contributors", attributionUrl };
}

export function validateConfig(config, origin) {
  return { online: validateSource(config.online || DEFAULT_MAP_CONFIG.online, false, origin),
    offline: config.offline ? validateSource(config.offline, true, origin) : null };
}
export function sourceKey(source) {
  // A URL/provider change must not mix incompatible tile sets in IndexedDB.
  let hash = 2166136261;
  for (const character of source.urlTemplate) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return `${source.id}-${hash.toString(16)}`;
}
export function tileKey(source, { z, x, y }) { return `${sourceKey(source)}:${z}/${x}/${y}`; }
export function tileUrl(source, { z, x, y }, origin) {
  return new URL(source.urlTemplate.replace("{z}", z).replace("{x}", x).replace("{y}", y), origin).href;
}
