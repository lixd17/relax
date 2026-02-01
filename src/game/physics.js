import {
  CHARGE_MAX_SEC,
  THETA_MAX_RAD,
  VEHICLE_FLY_SEC,
  VEHICLE_SIZE_SCALE,
  VEHICLE_SPEED_MIN, VEHICLE_SPEED_MAX,
  VEHICLE_THROW_GRAV,
} from '../core/config.js';

import { clamp, lerp } from '../core/utils.js';

/**
 * Physics responsibilities:
 * - update charge timers (sec / rawSec)
 * - damped swing oscillator (theta, omega) when no overriding FX
 * - punch timeline (out/back + hit impulse)
 * - hit-mode vehicleAct (spawn, move, hit decision, leave-screen cleanup)
 * - throwFx (parabola + landing)
 * - flattenFx (down -> squash -> hold -> up)
 * - fly (spin + shrink)
 *
 * NOTE: rocket mode has been removed.
 */
export function updatePhysics(state, dt, audio, L) {
  dt = clamp(dt, 0, 0.033);

  // -------------------------
  // charge time (sec/rawSec)
  // -------------------------
  if (state.charge?.active) {
    const now = performance.now();
    const rawSec = (now - state.charge.t0) / 1000;
    state.charge.rawSec = rawSec;
    state.charge.sec = clamp(rawSec, 0, CHARGE_MAX_SEC);
  }

  // -------------------------
  // punch mode timeline
  // -------------------------
  const mode = state.modeKey ?? 'punch';
  if (mode === 'punch') stepPunch(state, dt, audio, L);

  // -------------------------
  // hit mode vehicle logic
  // -------------------------
  if (mode === 'hit' && state.vehicleAct?.active && L) {
    stepVehicleAct(state, dt, audio, L);
  }

  // -------------------------
  // FX priority
  // -------------------------
  if (state.fly?.active && L) {
    stepFly(state, dt, L);
  } else if (state.throwFx?.active && L) {
    stepThrowFx(state, dt, L);
  } else if (state.flattenFx?.active) {
    stepFlattenFx(state, dt);
  } else {
    // free swing oscillator
    const w0 = 6.0;    // natural freq
    const zeta = 0.25; // damping ratio
    const domega = (-2 * zeta * w0 * state.omega - (w0 * w0) * state.theta);
    state.omega += domega * dt;
    state.theta += state.omega * dt;
    state.theta = clamp(state.theta, -THETA_MAX_RAD, THETA_MAX_RAD);
  }

  // decay transient visual scalars
  state.squash *= Math.exp(-10.0 * dt);
  state.flash *= Math.exp(-12.0 * dt);
}

// =========================================================
// Punch
// =========================================================
function stepPunch(state, dt, audio, L) {
  const p = state.punch;
  if (!p?.active) return;
  if (!L) return;

  const outDur = 0.12;
  const backDur = 0.10;

  if (p.phase === 'out') {
    p.t += dt / outDur;
    if (p.t >= 1) {
      // reach impact
      p.t = 0;
      p.phase = 'back';

      if (!p.hitDone) {
        p.hitDone = true;
        onImpactImpulse(
          state,
          p.side,
          clamp(p.strength / CHARGE_MAX_SEC, 0, 1),
          L,
          /*allowFly*/ true,
        );
      }
    }
    return;
  }

  if (p.phase === 'back') {
    p.t += dt / backDur;
    if (p.t >= 1) {
      p.active = false;
      p.phase = 'idle';
      p.t = 0;
      p.hitDone = false;
    }
  }
}

function onImpactImpulse(state, side, strength01, L, allowFly) {
  // visual bump
  state.squash = Math.max(state.squash, lerp(0.18, 0.55, strength01));
  state.flash = Math.max(state.flash, lerp(0.25, 1.0, strength01));

  // swing impulse: side=-1 (from left) => rotate to right (positive)
  const dir = -side;
  state.omega += dir * lerp(8.0, 16.0, strength01);
  state.theta = clamp(state.theta, -THETA_MAX_RAD, THETA_MAX_RAD);

  // fly if over-charged and allowed
  if (allowFly && state.punch?.over) {
    startFly(state, side, strength01, L);
  }
}

// =========================================================
// VehicleAct (hit mode)
// =========================================================
function stepVehicleAct(state, dt, audio, L) {
  const act = state.vehicleAct;
  if (!act.active) return;

  // lazy init (needs layout)
  if (act.pendingInit) {
    initVehicleAct(act, state, L);
    act.pendingInit = false;
  }

  // move
  act.x += act.vx * dt;

  // detect hit near target (once)
  if (!act.hitDone) {
    const impactX = L.cx + act.side * (L.objW * 0.18);
    const bumperX = (act.vx > 0) ? (act.x + act.w * 0.5) : (act.x - act.w * 0.5);
    const hitNow = (act.vx > 0) ? (bumperX >= impactX) : (bumperX <= impactX);

    if (hitNow) {
      act.hitDone = true;

      // impulse on target
      onImpactImpulse(state, act.side, act.strength01, L, /*allowFly*/ false);

      // FX based on vehicle type + charge
      if (act.key === 'roller') {
        startFlattenFx(state);
      } else {
        if ((act.chargeSec ?? 0) >= VEHICLE_FLY_SEC) {
          startFly(state, act.side, act.strength01, L);
        } else {
          startThrowFx(state, act.side, act.strength01, L);
        }
      }

      audio?.playHit?.();
    }
  }

  // keep going until out of screen, then cleanup
  const margin = L.minDim * 0.25;
  const out = (act.x < -margin) || (act.x > L.W + margin);

  if (out) {
    act.active = false;
    act.pendingInit = false;

    // if roller still holding squash, start lifting up
    if (state.flattenFx?.active && state.flattenFx.phase === 'hold') {
      state.flattenFx.phase = 'up';
      state.flattenFx.t = 0;
    }
  }
}

