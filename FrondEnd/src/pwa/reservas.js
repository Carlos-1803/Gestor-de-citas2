import { serverRead } from "./red.js";
import { compareChange, fetchAccountList, updateSnapshot } from "./cuentas.js";
import { applyManagementReceipt, keepPublishedPhoto, prepareDelivery, prepareOperation, releasePhoto } from "./gestion.js";
// Solo se conservan solicitudes creadas en este dispositivo. Nunca se persisten tokens.
const prefix = "entrecortes:reserva:";

export const queueEvent = "entrecortes-reservas";
export const agendaEvent = "entrecortes-agenda";

const scope = (owner, role) => prefix + (role === "Barber" ? "barbero:" : role === "Admin" ? "admin:" : "") + owner + ":";

export function localRequests(owner, role = "Client") {
  const start = scope(owner, role);
  return Object.keys(localStorage).filter(key => key.startsWith(start))
    .map(key => JSON.parse(localStorage.getItem(key))).filter(Boolean)
    .sort((a, b) => a.created - b.created);
}

function publish() {
  window.dispatchEvent(new Event(queueEvent));
}

function store(row) {
  localStorage.setItem(row.key, JSON.stringify(row));
  publish();
}

export function watchQueue(notify) {
  function changed(event) {
    if (!event.key || event.key.startsWith(prefix)) notify();
  }
  window.addEventListener("storage", changed);
  window.addEventListener(queueEvent, notify);
  return () => {
    window.removeEventListener("storage", changed);
    window.removeEventListener(queueEvent, notify);
  };
}

const lockName = (owner, role) => scope(owner, role) + "sync";

function requireAvailableRequest(owner, body, exceptKey) {
  const duplicate = localRequests(owner).some(r => r.key !== exceptKey && !r.kind &&
    r.body.offeringId === body.offeringId && Date.parse(r.body.start) === Date.parse(body.start));
  if (duplicate) throw Error("Ya hay una solicitud para ese horario en Mis citas.");
}

export async function addRequest(owner, body, description, zone, booking) {
  if (!navigator.locks) throw Error("Abre la PWA por HTTPS o localhost para guardar una reserva pendiente.");
  const opId = crypto.randomUUID();
  await navigator.locks.request(scope(owner, "Client") + "editar", () => {
    requireAvailableRequest(owner, body);
    store({ key: scope(owner, "Client") + opId, opId, owner, body, description, zone, booking, created: Date.now(), state: "pendiente" });
  });
}

export async function addAccountChange(owner, kind, target, base, body, description, role = "Barber") {
  if (!navigator.locks) throw Error("Abre la PWA por HTTPS o localhost para guardar los cambios.");
  const resource = scope(owner, role) + kind + ":" + target;
  await navigator.locks.request(resource, () => {
    const previous = kind === "status" ? localRequests(owner, role)
      .filter(row => row.kind === kind && row.target === target).at(-1) : null;
    if (previous ? !["pendiente", "enviando"].includes(previous.state) || previous.body.status !== base
                 : localStorage.getItem(resource)) {
      throw Error("Revisa primero el cambio que ya guardaste para este registro.");
    }
    const opId = crypto.randomUUID();
    const key = kind === "status" ? scope(owner, role) + opId : resource;
    const created = Math.max(Date.now(), (previous?.created || 0) + 1);
    store({key, owner, role, opId, kind, target, base, body, description, created,
      previous: previous?.key, state: "pendiente"});
  });
}

export function selectedStyle(owner, role) {
  return Number(localStorage.getItem("entrecortes:estilo:" + role + ":" + owner)) || null;
}

export async function saveStylePreference(owner, role, target, label) {
  if (!navigator.locks) throw Error("Abre EntreCortes con HTTPS de confianza para guardar tu elección.");
  await navigator.locks.request(scope(owner, role) + "editar", () => {
    const recent = localRequests(owner, role);
    const last = recent.filter(row => row.kind === "preference").at(-1);
    if (last?.target === target && last.state !== "rechazada") return;
    const opId = crypto.randomUUID();
    store({
      key: scope(owner, role) + opId, opId, owner, role, kind: "preference", target,
      body: {estiloId: target}, description: "Estilo elegido · " + label,
      created: Math.max(Date.now(), (recent.at(-1)?.created || 0) + 1), state: "pendiente",
    });
    localStorage.setItem("entrecortes:estilo:" + role + ":" + owner, String(target));
  });
}

export async function addManagementChange(owner, action, shopId, target, body, view, base) {
  return navigator.locks.request(scope(owner,"Barber") + "editar", async () => {
    const row = await prepareOperation(owner,action,shopId,target,body,view);
    if (base !== undefined) row.base = base;
    const existing = localRequests(owner,"Barber");
    const created = Math.max(Date.now(), (existing.at(-1)?.created || 0) + 1);
    try {
      store({...row,key:scope(owner,"Barber") + row.opId,created,state:"pendiente"});
    } catch (error) {
      await releasePhoto(row);
      throw error;
    }
    return {id:row.draft || row.target};
  });
}

