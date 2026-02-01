import { TARGETS, WEAPONS, VEHICLES, ASSET } from './config.js';
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
      // ✅ custom target 无 src，跳过
      if (!t.src) return;
      const img = await loadImageSafe(t.src);
      if (img) targets.set(t.key, img);
    })
  );

  // weapons（缺图不崩：fallback 到 fist）
  const weapons = new Map();
  await Promise.all(
    WEAPONS.map(async (w) => {
      const img = await loadImageSafe(w.src);
      weapons.set(w.key, img ?? fist);
    })
  );

  // vehicles（缺图不崩：fallback 到 fist）
  const vehicles = new Map();
  await Promise.all(
    VEHICLES.map(async (v) => {
      const img = await loadImageSafe(v.src);
      vehicles.set(v.key, img ?? fist);
    })
  );

  return { fist, targets, weapons, vehicles };
}
