import test from "node:test";
import assert from "node:assert/strict";
import { addRequest, localRequests, syncRequests } from "../src/pwa/reservas.js";

test("La cola comprueba la identidad y evita enviar dos veces una solicitud", async t => {
  const records = {};
  const locks = new Set();
  const original = {};
  function replace(key, value) {
    original[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  t.after(() => {
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  replace("window", new EventTarget());
  replace("localStorage", Object.assign(records, {
    getItem(key) { return this[key] || null; },
    setItem(key, value) { this[key] = String(value); },
    removeItem(key) { delete this[key]; },
  }));
  replace("navigator", { onLine: false, locks: {
    async request(name, options, callback) {
      if (typeof options === "function") return options();
      if (locks.has(name)) return callback(null);
      locks.add(name);
      try { return await callback({ name }); }
      finally { locks.delete(name); }
    },
  } });
  let logged = 2, posts = 0;
  replace("fetch", async (url, options) => {
    if (url === "/api/auth/token") return Response.json({ token: "prueba" });
    if (url === "/api/auth/me") return Response.json({ id: logged, role: "Client" });
    assert.equal(url, "/api/bookings");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["X-CSRF-TOKEN"], "prueba");
    posts++;
    return Response.json({ id: 100 });
  });
  const body = { offeringId: 7, start: "2030-06-01T10:00:00Z", items: [] };
  await addRequest(1, body, "Prueba", "UTC");
  await assert.rejects(addRequest(1, body, "Prueba", "UTC"), /Ya hay una solicitud/);
  await syncRequests(1);
  assert.equal(posts, 0);
  navigator.onLine = true;
  await syncRequests(1);
  assert.equal(posts, 0);
  assert.equal(localRequests(1)[0].state, "pendiente");
  assert.deepEqual(localRequests(2), []);
  logged = 1;
  await Promise.all([syncRequests(1), syncRequests(1)]);
  assert.equal(posts, 1);
  assert.deepEqual(localRequests(1), []);
});
