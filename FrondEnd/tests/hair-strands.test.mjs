import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { generateHairTextures, colorPalette } from '../src/components/Simulacion/hairStrands.js';
function inspect(canvas) {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const alphas = new Set(), colors = new Set(); let clear = 0, painted = 0, solid = 0;
  for (let i = 0; i < data.length; i += 4) {
    alphas.add(data[i + 3]);
    if (!data[i + 3]) clear++; else { painted++; colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`); }
    if (data[i + 3] === 255) solid++;
  }
  return { alphas, colors, clear, painted, solid };
}
test('curls are layered translucent strands with tonal variation and no opaque undercoat', () => {
  const result = generateHairTextures('curls', '#24160e', { createSurface: createCanvas, size: 256 });
  assert.ok(result.stats.curls > 3000);
  for (const name of ['rear', 'front']) {
    const pixels = inspect(result[name]);
    assert.ok(pixels.clear > pixels.painted, 'background outside individual hair remains transparent');
    assert.ok(pixels.alphas.size > 100, 'soft perimeter and alpha variation');
    assert.ok(pixels.colors.size > 100, 'highlights/lowlights instead of a single flat color');
    assert.ok(pixels.solid < pixels.painted * .6, 'no solid helmet');
  }
  const shadow = inspect(result.shadow);
  assert.ok(shadow.painted > 0 && shadow.solid === 0);
});
test('all fade variants use thousands of short hairs with progressive density', () => {
  for (const key of ['skin', 'low', 'mid', 'high', 'taper']) {
    const result = generateHairTextures(key, '#4b2f20', { createSurface: createCanvas, size: 128 });
    assert.ok(result.stats.stubble > 2000, key);
    assert.ok(inspect(result.rear).alphas.size > 50, key);
  }
});
test('changing base tone changes pixel colors without changing strand placement', () => {
  const dark = generateHairTextures('curls', '#24160e', { createSurface: createCanvas, size: 128 });
  const light = generateHairTextures('curls', '#c08a54', { createSurface: createCanvas, size: 128 });
  const a = dark.front.getContext('2d').getImageData(0, 0, 128, 128).data;
  const b = light.front.getContext('2d').getImageData(0, 0, 128, 128).data;
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) { assert.equal(a[i + 3], b[i + 3]); if (a[i] !== b[i]) changed++; }
  assert.ok(changed > 1000);
  assert.throws(() => colorPalette('not-a-color'));
});
