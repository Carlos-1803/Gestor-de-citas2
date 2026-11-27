import { validCoordinates } from "./mapRegion.js";

const ERROR_MESSAGES = {
  1: "PERMISSION_DENIED (1): Permiso de ubicación denegado en el navegador.",
  2: "POSITION_UNAVAILABLE (2): No se pudo determinar la ubicación actual.",
  3: "TIMEOUT (3): Tiempo de espera agotado.",
};

export function requestPreciseLocation({ geolocation = globalThis.navigator?.geolocation,
  signal, onFallback = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    if (!geolocation?.getCurrentPosition) {
      reject(new Error("Este navegador no ofrece geolocalización. Selecciona el local en el mapa."));
      return;
    }
    if (signal?.aborted) { reject(new DOMException("Búsqueda cancelada", "AbortError")); return; }
    let settled = false;
    const finish = (error, point) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(point);
    };
    const abort = () => finish(new DOMException("Búsqueda cancelada", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    const request = (highAccuracy) => {
      try {
        geolocation.getCurrentPosition((position) => {
          if (settled) return;
          const coords = position?.coords;
          if (!coords || !validCoordinates(coords.latitude, coords.longitude)) {
            finish(new Error(ERROR_MESSAGES[2]));
            return;
          }
          finish(null, { latitude: coords.latitude, longitude: coords.longitude,
            accuracy: Number.isFinite(coords.accuracy) && coords.accuracy >= 0 ? coords.accuracy : null,
            fallback: !highAccuracy });
        }, (error) => {
          if (settled) return;
          if (highAccuracy && error.code === 3) {
            onFallback();
            if (!settled) request(false);
          } else {
            const failure = new Error(ERROR_MESSAGES[error.code] || "No se pudo obtener la ubicación del dispositivo.");
            failure.code = error.code;
            finish(failure);
          }
        }, { enableHighAccuracy: highAccuracy, timeout: 10000, maximumAge: 0 });
      } catch (error) {
        finish(new Error("No se pudo iniciar la ubicación del dispositivo. Selecciona el local en el mapa.", { cause: error }));
      }
    };
    request(true);
  });
}
