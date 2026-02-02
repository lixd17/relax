import {
  CHARGE_MAX_SEC, CLICK_THRESH_SEC,
  RAGE_MAX_PUNCHES,
  SWING_MIN_DEG, SWING_MAX_DEG,
  THETA_MAX_RAD,
  VEHICLE_FLY_SEC,
  VEHICLE_SIZE_SCALE,
  VEHICLE_SPEED_MIN, VEHICLE_SPEED_MAX,
  VEHICLE_LAND_MARGIN_FRAC,
  VEHICLE_THROW_GRAV,
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
  if (state.fly?.active && L) {
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

  // impact fx (decals/particles/shadow)
  stepImpactFx(state, dt);

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

  // rage: multiple punches (no charge)
  if ((state.modeKey ?? 'punch') === 'rage' && Array.isArray(state.ragePunches) && state.ragePunches.length > 0) {
    stepRagePunches(state, dt, audio, L);
  }
}

function stepRagePunches(state, dt, audio, L) {
  const outDur = 0.12;
  const backDur = 0.10;

  const list = state.ragePunches;
  // 保险：太多了就截断
  if (list.length > RAGE_MAX_PUNCHES) list.splice(0, list.length - RAGE_MAX_PUNCHES);

  for (let i = list.length - 1; i >= 0; i--) {
    const pp = list[i];
    if (!pp || !pp.active) {
      list.splice(i, 1);
      continue;
    }

    if (pp.phase === 'out') {
      pp.t += dt / outDur;
      if (!pp.hitDone && pp.t >= 1.0) {
        pp.hitDone = true;
        pp.t = 1.0;

        const strength01 = clamp(pp.strength01 ?? 0.65, 0, 1);
        applyPunchHit(state, pp.side ?? 1, strength01, false, audio, L);

        pp.phase = 'back';
      }
    } else if (pp.phase === 'back') {
      pp.t -= dt / backDur;
      if (pp.t <= 0) {
        list.splice(i, 1);
      }
    } else {
      list.splice(i, 1);
    }
  }
}

// punch hit (unchanged)
function applyPunchHit(state, side, strength01, isOverCharge, audio, L) {
  audio?.playOnce?.();

  if (L) triggerImpactFx(state, side, strength01, L, "punch");

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

      if (L) triggerImpactFx(state, act.side, act.strength01, L, act.key);

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
        startFlattenFx(state, act.side);
        state.squash = 1.0;
        state.flash = 1.0;
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
      if (L) triggerImpactFx(state, (state.throwFx.side ?? act.side ?? -1), clamp(0.35 + 0.45 * (act.strength01 ?? 0), 0, 1), L, "crush");
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
  return 2.20;
}

function vehicleAspectApprox(key) {
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
  const rotSign = -side; // mirror rotation for left/right hits

  fx.angVel = rotSign * lerp(2.0, 7.0, tCurve) * (0.7 + 0.6 * strength01);

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
function startFlattenFx(state, side) {
  const fx = state.flattenFx;
  fx.active = true;
  fx.phase = 'down';
  fx.t = 0;
  fx.rot01 = 0;
  fx.squash01 = 0;

  
  fx.side = (side ?? -1);
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

      state.theta = 0;
      state.omega = 0;
    }
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

// ---------------------------
// impact FX (shared across punch / hit / rage)
// 3) contact shadow compression
// 4) dent decal (on target)
// 6) particles
// ---------------------------
function ensureImpactFx_(state) {
  if (!state.fxImpact) {
    state.fxImpact = { shadow: 0, shadowSide: -1, decals: [], parts: [] };
  }
  if (!Array.isArray(state.fxImpact.decals)) state.fxImpact.decals = [];
  if (!Array.isArray(state.fxImpact.parts)) state.fxImpact.parts = [];
}

function triggerImpactFx(state, side, strength01, L, kind) {
  if (!L) return;
  ensureImpactFx_(state);

  const fx = state.fxImpact;
  const s = clamp(strength01 ?? 0, 0, 1);

  // shadow pulse
  fx.shadowSide = (side ?? -1);
  fx.shadow = Math.max(fx.shadow ?? 0, 0.25 + 0.75 * s);

  // dent decal (target-local)
  const tgt = getTarget(state);
  let u = 0.18 * (side ?? 1);
  let v = (tgt.type === 'boss') ? -0.12 : -0.05;

  // small jitter (keeps symmetry while avoiding perfect stacking)
  u += (Math.random() - 0.5) * 0.05;
  v += (Math.random() - 0.5) * 0.04;
  u = clamp(u, -0.45, 0.45);
  v = clamp(v, -0.45, 0.45);

  const r01Base = lerp(0.055, 0.115, s) * ((tgt.type === 'boss') ? 1.10 : 1.00);
  const life = lerp(2.0, 3.2, s);
  fx.decals.push({ u, v, r01: r01Base, rot: (Math.random() * 2 - 1) * 0.8, age: 0, life, side: (side ?? 1) });
  if (fx.decals.length > 12) fx.decals.splice(0, fx.decals.length - 12);

  // particles (world-space)
  let dx = 0, dy = 0;
  if (state.fly?.active) {
    dx = state.fly.x ?? 0;
    dy = state.fly.y ?? 0;
  } else if (state.throwFx?.active) {
    dx = state.throwFx.x ?? 0;
    dy = state.throwFx.y ?? 0;
  }

  const cx2 = L.cx + dx;
  const cy2 = L.cy + dy;

  const impactX = cx2 + (side ?? 1) * (L.objW * 0.18);
  const impactY = cy2 + ((tgt.type === 'boss') ? (-L.objH * 0.12) : (-L.objH * 0.05));

  let n = Math.round(8 + 18 * s);
  if (kind === 'roller') n = Math.round(n * 1.15);
  if (kind === 'truck') n = Math.round(n * 1.10);

  const baseAngle = ((side ?? 1) < 0) ? Math.PI : 0;
  const tilt = -0.45;
  const spread = 0.95;

  for (let i = 0; i < n; i++) {
    const a = baseAngle + tilt + (Math.random() - 0.5) * 2 * spread;
    const sp = L.minDim * (0.55 + 0.75 * Math.random()) * (0.20 + 0.85 * s);
    const vx = Math.cos(a) * sp;
    const vy = Math.sin(a) * sp;

    const r = L.minDim * (0.0035 + 0.0040 * Math.random());
    const lifeP = lerp(0.18, 0.55, Math.random()) * (0.75 + 0.65 * s);
    const g = L.minDim * (2.2 + 1.0 * Math.random());
    const alpha = 0.55 + 0.35 * Math.random();

    fx.parts.push({ x: impactX, y: impactY, vx, vy, r, age: 0, life: lifeP, a: alpha, g });
  }

  // cap for rage spam
  if (fx.parts.length > 180) fx.parts.splice(0, fx.parts.length - 180);
}

function stepImpactFx(state, dt) {
  ensureImpactFx_(state);
  const fx = state.fxImpact;

  // shadow pulse decay
  fx.shadow = (fx.shadow ?? 0) * Math.exp(-14.0 * dt);
  if (fx.shadow < 1e-3) fx.shadow = 0;

  // decals
  for (let i = fx.decals.length - 1; i >= 0; i--) {
    const d = fx.decals[i];
    d.age += dt;
    if (d.age >= d.life) fx.decals.splice(i, 1);
  }

  // particles
  const drag = Math.exp(-3.2 * dt);
  for (let i = fx.parts.length - 1; i >= 0; i--) {
    const p = fx.parts[i];
    p.age += dt;
    if (p.age >= p.life) {
      fx.parts.splice(i, 1);
      continue;
    }
    p.vy += (p.g ?? 0) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= drag;
    p.vy *= drag;
  }
}
