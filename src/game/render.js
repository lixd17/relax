import { FIST_SIZE_FACTOR, CHARGE_MAX_SEC } from '../core/config.js';
import { clamp, lerp, easeOutCubic, easeInCubic, deg2rad } from '../core/utils.js';
import { getTarget } from './layout.js';
import { fillRoundRect, strokeRoundRect } from '../core/utils.js';

export function renderFrame(ctx, canvas, L, state, imgs, getDpr, nowMs) {
  drawBackground(ctx, L);

  const targetImg = pickTargetImage(state, imgs);
  drawTarget(ctx, L, state, targetImg);

  const pose = getToolPose(L, state, imgs, nowMs);
  drawToolAndFX(ctx, L, state, imgs, pose, nowMs, getDpr);

  drawHint(ctx, L, state);
}

function pickTargetImage(state, imgs) {
  if (state.targetKey === 'custom' && state.customTarget?.img) {
    return state.customTarget.img;
  }
  const img = imgs.targets.get(state.targetKey);
  if (img) return img;

  // fallback: 任取一个目标
  const it = imgs.targets.values().next();
  return it.value ?? imgs.fist;
}

function pickTool(state, imgs) {
  const mode = state.modeKey ?? 'punch';
  if (mode === 'hit') {
    const key = state.vehicleKey ?? 'truck';
    const img = imgs.vehicles?.get(key) ?? imgs.fist;
    return { mode, key, img };
  }

  const key = state.weaponKey ?? 'fist';
  const img = imgs.weapons?.get(key) ?? imgs.fist;
  return { mode, key, img };
}

