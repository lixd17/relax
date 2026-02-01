import {
  CHARGE_MAX_SEC, CLICK_THRESH_SEC,
  SWING_MIN_DEG, SWING_MAX_DEG,
  THETA_MAX_RAD,
  VEHICLE_FLY_SEC,
  VEHICLE_SPEED_MIN, VEHICLE_SPEED_MAX,
  VEHICLE_LANE_Y_FRAC,
  VEHICLE_LAND_MARGIN_FRAC,
  VEHICLE_THROW_GRAV,
  ROCKET_SPIRAL_AMP_MIN,
  ROCKET_SPIRAL_AMP_MAX,
  EXPLOSION_DUR_SEC,
} from '../core/config.js';

import { clamp, deg2rad, lerp } from '../core/utils.js';
import { getTarget } from './layout.js';

export function updatePhysics(state, dt, audio, L) {
  dt = clamp(dt, 0, 0.033);

  // charge time：记录 sec(0..3) + rawSec
  if (state.charge?.active) {
    const now = performance.now();
    const rawSec = (now - state.charge.t0) / 1000;
    state.charge.rawSec = rawSec;
    state.charge.sec = clamp(rawSec, 0, CHARGE_MAX_SEC);
  }

  // ✅ hit 模式车辆：车辆运动可与 fly 并存（车继续开走）
  if (state.vehicleAct?.active && L) {
    stepVehicleAct(state, dt, audio, L);
  }

  // ✅ 目标特效更新优先级（rocket > fly > throw/flatten > swing）
  if (state.rocketFx?.active && L) {
    stepRocketFx(state, dt, L);
  } else if (state.fly?.active && L) {
    stepFly(state, dt, L);
  } else if (state.throwFx?.active && L) {
    stepThrowFx(state, dt, L);
  } else if (state.flattenFx?.active) {
    stepFlattenFx(state, dt);
  } else {
    // 正常摆动振子
    const w0 = 6.0;
    const zeta = 0.25;

    const domega = (-2 * zeta * w0 * state.omega - (w0 * w0) * state.theta);
    state.omega += domega * dt;
    state.theta += state.omega * dt;
    state.theta = clamp(state.theta, -THETA_MAX_RAD, THETA_MAX_RAD);
  }

  // explosion（可与其他共存）
  if (state.explosion?.active) {
    state.explosion.t += dt;
    if (state.explosion.t >= EXPLOSION_DUR_SEC) {
      state.explosion.active = false;
      state.explosion.t = 0;
    }
  }

  // decay
  state.squash *= Math.exp(-10.0 * dt);
  state.flash *= Math.exp(-12.0 * dt);

  // punch animation（仅 punch 模式使用）
  const p = state.punch;
  if (p && p.active && (state.modeKey ?? 'punch') === 'punch') {
    const outDur = 0.12;
    const backDur = 0.10;

    if (p.phase === 'out') {
      p.t += dt / outDur;
      if (!p.hitDone && p.t >= 1.0) {
        p.hitDone = true;

        let strength01 = clamp(p.strength / CHARGE_MAX_SEC, 0, 1);
        if (p.strength < CLICK_THRESH_SEC) strength01 = 0;

        applyPunchHit(state, p.side, strength01, !!p.over, audio, L);

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

// ---------------------------
// punch 模式命中
// ---------------------------
function applyPunchHit(state, side, strength01, isOverCharge, audio, L) {
  audio?.playOnce?.();

  // 超时：原 fly（左右拳方向）
  if (isOverCharge && L) {
    startFly(state, side, strength01, L);
    state.squash = 1.0;
    state.flash = 1.0;
    return;
  }

  if (state.fly?.active) return;

  const tgt = getTarget(state);
  const typeDir = (tgt.type === 'boss') ? -1 : +1;

  const swingDeg = SWING_MIN_DEG + (SWING_MAX_DEG - SWING_MIN_DEG) * strength01;
  const peak = deg2rad(swingDeg);

  const w0 = 6.0;
  const omegaImpulse = peak * w0;

  state.omega += omegaImpulse * side * typeDir;
  state.squash = 1.0;
  state.flash = 1.0;
}

// ---------------------------
// ✅ hit 模式车辆主逻辑
// ---------------------------
function stepVehicleAct(state, dt, audio, L) {
  const act = state.vehicleAct;
  if (!act.active) return;

  // init（需要 layout）
  if (act.pendingInit) {
    initVehicleAct(act, L);
    act.pendingInit = false;
  }

  // 移动（一直到右侧出屏才消失）
  act.x += act.vx * dt;

  // 碰撞判定（只触发一次）
  if (!act.hitDone) {
    const impactX = L.cx - L.objW * 0.18; // 目标偏左一点
    const frontX = act.x + act.w * 0.5;

    if (frontX >= impactX) {
      act.hitDone = true;

      // 命中音效
      audio?.playOnce?.();

      // truck/car：<2.5 抛物线；>=2.5 走原 fly
      if (act.key === 'truck' || act.key === 'car') {
        if (act.chargeSec >= VEHICLE_FLY_SEC) {
          // ✅ fly：方向固定“右上”
          startFly(state, -1, act.strength01, L);
          state.squash = 1.0;
          state.flash = 1.0;
        } else {
          startThrowFx(state, act.chargeSec, act.strength01, L);
          state.squash = 1.0;
          state.flash = 1.0;
        }
      }

      // roller：压扁
      if (act.key === 'roller') {
        startFlattenFx(state);
        state.squash = 1.0;
        state.flash = 1.0;
      }

      // rocket：螺旋升天 + 爆炸
      if (act.key === 'rocket') {
        startRocketFx(state, act.strength01, L);
        state.squash = 1.0;
        state.flash = 1.0;

        // rocket 交给 rocketFx 渲染/运动，vehicleAct 不再负责
        act.active = false;
        return;
      }
    }
  }

  // truck/car：当抛物线落地后，让车“碾过去”触发一次更强的挤压
  if (state.throwFx?.active && state.throwFx.grounded && !state.throwFx.crushed) {
    const tx = L.cx + state.throwFx.x;
    const passed = (act.x + act.w * 0.1) >= tx;
    if (passed) {
      state.throwFx.crushed = true;
      state.squash = 1.0;
      state.flash = 1.0;
    }
  }

  // 出屏：车辆中心超过右侧一定距离
  const out = (act.x - act.w * 0.5) > (L.W + act.w * 0.8);
  if (out) {
    act.active = false;

    // 若是 throw/flatten 造成的“停留状态”，车走后恢复
    if (state.throwFx?.active) {
      state.throwFx.active = false;
      state.throwFx.grounded = false;
      state.throwFx.t = 0;
      state.throwFx.x = 0;
      state.throwFx.y = 0;
      state.throwFx.ang = 0;
      state.throwFx.crushed = false;
    }

    if (state.flattenFx?.active) {
      // 让 flatten 进入回弹阶段
      state.flattenFx.phase = 'up';
      state.flattenFx.t = 0;
    }

    // 复位一点点（避免残余摆动）
    state.theta = 0;
    state.omega = 0;
  }
}

function initVehicleAct(act, L) {
  const minDim = L.minDim;

  // 车辆大小（仅用作物理碰撞/出屏；渲染会用真实图片比例再算一遍）
  const sizeFactor = vehicleSizeFactor(act.key);
  const w = minDim * 0.1 * sizeFactor;
  const ar = vehicleAspectApprox(act.key); // h/w
  const h = w * ar;

  act.w = w;
  act.h = h;

  // 车道 y：尽量靠近屏幕下方，但别太贴底
  const laneY = clamp(L.H * VEHICLE_LANE_Y_FRAC, L.H * 0.55, L.H * 0.92);
  act.y = laneY;

  // 从左侧外进入
  act.x = -w * 0.65;

  // 速度：随 chargeSec 增加，>3s 不增（因为 chargeSec 已被 clamp）
  const k = clamp(act.chargeSec / CHARGE_MAX_SEC, 0, 1);
  act.vx = minDim * lerp(VEHICLE_SPEED_MIN, VEHICLE_SPEED_MAX, k);
}

function vehicleSizeFactor(key) {
  if (key === 'truck') return 2.35;
  if (key === 'car') return 2.10;
  if (key === 'roller') return 2.25;
  if (key === 'rocket') return 2.20;
  return 2.20;
}

function vehicleAspectApprox(key) {
  // 物理近似比例，不必完全准确（渲染会按真实图片）
  if (key === 'rocket') return 0.55;
  return 0.50;
}

// ---------------------------
// throwFx（truck/car 2.5s以下）
// ---------------------------
function startThrowFx(state, chargeSec, strength01, L) {
  const fx = state.throwFx;

  fx.active = true;
  fx.grounded = false;
  fx.t = 0;

  // p: 0..1（0->很短；接近2.5->很远）
  const p = clamp(chargeSec / VEHICLE_FLY_SEC, 0, 1);

  const margin = L.minDim * VEHICLE_LAND_MARGIN_FRAC;
  const landX = (L.W - margin);
  fx.dxLand = landX - L.cx;

  // 落地时中心稍微更靠下（看起来“掉到地上”）
  fx.dyLand = clamp(L.objH * 0.22, 10, L.H * 0.35);

  // 飞行时间（远一点 -> 时间略长）
  fx.T = lerp(0.48, 0.85, p);

  // 重力
  fx.g = L.minDim * VEHICLE_THROW_GRAV;

  // 速度求解：到达 (dxLand, dyLand) 用时 T
  fx.vx = fx.dxLand / fx.T;
  fx.vy = (fx.dyLand - 0.5 * fx.g * fx.T * fx.T) / fx.T;

  fx.x = 0;
  fx.y = 0;

  // 旋转（轻微）
  fx.ang = 0;
  fx.angVel = lerp(2.5, 6.5, p) * (0.7 + 0.6 * strength01);

  fx.crushed = false;

  // 抛物线期间关闭摆动
  state.theta = 0;
  state.omega = 0;
}

function stepThrowFx(state, dt, L) {
  const fx = state.throwFx;
  if (!fx.active) return;

  if (!fx.grounded) {
    fx.t += dt;
    const t = fx.t;

    fx.x = fx.vx * t;
    fx.y = fx.vy * t + 0.5 * fx.g * t * t;

    fx.ang += fx.angVel * dt;

    // 落地判定
    if (t >= fx.T || fx.y >= fx.dyLand) {
      fx.grounded = true;
      fx.x = fx.dxLand;
      fx.y = fx.dyLand;
      fx.t = 0;
    }
  } else {
    // 落地后保持
    fx.ang *= Math.exp(-4.0 * dt);
  }
}

// ---------------------------
// flattenFx（roller）
// ---------------------------
function startFlattenFx(state) {
  const fx = state.flattenFx;
  fx.active = true;
  fx.phase = 'down';
  fx.t = 0;
  fx.prog = 0;

  // 压扁时不摆动
  state.theta = 0;
  state.omega = 0;
}

function stepFlattenFx(state, dt) {
  const fx = state.flattenFx;
  if (!fx.active) return;

  // 下压
  const downDur = 0.18;
  const upDur = 0.28;

  if (fx.phase === 'down') {
    fx.t += dt;
    fx.prog = clamp(fx.t / downDur, 0, 1);
    if (fx.prog >= 1) {
      fx.phase = 'hold';
      fx.t = 0;
      fx.prog = 1;
    }
    return;
  }

  if (fx.phase === 'hold') {
    // 只要 roller 还在跑，就一直 hold；roller 出屏时会把 phase 切到 up
    fx.prog = 1;
    return;
  }

  if (fx.phase === 'up') {
    fx.t += dt;
    fx.prog = 1 - clamp(fx.t / upDur, 0, 1);
    if (fx.prog <= 0) {
      fx.active = false;
      fx.phase = 'down';
      fx.t = 0;
      fx.prog = 0;
    }
  }
}

// ---------------------------
// rocketFx（螺旋升天 + 爆炸）
// ---------------------------
function startRocketFx(state, strength01, L) {
  const fx = state.rocketFx;
  fx.active = true;
  fx.t = 0;

  fx.strength01 = clamp(strength01, 0, 1);

  // 从命中点附近开始（偏左一点）
  fx.baseX = L.cx - L.objW * 0.16;
  fx.baseY = L.cy - L.objH * 0.08;

  // 右上升
  fx.vx = L.minDim * lerp(0.75, 1.15, fx.strength01);
  fx.vy = -L.minDim * lerp(0.85, 1.25, fx.strength01);

  fx.phi = 0;
  fx.amp = L.minDim * ROCKET_SPIRAL_AMP_MIN;

  fx.x = fx.baseX;
  fx.y = fx.baseY;

  // rocket 期间不摆动
  state.theta = 0;
  state.omega = 0;
}

function stepRocketFx(state, dt, L) {
  const fx = state.rocketFx;
  if (!fx.active) return;

  fx.t += dt;

  fx.baseX += fx.vx * dt;
  fx.baseY += fx.vy * dt;

  // 螺旋：幅度渐大
  const ampMax = L.minDim * ROCKET_SPIRAL_AMP_MAX;
  const amp = lerp(L.minDim * ROCKET_SPIRAL_AMP_MIN, ampMax, clamp(fx.t / 1.2, 0, 1));
  fx.amp = amp;

  // 角速度随强度
  const w = (9.0 + 6.0 * fx.strength01);
  fx.phi += w * dt;

  fx.x = fx.baseX + amp * Math.cos(fx.phi);
  fx.y = fx.baseY + amp * Math.sin(fx.phi);

  const margin = L.minDim * 0.20;
  const out = (fx.x > L.W + margin) || (fx.y < -margin);

  if (out) {
    // 爆炸
    state.explosion.active = true;
    state.explosion.t = 0;
    state.explosion.x = clamp(fx.x, -margin, L.W + margin);
    state.explosion.y = clamp(fx.y, -margin, L.H + margin);

    // 复位 rocketFx
    fx.active = false;
    fx.t = 0;

    // 同时清掉其他状态（避免叠加）
    state.fly.active = false;
    state.throwFx.active = false;
    state.flattenFx.active = false;

    state.theta = 0;
    state.omega = 0;
    state.squash = 0;
    state.flash = 0;
  }
}

// ---------------------------
// fly（原逻辑，复用）
// ---------------------------
function startFly(state, punchSide, strength01, L) {
  const fly = state.fly;

  fly.active = true;
  fly.x = 0;
  fly.y = 0;

  const dirX = -punchSide; // punchSide=-1 -> 右上

  const base = L.minDim * (1.35 + 0.55 * strength01); // px/s
  fly.vx = dirX * base * 1.0;
  fly.vy = -base * 0.85;

  fly.ang = 0;
  fly.angVel = dirX * (7.0 + 5.0 * strength01);

  fly.scale = 1;

  state.theta = 0;
  state.omega = 0;
}

function stepFly(state, dt, L) {
  const fly = state.fly;
  if (!fly.active) return;

  fly.x += fly.vx * dt;
  fly.y += fly.vy * dt;
  fly.ang += fly.angVel * dt;

  fly.scale *= Math.exp(-1.6 * dt);

  const cx = L.cx + fly.x;
  const cy = L.cy + fly.y;

  const margin = L.minDim * 0.20;
  const out =
    (cx < -margin) || (cx > L.W + margin) ||
    (cy < -margin) || (cy > L.H + margin) ||
    (fly.scale < 0.06);

  if (out) {
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
