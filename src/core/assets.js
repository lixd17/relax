import { TARGETS, ASSET } from './config.js';
import { loadImage } from './utils.js';

export async function loadAllImages() {
  const fist = await loadImage(ASSET.fist);

  const targets = new Map();
  await Promise.all(
    TARGETS.map(async (t) => {
      const img = await loadImage(t.src);
      targets.set(t.key, img);
    })
  );

  return { fist, targets };
}
