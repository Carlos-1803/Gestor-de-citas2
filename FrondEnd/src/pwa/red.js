// El teléfono puede tener datos móviles aunque la PC que aloja la API ya no sea accesible.
let reachable = true;
const changes = new EventTarget();

export function serverOnline() {
  return navigator.onLine !== false && reachable;
}
export function watchConnection(notify) {
  function networkChanged() {
    reachable = true;
    notify();
  }
  changes.addEventListener("change", notify);
  window.addEventListener("online", networkChanged);
  window.addEventListener("offline", networkChanged);
  return () => {
    changes.removeEventListener("change", notify);
    window.removeEventListener("online", networkChanged);
    window.removeEventListener("offline", networkChanged);
  };
}
function mark(value) {
  if (value === reachable) return;
  reachable = value;
  changes.dispatchEvent(new Event("change"));
}

export async function serverRead(path, options = {}) {
  if (navigator.onLine === false) throw new TypeError("Sin conexión con EntreCortes.");
  let response;
  try {
    response = await fetch(path, {cache: "no-store", signal: AbortSignal.timeout(6000), ...options});
    if ([502,503,504,530].includes(response.status) || response.headers.get("Content-Type")?.includes("text/html")) {
      throw new TypeError("El servidor de EntreCortes no está disponible.");
    }
  } catch (error) {
    mark(false);
    throw new TypeError("Sin conexión con EntreCortes.", {cause: error});
  }
  mark(true);
  return response;
}
