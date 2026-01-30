import { clamp } from '../core/utils.js';
import { OBJECT_SCALE, FOOT_PIVOT_FRAC } from '../core/config.js';
import { TARGETS } from '../core/config.js';

export function getTarget(state) {
  return TARGETS.find(t => t.key === state.targetKey) || TARGETS[0];
}

export function computeLayout(canvas, targetImg, state) {
  const W = canvas.width;
  const H = canvas.height;
  const minDim = Math.min(W, H);

  const baseH = minDim * 0.52;
  const objH = baseH * OBJECT_SCALE;

  const aspect = targetImg.width / Math.max(1, targetImg.height);
  let objW = objH * aspect;
  objW = clamp(objW, objH * 0.30, objH * 0.85);

  const cx = W * 0.5;
  const cy = H * 0.58;

  const startXL = W * 0.25;
  const startXR = W * 0.75;
  const startY = cy - objH * 0.10;

  const tgt = getTarget(state);
  let pivotX = cx;
  let pivotY = cy;

  if (tgt.type === 'bag') {
    pivotY = cy - objH * 0.55;
  } else {
    pivotY = cy + objH * 0.5 - objH * FOOT_PIVOT_FRAC;
  }

  return {
    W, H, minDim,
    objW, objH,
    cx, cy,
    pivotX, pivotY,
    startXL, startXR, startY,
  };
}
