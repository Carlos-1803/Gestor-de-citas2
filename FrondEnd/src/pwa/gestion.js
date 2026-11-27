import { publicPhotoCache, isShopPhoto } from "./fotos.js";
import { accountSnapshot, fetchAccountList, offlineAccount, saveAccountSnapshot } from "./cuentas.js";

// Solo operaciones que existen en los formularios de Mi barbería y en la API.
const actions = {
  addShop:     ["shops", "POST", () => "/manage/shops", "Registrar barbería"],
  editShop:    ["shops", "PUT", id => "/manage/shops/" + id, "Editar barbería"],
  addBarber:   ["barbers", "POST", id => "/manage/shops/" + id + "/barbers", "Añadir barbero"],
  editBarber:  ["barbers", "PUT", id => "/manage/barbers/" + id, "Editar barbero"],
  service:     ["offerings", "POST", id => "/manage/barbers/" + id + "/offerings", "Guardar servicio"],
  schedule:    ["periods", "PUT", id => "/manage/barbers/" + id + "/periods", "Guardar horario"],
  addBlock:    ["blocks", "POST", id => "/manage/barbers/" + id + "/blocks", "Añadir bloqueo"],
  deleteBlock: ["blocks", "DELETE", id => "/manage/blocks/" + id, "Quitar bloqueo"],
  addProduct:  ["products", "POST", id => "/manage/shops/" + id + "/products", "Añadir producto"],
  editProduct: ["products", "PUT", id => "/manage/products/" + id, "Actualizar producto"],
  addPhoto:    ["photos", "POST", id => "/manage/shops/" + id + "/photos", "Subir fotografía"],
  deletePhoto: ["photos", "DELETE", id => "/manage/photos/" + id, "Quitar fotografía"],
};
export function managementRoute(action,target) {
  const [,method,path] = actions[action];
  return {method,path:path(target)};
}

const fields = {
  shops: ["name","description","address","phone","timeZone","latitude","longitude"],
  barbers: ["name","active"], products: ["name","description","price","stock","active"],
  offerings: ["haircutId","price","minutes","active"], periods: ["day","startMinute","endMinute"],
  blocks: ["startUtc","endUtc"], photos: ["kind"],
};
export const emptyTeam = () => ({barbers:[], offerings:[], periods:[], blocks:[], products:[]});
const mapKey = (owner,id) => "entrecortes:id:Barber:" + owner + ":" + id;
export function serverId(owner,id) {
  return id < 0 ? Number(localStorage.getItem(mapKey(owner,id))) || id : id;
}

const photoCache = "entrecortes-fotos-pendientes";
const photoKey = (owner,id) => "/__pwa/fotos/" + owner + "/" + id;
export async function savedPhoto(owner, id) {
  const response = await (await caches.open(photoCache)).match(photoKey(owner,id));
  if (!response) throw Error("No se encuentra la fotografía guardada en este dispositivo.");
  return response.blob();
}
export async function keepPublishedPhoto(row, url) {
  if (row.action !== "addPhoto" || !isShopPhoto(url)) return;
  const blob = await savedPhoto(row.owner, row.opId);
  await (await caches.open(publicPhotoCache)).put(url, new Response(blob, {headers: {"Content-Type":blob.type}}));
}
export async function releasePhoto(row) {
  if (row.action === "addPhoto") await (await caches.open(photoCache)).delete(photoKey(row.owner,row.opId));
}

function selectFields(item, list) {
  if (!item) return null;
  return Object.fromEntries(fields[list].map(key => [
    key, typeof item[key] === "string" ? item[key].trim() : item[key],
  ]));
}
function periods(rows) {
  return rows.map(p => selectFields(p, "periods"))
    .sort((a,b) => a.day-b.day || a.startMinute-b.startMinute || a.endMinute-b.endMinute);
}
function currentValue(row, items) {
  const [list] = actions[row.action];
  const target = serverId(row.owner, row.target);
  if (row.action === "schedule") return periods(items.filter(p => p.barberId === target));
  const record = row.action === "service"
    ? items.find(o => o.barberId === target && o.haircutId === row.body.haircutId)
    : items.find(entry => entry.id === target);
  return selectFields(record, list);
}

export async function prepareOperation(owner, action, shopId, target, input, view) {
  const [list, method, , label] = actions[action];
  const creates = method === "POST";
  // Negativo para poder seleccionar un registro local y preparar sus hijos antes de recibir sus IDs reales.
  const draft = creates ? -1 - Math.floor(Math.random() * (2 ** 48)) : null;
  const opId = crypto.randomUUID();
  let body = input ?? {};
  if (action === "addPhoto") {
    const file = input.get("photo");
    if (!(file instanceof Blob) || file.size <= 12 || file.size > 5000000) {
      throw Error("Selecciona una foto JPEG, PNG o WebP de hasta 5 MB.");
    }
    const head = new Uint8Array(await file.slice(0,12).arrayBuffer());
    const signature = String.fromCharCode(...head);
    const type = head[0] === 255 && head[1] === 216 && head[2] === 255 ? "image/jpeg"
      : head[0] === 137 && signature.slice(1,8) === "PNG\r\n\x1a\n" ? "image/png"
      : signature.startsWith("RIFF") && signature.endsWith("WEBP") ? "image/webp" : null;
    if (!type) throw Error("Solo se aceptan fotos JPEG, PNG o WebP.");
    body = {kind:input.get("kind"), filename:file.name};
    await (await caches.open(photoCache)).put(photoKey(owner,opId),new Response(file,{headers:{"Content-Type":type}}));
  } else if ((method === "PUT" && action !== "schedule") || action === "service" || ["addBarber","addProduct","addShop"].includes(action)) {
    body = selectFields(body, list);
  }
  const row = {kind:"management", role:"Barber", owner, action, shopId:Number(shopId), target:Number(target),
    draft, opId, body, description:label + (body.name ? " · " + body.name : "")};
  const items = list === "shops" ? view.shops : list === "photos" ? view.photos : view.team?.[list] || [];
  row.base = currentValue(row, items);
  return row;
}

