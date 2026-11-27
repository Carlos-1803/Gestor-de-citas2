import test from "node:test";
import assert from "node:assert/strict";
import { addAccountChange, addRequest, localRequests, moveBooking, receipts, syncRequests } from "../src/pwa/reservas.js";

function setup(t, role, idempotent) {
  const stored = Object.create(null);
  const storage = Object.assign(stored, {
    getItem(key) { return this[key] ?? null; },
    setItem(key, value) { this[key] = value; },
    removeItem(key) { delete this[key]; },
  });
  const sent = [], accepted = new Map();
  let conflict = false;
  const fetch = async (path, options) => {
    if (path === "/api/auth/token") return Response.json({token:"local",supportsIdempotency:idempotent});
    if (path === "/api/auth/me") return Response.json({id:6,role});
    assert.equal(path, role === "Admin" ? "/api/admin/haircuts" : "/api/bookings");
    const key = options.headers["Idempotency-Key"];
    sent.push({key,body:JSON.parse(options.body)});
    if (conflict) return Response.json({message:"El horario está ocupado."},{status:409});
    if (!accepted.has(key)) {
      accepted.set(key,{id:101});
      throw new TypeError("Se perdió el recibo después de guardar.");
    }
    return Response.json(accepted.get(key));
  };
  for (const [key,value] of Object.entries({window:new EventTarget(),localStorage:storage,fetch,
    navigator:{onLine:true,locks:{request:(name,opts,fn)=>fn ? fn({name}) : opts({name})}}})) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>descriptor ? Object.defineProperty(globalThis,key,descriptor) : delete globalThis[key]);
  }
  return {sent,accepted,setConflict(value){conflict=value;}};
}

for (const idempotent of [true,false]) {
  test("Alta de catálogo con respuesta perdida, idempotencia " + idempotent, async t => {
    const {sent,accepted} = setup(t,"Admin",idempotent);
    await addAccountChange(6,"createCut","borrador",null,{name:"Clásico",description:"Prueba",active:true},"Crear clásico","Admin");
    await syncRequests(6,"Admin");
    assert.equal(localRequests(6,"Admin")[0].state,"revisar");
    await syncRequests(6,"Admin");
    assert.equal(accepted.size,1);
    assert.equal(sent.length,idempotent ? 2 : 1);
    if (idempotent) {
      assert.ok(sent[0].key);
      assert.equal(sent[0].key,sent[1].key);
      assert.equal(localRequests(6,"Admin").length,0);
      assert.equal(receipts(6,"Admin")[0].text,"Crear clásico · #101");
    } else assert.equal(localRequests(6,"Admin")[0].state,"revisar");
  });
}
test("Cambiar un horario ocupado conserva los productos en una sola solicitud", async t => {
  const api = setup(t,"Client",true);
  api.setConflict(true);
  const body={offeringId:7,start:"2030-03-01T10:00:00Z",items:[{productId:9,quantity:2}]};
  await addRequest(6,body,"Servicio","UTC");
  await syncRequests(6,"Client");
  const [rejected]=localRequests(6);
  assert.equal(rejected.state,"rechazada");
  await moveBooking(rejected,"2030-03-01T10:30:00Z");
  const [moved]=localRequests(6);
  assert.equal(localRequests(6).length,1);
  assert.equal(rejected.key,moved.key);
  assert.notEqual(rejected.opId,moved.opId);
  assert.deepEqual(moved.body.items,body.items);
  await assert.rejects(addRequest(6,moved.body,"Duplicada","UTC"),/Ya hay/);
});