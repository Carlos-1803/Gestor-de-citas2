import test from "node:test";
import assert from "node:assert/strict";
import { accountList, compareChange, offlineAccount, profileFields, rememberAccount } from "../src/pwa/cuentas.js";
import { addAccountChange, localRequests, syncRequests } from "../src/pwa/reservas.js";

test("El perfil usa los campos editables y conserva un cambio externo", () => {
  const original = { id: 8, name: " Norte ", description: "Barrio", address: "Centro", phone: "555",
    timeZone: "UTC", latitude: 20, longitude: -89, ownerId: 22 };
  const base = profileFields(original);
  const body = { ...base, phone: "555123" };
  const row = { kind: "profile", target: 8, base, body };
  assert.equal(compareChange(row, [original]), "send");
  assert.equal(compareChange(row, [{ ...original, ...body }]), "done");
  assert.equal(compareChange(row, [{ ...original, address: "Otra calle" }]), "conflict");
  assert.equal(compareChange(row, []), "conflict");
});

test("La agenda y los envíos pendientes pertenecen a la cuenta del barbero", async t => {
  const globals = {
    window: new EventTarget(),
    localStorage: {
      getItem(key) { return this[key] ?? null; },
      setItem(key, value) { this[key] = value; },
      removeItem(key) { delete this[key]; },
    },
    navigator: { onLine: true, locks: { request: async (name, opts, fn) =>
      fn ? fn({ name }) : opts({ name }) } },
  };
  const barber = { id: 1, role: "Barber", name: "Primero" };
  const other = { id: 2, role: "Barber", name: "Segundo" };
  let session = barber;
  const writes = [];
  const pending = { id: 5, status: "Pending", revision: '"rev1"' };
  globals.fetch = async (url, options) => {
    if (!navigator.onLine) throw new TypeError("Sin red");
    if (url === "/api/auth/me") return Response.json(session);
    if (url === "/api/auth/token") return Response.json({ token: "demo" });
    if (url === "/api/bookings") return Response.json([pending]);
    assert.equal(url, "/api/bookings/5/status");
    assert.equal(options.method, "PUT");
    assert.equal(options.headers["If-Match"], pending.revision);
    assert.equal(options.headers["X-CSRF-TOKEN"], "demo");
    writes.push(JSON.parse(options.body));
    return Response.json({ message: "Cambio simultáneo" }, { status: 412 });
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    });
  }
  rememberAccount(barber);
  assert.deepEqual(await accountList(1, "status"), [pending]);
  navigator.onLine = false;
  assert.deepEqual(await accountList(1, "status"), [pending]);
  const add = () => addAccountChange(1, "status", 5, "Pending", { status: "Confirmed" }, "Cita 5");
  await add();
  await assert.rejects(add(), /ya guardaste/);
  rememberAccount(other);
  assert.equal(offlineAccount().id, 2);
  await assert.rejects(accountList(1, "status"));
  await assert.rejects(accountList(2, "status"), /Abre esta sección/);
  assert.deepEqual(localRequests(2, "Barber"), []);
  assert.deepEqual(localRequests(1, "Client"), []);
  navigator.onLine = true;
  session = other;
  await syncRequests(1, "Barber");
  session = { ...barber, role: "Client" };
  await syncRequests(1, "Barber");
  assert.equal(writes.length, 0);
  assert.equal(localRequests(1, "Barber")[0].state, "pendiente");
  session = barber;
  rememberAccount(barber);
  navigator.onLine = false;
  await assert.rejects(accountList(1, "status"), /Abre esta sección/);
  navigator.onLine = true;
  await syncRequests(1, "Barber");
  assert.deepEqual(writes, [{ status: "Confirmed" }]);
  assert.equal(localRequests(1, "Barber")[0].state, "rechazada");
  assert.equal(localRequests(1, "Barber")[0].message, "Cambio simultáneo");
  await syncRequests(1, "Barber");
  assert.equal(writes.length, 1);
  rememberAccount(null);
  assert.equal(offlineAccount(), null);
});
