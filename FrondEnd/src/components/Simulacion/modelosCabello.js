import * as THREE from 'three';
import { HAIR_STYLES } from './hairCatalog.js';
import { acquireHairTextures, releaseHairTextures } from './strandTextures.js';

function surface(depth) {
  // A gently curved transparent image surface, not an opaque scalp/helmet.
  const geometry = new THREE.PlaneGeometry(1.7, 1.65, 24, 24), positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i) + .025;
    const curvature = Math.sqrt(Math.max(0, 1 - (x / .68) ** 2));
    positions.setXYZ(i, x, y, depth + curvature * .15);
  }
  geometry.computeVertexNormals(); return geometry;
}
function texture(image) {
  const value = new THREE.CanvasTexture(image);
  value.colorSpace = THREE.SRGBColorSpace;
  value.minFilter = THREE.LinearFilter; value.magFilter = THREE.LinearFilter;
  value.generateMipmaps = false;
  // Canvas is not flipped for ImageBitmap uploads by WebGL; uv is adjusted below.
  value.flipY = !(typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap);
  return value;
}
function bind(group, set) {
  for (const layer of group.userData.layers) {
    const image = set[layer.userData.layer];
    layer.material.map?.dispose(); layer.material.map = texture(image);
    layer.geometry.attributes.uv.copy(layer.userData.originalUv);
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
      const uv = layer.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
      uv.needsUpdate = true;
    }
    layer.material.needsUpdate = true; layer.material.visible = true;
  }
}
function load(group, tone, acquire, release) {
  const generation = ++group.userData.generation;
  group.userData.loading = true;
  const promise = acquire(group.userData.style, tone).then(set => {
    if (group.userData.disposed || generation !== group.userData.generation) { release(set); return; }
    bind(group, set); release(group.userData.textureSet); group.userData.textureSet = set;
    group.userData.loading = false; group.userData.stats = set.stats;
    group.userData.fringe = set.profile.fringe;
  }).catch(error => {
    if (!group.userData.disposed && generation === group.userData.generation) { group.userData.loading = false; group.userData.error = error; }
  });
  group.userData.ready = promise;
}
export function crearModeloCabello(key = 'classic', tone = '#24160e', {
  acquire = acquireHairTextures, release = releaseHairTextures,
} = {}) {
  if (!HAIR_STYLES.some(style => style.key === key)) throw new Error(`Filtro desconocido: ${key}`);
  const group = new THREE.Group(); group.name = `StrandHair-${key}`;
  Object.assign(group.userData, { style: key, generation: 0, disposed: false, layers: [], release, acquire });
  // Depth-only face occluder: has no visible color and never fills a hair shape.
  const mask = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true }));
  mask.position.set(0, -.54, -.13); mask.scale.set(.45, .56, .40); mask.renderOrder = -1; group.add(mask);
  for (const [index, name] of ['shadow', 'rear', 'front'].entries()) {
    const depth = name === 'shadow' ? .17 : name === 'rear' ? (key === 'mullet' ? -.32 : .08) : .27;
    const geometry = surface(depth);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ transparent: true,
      opacity: 1, depthWrite: false, side: THREE.DoubleSide, alphaTest: .001 }));
    // Empty material remains invisible until worker-generated textures are ready.
    mesh.material.visible = false;
    mesh.userData.layer = name; mesh.userData.originalUv = geometry.attributes.uv.clone();
    mesh.renderOrder = index; mesh.frustumCulled = false;
    group.userData.layers.push(mesh); group.add(mesh);
  }
  load(group, tone, acquire, release);
  return group;
}
export function cambiarTonoCabello(group, tone) {
  if (group && !group.userData.disposed) load(group, tone, group.userData.acquire, group.userData.release);
}
export function liberarModeloCabello(group) {
  if (!group || group.userData.disposed) return;
  group.userData.disposed = true; group.userData.generation++;
  group.userData.release(group.userData.textureSet);
  group.traverse(mesh => { if (mesh.isMesh) { mesh.material.map?.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); } });
  group.clear();
}
