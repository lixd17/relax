import {
  CHARGE_MAX_SEC, CLICK_THRESH_SEC,
  SWING_MIN_DEG, SWING_MAX_DEG,
  THETA_MAX_RAD,
  VEHICLE_FLY_SEC,
  VEHICLE_SIZE_SCALE,
  VEHICLE_SPEED_MIN, VEHICLE_SPEED_MAX,
  VEHICLE_LAND_MARGIN_FRAC,
  VEHICLE_THROW_GRAV,
  ROCKET_CURVE_AY,
} from '../core/config.js';

import { clamp, deg2rad, lerp } from '../core/utils.js';
import { getTarget } from './layout.js';

export function updatePhysics(state, dt, audio, L) {
  dt = clamp(dt, 0, 0.033);

  // charge time
  if (state.charge?.active) {
    const now = performance.now();
    const rawSec = (now - state.charge.t0) / 1000;
    state.charge.rawSec = rawSec;
    state.charge.sec = clamp(rawSec, 0, CHARGE_MAX_SEC);
  }

  // hit mode vehicle
  if (state.vehicleAct?.active && L) stepVehicleAct(state, dt, audio, L);

  // fx priority
  if (state.rocketFx?.active && L) {
    stepRocketFx(state, dt, L);
  } else if (state.fly?.active && L) {
    stepFly(state, dt, L);
  } else if (state.throwFx?.active && L) {
    stepThrowFx(state, dt, L);
  } else if (state.flattenFx?.active) {
    stepFlattenFx(state, dt);
  } else {
    // swing oscillator
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

  // punch animation (punch mode only)
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

// punch hit (unchanged)
function applyPunchHit(state, side, strength01, isOverCharge, audio, L) {
  audio?.playOnce?.();

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
// Vehicle Act (hit mode)
// ---------------------------
function stepVehicleAct(state, dt, audio, L) {
  const act = state.vehicleAct;
  if (!act.active) return;

  if (act.pendingInit) {
    initVehicleAct(act, L);
    act.pendingInit = false;
  }

  act.x += act.vx * dt;

  if (!act.hitDone) {
    const impactX = L.cx + act.side * (L.objW * 0.18);

    const bumperX = (act.vx >= 0) ? (act.x + act.w * 0.5) : (act.x - act.w * 0.5);
    const hit = (act.vx >= 0) ? (bumperX >= impactX) : (bumperX <= impactX);

    if (hit) {
      act.hitDone = true;
      audio?.playOnce?.();

      if (act.key === 'truck' || act.key === 'car') {
        if (act.chargeSec >= VEHICLE_FLY_SEC) {
          startFly(state, act.side, act.strength01, L);
          state.squash = 1.0;
          state.flash = 1.0;
        } else {
          startThrowFx(state, act.side, act.chargeSec, act.strength01, L);
          state.squash = 1.0;
          state.flash = 1.0;
        }
      }

      if (act.key === 'roller') {
        startFlattenFx(state);
        state.squash = 1.0;
        state.flash = 1.0;
      }

      if (act.key === 'rocket') {
        startRocketFx(state, act.side, act.strength01, L);
        state.squash = 1.0;
        state.flash = 1.0;
        act.active = false;
        return;
      }
    }
  }

  // car/truck: after grounded, "roll over" once
  if (state.throwFx?.active && state.throwFx.grounded && !state.throwFx.crushed) {
    const tx = L.cx + state.throwFx.x;
    const passed = (act.vx >= 0) ? ((act.x + act.w * 0.10) >= tx) : ((act.x - act.w * 0.10) <= tx);
    if (passed) {
      state.throwFx.crushed = true;
      state.squash = 1.0;
      state.flash = 1.0;
    }
  }

  // out of screen
  const out = (act.vx >= 0)
    ? ((act.x - act.w * 0.5) > (L.W + act.w * 0.60))
    : ((act.x + act.w * 0.5) < (-act.w * 0.60));

  if (out) {
    act.active = false;

    if (state.throwFx?.active) {
      state.throwFx.active = false;
      state.throwFx.grounded = false;
      state.throwFx.t = 0;
      state.throwFx.x = 0;
      state.throwFx.y = 0;
      state.throwFx.ang = 0;
      state.throwFx.crushed = false;
    }

    // roller 出屏后：开始回弹（up）
    if (state.flattenFx?.active) {
      state.flattenFx.phase = 'up';
      state.flattenFx.t = 0;
    }

    state.theta = 0;
    state.omega = 0;
  }
}

function initVehicleAct(act, L) {
  const minDim = L.minDim;

  const sizeFactor = vehicleSizeFactor(act.key);
  const baseW = minDim * 0.1 * sizeFactor * VEHICLE_SIZE_SCALE;
  const ar = vehicleAspectApprox(act.key);
  const w = baseW;
  const h = baseW * ar;

  act.w = w;
  act.h = h;

  // y align with target center
  act.y = L.cy;

  // ✅ vehicle start positions: 1/6 & 5/6 (not fists)
  const startX = (act.side < 0) ? L.vehicleStartXL : L.vehicleStartXR;

  const k = clamp(act.chargeSec / CHARGE_MAX_SEC, 0, 1);
  const speed = minDim * lerp(VEHICLE_SPEED_MIN, VEHICLE_SPEED_MAX, k);

  act.vx = (act.side < 0) ? (+speed) : (-speed);

  // align front edge near startX
  if (act.vx >= 0) act.x = startX - w * 0.52;
  else act.x = startX + w * 0.52;
}

function vehicleSizeFactor(key) {
  if (key === 'truck') return 2.35;
  if (key === 'car') return 2.10;
  if (key === 'roller') return 2.25;
  if (key === 'rocket') return 2.20;
  return 2.20;
}

function vehicleAspectApprox(key) {
  if (key === 'rocket') return 0.55;
  return 0.50;
}

// ---------------------------
// throwFx
// ---------------------------
function startThrowFx(state, side, chargeSec, strength01, L) {
  const fx = state.throwFx;

  fx.active = true;
  fx.grounded = false;
  fx.t = 0;
  fx.side = side;

  const p = clamp(chargeSec / VEHICLE_FLY_SEC, 0, 1);
  const tCurve = Math.pow(p, 2.2);

  const margin = L.minDim * VEHICLE_LAND_MARGIN_FRAC;

  const maxDx = (side < 0)
    ? ((L.W - margin) - L.cx)
    : ((margin) - L.cx);

  const minDx = (side < 0 ? +1 : -1) * (L.objW * 0.35);

  fx.dxLand = lerp(minDx, maxDx, tCurve);
  fx.dyLand = clamp(L.objH * 0.22, 8, L.H * 0.28);

  fx.T = lerp(0.32, 0.85, tCurve);
  fx.g = L.minDim * VEHICLE_THROW_GRAV;

  fx.vx = fx.dxLand / fx.T;
  fx.vy = (fx.dyLand - 0.5 * fx.g * fx.T * fx.T) / fx.T;

  fx.x = 0;
  fx.y = 0;

  fx.ang = 0;
  fx.angVel = lerp(2.0, 7.0, tCurve) * (0.7 + 0.6 * strength01);

  fx.crushed = false;

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

    if (t >= fx.T || fx.y >= fx.dyLand) {
      fx.grounded = true;
      fx.x = fx.dxLand;
      fx.y = fx.dyLand;
      fx.t = 0;
    }
  } else {
    fx.ang *= Math.exp(-4.0 * dt);
  }
}

// ---------------------------
// ✅ flattenFx (roller): down -> squash -> hold -> up
// ---------------------------
function startFlattenFx(state) {
  const fx = state.flattenFx;
  fx.active = true;
  fx.phase = 'down';
  fx.t = 0;
  fx.rot01 = 0;
  fx.squash01 = 0;

  state.theta = 0;
  state.omega = 0;
}

function stepFlattenFx(state, dt) {
  const fx = state.flattenFx;
  if (!fx.active) return;

  const downDur = 0.18;     // stand -> lie down
  const squashDur = 0.16;   // lie down -> squash
  const upDur = 0.26;       // restore

  if (fx.phase === 'down') {
    fx.t += dt;
    fx.rot01 = clamp(fx.t / downDur, 0, 1);
    fx.squash01 = 0;
    if (fx.rot01 >= 1) {
      fx.phase = 'squash';
      fx.t = 0;
    }
    return;
  }

  if (fx.phase === 'squash') {
    fx.t += dt;
    fx.rot01 = 1;
    fx.squash01 = clamp(fx.t / squashDur, 0, 1);
    if (fx.squash01 >= 1) {
      fx.phase = 'hold';
      fx.t = 0;
    }
    return;
  }

  if (fx.phase === 'hold') {
    fx.rot01 = 1;
    fx.squash01 = 1;
    return;
  }

  if (fx.phase === 'up') {
    fx.t += dt;
    const k = 1 - clamp(fx.t / upDur, 0, 1);
    fx.rot01 = k;
    fx.squash01 = k;

    if (k <= 0) {
      fx.active = false;
      fx.phase = 'down';
      fx.t = 0;
      fx.rot01 = 0;
      fx.squash01 = 0;
    }
  }
}

// ---------------------------
// rocketFx (simplified quadratic curve)
// ---------------------------
function startRocketFx(state, side, strength01, L) {
  const fx = state.rocketFx;
  fx.active = true;
  fx.side = side;

  fx.x = L.cx + side * (L.objW * 0.18);
  fx.y = L.cy - L.objH * 0.06;

  const s = clamp(strength01, 0, 1);
  const dir = (side < 0) ? +1 : -1;

  fx.vx = dir * L.minDim * lerp(0.95, 1.45, s);
  fx.vy = -L.minDim * lerp(0.55, 0.95, s);
  fx.ay = -L.minDim * ROCKET_CURVE_AY * lerp(0.85, 1.20, s);

  state.theta = 0;
  state.omega = 0;
}

function stepRocketFx(state, dt, L) {
  const fx = state.rocketFx;
  if (!fx.active) return;

  fx.x += fx.vx * dt;
  fx.y += fx.vy * dt + 0.5 * fx.ay * dt * dt;
  fx.vy += fx.ay * dt;

  const margin = L.minDim * 0.25;
  const out =
    (fx.x < -margin) || (fx.x > L.W + margin) ||
    (fx.y < -margin) || (fx.y > L.H + margin);

  if (out) {
    fx.active = false;
    fx.x = 0; fx.y = 0;
    fx.vx = 0; fx.vy = 0; fx.ay = 0;

    state.theta = 0;
    state.omega = 0;
    state.squash = 0;
    state.flash = 0;
  }
}

// ---------------------------
// fly (unchanged)
// ---------------------------
function startFly(state, punchSide, strength01, L) {
  const fly = state.fly;

  fly.active = true;
  fly.x = 0;
  fly.y = 0;

  const dirX = -punchSide;

  const base = L.minDim * (1.35 + 0.55 * strength01);
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
