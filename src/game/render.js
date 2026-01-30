import { FIST_SIZE_FACTOR, CHARGE_MAX_SEC } from '../core/config.js';
import { clamp, lerp, easeOutCubic, easeInCubic } from '../core/utils.js';
import { getTarget } from './layout.js';
import { fillRoundRect, strokeRoundRect } from '../core/utils.js';

export function renderFrame(ctx, canvas, L, state, imgs, getDpr, nowMs) {
  drawBackground(ctx, L);

  const targetImg = imgs.targets.get(state.targetKey);
  drawTarget(ctx, L, state, targetImg);

  const fistPose = getFistPose(L, state);
  drawFistAndFX(ctx, L, state, imgs.fist, fistPose, nowMs, getDpr);
  
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

  const s = clamp(state.squash, 0, 1);
  const squashK = (tgt.type === 'boss') ? 0.06 : 0.10;
  const stretchK = (tgt.type === 'boss') ? 0.08 : 0.12;
  const scaleX = 1 + squashK * s;
  const scaleY = 1 - stretchK * s;

  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(state.theta);
  ctx.translate(-pivotX, -pivotY);

  if (tgt.type === 'bag') {
    ctx.save();
    ctx.strokeStyle = 'rgba(220,230,255,0.25)';
    ctx.lineWidth = Math.max(2, minDim * 0.003);
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(cx, cy - objH * 0.52);
    ctx.stroke();
    ctx.restore();
  }

  ctx.translate(cx, cy);
  ctx.scale(scaleX, scaleY);
  ctx.translate(-cx, -cy);

  const x = cx - objW / 2;
  const y = cy - objH / 2;
  ctx.drawImage(targetImg, x, y, objW, objH);
  
  if (state.flash > 0.02) {
    ctx.save();
    ctx.globalAlpha = 0.18 * state.flash;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, objW, objH);
    ctx.restore();
  }
  
  // ✅ 关键：在“目标的旋转/缩放变换”内部画名字 => 名字跟着一起旋转/摆动
  drawNameOnTarget(ctx, L, state);
  
  ctx.restore();
  
}

function getFistPose(L, state) {
  const { objW, objH, cx, cy, startXL, startXR, startY, minDim } = L;

  let side = +1;
  if (state.charge.active) side = state.charge.side;
  else if (state.punch.active) side = state.punch.side;

  const startX = (side < 0) ? startXL : startXR;

  const tgt = getTarget(state);
  const impactX = cx + side * (objW * 0.18);
  const impactY = (tgt.type === 'boss') ? (cy - objH * 0.12) : (cy - objH * 0.05);

  // ✅ 固定拳头大小：仅随屏幕
  const fistW = minDim * FIST_SIZE_FACTOR;
  const fistH = fistW;

  let x = startX, y = startY;

  const p = state.punch;
  if (p.active) {
    if (p.phase === 'out') {
      const t = easeOutCubic(clamp(p.t, 0, 1));
      x = lerp(startX, impactX, t);
      y = lerp(startY, impactY, t);
    } else {
      const t = easeInCubic(clamp(p.t, 0, 1)); // 1->0
      x = lerp(startX, impactX, t);
      y = lerp(startY, impactY, t);
    }
  }

  // 归一化蓄力强度（用于特效）
  const charge01 = state.charge.active
    ? clamp(state.charge.sec / CHARGE_MAX_SEC, 0, 1)
    : (state.punch.active ? clamp(state.punch.strength / CHARGE_MAX_SEC, 0, 1) : 0);

  return { x, y, side, fistW, fistH, impactX, impactY, charge01 };
}

function drawFistAndFX(ctx, L, state, fistImg, pose, nowMs, getDpr) {
  if (!state.charge.active && !state.punch.active) return;

  // ✅ 蓄力特效（越久越强）
  drawChargeFX(ctx, pose, nowMs);

  // 画拳头
  ctx.save();

  if (state.flash > 0.12) {
    const k = 2.0 * state.flash;
    ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
  }

  if (pose.side < 0) {
    ctx.translate(pose.x, pose.y);
    ctx.scale(-1, 1);
    ctx.drawImage(fistImg, -pose.fistW / 2, -pose.fistH / 2, pose.fistW, pose.fistH);
  } else {
    ctx.drawImage(fistImg, pose.x - pose.fistW / 2, pose.y - pose.fistH / 2, pose.fistW, pose.fistH);
  }

  ctx.restore();

  // 蓄力条
  if (state.charge.active) {
    const p = clamp(state.charge.sec / CHARGE_MAX_SEC, 0, 1);
    drawChargeBar(ctx, pose.x, pose.y, pose.fistW, pose.fistH, p, getDpr());
  }
}