function initVehicleAct(act, state, L) {
  const key = act.key ?? 'truck';

  const s = clamp(act.strength01 ?? 0, 0, 1);

  // approximate base size (render uses real image aspect; physics uses approx)
  const sizeFactor = getVehicleSizeFactor(key);
  const baseW = L.minDim * 0.22 * VEHICLE_SIZE_SCALE * sizeFactor;
  const ar = getVehicleAspectApprox(key); // h/w
  act.w = baseW;
  act.h = baseW * ar;

  const startX = (act.side < 0) ? L.vehicleStartXL : L.vehicleStartXR;
  act.x = startX + act.side * act.w * 0.52;

  // align to target center slightly above bottom
  act.y = L.cy + L.objH * 0.25;

  const dir = (act.side < 0) ? +1 : -1;
  const speed = lerp(VEHICLE_SPEED_MIN, VEHICLE_SPEED_MAX, s) * L.minDim;
  act.vx = dir * speed;
}

// =========================================================
// ThrowFx (truck / car short charge)
// =========================================================
function startThrowFx(state, side, strength01, L) {
  const fx = state.throwFx;
  fx.active = true;
  fx.grounded = false;
  fx.crushed = false;
  fx.side = side;
  fx.t = 0;

  // position offset relative to target center
  fx.x = 0;
  fx.y = 0;

  // flight duration based on strength (shorter = nearer)
  const p = clamp(strength01, 0, 1);
  fx.T = lerp(0.55, 0.85, p);

  // horizontal travel and arc height
  const dir = -side;
  const dx = dir * L.objW * lerp(0.35, 0.85, Math.pow(p, 2.2));
  const dy = L.objH * lerp(0.15, 0.35, p);

  fx.dxLand = dx;
  fx.dyLand = dy;

  // initial vel so that lands at (dx, dy) with gravity
  fx.g = VEHICLE_THROW_GRAV * L.minDim;
  fx.vx = dx / fx.T;
  fx.vy = -(dy / fx.T) - 0.5 * fx.g * fx.T;

  fx.ang = 0;
  fx.angVel = dir * lerp(2.0, 6.0, p);

  state.theta = 0;
  state.omega = 0;
}

function stepThrowFx(state, dt, L) {
  const fx = state.throwFx;
  if (!fx.active) return;

  fx.t += dt;

  // position in local throw space (relative to target center)
  const t = fx.t;
  const x = fx.vx * t;
  const y = fx.vy * t + 0.5 * fx.g * t * t;

  fx.x = x;
  fx.y = y;

  fx.ang += fx.angVel * dt;

  // ground contact
  const landY = fx.dyLand;
  if (!fx.grounded && (t >= fx.T || y >= landY)) {
    fx.grounded = true;
    fx.x = fx.dxLand;
    fx.y = fx.dyLand;

    // landing squish/flash
    state.squash = Math.max(state.squash, 0.55);
    state.flash = Math.max(state.flash, 0.45);
  }

  // after landing, we just keep state; render uses grounded/crushed flags for layering
  if (fx.grounded) {
    fx.crushed = true;
  }

  // cleanup after a short linger
  const maxT = fx.T + 0.9;
  if (t > maxT) {
    fx.active = false;
    fx.grounded = false;
    fx.crushed = false;
  }
}

// =========================================================
// FlattenFx (roller)
// =========================================================
function startFlattenFx(state) {
  const fx = state.flattenFx;
  fx.active = true;
  fx.phase = 'down';
  fx.t = 0;
  fx.rot01 = 0;
  fx.squash01 = 0;

  // immediate visual feedback
  state.flash = Math.max(state.flash, 0.75);
  state.squash = Math.max(state.squash, 0.55);
}

function stepFlattenFx(state, dt) {
  const fx = state.flattenFx;
  if (!fx.active) return;

  const downDur = 0.18;
  const squashDur = 0.12;
  const upDur = 0.22;

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

// =========================================================
// Fly
// =========================================================
function startFly(state, punchSide, strength01, L) {
  const fly = state.fly;

  fly.active = true;
  fly.x = 0;
  fly.y = 0;

  const dirX = -punchSide;

  const base = L.minDim * (1.35 + 0.55 * strength01);
  fly.vx = dirX * base;
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

  const margin = L.minDim * 0.2;
  const out =
    (cx < -margin) || (cx > L.W + margin) ||
    (cy < -margin) || (cy > L.H + margin) ||
    (fly.scale < 0.06);

  if (out) {
    fly.active = false;
    fly.x = 0;
    fly.y = 0;
    fly.vx = 0;
    fly.vy = 0;
    fly.ang = 0;
    fly.angVel = 0;
    fly.scale = 1;

    state.theta = 0;
    state.omega = 0;
    state.squash = 0;
    state.flash = 0;
  }
}

// =========================================================
// Vehicle sizing helpers
// =========================================================
function getVehicleSizeFactor(key) {
  if (key === 'truck') return 1.15;
  if (key === 'car') return 1.0;
  if (key === 'roller') return 0.95;
  return 1.0;
}

function getVehicleAspectApprox(key) {
  // height / width
  if (key === 'truck') return 0.56;
  if (key === 'car') return 0.48;
  if (key === 'roller') return 0.52;
  return 0.5;
}