function drawBackground(ctx, L) {
  const { W, H } = L;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b0f14');
  g.addColorStop(1, '#121a24');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = 0.20;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(W * 0.5, H * 0.62, W * 0.58, H * 0.58, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTarget(ctx, L, state, targetImg) {
  const { objW, objH, cx, cy, pivotX, pivotY, minDim } = L;
  const tgt = getTarget(state);

  const fly = state.fly;
  const isFly = !!(fly && fly.active);

  const cx2 = isFly ? (cx + fly.x) : cx;
  const cy2 = isFly ? (cy + fly.y) : cy;

  const s = isFly ? 0 : clamp(state.squash, 0, 1);
  const squashK = (tgt.type === 'boss') ? 0.06 : 0.10;
  const stretchK = (tgt.type === 'boss') ? 0.08 : 0.12;
  const scaleX = 1 + squashK * s;
  const scaleY = 1 - stretchK * s;

  ctx.save();

  if (isFly) {
    const ang = fly.ang || 0;
    const sc = clamp((fly.scale ?? 1), 0.0001, 10);

    ctx.translate(cx2, cy2);
    ctx.rotate(ang);
    ctx.scale(sc, sc);
    ctx.translate(-cx2, -cy2);
  } else {
    ctx.translate(pivotX, pivotY);
    ctx.rotate(state.theta);
    ctx.translate(-pivotX, -pivotY);
  }

  if (!isFly && tgt.type === 'bag') {
    ctx.save();
    ctx.strokeStyle = 'rgba(220,230,255,0.25)';
    ctx.lineWidth = Math.max(2, minDim * 0.003);
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(cx, cy - objH * 0.52);
    ctx.stroke();
    ctx.restore();
  }

  ctx.translate(cx2, cy2);
  ctx.scale(scaleX, scaleY);
  ctx.translate(-cx2, -cy2);

  const x = cx2 - objW / 2;
  const y = cy2 - objH / 2;

  if (targetImg) ctx.drawImage(targetImg, x, y, objW, objH);

  if (state.flash > 0.02) {
    ctx.save();
    ctx.globalAlpha = 0.18 * state.flash;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, objW, objH);
    ctx.restore();
  }

  drawNameOnTarget(ctx, state, cx2, cy2, objW, objH);

  ctx.restore();
}

function getToolPose(L, state, imgs, nowMs) {
  const { objW, objH, cx, cy, startXL, startXR, startY, minDim } = L;

  const tool = pickTool(state, imgs);
  const key = tool.key;
  const toolImg = tool.img;

  let side = +1;
  if (state.charge?.active) side = state.charge.side;
  else if (state.punch?.active) side = state.punch.side;

  const startX = (side < 0) ? startXL : startXR;

  const tgt = getTarget(state);
  const impactX = cx + side * (objW * 0.18);
  const impactY = (tgt.type === 'boss') ? (cy - objH * 0.12) : (cy - objH * 0.05);

  let tInterp = 0;
  if (state.punch?.active) {
    const p = state.punch;
    const tt = clamp(p.t, 0, 1);
    if (p.phase === 'out') tInterp = easeOutCubic(tt);
    else tInterp = easeInCubic(tt);
  }

  let x = startX, y = startY;
  if (state.punch?.active) {
    x = lerp(startX, impactX, tInterp);
    y = lerp(startY, impactY, tInterp);
  }

  const charge01 = state.charge?.active
    ? clamp(state.charge.sec / CHARGE_MAX_SEC, 0, 1)
    : (state.punch?.active ? clamp(state.punch.strength / CHARGE_MAX_SEC, 0, 1) : 0);

  let rawSec = 0;
  if (state.charge?.active) rawSec = (state.charge.rawSec ?? state.charge.sec ?? 0);
  else if (state.punch?.active) rawSec = (state.punch.strength ?? 0);

  const sizeFactor = getToolSizeFactor(tool.mode, key);
  const baseW = minDim * FIST_SIZE_FACTOR * sizeFactor;

  const ar = (toolImg && toolImg.width > 0) ? (toolImg.height / toolImg.width) : 1;
  const w = baseW;
  const h = baseW * ar;

  const angle = getToolAngle(tool.mode, key, side, tInterp, charge01, rawSec, nowMs);

  const needMirror = (tool.mode === 'hit') ? true : (key === 'fist' || key === 'extinguisher');

  return { toolMode: tool.mode, toolKey: key, toolImg, side, x, y, w, h, charge01, angle, needMirror };
}

function getToolSizeFactor(mode, key) {
  if (mode === 'hit') {
    if (key === 'truck') return 2.35;
    if (key === 'car') return 2.10;
    if (key === 'roller') return 2.25;
    if (key === 'rocket') return 2.20;
    return 2.20;
  }

  if (key === 'extinguisher') return 1.35;
  if (key === 'stick') return 1.8;
  if (key === 'banana') return 1.40;
  return 1.00;
}

function getToolAngle(mode, key, side, tInterp, charge01, rawSec, nowMs) {
  if (mode === 'hit') {
    // 交通工具先默认跟拳套一样：不额外旋转
    return 0;
  }

  if (key === 'stick') {
    const base = Math.PI / 4;
    const d = deg2rad(25);
    const a0 = (side > 0) ? (base + d) : (base - d);
    const a1 = (side > 0) ? (base - d) : (base + d);
    return lerp(a0, a1, clamp(tInterp, 0, 1));
  }

  if (key === 'banana') {
    const now = nowMs * 0.001;
    const k = clamp(rawSec / CHARGE_MAX_SEC, 0, 2);
    const spinRate = lerp(1.0, 5.0, clamp(k, 0, 1));
    const dir = (side > 0) ? 1 : -1;
    return dir * now * spinRate;
  }

  return 0;
}

function drawToolAndFX(ctx, L, state, imgs, pose, nowMs, getDpr) {
  if (!state.charge?.active && !state.punch?.active) return;

  drawChargeFX(ctx, pose, nowMs);

  ctx.save();

  if (state.flash > 0.12) {
    const k = 2.0 * state.flash;
    ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
  }

  ctx.translate(pose.x, pose.y);

  if (pose.needMirror && pose.side < 0) ctx.scale(-1, 1);
  if (pose.angle) ctx.rotate(pose.angle);

  ctx.drawImage(pose.toolImg, -pose.w / 2, -pose.h / 2, pose.w, pose.h);

  ctx.restore();

  if (state.charge?.active) {
    const p = clamp(state.charge.sec / CHARGE_MAX_SEC, 0, 1);
    drawChargeBar(ctx, pose.x, pose.y, pose.w, pose.h, p, getDpr());
  }
}

function drawChargeBar(ctx, x, y, w, h, p01, dpr) {
  const p = clamp(p01, 0, 1);

  const barW = w * 0.90;
  const barH = Math.max(4, h * 0.08);

  const bx = x - barW / 2;
  const by = y - h / 2 - barH * 1.2;

  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  fillRoundRect(ctx, bx, by, barW, barH, barH * 0.5);

  ctx.globalAlpha = 0.95;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  fillRoundRect(ctx, bx, by, barW * p, barH, barH * 0.5);

  ctx.globalAlpha = 0.70;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, 1.5 * dpr);
  strokeRoundRect(ctx, bx, by, barW, barH, barH * 0.5);
  ctx.restore();
}

