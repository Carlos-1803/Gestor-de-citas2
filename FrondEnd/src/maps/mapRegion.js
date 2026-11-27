export const CAMPECHE = Object.freeze({ minLat: 17.80, maxLat: 20.85, minLon: -92.47, maxLon: -89.12 });
export const CAMPECHE_BOUNDS = [[CAMPECHE.minLat, CAMPECHE.minLon], [CAMPECHE.maxLat, CAMPECHE.maxLon]];
export const CANDELARIA = Object.freeze({ latitude: 18.1869, longitude: -91.0422 });
export const MIN_ZOOM = 8;
export const MAX_NATIVE_ZOOM = 15;
export const ESTIMATED_TILE_BYTES = 25 * 1024;

export function validCoordinates(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}
export function inCampeche(latitude, longitude) {
  return validCoordinates(latitude, longitude) && latitude >= CAMPECHE.minLat && latitude <= CAMPECHE.maxLat
    && longitude >= CAMPECHE.minLon && longitude <= CAMPECHE.maxLon;
}
export function intersectCampeche(bounds) {
  const area = {
    minLat: Math.max(bounds.minLat, CAMPECHE.minLat), maxLat: Math.min(bounds.maxLat, CAMPECHE.maxLat),
    minLon: Math.max(bounds.minLon, CAMPECHE.minLon), maxLon: Math.min(bounds.maxLon, CAMPECHE.maxLon),
  };
  return area.minLat <= area.maxLat && area.minLon <= area.maxLon ? area : null;
}
export function tileRange(bounds, z) {
  const n = 2 ** z;
  const x = (lon) => Math.max(0, Math.min(n - 1, Math.floor((lon + 180) / 360 * n)));
  const y = (lat) => Math.max(0, Math.min(n - 1, Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n)));
  return { minX: x(bounds.minLon), maxX: x(bounds.maxLon), minY: y(bounds.maxLat), maxY: y(bounds.minLat) };
}
export function countTiles(bounds, maxZoom, withStateBase = false) {
  let count = 0;
  for (let z = MIN_ZOOM; z <= maxZoom; z++) {
    const range = tileRange(withStateBase && z === MIN_ZOOM ? CAMPECHE : bounds, z);
    count += (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1);
  }
  return count;
}
export function* enumerateTiles(bounds, maxZoom, withStateBase = false) {
  for (let z = MIN_ZOOM; z <= maxZoom; z++) {
    const range = tileRange(withStateBase && z === MIN_ZOOM ? CAMPECHE : bounds, z);
    for (let x = range.minX; x <= range.maxX; x++) {
      for (let y = range.minY; y <= range.maxY; y++) yield { z, x, y };
    }
  }
}
export function ancestorCrop({ z, x, y }, parentZoom, tileSize = 256) {
  const scale = 2 ** (z - parentZoom);
  return { x: Math.floor(x / scale), y: Math.floor(y / scale), z: parentZoom,
    sx: (x % scale) * tileSize / scale, sy: (y % scale) * tileSize / scale, size: tileSize / scale };
}
export function formatBytes(bytes) {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GiB` : `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}
