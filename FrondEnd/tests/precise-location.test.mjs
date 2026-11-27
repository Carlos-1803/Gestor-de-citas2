import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestPreciseLocation } from '../src/maps/preciseLocation.js';
const position = (accuracy = 12) => ({ coords: { latitude: 18.1869, longitude: -91.0422, accuracy } });
function mock() {
  const calls = [];
  const geo = { getCurrentPosition(success, error, options) { calls.push({ success, error, options }); } };
  return { geo, calls };
}
test('successful GPS returns form coordinates with the requested browser options', async () => {
  const { geo, calls } = mock();
  const pending = requestPreciseLocation({ geolocation: geo });
  assert.deepEqual(calls[0].options, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  calls[0].success(position());
  assert.deepEqual(await pending, { latitude: 18.1869, longitude: -91.0422, accuracy: 12, fallback: false });
});
test('timeout retries once with network accuracy and accepts approximate positions', async () => {
  const { geo, calls } = mock();
  let fallbacks = 0;
  const pending = requestPreciseLocation({ geolocation: geo, onFallback: () => fallbacks++ });
  calls[0].error({ code: 3 });
  assert.equal(fallbacks, 1);
  assert.deepEqual(calls[1].options, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
  calls[1].success(position(5000));
  assert.equal((await pending).fallback, true);
});
for (const [code, name] of [[1, 'PERMISSION_DENIED'], [2, 'POSITION_UNAVAILABLE'], [3, 'TIMEOUT']]) {
  test(`reports ${name} (${code}) without endless retries`, async () => {
    const { geo, calls } = mock();
    const pending = requestPreciseLocation({ geolocation: geo });
    calls[0].error({ code });
    if (code === 3) calls[1].error({ code });
    await assert.rejects(pending, (error) => error.code === code && error.message.includes(`${name} (${code})`));
    assert.equal(calls.length, code === 3 ? 2 : 1);
  });
}
test('manual cancellation ignores late positions and prevents fallback', async () => {
  const { geo, calls } = mock();
  const controller = new AbortController();
  const pending = requestPreciseLocation({ geolocation: geo, signal: controller.signal });
  controller.abort();
  calls[0].success(position());
  calls[0].error({ code: 3 });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(calls.length, 1);
});
test('pre-cancelled requests do not ask for location', async () => {
  const { geo, calls } = mock();
  await assert.rejects(requestPreciseLocation({ geolocation: geo, signal: AbortSignal.abort() }), { name: 'AbortError' });
  assert.equal(calls.length, 0);
});
test('invalid coordinates never reach the form', async () => {
  const { geo, calls } = mock();
  const pending = requestPreciseLocation({ geolocation: geo });
  calls[0].success({ coords: { latitude: NaN, longitude: 0 } });
  await assert.rejects(pending, /POSITION_UNAVAILABLE/);
});

test('GPS can be requested again after a manual adjustment without reusing a previous result', async () => {
  const { geo, calls } = mock();
  const first = requestPreciseLocation({ geolocation: geo });
  calls[0].success(position());
  assert.equal((await first).latitude, 18.1869);
  const second = requestPreciseLocation({ geolocation: geo });
  const moved = { coords: { latitude: 19.8301, longitude: -90.5349, accuracy: 20 } };
  calls[1].success(moved);
  assert.equal((await second).latitude, 19.8301);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ options }) => options.maximumAge === 0));
});

test('a cancelled request cannot overwrite a later GPS selection', async () => {
  const { geo, calls } = mock();
  const controller = new AbortController();
  const first = requestPreciseLocation({ geolocation: geo, signal: controller.signal });
  controller.abort();
  await assert.rejects(first, { name: 'AbortError' });
  const second = requestPreciseLocation({ geolocation: geo });
  calls[0].success(position());
  calls[1].success({ coords: { latitude: 19.8301, longitude: -90.5349, accuracy: 20 } });
  assert.equal((await second).latitude, 19.8301);
});
