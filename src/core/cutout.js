// src/core/cutout.js
// Person cutout (background removal) using MediaPipe Tasks Vision (browser-only).
//
// Design goals:
// - No new build-time dependency (works on GitHub Pages): dynamic import from CDN.
// - Robust against async races: if model load fails, just return null.
// - Minimal surface area: caller supplies an Image/Canvas and gets a Canvas with alpha.

let _segmenterPromise = null;
let _segmenter = null;

async function getSegmenter() {
  if (_segmenter) return _segmenter;
  if (_segmenterPromise) return _segmenterPromise;

  _segmenterPromise = (async () => {
    // Pinned version (avoid breaking changes).
    const TASKS_VER = '0.10.14';
    // Vite: remote URL import needs @vite-ignore.
    const visionMod = await import(
      /* @vite-ignore */ `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VER}/vision_bundle.mjs`
    );

    const { ImageSegmenter, FilesetResolver } = visionMod;

    // WASM assets on CDN.
    const vision = await FilesetResolver.forVisionTasks(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VER}/wasm`
    );

    // Selfie segmenter: optimized for people.
    const modelUrl =
      'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite';

    // Try GPU first; fallback to CPU if GPU fails.
    async function create(delegate) {
      return await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelUrl,
          delegate,
        },
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
    }

    try {
      _segmenter = await create('GPU');
    } catch (e) {
      console.warn('[cutout] GPU delegate failed, fallback to CPU', e);
      _segmenter = await create('CPU');
    }

    return _segmenter;
  })();

  return _segmenterPromise;
}

function asCanvasLike(src) {
  if (!src) return null;
  if (src instanceof HTMLCanvasElement) return src;
  if (src instanceof HTMLImageElement) {
    const c = document.createElement('canvas');
    const w = src.naturalWidth || src.width || 1;
    const h = src.naturalHeight || src.height || 1;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0, w, h);
    return c;
  }
  return null;
}

/**
 * Cut out person foreground.
 * @param {HTMLCanvasElement|HTMLImageElement} src
 * @param {object} [opt]
 * @param {number} [opt.softness]   Edge softness (0..1). Higher -> smoother.
 * @param {number} [opt.t0]         Lower threshold (0..1).
 * @param {number} [opt.t1]         Upper threshold (0..1).
 * @returns {Promise<HTMLCanvasElement|null>}  Canvas with alpha, or null if failed.
 */
export async function cutoutPerson(src, opt = {}) {
  try {
    const seg = await getSegmenter();
    const srcCanvas = asCanvasLike(src);
    if (!seg || !srcCanvas) return null;

    const w = srcCanvas.width;
    const h = srcCanvas.height;
    if (w <= 1 || h <= 1) return null;

    // Segment
    const res = seg.segment(srcCanvas);
    if (!res || !res.categoryMask) return null;

    // Mask values may be uint8 [0..255] or float [0..1].
    const mask = res.categoryMask.getAsFloat32Array
      ? res.categoryMask.getAsFloat32Array()
      : res.categoryMask.getAsUint8Array();
    if (!mask || mask.length < w * h) return null;

    // Build output with alpha.
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const octx = out.getContext('2d');
    octx.drawImage(srcCanvas, 0, 0);
    const im = octx.getImageData(0, 0, w, h);
    const data = im.data;

    const t0 = typeof opt.t0 === 'number' ? opt.t0 : 0.35;
    const t1 = typeof opt.t1 === 'number' ? opt.t1 : 0.55;
    const softness = typeof opt.softness === 'number' ? opt.softness : 0.25;

    // Detect range
    let maxV = 0;
    for (let i = 0; i < Math.min(mask.length, 1024); i++) {
      if (mask[i] > maxV) maxV = mask[i];
    }
    const needScale255 = maxV > 1.5;

    const inv = 1 / Math.max(1e-6, (t1 - t0));
    for (let i = 0; i < w * h; i++) {
      let m = mask[i];
      if (needScale255) m = m / 255;
      // Smooth step-ish
      let a = (m - t0) * inv;
      if (a < 0) a = 0;
      if (a > 1) a = 1;

      // Additional softness near edge
      if (softness > 0) {
        // Ease curve: reduce harsh transitions
        const s = softness;
        a = a * (1 - s) + (a * a * (3 - 2 * a)) * s;
      }

      data[i * 4 + 3] = Math.round(a * 255);
    }

    octx.putImageData(im, 0, 0);
    return out;
  } catch (e) {
    console.warn('[cutout] failed', e);
    return null;
  }
}