export async function reviseCut(row,body) {
  await navigator.locks.request(lockName(row.owner,"Admin"), () => {
    const current = JSON.parse(localStorage.getItem(row.key));
    if (current?.state !== "pendiente") throw Error("Comprueba el estado de este envío antes de editarlo.");
    store({...current,body,opId:crypto.randomUUID(),description:(row.kind === "createCut" ? "Crear corte · " : "Editar corte · ")+body.name});
  });
}

export async function dismissRequest(row) {
  await navigator.locks.request(lockName(row.owner, row.role), () => {
    for (const dependent of localRequests(row.owner, row.role).filter(item => item.previous === row.key)) {
      store({...dependent, state:"rechazada", message:"Se retiró el cambio anterior de esta cita. Revisa su estado."});
    }
    localStorage.removeItem(row.key);
    publish();
    return releasePhoto(row);
  });
}

export function receipts(owner, role = "Client") {
  return JSON.parse(localStorage.getItem("entrecortes:recibos:" + role + ":" + owner) || "[]");
}

function confirmed(row, serverId = row.target) {
  const role = row.role || "Client";
  const key = "entrecortes:recibos:" + role + ":" + row.owner;
  const history = receipts(row.owner, role).filter(entry => entry.key !== (row.opId || row.key));
  const text = row.description + (serverId ? " · #" + serverId : "");
  localStorage.setItem(key, JSON.stringify([{ key: row.opId || row.key, kind:row.kind, text }, ...history].slice(0, 30)));
  localStorage.removeItem(row.key);
}

export async function moveBooking(row, start) {
  if (!start || Date.parse(start) === Date.parse(row.body.start)) throw Error("Elige otro horario.");
  await navigator.locks.request(lockName(row.owner, "Client"), async () => {
    const current = JSON.parse(localStorage.getItem(row.key));
    if (current?.state !== "rechazada") throw Error("Esta solicitud ya cambió.");
    await navigator.locks.request(scope(row.owner, "Client") + "editar", () => {
      const body = { ...current.body, start };
      requireAvailableRequest(row.owner, body, row.key);
      store({ ...current, body, opId: crypto.randomUUID(), state: "pendiente", message: "", replayable: false });
    });
  });
  publish();
}

function sameProducts(first,second) {
  const items = values => values.map(v => [v.name,v.quantity]).sort(([a],[b]) => a.localeCompare(b));
  return JSON.stringify(items(first)) === JSON.stringify(items(second));
}

