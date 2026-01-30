export function attachInput(canvas, getDpr, state, audio) {
  function startCharge(side) {
    if (state.punch.active) return;
    if (state.charge.active) return;

    state.interacted = true;
    state.charge.active = true;
    state.charge.side = side;
    state.charge.t0 = performance.now();
    state.charge.sec = 0;

    // ✅ 按下开始播放蓄力音
    audio?.startCharge?.();
  }

  function releaseChargeToPunch() {
    if (!state.charge.active) return;
    if (state.punch.active) return;

    // ✅ 松开立即停止蓄力音
    audio?.stopCharge?.();

    const side = state.charge.side;
    const sec = state.charge.sec;

    state.charge.active = false;

    // strength 在 physics 里映射，这里先保存
    state.punch.active = true;
    state.punch.phase = 'out';
    state.punch.t = 0;
    state.punch.hitDone = false;
    state.punch.side = side;
    state.punch.strength = sec; // 先塞秒数，physics 里会归一化
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
    audio?.stopCharge?.(); // ✅ cancel 也要停
    state.charge.active = false;
  });

  return { startCharge, releaseChargeToPunch };
}
