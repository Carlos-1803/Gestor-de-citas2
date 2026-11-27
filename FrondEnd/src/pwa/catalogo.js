import { api } from "../api.js";
import { serverOnline } from "./red.js";

const cacheName = "entrecortes-publico-v1";

// Estos GET se hacen como visitante, incluso si el administrador tiene una sesión abierta.
export async function readPublic(path, {requireStorage = false} = {}) {
  if (!/^\/(?:haircuts|shops(?:\/\d+)?|offerings\/\d+\/slots\?date=\d{4}-\d{2}-\d{2})$/.test(path)) {
    throw Error("Ruta fuera del catálogo público.");
  }
  const url = "/api" + path;
  async function fromCache() {
    return globalThis.caches && caches.match(url, {cacheName});
  }
  if (!serverOnline()) {
    const saved = await fromCache();
    if (saved) return saved.json();
  }
  let data;
  try {
    data = await api(path, {credentials: "omit"});
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    const saved = await fromCache();
    if (saved) return saved.json();
    throw Error("Este dato todavía no está guardado en el dispositivo.", {cause: error});
  }
  try {
    const cache = await caches.open(cacheName);
    await cache.put(url, Response.json(data));
  } catch (error) {
    if (requireStorage) throw Error("No se pudo guardar el catálogo en este dispositivo.", {cause: error});
  }
  return data;
}
