import { CHARGE_MAX_SEC } from '../core/config.js';
import { clamp } from '../core/utils.js';

export function attachInput(canvas, getDpr, state, audio) {
  function isBusy() {
    if (state.fly?.active) return true;
    if (state.vehicleAct?.active) return true;
    if (state.rocketFx?.active) return true;
    return false;
  }

  function startCharge(side) {
    if (isBusy()) return;
    if (state.punch?.active) return;
    if (state.charge?.active) return;

    state.interacted = true;
    state.charge.active = true;
    state.charge.side = side;
    state.charge.t0 = performance.now();
    state.charge.sec = 0;
    state.charge.rawSec = 0;

    audio?.startCharge?.();
  }

  function releaseCharge() {
    if (!state.charge?.active) return;

    audio?.stopCharge?.();

    const side = state.charge.side;
    const sec = clamp(state.charge.sec ?? 0, 0, CHARGE_MAX_SEC);
    const rawSec = (state.charge.rawSec ?? sec);

    state.charge.active = false;

    // ✅ hit 模式：启动 vehicleAct（不走 punch out/back）
    if ((state.modeKey ?? 'punch') === 'hit') {
      // 若还在忙（保险）
      if (isBusy()) return;

      state.vehicleAct.active = true;
      state.vehicleAct.pendingInit = true;
      state.vehicleAct.key = state.vehicleKey ?? 'truck';
      state.vehicleAct.chargeSec = sec;
      state.vehicleAct.strength01 = clamp(sec / CHARGE_MAX_SEC, 0, 1);

      state.vehicleAct.hitDone = false;

      // 初始化放到 physics 里（需要 layout）
      state.vehicleAct.x = 0;
      state.vehicleAct.y = 0;
      state.vehicleAct.vx = 0;
      state.vehicleAct.w = 0;
      state.vehicleAct.h = 0;

      // 清理旧特效（避免叠加）
      state.throwFx.active = false;
      state.flattenFx.active = false;
      state.rocketFx.active = false;
      state.explosion.active = false;

      return;
    }

    // ✅ punch 模式：原逻辑
    if (state.punch?.active) return;
    if (state.fly?.active) return;

    state.punch.active = true;
    state.punch.phase = 'out';
    state.punch.t = 0;
    state.punch.hitDone = false;
    state.punch.side = side;
    state.punch.strength = sec;
    state.punch.over = rawSec > CHARGE_MAX_SEC; // 原 >3s
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
    releaseCharge();
  });

  canvas.addEventListener('pointercancel', (e) => {
    e.preventDefault();
    audio?.stopCharge?.();
    if (state.charge) state.charge.active = false;
  });

  return { startCharge, releaseCharge };
}