function drawChargeBar(ctx, x, y, fistW, fistH, p01, dpr) {
  const p = clamp(p01, 0, 1);

  const barW = fistW * 0.90;
  const barH = Math.max(4, fistH * 0.08);

  const bx = x - barW / 2;
  const by = y - fistH / 2 - barH * 1.2;

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

  // 越蓄力越“炸裂”：层数、亮度都上去
  const glowR = pose.fistW * (0.55 + 0.85 * p);
  const ringN = Math.floor(1 + p * 4);
  const sparkN = Math.floor(6 + p * 26);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // 外圈柔光
  const g = ctx.createRadialGradient(x, y, 0, x, y, glowR);
  g.addColorStop(0, `rgba(140,220,255,${0.22 + 0.35 * p})`);
  g.addColorStop(0.55, `rgba(140,220,255,${0.10 + 0.25 * p})`);
  g.addColorStop(1, `rgba(140,220,255,0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, glowR, 0, Math.PI * 2);
  ctx.fill();

  // 旋转能量环（看起来更“牛逼”）
  for (let i = 0; i < ringN; i++) {
    const rr = pose.fistW * (0.55 + 0.12 * i + 0.18 * p);
    const a0 = t * (1.8 + 0.6 * i) + i * 1.7;
    const seg = 0.9 + 0.6 * p;

    ctx.lineWidth = Math.max(1.2, pose.fistW * 0.03);
    ctx.strokeStyle = `rgba(180,120,255,${0.10 + 0.22 * p})`;
    ctx.beginPath();
    ctx.arc(x, y, rr, a0, a0 + seg);
    ctx.stroke();

    ctx.strokeStyle = `rgba(120,255,210,${0.10 + 0.22 * p})`;
    ctx.beginPath();
    ctx.arc(x, y, rr * 0.88, -a0, -a0 + seg * 0.85);
    ctx.stroke();
  }

  // 火花（用 sin/cos 做“稳定抖动”，不会随机闪烁太刺眼）
  ctx.lineWidth = Math.max(1, pose.fistW * 0.02);
  for (let i = 0; i < sparkN; i++) {
    const phi = (i * 2.399963229728653) + t * (2.0 + 4.0 * p); // 黄金角 + 旋转
    const rr = pose.fistW * (0.30 + 0.55 * p * (0.5 + 0.5 * Math.sin(t * 3 + i)));
    const len = pose.fistW * (0.08 + 0.22 * p);

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

function drawNameOnTarget(ctx, L, state) {
  const name = (state.namesByKey[state.targetKey] ?? '').trim();
  if (!name) return;

  const { cx, cy, objW, objH } = L;

  // 竖排：按字符拆开
  const chars = Array.from(name);
  const n = Math.max(1, chars.length);

  // 自动字号：保证竖排总高度不超过目标 70%
  const maxH = objH * 0.70;
  const lineHFactor = 1.12;
  const fsByH = maxH / (n * lineHFactor);
  const fsByW = objW * 0.36;
  const NAME_SCALE = 0.5; // ✅ 这里调大/调小：1.0=原样，1.2更大，0.9更小
  const fontSize = clamp(fsByH, 14, Math.min(64, fsByW)) * NAME_SCALE;
  

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${fontSize}px sans-serif`;

  // 突出颜色 + 描边，保证任何背景都看得清
  const fill = 'rgba(255, 210, 80, 0.95)';
  const stroke = 'rgba(0, 0, 0, 0.75)';

  // ✅ 名字中心放到“目标上部 75%”的位置
  // 目标的顶部是 (cy - objH/2)，所以 75% 处 = 顶部 + 0.25*objH
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
  ctx.fillText('按住蓄力，松开出拳；左上角可命名；右上角切换目标', L.W * 0.5, L.H * 0.18);
  ctx.restore();
}
