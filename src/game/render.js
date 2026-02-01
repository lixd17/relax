import {
  FIST_SIZE_FACTOR, CHARGE_MAX_SEC,
  VEHICLE_LANE_Y_FRAC,
  EXPLOSION_DUR_SEC
} from '../core/config.js';

import { clamp, lerp, easeOutCubic, easeInCubic, deg2rad } from '../core/utils.js';
import { getTarget } from './layout.js';
import { fillRoundRect, strokeRoundRect } from '../core/utils.js';

export function renderFrame(ctx, canvas, L, state, imgs, getDpr, nowMs) {
  drawBackground(ctx, L);

  const mode = state.modeKey ?? 'punch';

  // 选目标图（含 custom）
  const targetImg = pickTargetImage(state, imgs);

  // hit 模式：根据阶段决定“车/目标”绘制层级
  if (mode === 'hit') {
    renderHitMode(ctx, L, state, imgs, targetImg, nowMs, getDpr);
    drawHint(ctx, L, state);
    return;
  }

  // punch 模式（原：道具 + punch/fly）
  drawTarget(ctx, L, state, targetImg);

  const pose = getWeaponPose(L, state, imgs, nowMs);
  drawWeaponAndFX(ctx, L, state, pose, nowMs, getDpr);

  drawHint(ctx, L, state);
}

function pickTargetImage(state, imgs) {
  if (state.targetKey === 'custom' && state.customTarget?.img) return state.customTarget.img;
  return imgs.targets.get(state.targetKey) || imgs.targets.values().next().value || imgs.fist;
}

// ------------------------
// hit 模式渲染
// ------------------------
function renderHitMode(ctx, L, state, imgs, targetImg, nowMs, getDpr) {
  const act = state.vehicleAct;
  const charging = !!state.charge?.active;

  // rocketFx：rocket 与目标一起螺旋上升
  if (state.rocketFx?.active) {
    // 先画目标（带 rocketFx transform），再画 rocket（在上层更像“带着”）
    drawTarget(ctx, L, state, targetImg);
    drawRocketFx(ctx, L, state, imgs, nowMs);

    if (state.explosion?.active) drawExplosion(ctx, L, state, nowMs);
    return;
  }

  // 普通 hit：可能有车辆 act 或仅充能预览
  const hasVehicle = !!act?.active;

  // truck/car 抛物线期间：目标在空中 -> 先画车再画目标（看起来目标在车上方）
  const throwingAir = !!(state.throwFx?.active && !state.throwFx.grounded);
  const throwingGround = !!(state.throwFx?.active && state.throwFx.grounded);

  const crushing = !!(state.flattenFx?.active);

  // ✅ 绘制顺序策略：
  // 1) 抛物线空中：车在下层（先画车）
  // 2) 落地并“碾过去”：车在上层（后画车）
  // 3) roller 压扁：车在上层（后画车）
  // 4) 其他：默认 target 先，车后（更有打击感）
  const carUnder = throwingAir;

  if (carUnder) {
    if (hasVehicle) drawVehicleAct(ctx, L, state, imgs, nowMs);
    else if (charging) drawVehicleChargePreview(ctx, L, state, imgs, nowMs, getDpr);

    drawTarget(ctx, L, state, targetImg);
  } else {
    drawTarget(ctx, L, state, targetImg);

    if (hasVehicle) {
      // 落地后“碾过去”/roller 压扁：车盖住目标更像“压”
      drawVehicleAct(ctx, L, state, imgs, nowMs);
    } else if (charging) {
      drawVehicleChargePreview(ctx, L, state, imgs, nowMs, getDpr);
    }
  }

  if (state.explosion?.active) drawExplosion(ctx, L, state, nowMs);
}

function drawVehicleChargePreview(ctx, L, state, imgs, nowMs, getDpr) {
  const key = state.vehicleKey ?? 'truck';
  const img = imgs.vehicles?.get(key) ?? imgs.fist;

  const { w, h } = getVehicleWH(L, key, img);

  // 充能时车辆停在左侧外一点（不遮目标）
  const x = -w * 0.45;
  const y = clamp(L.H * VEHICLE_LANE_Y_FRAC, L.H * 0.55, L.H * 0.92);

  const charge01 = clamp((state.charge?.sec ?? 0) / CHARGE_MAX_SEC, 0, 1);
  drawChargeFXAt(ctx, x, y, w, charge01, nowMs);

  // 画车
  ctx.save();
  ctx.translate(x, y);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();

  // 画蓄力条
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

  // 命中特效：如果你想更夸张可以加闪烁/抖动
  const charge01 = clamp((act.chargeSec ?? 0) / CHARGE_MAX_SEC, 0, 1);
  drawChargeFXAt(ctx, x, y, w, charge01 * 0.6, nowMs);

  ctx.save();
  ctx.translate(x, y);

  // rocket 在 act 内不会走到这里（rocketFx 会单独画）
  ctx.drawImage(img, -w / 2, -h / 2, w, h);

  ctx.restore();
}

