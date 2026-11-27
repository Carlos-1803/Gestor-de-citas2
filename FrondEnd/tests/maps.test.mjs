import { test } from "node:test";
import assert from "node:assert/strict";
import { CAMPECHE, ancestorCrop, countTiles, enumerateTiles, inCampeche, intersectCampeche } from "../src/maps/mapRegion.js";
import { DEFAULT_MAP_CONFIG, sourceKey, validateSource } from "../src/maps/mapConfig.js";

test("Campeche coverage matches the requested bounds and a practical download estimate", () => {
  assert.ok(inCampeche(18.1869, -91.0422));
  assert.ok(inCampeche(19.8301, -90.5349));
  assert.equal(inCampeche(20.9674, -89.5926), false);
  assert.equal(inCampeche(NaN, -91), false);
  assert.equal(countTiles(CAMPECHE, 15), 121316);
  assert.equal(countTiles(CAMPECHE, 11), 578);
  assert.equal([...enumerateTiles(CAMPECHE, 8)].length, 12);
});
test("an urban pack includes the statewide zoom-8 base for fallback", () => {
  const city = { minLat: 18.17, maxLat: 18.20, minLon: -91.06, maxLon: -91.02 };
  const pack = [...enumerateTiles(city, 12, true)];
  assert.equal(pack.filter((tile) => tile.z === 8).length, 12);
  assert.equal(pack.length, countTiles(city, 12, true));
  assert.equal(new Set(pack.map((tile) => `${tile.z}/${tile.x}/${tile.y}`)).size, pack.length);
});
test("cached parents are cropped to the exact child, not stretched as the full parent", () => {
  assert.deepEqual(ancestorCrop({ z: 15, x: 7, y: 5 }, 13), { x: 1, y: 1, z: 13, sx: 192, sy: 64, size: 64 });
});
test("visible bounds are clipped to Campeche and fully unrelated areas are rejected", () => {
  assert.deepEqual(intersectCampeche({ minLat: 17, maxLat: 22, minLon: -94, maxLon: -88 }), CAMPECHE);
  assert.equal(intersectCampeche({ minLat: 30, maxLat: 31, minLon: -120, maxLon: -119 }), null);
});
test("the public OSM service and subdomains cannot be used for bulk offline download", () => {
  for (const host of ["tile.openstreetmap.org", "a.tile.openstreetmap.org", "openstreetmap.org"]) {
    assert.throws(() => validateSource({ ...DEFAULT_MAP_CONFIG.online, urlTemplate: `https://${host}/{z}/{x}/{y}.png`, offlineAllowed: true }, true), /no permite descarga/);
  }
  assert.doesNotThrow(() => validateSource(DEFAULT_MAP_CONFIG.online));
  assert.throws(() => validateSource({ id: "own", urlTemplate: "/map-tiles/{z}/{x}/{y}.png" }, true), /no permite/);
  assert.doesNotThrow(() => validateSource({ id: "own", urlTemplate: "/map-tiles/{z}/{x}/{y}.png", offlineAllowed: true }, true));
});
test("a change in tile source cannot reuse incompatible cached tiles", () => {
  assert.notEqual(sourceKey(DEFAULT_MAP_CONFIG.online), sourceKey({ ...DEFAULT_MAP_CONFIG.online, urlTemplate: "https://example.org/{z}/{x}/{y}.png" }));
});
