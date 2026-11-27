import { fetchAccountList } from "./cuentas.js";
import { readPublic } from "./catalogo.js";
import { publicPhotoCache, isShopPhoto } from "./fotos.js";
import { serverRead } from "./red.js";

let installation;

async function activeWorker(registration) {
  const worker = registration.installing || registration.waiting || registration.active;
  if (!worker) throw Error("Chrome no ha instalado la copia sin conexión.");
  if (worker.state !== "activated") {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => finish(false), 180000);
      function finish(ok) {
        clearTimeout(timeout);
        worker.removeEventListener("statechange", changed);
        if (ok) resolve();
        else reject(Error("La descarga se interrumpió. Comprueba la conexión y el espacio disponible."));
      }
      function changed() {
        if (worker.state === "activated") finish(true);
        if (worker.state === "redundant") finish(false);
      }
      worker.addEventListener("statechange", changed);
      changed();
    });
  }
  return worker;
}

export function offlineShell() {
  if (!installation) installation = install().catch(error => {
    installation = undefined;
    throw error;
  });
  return installation;
}

async function install() {
  if (!window.isSecureContext || !navigator.serviceWorker || !globalThis.caches) {
    throw Error("Chrome necesita un HTTPS de confianza para poder abrir EntreCortes sin conexión.");
  }
  let registration;
  try {
    registration = await navigator.serviceWorker.register("/sw.js", {updateViaCache: "none"});
  } catch {
    throw Error("Chrome no pudo instalar la copia sin conexión. Comprueba que HTTPS aparezca sin advertencias y vuelve a abrir EntreCortes.");
  }
  await activeWorker(registration);
  const entry = document.querySelector('script[type="module"][src]').src;
  const names = await caches.keys();
  for (const name of names.filter(n => n.startsWith("entrecortes-shell-"))) {
    // El worker sólo activa el build después de guardar juntos el documento, JS, detector e iconos.
    if (await (await caches.open(name)).match(entry)) return;
  }
  throw Error("Hay una versión nueva de EntreCortes. Vuelve a abrir la aplicación con conexión.");
}

export async function prepareAccount(owner, role, current) {
  const options = {requireStorage: true};
  async function publicData() {
    const shops = await readPublic("/shops", options);
    const images = await caches.open(publicPhotoCache);
    const cachedAtStart = await images.keys();
    const published = new Set();
    for (const shop of shops) {
      if (!current()) return;
      const detail = await readPublic("/shops/" + shop.id, options);
      for (const {url} of detail.photos) {
        if (!current()) return;
        if (!isShopPhoto(url)) continue;
        published.add(url);
        if (await images.match(url)) continue;
        const response = await serverRead(url, {credentials: "omit"});
        if (response.status === 404) continue;
        if (!response.ok || !response.headers.get("Content-Type")?.startsWith("image/")) {
          throw Error("No se pudo guardar una fotografía de la barbería.");
        }
        if (!(await images.match(url))) await images.put(url, response);
      }
    }
    if (current()) {
      await Promise.all(cachedAtStart.filter(req => !published.has(new URL(req.url).pathname))
        .map(req => images.delete(req)));
    }
  }
  async function privateData() {
    if (!owner) {
      await readPublic("/haircuts", options);
      return;
    }
    const save = kind => fetchAccountList(owner, kind, role, true);
    async function shopsOwned() {
      if (role !== "Barber") return;
      const shops = await save("profile");
      for (const shop of shops) {
        if (!current()) return;
        await Promise.all([save("team:" + shop.id), save("photos:" + shop.id)]);
      }
    }
    await Promise.all([save("status"), save("catalog"), shopsOwned()]);
  }
  await Promise.all([publicData(), privateData()]);
}
