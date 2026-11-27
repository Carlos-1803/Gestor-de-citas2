import "fake-indexeddb/auto";
import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { clearMapTiles, downloadMapPack, getStoredTile, mapStats, storeTile } from "../src/maps/mapStorage.js";
import { DEFAULT_MAP_CONFIG } from "../src/maps/mapConfig.js";
import { CAMPECHE, enumerateTiles } from "../src/maps/mapRegion.js";

const source = { id: "test-own-v1", name: "Owned test tiles", urlTemplate: "https://tiles.example.test/{z}/{x}/{y}.png", offlineAllowed: true };
const area = { minLat: 18.17, maxLat: 18.20, minLon: -91.06, maxLon: -91.02 };
const originalFetch = globalThis.fetch;
const storageDescriptor = Object.getOwnPropertyDescriptor(navigator, "storage");
beforeEach(async () => { await clearMapTiles(); });
afterEach(async () => {
  globalThis.fetch = originalFetch;
  if (storageDescriptor) Object.defineProperty(navigator, "storage", storageDescriptor);
  else delete navigator.storage;
  await clearMapTiles();
});
const tileResponse = () => new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), { headers: { "Content-Type": "image/png" } });

test("map blobs persist for offline reuse while honoring the provider freshness TTL", async () => {
  const coords = { z: 8, x: 63, y: 114 };
  await storeTile(source, coords, new Blob(["tile"], { type: "image/png" }), { maxAge: 10 });
  const record = await getStoredTile(source, coords);
  assert.equal(await record.blob.text(), "tile");
  assert.equal(record.expiresAt - record.storedAt, 10);
  assert.ok(record.retainUntil - record.storedAt >= 7 * 86400000);
  assert.deepEqual({ count: (await mapStats()).count, bytes: (await mapStats()).bytes }, { count: 1, bytes: 4 });
});
test("download resumes by reusing existing tiles rather than requesting them again", async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; return tileResponse(); };
  const first = await downloadMapPack({ source, bounds: area, maxZoom: 9, maxBytes: 32 * 1024 ** 2 });
  assert.ok(first.total > 0);
  const networkCount = requests;
  const resumed = await downloadMapPack({ source, bounds: area, maxZoom: 9, maxBytes: 32 * 1024 ** 2 });
  assert.equal(requests, networkCount);
  assert.equal(resumed.reused, resumed.total);
  assert.equal(resumed.downloaded, 0);
});
test("an oversized state download stops before any network request", async () => {
  globalThis.fetch = async () => { assert.fail("No request should be issued"); };
  await assert.rejects(downloadMapPack({ source, bounds: CAMPECHE, maxZoom: 15, maxBytes: 32 * 1024 ** 2 }), /estimación supera/);
});
test("OSM bulk download is blocked independently of the UI", async () => {
  globalThis.fetch = async () => { assert.fail("The public tile server must not be prefetched"); };
  await assert.rejects(downloadMapPack({ source: { ...DEFAULT_MAP_CONFIG.online, offlineAllowed: true }, bounds: area, maxZoom: 8, maxBytes: 1e6 }), /no permite descarga/);
});
test("a previously cancelled download sends no requests and records a partial pack", async () => {
  globalThis.fetch = async () => { assert.fail("Cancelled request"); };
  const controller = new AbortController(); controller.abort();
  await assert.rejects(downloadMapPack({ source, bounds: area, maxZoom: 8, maxBytes: 32 * 1024 ** 2, signal: controller.signal }), { name: "AbortError" });
  assert.equal((await mapStats()).lastPack.complete, false);
});
test("provider failures stop the download and permit a subsequent retry", async () => {
  globalThis.fetch = async () => new Response("Missing", { status: 404 });
  await assert.rejects(downloadMapPack({ source, bounds: area, maxZoom: 8, maxBytes: 32 * 1024 ** 2 }), /404/);
  globalThis.fetch = async () => tileResponse();
  assert.equal((await downloadMapPack({ source, bounds: area, maxZoom: 8, maxBytes: 32 * 1024 ** 2 })).completed > 0, true);
});
test("the browser storage quota is checked before starting a download", async () => {
  Object.defineProperty(navigator, "storage", { configurable: true, value: { estimate: async () => ({ quota: 10000, usage: 9000 }) } });
  globalThis.fetch = async () => { assert.fail("Quota failure must not download data"); };
  await assert.rejects(downloadMapPack({ source, bounds: area, maxZoom: 8, maxBytes: 32 * 1024 ** 2 }), /espacio disponible/);
});
test("a provider no-store response is not persisted even for an authorized source", async () => {
  globalThis.fetch = async () => new Response(new Blob(["tile"], { type: "image/png" }), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
  await assert.rejects(downloadMapPack({ source, bounds: area, maxZoom: 8, maxBytes: 32 * 1024 ** 2 }), /prohíbe almacenar/);
  assert.equal((await mapStats()).count, 0);
});
test("cancelling an in-flight pack retains completed tiles for resume", async () => {
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    if (++calls === 1) return tileResponse();
    return new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
    });
  };
  const controller = new AbortController();
  const download = downloadMapPack({ source, bounds: area, maxZoom: 9, maxBytes: 32 * 1024 ** 2, signal: controller.signal });
  const first = enumerateTiles(area, 9).next().value;
  let found = null;
  for (let attempt = 0; attempt < 100 && !found; attempt++) {
    found = await getStoredTile(source, first);
    if (!found) await new Promise((resolve) => setTimeout(resolve, 2));
  }
  controller.abort();
  await assert.rejects(download, { name: "AbortError" });
  assert.ok(found);
  assert.equal((await mapStats()).count, 1);
  assert.equal((await mapStats()).lastPack.complete, false);
});
