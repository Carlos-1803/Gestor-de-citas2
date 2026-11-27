import { generateHairTextures } from './hairStrands.js';

// Worker generation + bounded, reference-counted LRU. No canvas painting in rAF.
const cache = new Map(), pending = new Map();
let worker = null, counter = 0;
function prune() {
  const unused = [...cache.entries()].filter(([, entry]) => entry.refs === 0);
  while (unused.length > 2) {
    const [id, entry] = unused.shift(); cache.delete(id);
    for (const name of ['rear', 'front', 'shadow']) entry[name].close?.();
  }
}
async function bake(key, tone) {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    await new Promise(resolve => setTimeout(resolve, 0));
    return generateHairTextures(key, tone);
  }
  if (!worker) {
    worker = new Worker(new URL('./strandWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = event => {
      const { id, error, ...value } = event.data, job = pending.get(id);
      if (!job) return;
      pending.delete(id); clearTimeout(job.timer);
      if (error) job.reject(new Error(error)); else job.resolve(value);
    };
    worker.onerror = () => {
      for (const job of pending.values()) { clearTimeout(job.timer); job.reject(new Error('No se pudo preparar la textura capilar.')); }
      pending.clear(); worker.terminate(); worker = null;
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++counter;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('La textura tardó demasiado. Intenta de nuevo.')); }, 20000);
    pending.set(id, { resolve, reject, timer }); worker.postMessage({ id, key, tone });
  });
}
export async function acquireHairTextures(key, tone) {
  const id = key + ':' + tone;
  let entry = cache.get(id);
  if (!entry) {
    entry = { refs: 0, promise: null };
    entry.promise = bake(key, tone).then(value => Object.assign(entry, value)).catch(error => { cache.delete(id); throw error; });
    cache.set(id, entry);
  }
  entry.refs++;
  try { await entry.promise; }
  catch (error) { entry.refs--; throw error; }
  cache.delete(id); cache.set(id, entry); prune();
  return entry;
}
export function releaseHairTextures(entry) { if (entry) { entry.refs--; prune(); } }
