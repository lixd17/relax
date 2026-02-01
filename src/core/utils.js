export function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
export function easeInCubic(t) { return t * t * t; }

export function deg2rad(deg) { return (deg * Math.PI) / 180; }
export function stripExt(name) { return name.replace(/\.[^/.]+$/, ''); }

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ---------- 用户上传图片辅助 ----------

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

export function imageToCanvasScaled(img, maxSide = 2048) {
  const w0 = img.naturalWidth || img.width || 1;
  const h0 = img.naturalHeight || img.height || 1;
  const s = Math.min(1, maxSide / Math.max(w0, h0));

  const w = Math.max(1, Math.round(w0 * s));
  const h = Math.max(1, Math.round(h0 * s));

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

// ✅ 对带透明背景 PNG 很有效：裁掉四周透明边
export function autoCropAlphaCanvas(canvas, alphaThreshold = 10, pad = 4) {
  const w = canvas.width;
  const h = canvas.height;
  if (w <= 0 || h <= 0) return canvas;

  const ctx = canvas.getContext('2d');
  const im = ctx.getImageData(0, 0, w, h);
  const data = im.data;

  let minX = w, minY = h, maxX = -1, maxY = -1;
  let hasAlpha = false;

  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const a = data[row + x * 4 + 3];
      if (a < 254) hasAlpha = true;
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!hasAlpha || maxX < 0) return canvas;

  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);

  const cw = Math.max(1, maxX - minX + 1);
  const ch = Math.max(1, maxY - minY + 1);
  if (cw < 16 || ch < 16) return canvas;

  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  const octx = out.getContext('2d');
  octx.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
  return out;
}

// ---------- 绘制辅助 ----------

export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function fillRoundRect(ctx, x, y, w, h, r) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fill();
}

export function strokeRoundRect(ctx, x, y, w, h, r) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.stroke();
}
