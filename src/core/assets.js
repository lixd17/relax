import { TARGETS, WEAPONS, VEHICLES, BACKGROUNDS, ASSET } from './config.js';
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
  // fist 兜底：必须加载成功
  const fist = await loadImage(ASSET.fist);

  // targets（custom 没 src：跳过）
  const targets = new Map();
  await Promise.all(
    TARGETS.map(async (t) => {
      if (!t.src) return;
      const img = await loadImageSafe(t.src);
      if (img) targets.set(t.key, img);
    })
  );

  // weapons（缺图 fallback fist）
  const weapons = new Map();
  await Promise.all(
    WEAPONS.map(async (w) => {
      const img = await loadImageSafe(w.src);
      weapons.set(w.key, img ?? fist);
    })
  );

  // vehicles（缺图 fallback fist）
  const vehicles = new Map();
  await Promise.all(
    VEHICLES.map(async (v) => {
      const img = await loadImageSafe(v.src);
      vehicles.set(v.key, img ?? fist);
    })
  );

  // backgrounds（缺图则跳过；render 会回退到默认渐变）
  const backgrounds = new Map();
  await Promise.all(
    (BACKGROUNDS || []).map(async (b) => {
      const img = await loadImageSafe(b.src);
      if (img) backgrounds.set(b.key, img);
    })
  );

  return { fist, targets, weapons, vehicles, backgrounds };
}
