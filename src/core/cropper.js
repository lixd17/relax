// src/core/cropper.js
// Minimal manual crop modal for a canvas/image.
// - Pointer-friendly: click-drag to create selection; drag inside to move; drag corners to resize.
// - Returns a cropped canvas.

import { clamp } from './utils.js';

function makeEl(tag, cls, html) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
}

function canvasFrom(src) {
  if (!src) return null;
  if (src instanceof HTMLCanvasElement) return src;
  if (src instanceof HTMLImageElement) {
    const c = document.createElement('canvas');
    const w = src.naturalWidth || src.width || 1;
    const h = src.naturalHeight || src.height || 1;
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(src, 0, 0, w, h);
    return c;
  }
  return null;
}

function cropCanvas(srcCanvas, rect) {
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const w = Math.round(rect.w);
  const h = Math.round(rect.h);
  const out = document.createElement('canvas');
  out.width = Math.max(1, w);
  out.height = Math.max(1, h);
  const ctx = out.getContext('2d');
  ctx.drawImage(srcCanvas, x, y, w, h, 0, 0, w, h);
  return out;
}

function defaultRect(w, h) {
  const pad = Math.round(Math.min(w, h) * 0.06);
  return {
    x: pad,
    y: pad,
    w: Math.max(1, w - pad * 2),
    h: Math.max(1, h - pad * 2),
  };
}

function hitCorner(px, py, r, corner, rad = 10) {
  const dx = px - corner.x;
  const dy = py - corner.y;
  return (dx * dx + dy * dy) <= rad * rad;
}

/**
 * Open cropper modal.
 * @param {HTMLCanvasElement|HTMLImageElement} src
 * @param {object} opt
 * @param {string} [opt.title]
 * @param {object} [opt.initialRect]  In source image pixels.
 * @returns {Promise<{canvas: HTMLCanvasElement, rect: {x,y,w,h}}|null>}
 */
