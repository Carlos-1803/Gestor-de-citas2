import { generateHairTextures } from './hairStrands.js';
self.onmessage = event => {
  const { id, key, tone } = event.data;
  try {
    const set = generateHairTextures(key, tone);
    const layers = { rear: set.rear.transferToImageBitmap(), front: set.front.transferToImageBitmap(), shadow: set.shadow.transferToImageBitmap() };
    self.postMessage({ id, ...layers, stats: set.stats, profile: set.profile }, Object.values(layers));
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