function drawChargeFX(ctx, pose, nowMs) {
  const p = clamp(pose.charge01, 0, 1);
  if (p <= 0.001) return;

  const t = nowMs * 0.001;
  const x = pose.x;
  const y = pose.y;

  const glowR = pose.w * (0.55 + 0.85 * p);
  const ringN = Math.floor(1 + p * 4);
  const sparkN = Math.floor(6 + p * 26);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const g = ctx.createRadialGradient(x, y, 0, x, y, glowR);
  g.addColorStop(0, `rgba(140,220,255,${0.22 + 0.35 * p})`);
  g.addColorStop(0.55, `rgba(140,220,255,${0.10 + 0.25 * p})`);
  g.addColorStop(1, `rgba(140,220,255,0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, glowR, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < ringN; i++) {
    const rr = pose.w * (0.55 + 0.12 * i + 0.18 * p);
    const a0 = t * (1.8 + 0.6 * i) + i * 1.7;
    const seg = 0.9 + 0.6 * p;

    ctx.lineWidth = Math.max(1.2, pose.w * 0.03);
    ctx.strokeStyle = `rgba(180,120,255,${0.10 + 0.22 * p})`;
    ctx.beginPath();
    ctx.arc(x, y, rr, a0, a0 + seg);
    ctx.stroke();

    ctx.strokeStyle = `rgba(120,255,210,${0.10 + 0.22 * p})`;
    ctx.beginPath();
    ctx.arc(x, y, rr * 0.88, -a0, -a0 + seg * 0.85);
    ctx.stroke();
  }

  ctx.lineWidth = Math.max(1, pose.w * 0.02);
  for (let i = 0; i < sparkN; i++) {
    const phi = (i * 2.399963229728653) + t * (2.0 + 4.0 * p);
    const rr = pose.w * (0.30 + 0.55 * p * (0.5 + 0.5 * Math.sin(t * 3 + i)));
    const len = pose.w * (0.08 + 0.22 * p);

    const x0 = x + rr * Math.cos(phi);
    const y0 = y + rr * Math.sin(phi);
    const x1 = x0 + len * Math.cos(phi + 0.2 * Math.sin(t + i));
    const y1 = y0 + len * Math.sin(phi + 0.2 * Math.sin(t + i));

    ctx.strokeStyle = `rgba(255,240,160,${0.08 + 0.30 * p})`;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  ctx.restore();
}

function drawNameOnTarget(ctx, state, cx, cy, objW, objH) {
  const name = (state.namesByKey[state.targetKey] ?? '').trim();
  if (!name) return;

  const chars = Array.from(name);
  const n = Math.max(1, chars.length);

  const maxH = objH * 0.70;
  const lineHFactor = 1.12;
  const fsByH = maxH / (n * lineHFactor);
  const fsByW = objW * 0.36;
  const NAME_SCALE = 0.5;
  const fontSize = clamp(fsByH, 14, Math.min(64, fsByW)) * NAME_SCALE;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${fontSize}px sans-serif`;

  const fill = 'rgba(255, 210, 80, 0.95)';
  const stroke = 'rgba(0, 0, 0, 0.75)';

  const nameCy = (cy - objH * 0.5) + objH * 0.35;
  const startY = nameCy - (n - 1) * (fontSize * lineHFactor) / 2;

  for (let i = 0; i < n; i++) {
    const ch = chars[i];
    const yy = startY + i * fontSize * lineHFactor;

    ctx.lineWidth = Math.max(3, fontSize * 0.18);
    ctx.strokeStyle = stroke;
    ctx.strokeText(ch, cx, yy);

    ctx.fillStyle = fill;
    ctx.fillText(ch, cx, yy);
  }

  ctx.restore();
}

function drawHint(ctx, L, state) {
  if (state.interacted) return;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `${Math.floor(L.minDim * 0.03)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('按住蓄力，松开出拳；左上角 Menu 可展开设置', L.W * 0.5, L.H * 0.18);
  ctx.restore();
}