export function openCropper(src, opt = {}) {
  const srcCanvas = canvasFrom(src);
  if (!srcCanvas) return Promise.resolve(null);

  // HMR cleanup
  document.getElementById('cropModal')?.remove();

  const title = opt.title ?? '手动裁剪';
  const W = srcCanvas.width;
  const H = srcCanvas.height;

  let rect = opt.initialRect
    ? { ...opt.initialRect }
    : defaultRect(W, H);

  rect.x = clamp(rect.x, 0, W - 2);
  rect.y = clamp(rect.y, 0, H - 2);
  rect.w = clamp(rect.w, 2, W - rect.x);
  rect.h = clamp(rect.h, 2, H - rect.y);

  const overlay = makeEl('div');
  overlay.id = 'cropModal';

  const card = makeEl('div', 'cropCard');
  overlay.appendChild(card);

  card.appendChild(
    makeEl(
      'div',
      'cropHeader',
      `<div class="cropTitle">${title}</div><button id="cropClose" type="button" aria-label="close">✕</button>`
    )
  );

  const body = makeEl('div', 'cropBody');
  card.appendChild(body);

  const hint = makeEl(
    'div',
    'cropHint',
    '拖拽框选范围；拖拽框内可移动；拖拽四角可缩放。'
  );
  body.appendChild(hint);

  const view = makeEl('canvas', 'cropCanvas');
  body.appendChild(view);

  const footer = makeEl(
    'div',
    'cropFooter',
    `<button id="cropReset" type="button">重置</button>
     <div style="flex:1"></div>
     <button id="cropApply" type="button" class="primary">应用</button>`
  );
  card.appendChild(footer);

  document.body.appendChild(overlay);

  // Fit source into view canvas
  const maxW = Math.min(92 * window.innerWidth / 100, 560);
  const maxH = Math.min(62 * window.innerHeight / 100, 520);

  const s = Math.min(maxW / W, maxH / H, 1);
  view.width = Math.max(1, Math.round(W * s));
  view.height = Math.max(1, Math.round(H * s));

  const vctx = view.getContext('2d');

  function draw() {
    vctx.clearRect(0, 0, view.width, view.height);
    vctx.drawImage(srcCanvas, 0, 0, W, H, 0, 0, view.width, view.height);

    // dim outside
    const rx = rect.x * s;
    const ry = rect.y * s;
    const rw = rect.w * s;
    const rh = rect.h * s;

    vctx.save();
    vctx.fillStyle = 'rgba(0,0,0,0.45)';
    vctx.beginPath();
    vctx.rect(0, 0, view.width, view.height);
    vctx.rect(rx, ry, rw, rh);
    vctx.fill('evenodd');
    vctx.restore();

    // rect stroke
    vctx.save();
    vctx.strokeStyle = 'rgba(255,255,255,0.90)';
    vctx.lineWidth = 2;
    vctx.strokeRect(rx, ry, rw, rh);

    // corner handles
    const corners = [
      { x: rx, y: ry },
      { x: rx + rw, y: ry },
      { x: rx + rw, y: ry + rh },
      { x: rx, y: ry + rh },
    ];
    vctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const c of corners) {
      vctx.beginPath();
      vctx.arc(c.x, c.y, 5.5, 0, Math.PI * 2);
      vctx.fill();
    }
    vctx.restore();
  }

  // Interaction state
  let dragging = false;
  let mode = 'new'; // new | move | resize
  let resizeCorner = -1;
  let startPx = 0, startPy = 0;
  let startRect = null;

  function pxToImg(px) { return clamp(px / s, 0, W); }
  function pyToImg(py) { return clamp(py / s, 0, H); }

  function classifyPointer(px, py) {
    const rx = rect.x * s;
    const ry = rect.y * s;
    const rw = rect.w * s;
    const rh = rect.h * s;
    const corners = [
      { x: rx, y: ry },
      { x: rx + rw, y: ry },
      { x: rx + rw, y: ry + rh },
      { x: rx, y: ry + rh },
    ];
    for (let i = 0; i < corners.length; i++) {
      if (hitCorner(px, py, rect, corners[i], 12)) return { kind: 'resize', corner: i };
    }
    const inside = (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh);
    if (inside) return { kind: 'move', corner: -1 };
    return { kind: 'new', corner: -1 };
  }

  function setRectFromPoints(x0, y0, x1, y1) {
    const xx0 = clamp(Math.min(x0, x1), 0, W - 2);
    const yy0 = clamp(Math.min(y0, y1), 0, H - 2);
    const xx1 = clamp(Math.max(x0, x1), xx0 + 2, W);
    const yy1 = clamp(Math.max(y0, y1), yy0 + 2, H);
    rect = { x: xx0, y: yy0, w: xx1 - xx0, h: yy1 - yy0 };
  }

  view.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    view.setPointerCapture(e.pointerId);
    const b = view.getBoundingClientRect();
    const px = e.clientX - b.left;
    const py = e.clientY - b.top;

    const cls = classifyPointer(px, py);
    mode = cls.kind;
    resizeCorner = cls.corner;
    dragging = true;

    startPx = px;
    startPy = py;
    startRect = { ...rect };

    if (mode === 'new') {
      const x0 = pxToImg(px);
      const y0 = pyToImg(py);
      setRectFromPoints(x0, y0, x0 + 2, y0 + 2);
      startRect = { ...rect };
    }

    draw();
  });

  view.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const b = view.getBoundingClientRect();
    const px = e.clientX - b.left;
    const py = e.clientY - b.top;

    const dx = (px - startPx) / s;
    const dy = (py - startPy) / s;

    if (mode === 'move') {
      rect.x = clamp(startRect.x + dx, 0, W - startRect.w);
      rect.y = clamp(startRect.y + dy, 0, H - startRect.h);
    } else if (mode === 'new') {
      const x0 = startRect.x;
      const y0 = startRect.y;
      const x1 = pxToImg(px);
      const y1 = pyToImg(py);
      setRectFromPoints(x0, y0, x1, y1);
    } else if (mode === 'resize') {
      const r = { ...startRect };
      // corners: 0=tl 1=tr 2=br 3=bl
      let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
      if (resizeCorner === 0) { x0 = clamp(x0 + dx, 0, x1 - 2); y0 = clamp(y0 + dy, 0, y1 - 2); }
      if (resizeCorner === 1) { x1 = clamp(x1 + dx, x0 + 2, W); y0 = clamp(y0 + dy, 0, y1 - 2); }
      if (resizeCorner === 2) { x1 = clamp(x1 + dx, x0 + 2, W); y1 = clamp(y1 + dy, y0 + 2, H); }
      if (resizeCorner === 3) { x0 = clamp(x0 + dx, 0, x1 - 2); y1 = clamp(y1 + dy, y0 + 2, H); }
      rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }

    draw();
  });

  view.addEventListener('pointerup', (e) => {
    dragging = false;
    try { view.releasePointerCapture(e.pointerId); } catch (_) {}
  });

  // Close handlers
  const btnClose = overlay.querySelector('#cropClose');
  const btnReset = overlay.querySelector('#cropReset');
  const btnApply = overlay.querySelector('#cropApply');

  function cleanup() {
    overlay.remove();
  }

  return new Promise((resolve) => {
    btnClose.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(null);
      }
    });
    btnReset.addEventListener('click', () => {
      rect = defaultRect(W, H);
      draw();
    });
    btnApply.addEventListener('click', () => {
      const out = cropCanvas(srcCanvas, rect);
      cleanup();
      resolve({ canvas: out, rect: { ...rect } });
    });

    draw();
  });
}
