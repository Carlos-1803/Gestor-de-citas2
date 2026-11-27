import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { HAIR_STYLES, styleForName, linkCatalog } from '../src/components/Simulacion/hairCatalog.js';
import { crearModeloCabello, cambiarTonoCabello, liberarModeloCabello } from '../src/components/Simulacion/modelosCabello.js';
import { createCanvas } from '@napi-rs/canvas';
import { generateHairTextures } from '../src/components/Simulacion/hairStrands.js';
import { fitFace, viewportPose, safeHairOffset } from '../src/components/Simulacion/facePose.js';

test('all 20 database catalog names map one-to-one, independent of ID or ordering', async () => {
  const seed = await readFile(new URL('../../BackEnd/Data/Seed.cs', import.meta.url), 'utf8');
  const names = [...seed.match(/string\[\] cuts = \[([^\]]+)\]/)[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
  assert.equal(HAIR_STYLES.length, 20);
  assert.deepEqual(HAIR_STYLES.map(s => s.name).sort(), names.sort());
  const rows = names.reverse().map((name, i) => ({ id: i + 150, name }));
  const linked = linkCatalog(rows);
  for (const cut of linked) assert.equal(rows.find(r => r.id === cut.haircutId).name, cut.name);
  assert.equal(styleForName('  CORTE CLÁSICO ').key, 'classic');
  assert.equal(styleForName('desconocido'), null);
  assert.equal(linkCatalog([]).length, 20);
});
test('all 20 styles render distinct transparent strand textures and release GPU resources', async () => {
  const signatures = new Set();
  for (const style of HAIR_STYLES) {
    const group = crearModeloCabello(style.key, '#24160e', {
      acquire: async (key, tone) => generateHairTextures(key, tone, { size: 256, createSurface: createCanvas }), release() {},
    });
    assert.ok(group.userData.layers.every(layer => !layer.material.visible));
    await group.userData.ready;
    assert.equal(group.userData.error, undefined, style.name);
    const hash = createHash('sha256');
    let disposed = 0;
    group.traverse(mesh => {
      if (!mesh.isMesh) return;
      assert.ok(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite));
      mesh.geometry.addEventListener('dispose', () => disposed++);
      if (mesh.material.colorWrite) {
        assert.ok(mesh.material.map?.isTexture, 'every visible layer must have a strand/gradient texture');
        hash.update(mesh.material.map.image.toBuffer('image/png'));
      }
    });
    signatures.add(hash.digest('hex'));
    cambiarTonoCabello(group, '#c08a54'); await group.userData.ready;
    assert.equal(group.userData.error, undefined);
    liberarModeloCabello(group); assert.equal(disposed, 4); assert.equal(group.children.length, 0);
  }
  assert.equal(signatures.size, 20);
  assert.throws(() => crearModeloCabello('unknown'));
});
test('stale preparation cannot expose blank white planes or replace a newer tone', async () => {
  const jobs = [], released = [];
  const group = crearModeloCabello('curls', '#24160e', {
    acquire: () => new Promise(resolve => jobs.push(resolve)), release: set => { if (set) released.push(set); },
  });
  const oldReady = group.userData.ready;
  cambiarTonoCabello(group, '#c08a54');
  const set = generateHairTextures('curls', '#24160e', { size: 128, createSurface: createCanvas });
  jobs[0](set); await oldReady;
  assert.ok(group.userData.layers.every(layer => !layer.material.visible));
  assert.equal(released.length, 1);
  jobs[1](set); await group.userData.ready;
  assert.ok(group.userData.layers.every(layer => layer.material.visible && layer.material.map));
  liberarModeloCabello(group);
});
function face() {
  const points = [];
  points[10] = { x: .5, y: .2 }; points[152] = { x: .5, y: .8 };
  points[127] = { x: .2, y: .5 }; points[356] = { x: .8, y: .5 }; points[1] = { x: .5, y: .5 };
  return points;
}
test('photo and mirrored video align with contain letterboxing, scale and height', () => {
  const pose = fitFace(face(), 400, 600);
  assert.ok(Math.abs(pose.width - 240) < 1e-9);
  assert.ok(pose.crown.y < face()[10].y);
  const base = viewportPose(pose, 400, 600, 800, 600);
  assert.equal(base.position[0], 0);
  assert.ok(base.position[1] > 0);
  const moved = viewportPose(pose, 400, 600, 800, 600, 1.2, .1);
  assert.equal(moved.scale[0], base.scale[0] * 1.2);
  assert.ok(moved.position[1] > base.position[1]);
  const shifted = face(); shifted[10].x = .6;
  const normal = fitFace(shifted, 400, 600), mirrored = fitFace(shifted, 400, 600, true);
  assert.equal(mirrored.x, 1 - normal.x);
  assert.equal(fitFace([], 400, 600), null);
  assert.equal(viewportPose(pose, 0, 600, 800, 600), null);
});

test('forehead/glabella and eyebrow landmarks constrain downward adjustment even at maximum scale', () => {
  const points = face(); points[9] = { x: .5, y: .38 }; points[105] = { x: .35, y: .4 }; points[334] = { x: .65, y: .4 };
  const pose = fitFace(points, 400, 600);
  assert.ok(pose.browY < 0);
  const offset = safeHairOffset(pose, 1.4, .1, -.3);
  assert.ok(offset > -.3);
  assert.ok(offset - .125 * 1.4 * pose.stretch >= pose.browY + .044);
});
