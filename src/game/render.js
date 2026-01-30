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

  // ✅ 名字放在目标变换栈内 + 使用飞行后的中心 => 跟着飞（平移/旋转/缩放）
  drawNameOnTarget(ctx, state, cx2, cy2, objW, objH);

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

  // 旋转能量环
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

  // 火花
  ctx.lineWidth = Math.max(1, pose.fistW * 0.02);
  for (let i = 0; i < sparkN; i++) {
    const phi = (i * 2.399963229728653) + t * (2.0 + 4.0 * p);
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

function drawNameOnTarget(ctx, state, cx, cy, objW, objH) {
  const name = (state.namesByKey[state.targetKey] ?? '').trim();
  if (!name) return;

  // 竖排：按字符拆开
  const chars = Array.from(name);
  const n = Math.max(1, chars.length);

  // 自动字号：保证竖排总高度不超过目标 70%
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

  // 突出颜色 + 描边
  const fill = 'rgba(255, 210, 80, 0.95)';
  const stroke = 'rgba(0, 0, 0, 0.75)';

  // 名字中心放到目标上部（约 65% 位置）
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