function project(row, items, receipt) {
  const [, method] = actions[row.action];
  const target = serverId(row.owner,row.target);
  if (method === "DELETE") return items.filter(x => x.id !== target);
  if (row.action === "schedule") {
    return [...items.filter(p => p.barberId !== target), ...row.body.map(p => ({...p,barberId:target}))];
  }
  let id = receipt?.id || (row.draft ? serverId(row.owner,row.draft) : target);
  let item = {...row.body};
  if (row.action === "service") {
    const existing = items.find(o => o.barberId === target && o.haircutId === row.body.haircutId);
    id = receipt?.id || existing?.id || id;
    item.barberId = target;
  } else if (row.action === "addBlock") {
    item = {barberId:target,startUtc:row.body.start.replace(/Z$/,""),endUtc:row.body.end.replace(/Z$/,"")};
  } else if (row.action === "addPhoto") {
    item = receipt?.url ? {kind:row.body.kind,url:receipt.url} : {kind:row.body.kind,localPhoto:row.opId};
  }
  const index = items.findIndex(x => x.id === id || (row.draft && x.id === row.draft));
  if (index === -1) return method === "PUT" ? items : [...items,{...item,id}];
  return items.map((x,i) => i === index ? {...x,...item,id} : x);
}

export function managementView(owner, selected, shops, team, photos, rows) {
  const view = {shops,team:team && {...team},photos};
  for (const row of rows) {
    if (row.kind !== "management" || row.state === "rechazada") continue;
    const [list] = actions[row.action];
    if (list === "shops") view.shops = project(row,view.shops);
    else if (serverId(owner,row.shopId) === Number(selected)) {
      if (list === "photos") view.photos = project(row,view.photos);
      else if (view.team) view.team[list] = project(row,view.team[list]);
    }
  }
  return view;
}

export function ownerPreview(owner,id,rows) {
  const key = serverId(owner,id);
  const cachedShops = accountSnapshot(owner,"profile","Barber") || [];
  const team = accountSnapshot(owner,"team:"+key,"Barber") || emptyTeam();
  const photos = accountSnapshot(owner,"photos:"+key,"Barber") || [];
  const view = managementView(owner,key,cachedShops,team,photos,rows);
  const shop = view.shops.find(s => s.id === key);
  if (!shop) return null;
  const cuts = accountSnapshot(owner,"catalog","Barber") || [];
  return {shop,photos:view.photos,barbers:view.team.barbers.filter(b => b.active),
    products:view.team.products.filter(p => p.active),
    offerings:view.team.offerings.filter(o => o.active).map(o => ({
      ...o,name:cuts.find(c => c.id === o.haircutId)?.name || "Corte",
    })),
  };
}

function snapshotKind(row) {
  const [list] = actions[row.action];
  if (list === "shops") return "profile";
  return (list === "photos" ? "photos:" : "team:") + serverId(row.owner,row.shopId);
}
export async function prepareDelivery(row) {
  const [list,method,path] = actions[row.action];
  const target = serverId(row.owner,row.target);
  if (target < 0 || serverId(row.owner,row.shopId) < 0) return {decision:"wait"};
  if (row.draft && serverId(row.owner,row.draft) > 0) return {decision:"done",id:serverId(row.owner,row.draft)};
  if (method !== "POST" || row.action === "service") {
    const snapshot = await fetchAccountList(row.owner,snapshotKind(row),"Barber");
    const items = list === "shops" || list === "photos" ? snapshot : snapshot[list];
    const current = currentValue(row,items);
    const desired = method === "DELETE" ? null : row.action === "schedule" ? periods(row.body) : row.body;
    if (JSON.stringify(current) === JSON.stringify(desired)) {
      const record = row.action === "service" && items.find(o => o.barberId === target && o.haircutId === row.body.haircutId);
      return {decision:"done",id:record?.id || target};
    }
    if (JSON.stringify(current) !== JSON.stringify(row.base)) return {decision:"conflict"};
  }
  let payload = row.body;
  if (row.action === "addPhoto") {
    payload = new FormData();
    payload.set("kind",row.body.kind);
    payload.set("photo",await savedPhoto(row.owner,row.opId),row.body.filename);
  }
  return {decision:"send",path:"/api"+path(target),method,payload};
}

export function applyManagementReceipt(row, receipt) {
  if (row.draft && Number.isInteger(receipt?.id)) localStorage.setItem(mapKey(row.owner,row.draft), String(receipt.id));
  const user = offlineAccount();
  if (user?.role !== "Barber" || user.id !== row.owner) return;
  const [list] = actions[row.action];
  const kind = snapshotKind(row);
  const snapshot = accountSnapshot(row.owner,kind,"Barber") || (list === "shops" || list === "photos" ? [] : emptyTeam());
  const value = list === "shops" || list === "photos" ? project(row,snapshot,receipt)
    : {...snapshot,[list]:project(row,snapshot[list],receipt)};
  saveAccountSnapshot(row.owner,kind,"Barber",value);
  if (row.action === "addShop" && receipt?.id) {
    for (const [prefix,initial] of [["team:",emptyTeam()],["photos:",[]]]) {
      if (!accountSnapshot(row.owner,prefix+receipt.id,"Barber")) saveAccountSnapshot(row.owner,prefix+receipt.id,"Barber",initial);
    }
  }
}
