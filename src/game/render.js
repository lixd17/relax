import {
  FIST_SIZE_FACTOR, CHARGE_MAX_SEC,
  VEHICLE_SIZE_SCALE,
} from '../core/config.js';

import { clamp, lerp, easeOutCubic, easeInCubic, deg2rad } from '../core/utils.js';
import { getTarget } from './layout.js';
import { fillRoundRect, strokeRoundRect } from '../core/utils.js';
const TAU = Math.PI * 2;

export function renderFrame(ctx, canvas, L, state, imgs, getDpr, nowMs) {
  drawBackground(ctx, L);

  const mode = state.modeKey ?? 'punch';
  // 目标贴图由主循环统一选择（用于 layout + render 保持一致）
  const targetImg = L?.targetImg || imgs.targets?.values?.().next?.().value || imgs.fist;


  if (mode === 'hit') {
    renderHitMode(ctx, L, state, imgs, targetImg, nowMs, getDpr);
    drawImpactFx(ctx, L, state, "particles");
    drawHint(ctx, L, state);
    return;
  }

  if (mode === 'rage') {
    drawTarget(ctx, L, state, targetImg);
    renderRageMode(ctx, L, state, imgs, nowMs);
    drawImpactFx(ctx, L, state, "particles");
    drawHint(ctx, L, state);
    return;
  }

  drawTarget(ctx, L, state, targetImg);

  const pose = getWeaponPose(L, state, imgs, nowMs);
  drawWeaponAndFX(ctx, L, state, pose, nowMs, getDpr);

  drawImpactFx(ctx, L, state, "particles");

  drawHint(ctx, L, state);
}

// ------------------------
// rage mode (multi-punch)
// ------------------------
function renderRageMode(ctx, L, state, imgs, nowMs) {
  const list = state.ragePunches;
  if (!Array.isArray(list) || list.length === 0) return;

  for (let i = 0; i < list.length; i++) {
    const pp = list[i];
    if (!pp || !pp.active) continue;
    const pose = getWeaponPoseFromPunch(L, state, imgs, pp, nowMs);
    drawWeaponSimple(ctx, state, pose);
  }
}

// ------------------------
// hit mode
// ------------------------
function renderHitMode(ctx, L, state, imgs, targetImg, nowMs, getDpr) {
  const act = state.vehicleAct;
  const charging = !!state.charge?.active;

  const hasVehicle = !!act?.active;

  const throwingAir = !!(state.throwFx?.active && !state.throwFx.grounded);
  const carUnder = throwingAir;

  if (carUnder) {
    if (hasVehicle) drawVehicleAct(ctx, L, state, imgs, nowMs);
    else if (charging) drawVehicleChargePreview(ctx, L, state, imgs, nowMs, getDpr);

    drawTarget(ctx, L, state, targetImg);
  } else {
    drawTarget(ctx, L, state, targetImg);

    if (hasVehicle) drawVehicleAct(ctx, L, state, imgs, nowMs);
    else if (charging) drawVehicleChargePreview(ctx, L, state, imgs, nowMs, getDpr);
  }
}

function drawVehicleChargePreview(ctx, L, state, imgs, nowMs, getDpr) {
  const key = state.vehicleKey ?? 'truck';
  const img = imgs.vehicles?.get(key) ?? imgs.fist;

  const { w, h } = getVehicleWH(L, key, img);

  const side = state.charge?.side ?? -1;

  // ✅ vehicle 起点：1/6 & 5/6
  const startX = (side < 0) ? L.vehicleStartXL : L.vehicleStartXR;

  // y align with target center
  const y = L.cy;

  const x = (side < 0) ? (startX - w * 0.52) : (startX + w * 0.52);

  const charge01 = clamp((state.charge?.sec ?? 0) / CHARGE_MAX_SEC, 0, 1);

  ctx.save();
  ctx.translate(x, y);

  if (side < 0) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);

  ctx.restore();

  drawChargeBar(ctx, x, y, w, h, charge01, getDpr());
}

