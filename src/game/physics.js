import {
  CHARGE_MAX_SEC, CLICK_THRESH_SEC,
  SWING_MIN_DEG, SWING_MAX_DEG,
  THETA_MAX_RAD
} from '../core/config.js';

import { clamp, deg2rad } from '../core/utils.js';
import { getTarget } from './layout.js';

export function updatePhysics(state, dt, audio, L) {
  dt = clamp(dt, 0, 0.033);

  // ✅ 兼容：如果 state.fly 还没初始化（防止漏改 state.js）
  if (!state.fly) {
    state.fly = {
      active: false,
      x: 0, y: 0,
      vx: 0, vy: 0,
      ang: 0,
      angVel: 0,
      scale: 1,
    };
  }

  // charge time：同时记录 clamped sec 和 rawSec（raw 用于判断 >3s）
  if (state.charge && state.charge.active) {
    const now = performance.now();
    const rawSec = (now - state.charge.t0) / 1000;

    state.charge.rawSec = rawSec;
    state.charge.sec = clamp(rawSec, 0, CHARGE_MAX_SEC);
  }

  // ✅ 打飞更新（飞行时不再走摆动振子）
  if (state.fly.active && L) {
    stepFly(state, dt, L);
  } else {
    // damped oscillator（正常摆动）
    const w0 = 6.0;
    const zeta = 0.25;

    const domega = (-2 * zeta * w0 * state.omega - (w0 * w0) * state.theta);
    state.omega += domega * dt;
    state.theta += state.omega * dt;
    state.theta = clamp(state.theta, -THETA_MAX_RAD, THETA_MAX_RAD);
  }

  // decay
  state.squash *= Math.exp(-10.0 * dt);
  state.flash *= Math.exp(-12.0 * dt);

  // punch animation
  const p = state.punch;
  if (p && p.active) {
    const outDur = 0.12;
    const backDur = 0.10;

    if (p.phase === 'out') {
      p.t += dt / outDur;
      if (!p.hitDone && p.t >= 1.0) {
        p.hitDone = true;

        // strength: 秒 -> 0..1
        let strength01 = clamp(p.strength / CHARGE_MAX_SEC, 0, 1);
        if (p.strength < CLICK_THRESH_SEC) strength01 = 0;

        // ✅ 超时蓄力触发打飞（p.over 由 input.js 在松开时写入）
        applyHit(state, p.side, strength01, !!p.over, audio, L);

        p.phase = 'back';
        p.t = 1.0;
      }
    } else if (p.phase === 'back') {
      p.t -= dt / backDur;
      if (p.t <= 0) {
        p.t = 0;
        p.phase = 'idle';
        p.active = false;
      }
    }
  }
}

function applyHit(state, side, strength01, isOverCharge, audio, L) {
  // 命中音效
  audio?.playOnce?.();

  // ✅ 超时蓄力：打飞（需要 layout）
  if (isOverCharge && L) {
    startFly(state, side, strength01, L);
    state.squash = 1.0;
    state.flash = 1.0;
    return;
  }

  // 如果正在飞，忽略普通摆动（防止逻辑叠加）
  if (state.fly?.active) return;

  const tgt = getTarget(state);

  // boss 初始方向反向（你之前要求）
  const typeDir = (tgt.type === 'boss') ? -1 : +1;

  const swingDeg = SWING_MIN_DEG + (SWING_MAX_DEG - SWING_MIN_DEG) * strength01;
  const peak = deg2rad(swingDeg);

  const w0 = 6.0;
  const omegaImpulse = peak * w0;

  state.omega += omegaImpulse * side * typeDir;
  state.squash = 1.0;
  state.flash = 1.0;
}

function startFly(state, punchSide, strength01, L) {
  const fly = state.fly;

  fly.active = true;
  fly.x = 0;
  fly.y = 0;

  // 左拳(-1) => 右上；右拳(+1) => 左上
  const dirX = -punchSide;

  const base = L.minDim * (1.35 + 0.55 * strength01); // px/s
  fly.vx = dirX * base * 1.0;
  fly.vy = -base * 0.85;

  fly.ang = 0;
  fly.angVel = dirX * (7.0 + 5.0 * strength01);

  fly.scale = 1;

  // 打飞时不叠加摆动
  state.theta = 0;
  state.omega = 0;
}

function stepFly(state, dt, L) {
  const fly = state.fly;
  if (!fly.active) return;

  fly.x += fly.vx * dt;
  fly.y += fly.vy * dt;
  fly.ang += fly.angVel * dt;

  // 越来越小（指数衰减更顺）
  fly.scale *= Math.exp(-1.6 * dt);

  const cx = L.cx + fly.x;
  const cy = L.cy + fly.y;

  const margin = L.minDim * 0.20;
  const out =
    (cx < -margin) || (cx > L.W + margin) ||
    (cy < -margin) || (cy > L.H + margin) ||
    (fly.scale < 0.06);

  if (out) {
    // ✅ 回到中间并复位
    fly.active = false;
    fly.x = 0; fly.y = 0;
    fly.vx = 0; fly.vy = 0;
    fly.ang = 0;
    fly.angVel = 0;
    fly.scale = 1;

    state.theta = 0;
    state.omega = 0;
    state.squash = 0;
    state.flash = 0;
  }
}
