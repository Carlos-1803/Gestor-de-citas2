import { copyFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const target = new URL('public/ra/vision/', root);
await mkdir(target, { recursive: true });
for (const file of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_module_internal.js', 'vision_wasm_module_internal.wasm']) {
  await copyFile(new URL('node_modules/@mediapipe/tasks-vision/wasm/' + file, root), new URL(file, target));
}
const model = new URL('public/ra/face_landmarker.task', root);
if ((await stat(model)).size < 1000000) throw new Error('Falta el modelo facial local: ' + fileURLToPath(model));
console.log('Detector y runtime RA locales preparados.');
