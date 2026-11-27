import { serverRead, serverOnline } from "./red.js";

// Cada copia corresponde a una cuenta autenticada y a su rol.
export const identityKey = "entrecortes:cliente";
export const accountPaths = { status: "/bookings", profile: "/manage/shops", catalog: "/haircuts" };
const snapshotKey = (owner, kind, role = "Barber") => "entrecortes:" + (role === "Barber" ? "barbero" : role) + ":" + owner + ":" + kind;

export function accountSnapshot(owner, kind, role) {
  return JSON.parse(localStorage.getItem(snapshotKey(owner, kind, role)) || "null");
}
export function saveAccountSnapshot(owner, kind, role, value) {
  localStorage.setItem(snapshotKey(owner,kind,role),JSON.stringify(value));
}

function pathFor(kind) {
  if (Object.hasOwn(accountPaths,kind)) return accountPaths[kind];
  const match = /^(team|photos):([1-9]\d*)$/.exec(kind);
  if (!match) throw Error("Sección desconocida.");
  return match[1] === "team" ? "/manage/shops/" + match[2] + "/team" : "/shops/" + match[2];
}

export function offlineAccount() {
  return JSON.parse(localStorage.getItem(identityKey) || "null");
}

export function rememberAccount(user) {
  const prior = offlineAccount();
  if (prior && (prior.id !== user?.id || prior.role !== user?.role)) {
    const prefix = snapshotKey(prior.id, "", prior.role);
    for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.removeItem(key);
  }
  if (["Barber", "Client", "Admin"].includes(user?.role)) {
    localStorage.setItem(identityKey, JSON.stringify({ id: user.id, name: user.name, role: user.role }));
  } else localStorage.removeItem(identityKey);
}

function sameAccount(account, owner, role) {
  return account?.role === role && account.id === owner;
}

export async function fetchAccountList(owner, kind, role = "Barber", requireStorage = false) {
  const response = await serverRead("/api" + pathFor(kind));
  if (!response.ok) {
    if ([401,403].includes(response.status)) localStorage.removeItem(snapshotKey(owner,kind,role));
    throw Error("No se pudo consultar esta sección con tu cuenta.");
  }
  const result = await response.json();
  const rows = kind.startsWith("photos:") ? result.photos : result;
  const me = await serverRead("/api/auth/me");
  const identity = me.ok ? await me.text() : "";
  if (!identity || !sameAccount(JSON.parse(identity), owner, role) || !sameAccount(offlineAccount(), owner, role)) {
    throw Error("La sesión cambió. Vuelve a abrir la agenda con tu cuenta.");
  }
  try { saveAccountSnapshot(owner,kind,role,rows); }
  catch (error) { if (requireStorage) throw Error("No se pudieron guardar los datos de la cuenta en este dispositivo.", {cause: error}); }
  return rows;
}

export async function accountList(owner, kind, role = "Barber") {
  if (!serverOnline() && sameAccount(offlineAccount(), owner, role)) {
    const saved = accountSnapshot(owner, kind, role);
    if (saved !== null) return saved;
  }
  try { return await fetchAccountList(owner, kind, role); }
  catch (error) {
    if (!(error instanceof TypeError) || !sameAccount(offlineAccount(), owner, role)) throw error;
    const saved = localStorage.getItem(snapshotKey(owner, kind, role));
    if (saved === null) throw Error("Abre esta sección con conexión para guardarla en el dispositivo.", {cause: error});
    return JSON.parse(saved);
  }
}

export function profileFields(shop) {
  return Object.fromEntries(["name","description","address","phone","timeZone","latitude","longitude"]
    .map(key => [key, typeof shop[key] === "string" ? shop[key].trim() : shop[key]]));
}

export function cutFields(cut) {
  return { name: cut.name.trim(), description: cut.description.trim(), active: cut.active };
}

export function compareChange(row, records) {
  const item = records.find(entry => entry.id === row.target);
  if (!item) return "conflict";
  const current = row.kind === "status" ? item.status : row.kind === "catalog" ? cutFields(item) : profileFields(item);
  const desired = row.kind === "status" ? row.body.status : row.body;
  if (JSON.stringify(current) === JSON.stringify(desired)) return "done";
  return JSON.stringify(current) === JSON.stringify(row.base) ? "send" : "conflict";
}

export function updateSnapshot(row) {
  if (!sameAccount(offlineAccount(), row.owner, row.role)) return;
  const key = snapshotKey(row.owner, row.kind, row.role);
  const rows = JSON.parse(localStorage.getItem(key) || "null");
  if (rows) localStorage.setItem(key, JSON.stringify(rows.map(item =>
    item.id === row.target ? { ...item, ...row.body } : item)));
}
