import assert from "node:assert/strict";
import test from "node:test";
import { rememberAccount } from "../src/pwa/cuentas.js";
import { applyManagementReceipt, emptyTeam, managementView, prepareDelivery, prepareOperation, serverId } from "../src/pwa/gestion.js";
import { requestedInstant } from "../src/pwa/horario.js";

test("Un establecimiento creado sin conexión conserva sus productos al recibir el identificador del servidor", async t => {
  const data = new Map();
  const storage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  });
  const owner = { id: 24, role: "Barber" };
  rememberAccount(owner);
  const view = { shops: [], photos: [], team: emptyTeam() };
  const shop = await prepareOperation(owner.id, "addShop", 0, 0,
    { name: "Centro", description: "", address: "Centro", phone: "", timeZone: "UTC", latitude: 0, longitude: 0 }, view);
  const product = await prepareOperation(owner.id, "addProduct", shop.draft, shop.draft,
    { name: "Cera", description: "", price: 25, stock: 5, active: true }, view);

  assert.equal((await prepareDelivery(product)).decision, "wait");
  const preview = managementView(owner.id, shop.draft, [], emptyTeam(), [], [shop, product]);
  assert.equal(preview.shops[0].id, shop.draft);
  assert.equal(preview.team.products[0].id, product.draft);

  applyManagementReceipt(shop, { id: 16 });
  assert.equal(serverId(25, shop.draft), shop.draft);
  const delivery = await prepareDelivery(product);
  assert.equal(delivery.path, "/api/manage/shops/16/products");
  assert.equal(delivery.payload.stock, 5);
  applyManagementReceipt(product, { id: 63 });
  assert.equal((await prepareDelivery(product)).decision, "done");

  const edit = await prepareOperation(owner.id, "editProduct", 16, 63,
    { ...product.body, price: 29 }, { ...view, team: { ...emptyTeam(), products: [{ ...product.body, id: 63 }] } });
  const current = { ...emptyTeam(), products: [{ ...product.body, id: 63, stock: 3 }] };
  t.mock.method(globalThis, "fetch", async url => Response.json(url === "/api/auth/me" ? owner : current));
  assert.equal((await prepareDelivery(edit)).decision, "conflict");
});

test("Las horas propuestas sin conexión usan la zona de la barbería y rechazan la hora inexistente", () => {
  assert.equal(requestedInstant("2026-11-25", "10:00", "America/Mexico_City"), "2026-11-25T16:00:00.000Z");
  assert.throws(() => requestedInstant("2026-03-08", "02:30", "America/New_York"), /no existe/);
});
