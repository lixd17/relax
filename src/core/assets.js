import { TARGETS, WEAPONS, ASSET } from './config.js';
import { loadImage } from './utils.js';

async function loadImageSafe(src) {
  try {
    const img = await loadImage(src);
    return img;
  } catch (e) {
    console.warn('[assets] failed to load:', src, e);
    return null;
  }
}

export async function loadAllImages() {
  // fist 作为兜底：必须能加载
  const fist = await loadImage(ASSET.fist);

  const targets = new Map();
  await Promise.all(
    TARGETS.map(async (t) => {
      const img = await loadImage(t.src);
      targets.set(t.key, img);
    })
  );

  // ✅ weapons（缺图不崩：fallback 到 fist）
  const weapons = new Map();
  await Promise.all(
    WEAPONS.map(async (w) => {
      const img = await loadImageSafe(w.src);
      weapons.set(w.key, img ?? fist);
    })
  );

  return { fist, targets, weapons };
}
