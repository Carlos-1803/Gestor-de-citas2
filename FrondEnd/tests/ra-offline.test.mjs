import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const files = ['/index.html', '/assets/app.js', '/pwa/sin-conexion.html', '/ra/face_landmarker.task', '/ra/vision/vision_wasm_internal.wasm'];
async function worker({ missing = '', htmlAsset = '' } = {}) {
  const handlers = {}, stores = new Map(), messages = [];
  const key = value => new URL(typeof value === 'string' ? value : value.url, 'https://kiin.test').pathname;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const data = stores.get(name);
      return { async put(url, response) { data.set(key(url), response.clone()); },
        async match(url) { return data.get(key(url))?.clone(); },
        async keys() { return [...data.keys()].map(path => ({ url: 'https://kiin.test' + path })); } };
    }, async keys() { return [...stores.keys()]; }, async delete(name) { return stores.delete(name); },
  };
  let source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  source = source.replace('const BUILD = { version: "development", files: [], bytes: 0 };', 'const BUILD = ' + JSON.stringify({ version: 'test', files, bytes: 1234 }) + ';');
  vm.runInNewContext(source, { Request: class extends Request { constructor(url, options) { super(new URL(url, "https://kiin.test"), options); } }, Response, URL, Set, Promise, Error, caches,
    self: { location: { origin: 'https://kiin.test' }, addEventListener(name, fn) { handlers[name] = fn; },
      clients: { async claim() {}, async matchAll() { return [{ postMessage(value) { messages.push(value); } }]; } } },
    fetch: async request => { const url = key(request); return new Response('resource:' + url, {
      status: url === missing ? 404 : 200,
      headers: { 'content-type': url.endsWith('.html') || url === htmlAsset ? 'text/html' : 'application/octet-stream' },
    }); },
  });
  return { handlers, stores, caches, messages };
}
test('the complete shell and detector remain readable without network; APIs are never cached', async () => {
  const { handlers, caches, stores } = await worker();
  let install;
  handlers.install({ waitUntil(promise) { install = promise; } }); await install;
  await caches.open('kiin-ra-shell-obsolete'); await caches.open('barberst-map-tiles');
  let activate;
  handlers.activate({ waitUntil(promise) { activate = promise; } }); await activate;
  assert.equal(stores.has('kiin-ra-shell-obsolete'), false);
  assert.equal(stores.has('barberst-map-tiles'), true);
  let status, pending;
  handlers.message({ data: { type: 'RA_STATUS' }, ports: [{ postMessage(value) { status = value; } }], waitUntil(promise) { pending = promise; } }); await pending;
  assert.equal(status.ready, true); assert.equal(status.count, files.length);
  for (const path of ['/index.html', '/ra/vision/vision_wasm_internal.wasm']) {
    let response;
    handlers.fetch({ request: { method: 'GET', url: 'https://kiin.test' + path, mode: path.endsWith('.html') ? 'navigate' : 'cors' }, respondWith(promise) { response = promise; } });
    assert.equal(await (await response).text(), 'resource:' + path);
  }
  handlers.fetch({ request: { method: 'GET', url: 'https://kiin.test/api/auth/me' }, respondWith() { assert.fail('private API must bypass static cache'); } });
});
test('missing assets or an HTML fallback masquerading as WASM never report offline ready', async () => {
  for (const options of [{ missing: '/ra/face_landmarker.task' }, { htmlAsset: '/ra/vision/vision_wasm_internal.wasm' }]) {
    const { handlers, messages } = await worker(options);
    let install;
    handlers.install({ waitUntil(promise) { install = promise; } });
    await assert.rejects(install, /No se pudo preparar/);
    assert.ok(messages.some(message => message.type === 'RA_CACHE_ERROR'));
  }
});
