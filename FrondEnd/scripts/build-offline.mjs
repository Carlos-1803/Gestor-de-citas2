import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const dist = new URL('../dist/', import.meta.url);
async function files(folder, prefix = '') {
  const result = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await files(new URL(entry.name + '/', folder), name + '/'));
    else result.push(name);
  }
  return result;
}
const paths = (await files(dist)).filter(path => path === 'index.html' || path === 'manifest.json'
  || path === 'logo-kiin.png' || path === 'favicon.svg' || path === 'icons.svg'
  || path.startsWith('assets/') || path.startsWith('fonts/') || path.startsWith('ra/') || path.startsWith('pwa/')).sort();
if (!paths.some(path => path.endsWith('.wasm')) || !paths.includes('ra/face_landmarker.task')) throw new Error('Faltan recursos RA locales.');
const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const hash = createHash('sha256').update(source);
let bytes = 0;
for (const path of paths) { const data = await readFile(new URL(path, dist)); hash.update(path).update(data); bytes += (await stat(new URL(path, dist))).size; }
const build = { version: hash.digest('hex').slice(0, 16), files: paths.map(path => '/' + path), bytes };
await writeFile(new URL('sw.js', dist), source.replace('const BUILD = { version: "development", files: [], bytes: 0 };', 'const BUILD = ' + JSON.stringify(build) + ';'));
console.log(`App Shell + RA offline: ${paths.length} recursos, ${(bytes / 1024 / 1024).toFixed(1)} MiB.`);