function drawRocketFx(ctx, L, state, imgs, nowMs) {
  const fx = state.rocketFx;
  const img = imgs.vehicles?.get('rocket') ?? imgs.fist;

  const { w, h } = getVehicleWH(L, 'rocket', img);

  // 朝速度方向倾斜一点
  const ang = Math.atan2(fx.vy, fx.vx);

  ctx.save();
  ctx.translate(fx.x, fx.y);
  ctx.rotate(ang);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawExplosion(ctx, L, state, nowMs) {
  const ex = state.explosion;
  if (!ex?.active) return;

  const t = clamp(ex.t / EXPLOSION_DUR_SEC, 0, 1);

  const x = ex.x;
  const y = ex.y;

  const R = L.minDim * (0.06 + 0.18 * t);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // 外环
  ctx.globalAlpha = 0.25 * (1 - t);
  ctx.strokeStyle = 'rgba(255,220,120,1)';
  ctx.lineWidth = Math.max(2, L.minDim * 0.006);
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.stroke();

  // 内核光晕
  const g = ctx.createRadialGradient(x, y, 0, x, y, R * 0.9);
  g.addColorStop(0, `rgba(255,220,120,${0.55 * (1 - t)})`);
  g.addColorStop(0.5, `rgba(255,120,80,${0.30 * (1 - t)})`);
  g.addColorStop(1, `rgba(255,120,80,0)`);
  ctx.fillStyle = g;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(x, y, R * 0.9, 0, Math.PI * 2);
  ctx.fill();

  // 火花线
  const N = 18;
  ctx.globalAlpha = 0.35 * (1 - t);
  ctx.strokeStyle = 'rgba(255,240,170,1)';
  ctx.lineWidth = Math.max(1.5, L.minDim * 0.003);
  for (let i = 0; i < N; i++) {
    const a = i * (Math.PI * 2 / N) + (nowMs * 0.001) * 0.8;
    const r0 = R * (0.35 + 0.15 * Math.sin(i + nowMs * 0.002));
    const r1 = R * (0.95 + 0.25 * Math.cos(i * 1.7));
    ctx.beginPath();
    ctx.moveTo(x + r0 * Math.cos(a), y + r0 * Math.sin(a));
    ctx.lineTo(x + r1 * Math.cos(a), y + r1 * Math.sin(a));
    ctx.stroke();
  }

  ctx.restore();
}

function getVehicleWH(L, key, img) {
  const minDim = L.minDim;

  const sizeFactor =
    key === 'truck' ? 2.35 :
    key === 'car' ? 2.10 :
    key === 'roller' ? 2.25 :
    key === 'rocket' ? 2.20 : 2.20;

  const baseW = minDim * FIST_SIZE_FACTOR * sizeFactor;

  const ar = (img && img.width > 0) ? (img.height / img.width) : 0.5;
  const w = baseW;
  const h = baseW * ar;
  return { w, h };
}

// ------------------------
// punch 模式：原渲染（weapon）
// ------------------------
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

  const isThrow = !!(state.throwFx?.active);
  const isRocket = !!(state.rocketFx?.active);
  const isFlatten = !!(state.flattenFx?.active);

  // 当前中心偏移
  let dx = 0, dy = 0, ang = 0, sc = 1;

  if (isRocket) {
    const fx = state.rocketFx;
    dx = fx.x - cx;
    dy = fx.y - cy;
    ang = fx.phi * 0.35;
    sc = 1;
  } else if (isFly) {
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

  // special 状态不叠加 squash（避免怪）
  const special = isFly || isThrow || isRocket;
  const s = special ? 0 : clamp(state.squash, 0, 1);

  const squashK = (tgt.type === 'boss') ? 0.06 : 0.10;
  const stretchK = (tgt.type === 'boss') ? 0.08 : 0.12;
  const scaleX = 1 + squashK * s;
  const scaleY = 1 - stretchK * s;

  ctx.save();

  // 旋转体系
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

  // flatten：躺下 + 变扁（在当前中心上）
  if (isFlatten) {
    const p = clamp(state.flattenFx.prog ?? 0, 0, 1);
    const rot = lerp(0, Math.PI / 2, p); // 0->90°
    const fx = lerp(1.0, 1.18, p);
    const fy = lerp(1.0, 0.28, p);

    ctx.translate(cx2, cy2);
    ctx.rotate(rot);
    ctx.scale(fx, fy);
    ctx.translate(-cx2, -cy2);
  }

  // 绳子：仅 bag 且非 special/flatten
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

  // 挤压缩放（围绕当前中心）
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

// ------------------------
// FX：charge bar + glow
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
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `${Math.floor(L.minDim * 0.03)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('按住蓄力，松开攻击；左上角 Menu 可展开设置', L.W * 0.5, L.H * 0.18);
  ctx.restore();
}
