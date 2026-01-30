import {
    CHARGE_MAX_SEC, CLICK_THRESH_SEC,
    SWING_MIN_DEG, SWING_MAX_DEG,
    THETA_MAX_RAD
  } from '../core/config.js';
  import { clamp, deg2rad } from '../core/utils.js';
  import { getTarget } from './layout.js';
  
  export function updatePhysics(state, dt, audio) {
    dt = clamp(dt, 0, 0.033);
  
    // charge time
    if (state.charge.active) {
      const now = performance.now();
      const sec = (now - state.charge.t0) / 1000;
      state.charge.sec = clamp(sec, 0, CHARGE_MAX_SEC);
    }
  
    // damped oscillator
    const w0 = 6.0;
    const zeta = 0.25;
  
    const domega = (-2 * zeta * w0 * state.omega - (w0 * w0) * state.theta);
    state.omega += domega * dt;
    state.theta += state.omega * dt;
    state.theta = clamp(state.theta, -THETA_MAX_RAD, THETA_MAX_RAD);
  
    state.squash *= Math.exp(-10.0 * dt);
    state.flash *= Math.exp(-12.0 * dt);
  
    // punch animation
    const p = state.punch;
    if (p.active) {
      const outDur = 0.12;
      const backDur = 0.10;
  
      if (p.phase === 'out') {
        p.t += dt / outDur;
        if (!p.hitDone && p.t >= 1.0) {
          p.hitDone = true;
  
          // strength: 秒 -> 0..1
          let strength01 = clamp(p.strength / CHARGE_MAX_SEC, 0, 1);
          if (p.strength < CLICK_THRESH_SEC) strength01 = 0;
  
          applyHit(state, p.side, strength01, audio);
  
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
  
  function applyHit(state, side, strength01, audio) {
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
  
    audio?.playOnce?.();
  }
  