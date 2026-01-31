import { FIST_SIZE_FACTOR, CHARGE_MAX_SEC } from '../core/config.js';
import { clamp, lerp, easeOutCubic, easeInCubic, deg2rad } from '../core/utils.js';
import { getTarget } from './layout.js';
import { fillRoundRect, strokeRoundRect } from '../core/utils.js';

export function renderFrame(ctx, canvas, L, state, imgs, getDpr, nowMs) {
  drawBackground(ctx, L);

  const targetImg = imgs.targets.get(state.targetKey);
  drawTarget(ctx, L, state, targetImg);

  const pose = getWeaponPose(L, state, imgs, nowMs);
  drawWeaponAndFX(ctx, L, state, imgs, pose, nowMs, getDpr);

  drawHint(ctx, L, state);
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

  // ✅ 飞行位移后的中心
  const cx2 = isFly ? (cx + fly.x) : cx;
  const cy2 = isFly ? (cy + fly.y) : cy;

  // 飞行时不做挤压（避免二次缩放叠加太怪）
  const s = isFly ? 0 : clamp(state.squash, 0, 1);
  const squashK = (tgt.type === 'boss') ? 0.06 : 0.10;
  const stretchK = (tgt.type === 'boss') ? 0.08 : 0.12;
  const scaleX = 1 + squashK * s;
  const scaleY = 1 - stretchK * s;

  ctx.save();

  // ✅ 先应用旋转：正常=绕脚枢轴摆动；飞行=绕目标中心旋转
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

  // 绳子：飞行时不画（不然像拴着飞走）
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

  // ✅ 挤压缩放（围绕“当前中心”）
  ctx.translate(cx2, cy2);
  ctx.scale(scaleX, scaleY);
  ctx.translate(-cx2, -cy2);

  const x = cx2 - objW / 2;
  const y = cy2 - objH / 2;
  ctx.drawImage(targetImg, x, y, objW, objH);

  if (state.flash > 0.02) {
    ctx.save();
    ctx.globalAlpha = 0.18 * state.flash;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, objW, objH);
    ctx.restore();
  }

  // ✅ 名字跟随（平移/旋转/缩放都跟着）
  drawNameOnTarget(ctx, state, cx2, cy2, objW, objH);

  ctx.restore();
}

function getWeaponPose(L, state, imgs, nowMs) {
  const { objW, objH, cx, cy, startXL, startXR, startY, minDim } = L;

  const weaponKey = state.weaponKey ?? 'fist';
  const weaponImg = imgs.weapons?.get(weaponKey) ?? imgs.fist;

  // side
  let side = +1;
  if (state.charge?.active) side = state.charge.side;
  else if (state.punch?.active) side = state.punch.side;

  const startX = (side < 0) ? startXL : startXR;

  // impact
  const tgt = getTarget(state);
  const impactX = cx + side * (objW * 0.18);
  const impactY = (tgt.type === 'boss') ? (cy - objH * 0.12) : (cy - objH * 0.05);

  // punch插值参数（与位置一致，保证旋转“逐渐”）
  let tInterp = 0;
  if (state.punch?.active) {
    const p = state.punch;
    const tt = clamp(p.t, 0, 1);
    if (p.phase === 'out') tInterp = easeOutCubic(tt);
    else tInterp = easeInCubic(tt); // back: p.t 从 1->0，tInterp 也从 1->0
  }

  // position
  let x = startX, y = startY;
  if (state.punch?.active) {
    x = lerp(startX, impactX, tInterp);
    y = lerp(startY, impactY, tInterp);
  }

  // charge strength (0..1)
  const charge01 = state.charge?.active
    ? clamp(state.charge.sec / CHARGE_MAX_SEC, 0, 1)
    : (state.punch?.active ? clamp(state.punch.strength / CHARGE_MAX_SEC, 0, 1) : 0);

  // raw charge seconds（banana 用：蓄力越久旋转越快；可超过3s）
  let rawSec = 0;
  if (state.charge?.active) rawSec = (state.charge.rawSec ?? state.charge.sec ?? 0);
  else if (state.punch?.active) rawSec = (state.punch.strength ?? 0);

  // size factor by weapon
  const sizeFactor = getWeaponSizeFactor(weaponKey);
  const baseW = minDim * FIST_SIZE_FACTOR * sizeFactor;

  // keep aspect ratio
  const ar = (weaponImg && weaponImg.width > 0) ? (weaponImg.height / weaponImg.width) : 1;
  const w = baseW;
  const h = baseW * ar;

  // rotation
  const angle = getWeaponAngle(weaponKey, side, tInterp, charge01, rawSec, nowMs);

  // mirror (只对 fist/extinguisher 做镜像，stick/banana 只用角度控制)
  const needMirror = (weaponKey === 'fist' || weaponKey === 'extinguisher');

  return { weaponKey, weaponImg, side, x, y, w, h, charge01, angle, needMirror };
}

function getWeaponSizeFactor(key) {
  if (key === 'extinguisher') return 1.35;
  if (key === 'stick') return 2.20;
  if (key === 'banana') return 1.40;
  return 1.00; // fist
}

function getWeaponAngle(key, side, tInterp, charge01, rawSec, nowMs) {
  if (key === 'stick') {
    // ✅ 棍子：在“二四象限 45°”附近逐渐旋转
    // 右侧出发：初始逆时针25° -> 最终顺时针25°
    // 左侧出发：反过来
    const base = Math.PI / 4;   // 45°
    const d = deg2rad(25);

    // Canvas: 角度正向为顺时针；“逆时针”理解为 -d
    const a0 = (side > 0) ? (base - d) : (base - d);
    const a1 = (side > 0) ? (base + d) : (base + d);

    return lerp(a0, a1, clamp(tInterp, 0, 1));
  }

  if (key === 'banana') {
    // ✅ 香蕉皮：旋转速度随“蓄力时间”增加（rawSec 可>3s）
    const now = nowMs * 0.001;

    // 0..2 倍区间（>3s仍会继续变快一点）
    const k = clamp(rawSec / CHARGE_MAX_SEC, 0, 2);

    // 基础旋转 + 速度增益（越蓄越快）
    const spinRate = lerp(6.0, 22.0, clamp(k, 0, 1)) + (k > 1 ? 8.0 * (k - 1) : 0);

    // 左右出拳反向旋转，看起来更“对应”
    const dir = (side > 0) ? 1 : -1;

    return dir * now * spinRate;
  }

  // fist/extinguisher 默认不旋转
  return 0;
}

function drawWeaponAndFX(ctx, L, state, imgs, pose, nowMs, getDpr) {
  if (!state.charge?.active && !state.punch?.active) return;

  // 蓄力特效（越久越强）
  drawChargeFX(ctx, pose, nowMs);

  // 画道具
  ctx.save();

  if (state.flash > 0.12) {
    const k = 2.0 * state.flash;
    ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
  }

  ctx.translate(pose.x, pose.y);

  // 镜像（仅 fist/extinguisher）
  if (pose.needMirror && pose.side < 0) ctx.scale(-1, 1);

  // 旋转（stick/banana）
  if (pose.angle) ctx.rotate(pose.angle);

  ctx.drawImage(pose.weaponImg, -pose.w / 2, -pose.h / 2, pose.w, pose.h);

  ctx.restore();

  // 蓄力条
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
  ctx.fillText('按住蓄力，松开出拳；左上角可命名；右上角切换目标/道具', L.W * 0.5, L.H * 0.18);
  ctx.restore();
}