async function send(row) {
  // Un token de la misma identidad impide enviar con otra cuenta si cambia la cookie.
  const tokenResponse = await serverRead("/api/auth/token");
  if (!tokenResponse.ok) return false;
  const { token, supportsIdempotency } = await tokenResponse.json();
  const session = await serverRead("/api/auth/me");
  if (!session.ok) return false;
  const sessionBody = await session.text();
  const user = sessionBody ? JSON.parse(sessionBody) : null;
  if (user?.role !== (row.role || "Client") || user.id !== row.owner) return false;

  const management = row.kind === "management";
  const preference = row.kind === "preference";
  const edit = ["status", "profile", "catalog"].includes(row.kind);
  const replayable = Boolean(supportsIdempotency && row.opId);
  const uncertain = ["enviando", "revisar"].includes(row.state);
  if (uncertain && !edit && !management && !(row.replayable && replayable)) {
    if (row.booking && !row.kind) {
      const records = await fetchAccountList(row.owner,"status","Client");
      const matching = records.filter(b => b.status !== "Cancelled" && b.shopId === row.booking.shopId &&
        Date.parse(b.start) === Date.parse(row.body.start) && b.barber === row.booking.barber &&
        b.haircutName === row.booking.cut && sameProducts(b.items,row.booking.items));
      if (matching.length === 1) {
        confirmed(row,matching[0].id);
        publish();
        window.dispatchEvent(new Event(agendaEvent));
        return true;
      }
    }
    if (row.state === "enviando") store({ ...row, state: "revisar" });
    return true;
  }
  let path = row.kind === "createCut" ? "/api/admin/haircuts" : "/api/bookings";
  if (preference) path = "/api/preferencias/guardar";
  const headers = { "Content-Type": "application/json", "X-CSRF-TOKEN": token };
  if (replayable) headers["Idempotency-Key"] = row.opId;
  let method = edit ? "PUT" : "POST";
  let payload = row.body;
  if (management) {
    const delivery = await prepareDelivery(row);
    if (delivery.decision === "wait") {
      const parent = localRequests(row.owner,row.role).find(entry => entry.draft != null &&
        [row.target,row.shopId].includes(entry.draft));
      if (!parent || parent.state === "rechazada") {
        store({...row,state:"rechazada",message:"No se guardó el registro del que depende este cambio."});
      }
      return true;
    }
    if (delivery.decision === "done") {
      applyManagementReceipt(row,{id:delivery.id});
      confirmed(row,delivery.id);
      publish();
      window.dispatchEvent(new Event(agendaEvent));
      await releasePhoto(row);
      return true;
    }
    if (delivery.decision === "conflict") {
      store({...row,state:"rechazada",message:"Este registro cambió en el servidor. Revisa los datos actuales."});
      window.dispatchEvent(new Event(agendaEvent));
      return true;
    }
    if (uncertain && !(row.replayable && replayable)) {
      if (row.state === "enviando") store({...row,state:"revisar"});
      return true;
    }
    ({path,method,payload} = delivery);
  }
  if (edit) {
    const records = await fetchAccountList(row.owner, row.kind, row.role);
    const current = records.find(item => item.id === row.target);
    const decision = compareChange(row, records);
    // Un servidor con revisiones puede detectar también un cambio entre el GET y el PUT.
    if (current?.revision) headers["If-Match"] = current.revision;
    if (decision !== "send" || (uncertain && !(row.replayable && replayable))) {
      if (decision === "done") {
        confirmed(row);
        publish();
      } else if (decision === "conflict") {
        store({ ...row, state: "rechazada", message: "El registro cambió en el servidor. Revisa la versión actual." });
      } else if (row.state === "enviando") store({ ...row, state: "revisar" });
      window.dispatchEvent(new Event(agendaEvent));
      return true;
    }
    path = row.kind === "status" ? "/api/bookings/" + row.target + "/status" : row.kind === "catalog" ? "/api/admin/haircuts/" + row.target : "/api/manage/shops/" + row.target;
  }
  row = { ...row, replayable };
  store({ ...row, state: "enviando" });
  let response;
  try {
    const form = payload instanceof FormData;
    if (form || method === "DELETE") delete headers["Content-Type"];
    const body = method === "DELETE" ? undefined : form ? payload : JSON.stringify(payload);
    response = await fetch(path, {method, headers, body});
    if (response.ok) {
      let serverId = row.target;
      if (management) {
        const receipt = method === "POST" ? await response.json() : {};
        if (row.draft && !Number.isInteger(receipt.id)) throw Error("Falta el identificador del registro.");
        serverId = receipt.id || row.target;
        applyManagementReceipt(row,receipt);
        await keepPublishedPhoto(row,receipt.url).catch(() => {});
      } else if (preference) {
        // La API confirma la elección con un mensaje, sin devolver un ID de simulación.
        const receipt = await response.json();
        if (!receipt?.message) throw Error("Falta la confirmación de la preferencia.");
        serverId = null;
      } else if (edit) updateSnapshot(row);
      else {
        const receipt = await response.json();
        serverId = receipt.id;
        if (!Number.isInteger(receipt.id)) throw Error("Falta el identificador del registro.");
      }
      confirmed(row, serverId);
      if (management) await releasePhoto(row).catch(() => {});
      publish();
      window.dispatchEvent(new Event(agendaEvent));
      return true;
    }
  } catch {
    // El servidor pudo guardar la cita aunque no haya llegado el recibo.
    store({ ...row, state: "revisar" });
    window.dispatchEvent(new Event(agendaEvent));
    return false;
  }
  if ([401, 429].includes(response.status) || (!row.role && response.status === 403)) {
    store({ ...row, state: "pendiente" });
    return false;
  }
  const detail = await response.json().catch(() => ({}));
  if ([400, 403, 404, 409, 412].includes(response.status)) {
    store({ ...row, state: "rechazada", message: detail.message || "El servidor rechazó esta solicitud." });
    if (edit || management) window.dispatchEvent(new Event(agendaEvent));
  } else {
    store({ ...row, state: "revisar" });
  }
  return true;
}

export async function syncRequests(owner, role = "Client") {
  if (localStorage.getItem("entrecortes:salida") || !owner || !navigator.onLine || !navigator.locks || !localRequests(owner, role).length) return;
  await navigator.locks.request(lockName(owner, role), { ifAvailable: true }, async lock => {
    if (!lock) return;
    for (const row of localRequests(owner, role)) {
      const previous = row.previous && JSON.parse(localStorage.getItem(row.previous));
      if (row.state === "pendiente" && previous) {
        if (previous.state === "rechazada") {
          store({...row, state:"rechazada", message:"El servidor rechazó el cambio anterior de esta cita. Revisa su estado."});
        }
        continue;
      }
      if ((row.kind || row.booking || row.replayable) && ["enviando", "revisar"].includes(row.state)) {
        if (!(await send(row))) break;
        continue;
      }
      if (row.state === "enviando") store({ ...row, state: "revisar" });
      if (row.state === "pendiente" && !(await send(row))) break;
    }
  });
}