function drawVehicleAct(ctx, L, state, imgs, nowMs) {
  const act = state.vehicleAct;
  if (!act?.active) return;

  const key = act.key ?? 'truck';
  const img = imgs.vehicles?.get(key) ?? imgs.fist;

  const { w, h } = getVehicleWH(L, key, img);

  const x = act.x;
  const y = act.y;

  const charge01 = clamp((act.chargeSec ?? 0) / CHARGE_MAX_SEC, 0, 1);

  ctx.save();
  ctx.translate(x, y);

  if (act.vx > 0) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);

  ctx.restore();
}

function getVehicleWH(L, key, img) {
  const minDim = L.minDim;
  const sizeFactor =
    key === 'truck' ? 2.35 :
    key === 'car' ? 2.10 :
    key === 'roller' ? 2.25 : 2.20;

  const baseW = minDim * FIST_SIZE_FACTOR * sizeFactor * VEHICLE_SIZE_SCALE;

  const ar = (img && img.width > 0) ? (img.height / img.width) : 0.5;
  const w = baseW;
  const h = baseW * ar;
  return { w, h };
}

// ------------------------
// punch mode rendering
// ------------------------
function drawBackground(ctx, L) {
  const { W, H } = L;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#233044');
  g.addColorStop(1, '#141b26');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(W * 0.5, H * 0.62, W * 0.58, H * 0.58, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTarget(ctx, L, state, targetImg) {
  const { objW, objH, cx, cy, pivotX, pivotY, minDim } = L;
  const tgt = getTarget(state);
  const isFly = !!state.fly?.active;
  const isThrow = !!state.throwFx?.active;
  const isFlatten = !!state.flattenFx?.active;
  const special = isFly || isThrow;

  let dx = 0, dy = 0, ang = 0, sc = 1;

  if (isFly) {
    const fly = state.fly;
    dx = fly.x;
    dy = fly.y;
    ang = fly.ang || 0;
    sc = clamp((fly.scale ?? 1), 0.0001, 10);
  } else if (isThrow) {
    const fx = state.throwFx;
    dx = fx.x;
    dy = fx.y;
    ang = fx.ang || 0;
    sc = 1;
  }

  const cx2 = cx + dx;
  const cy2 = cy + dy;

  drawImpactFx(ctx, L, state, "shadow", cx2, cy2, objW, objH, special);
  const s = special ? 0 : clamp(state.squash, 0, 1);

  const squashK = (tgt.type === 'boss') ? 0.06 : 0.10;
  const stretchK = (tgt.type === 'boss') ? 0.08 : 0.12;
  const scaleX = 1 + squashK * s;
  const scaleY = 1 - stretchK * s;

  ctx.save();

  if (special) {
    ctx.translate(cx2, cy2);
    ctx.rotate(ang);
    ctx.scale(sc, sc);
    ctx.translate(-cx2, -cy2);
  } else {
    ctx.translate(pivotX, pivotY);
    ctx.rotate(state.theta);
    ctx.translate(-pivotX, -pivotY);
  }

  // ✅ roller：先躺下（旋转），再“纵向压扁”（屏幕 y 方向）
  if (isFlatten) {
    const fx = state.flattenFx;

    const rot01 = clamp(fx.rot01 ?? 0, 0, 1);
    const sq01  = clamp(fx.squash01 ?? 0, 0, 1);

    const side = (fx.side ?? state.vehicleAct?.side ?? -1);
    const rotDir = (side < 0) ? +1 : -1;
    const rot = lerp(0, rotDir * Math.PI / 2, rot01);

    // 纵向压扁：压缩屏幕 y（scaleY），并略增厚 x
    const sx = lerp(1.0, 1.10, sq01);
    const sy = lerp(1.0, 0.18, sq01);

    // 关键：缩放在旋转之后生效（屏幕坐标系），保持“向地面压扁”的方向感
    ctx.translate(cx2, cy2);
    ctx.scale(sx, sy);
    ctx.rotate(rot);
    ctx.translate(-cx2, -cy2);
  }

  if (!special && !isFlatten && tgt.type === 'bag') {
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

function getWeaponPose(L, state, imgs, nowMs) {
  const { objW, objH, cx, cy, startXL, startXR, startY, minDim } = L;

  const weaponKey = state.weaponKey ?? 'fist';
  const weaponImg = imgs.weapons?.get(weaponKey) ?? imgs.fist;

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

  const sizeFactor = getWeaponSizeFactor(weaponKey);
  const baseW = minDim * FIST_SIZE_FACTOR * sizeFactor;

  const ar = (weaponImg && weaponImg.width > 0) ? (weaponImg.height / weaponImg.width) : 1;
  const w = baseW;
  const h = baseW * ar;

  const angle = getWeaponAngle(weaponKey, side, tInterp, charge01, rawSec, nowMs);
  const needMirror = (weaponKey === 'fist' || weaponKey === 'extinguisher');

  return { weaponKey, weaponImg, side, x, y, w, h, charge01, angle, needMirror };
}

function getWeaponPoseFromPunch(L, state, imgs, pp, nowMs) {
  const { objW, objH, cx, cy, startXL, startXR, startY, minDim } = L;

  const weaponKey = pp.weaponKey ?? (state.weaponKey ?? 'fist');
  const weaponImg = imgs.weapons?.get(weaponKey) ?? imgs.fist;

  const side = (pp.side ?? +1);
  const startX = (side < 0) ? startXL : startXR;

  const tgt = getTarget(state);
  const impactX = cx + side * (objW * 0.18);
  const impactY = (tgt.type === 'boss') ? (cy - objH * 0.12) : (cy - objH * 0.05);

  const tt = clamp(pp.t ?? 0, 0, 1);
  const tInterp = (pp.phase === 'out') ? easeOutCubic(tt) : easeInCubic(tt);

  const x = lerp(startX, impactX, tInterp);
  const y = lerp(startY, impactY, tInterp);

  const charge01 = clamp(pp.strength01 ?? 0.65, 0, 1);
  const rawSec = charge01 * CHARGE_MAX_SEC;

  const sizeFactor = getWeaponSizeFactor(weaponKey);
  const baseW = minDim * FIST_SIZE_FACTOR * sizeFactor;
  const ar = (weaponImg && weaponImg.width > 0) ? (weaponImg.height / weaponImg.width) : 1;
  const w = baseW;
  const h = baseW * ar;

  const angle = getWeaponAngle(weaponKey, side, tInterp, charge01, rawSec, nowMs);
  const needMirror = (weaponKey === 'fist' || weaponKey === 'extinguisher');

  return { weaponKey, weaponImg, side, x, y, w, h, charge01, angle, needMirror };
}

function getWeaponSizeFactor(key) {
  if (key === 'extinguisher') return 1.35;
  if (key === 'stick') return 1.8;
  if (key === 'banana') return 1.40;
  return 1.00;
}

function getWeaponAngle(key, side, tInterp, charge01, rawSec, nowMs) {
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

function drawWeaponAndFX(ctx, L, state, pose, nowMs, getDpr) {
  if (!state.charge?.active && !state.punch?.active) return;

  drawChargeFXAt(ctx, pose.x, pose.y, pose.w, pose.charge01, nowMs);

  ctx.save();
  if (state.flash > 0.12) {
    const k = 2.0 * state.flash;
    ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
  }

  ctx.translate(pose.x, pose.y);
  if (pose.needMirror && pose.side < 0) ctx.scale(-1, 1);
  if (pose.angle) ctx.rotate(pose.angle);
  ctx.drawImage(pose.weaponImg, -pose.w / 2, -pose.h / 2, pose.w, pose.h);
  ctx.restore();

  if (state.charge?.active) {
    const p = clamp(state.charge.sec / CHARGE_MAX_SEC, 0, 1);
    drawChargeBar(ctx, pose.x, pose.y, pose.w, pose.h, p, getDpr());
  }
}

function drawWeaponSimple(ctx, state, pose) {
  ctx.save();
  if (state.flash > 0.12) {
    const k = 2.0 * state.flash;
    ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
  }

  ctx.translate(pose.x, pose.y);
  if (pose.needMirror && pose.side < 0) ctx.scale(-1, 1);
  if (pose.angle) ctx.rotate(pose.angle);
  ctx.drawImage(pose.weaponImg, -pose.w / 2, -pose.h / 2, pose.w, pose.h);
  ctx.restore();
}

// ------------------------
// FX: bar + glow
// ------------------------
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

function drawChargeFXAt(ctx, x, y, w, p01, nowMs) {
  const p = clamp(p01, 0, 1);
  if (p <= 0.001) return;

  const t = nowMs * 0.001;
  const glowR = w * (0.55 + 0.85 * p);
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
    const rr = w * (0.55 + 0.12 * i + 0.18 * p);
    const a0 = t * (1.8 + 0.6 * i) + i * 1.7;
    const seg = 0.9 + 0.6 * p;

    ctx.lineWidth = Math.max(1.2, w * 0.03);
    ctx.strokeStyle = `rgba(180,120,255,${0.10 + 0.22 * p})`;
    ctx.beginPath();
    ctx.arc(x, y, rr, a0, a0 + seg);
    ctx.stroke();

    ctx.strokeStyle = `rgba(120,255,210,${0.10 + 0.22 * p})`;
    ctx.beginPath();
    ctx.arc(x, y, rr * 0.88, -a0, -a0 + seg * 0.85);
    ctx.stroke();
  }

  ctx.lineWidth = Math.max(1, w * 0.02);
  for (let i = 0; i < sparkN; i++) {
    const phi = (i * 2.399963229728653) + t * (2.0 + 4.0 * p);
    const rr = w * (0.30 + 0.55 * p * (0.5 + 0.5 * Math.sin(t * 3 + i)));
    const len = w * (0.08 + 0.22 * p);

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

// ------------------------
// name + hint
// ------------------------
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
  const mode = state.modeKey ?? 'punch';

  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `${Math.floor(L.minDim * 0.03)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const msg = (mode === 'rage')
    ? '狂暴：鼠标点击或按任意字母键连击；空格=老板键'
    : '按住蓄力，松开攻击；左上角 Menu 可展开设置；空格=老板键';
  ctx.fillText(msg, L.W * 0.5, L.H * 0.18);
  ctx.restore();
}

// ---------------------------
// impact FX render (shared)
// 3) contact shadow compression
// 6) particles
// ---------------------------
function drawImpactFx(ctx, L, state, phase, cx2, cy2, objW, objH, special) {
  if (phase === "shadow") {
    return drawImpactShadow(ctx, L, state, cx2, cy2, objW, objH, special);
  }
  if (phase === "particles") {
    return drawImpactParticles(ctx, L, state);
  }
}

function drawImpactShadow(ctx, L, state, cx2, cy2, objW, objH, special) {
  const fx = state.fxImpact;
  if (!fx || !fx.shadow || fx.shadow <= 0) return;
  if (special) return; // no ground shadow while flying / in-air throw

  const p = clamp(fx.shadow, 0, 1);
  const side = fx.shadowSide ?? -1;

  // baseline shadow under target
  // 命中时的阴影“挪动”更明显：水平偏移加大 + 轻微下沉
  const x = cx2 + side * objW * 0.12 * p;
  const y = cy2 + objH * (0.53 + 0.02 * p);

  const baseW = objW * 0.34;
  const baseH = objH * 0.085;

  const w = baseW * (1 + 0.55 * p);
  const h = Math.max(2, baseH * (1 - 0.70 * p));

  ctx.save();
  ctx.globalAlpha = 0.10 + 0.22 * p;

  // soft edge
  const g = ctx.createRadialGradient(x, y, 0, x, y, w * 0.55);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;

  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.5, h * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawImpactParticles(ctx, L, state) {
  const fx = state.fxImpact;
  if (!fx || !Array.isArray(fx.parts) || fx.parts.length === 0) return;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,1)';

  for (const p of fx.parts) {
    const t = clamp((p.age ?? 0) / Math.max(1e-6, (p.life ?? 1)), 0, 1);
    const fade = 1 - t;
    const a = fade * clamp(p.a ?? 0.7, 0, 1);
    if (a <= 0.01) continue;

    const r = Math.max(0.8, p.r ?? 2);

    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(p.x ?? 0, p.y ?? 0, r, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}
