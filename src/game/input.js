import { CHARGE_MAX_SEC } from '../core/config.js';

export function attachInput(canvas, getDpr, state, audio) {
  function startCharge(side) {
    if (state.fly?.active) return;      // ✅ 飞行中不允许蓄力
    if (state.punch.active) return;
    if (state.charge.active) return;

    state.interacted = true;
    state.charge.active = true;
    state.charge.side = side;
    state.charge.t0 = performance.now();
    state.charge.sec = 0;
    state.charge.rawSec = 0;

    audio?.startCharge?.();
  }

  function releaseChargeToPunch() {
    if (!state.charge.active) return;
    if (state.punch.active) return;

    // 飞行中：直接取消
    if (state.fly?.active) {
      audio?.stopCharge?.();
      state.charge.active = false;
      return;
    }

    audio?.stopCharge?.();

    const side = state.charge.side;
    const sec = state.charge.sec;
    const rawSec = (state.charge.rawSec ?? sec);

    state.charge.active = false;

    state.punch.active = true;
    state.punch.phase = 'out';
    state.punch.t = 0;
    state.punch.hitDone = false;
    state.punch.side = side;
    state.punch.strength = sec;
    state.punch.over = rawSec > CHARGE_MAX_SEC;  // ✅ >3s
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);

    const dpr = getDpr();
    const xCanvas = e.clientX * dpr;
    const side = (xCanvas < canvas.width * 0.5) ? -1 : +1;
    startCharge(side);
  });

  canvas.addEventListener('pointerup', (e) => {
    e.preventDefault();
    releaseChargeToPunch();
  });

  canvas.addEventListener('pointercancel', (e) => {
    e.preventDefault();
    audio?.stopCharge?.();
    state.charge.active = false;
  });

  return { startCharge, releaseChargeToPunch };
}
