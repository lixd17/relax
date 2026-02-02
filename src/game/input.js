import { CHARGE_MAX_SEC, RAGE_STRENGTH01, RAGE_MAX_PUNCHES, RAGE_MIN_INTERVAL_SEC, CUSTOM_TARGET_KEY, BOSSKEY_TARGET_KEY } from '../core/config.js';
import { clamp } from '../core/utils.js';

function isTypingTarget(e) {
  const el = e?.target;
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.isContentEditable) return true;
  return false;
}

function isLetterKey(k) {
  if (typeof k !== 'string' || k.length !== 1) return false;
  return ((k >= 'a' && k <= 'z') || (k >= 'A' && k <= 'Z'));
}

function getSideFromEvent(canvas, e) {
  // Use CSS pixels + DOM rect so it stays correct even if canvas isn't at x=0
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  return (x < rect.width * 0.5) ? -1 : +1;
}

export function attachInput(canvas, getDpr, state, audio) {
  // 让 canvas 可获得焦点，尽量把键盘输入留在游戏里
  try { canvas.tabIndex = 0; } catch (_) {}

  let lastRageSpawnMs = 0;

  function isBusy() {
    if (state.fly?.active) return true;
    if (state.vehicleAct?.active) return true;
    // throw/flatten 在 hit 模式里出现；为了不串状态，这里也当忙
    if (state.throwFx?.active) return true;
    if (state.flattenFx?.active) return true;
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

    // normalize side to -1/+1
    const side = (state.charge.side === +1) ? +1 : -1;
    const sec = clamp(state.charge.sec ?? 0, 0, CHARGE_MAX_SEC);
    const rawSec = (state.charge.rawSec ?? sec);

    state.charge.active = false;

    // hit 模式：启动 vehicleAct（不走 punch out/back）
    if ((state.modeKey ?? 'punch') === 'hit') {
      if (isBusy()) return;

      state.vehicleAct.active = true;
      state.vehicleAct.pendingInit = true;
      state.vehicleAct.key = state.vehicleKey ?? 'truck';
      state.vehicleAct.side = side; // ✅ ensure left/right symmetric spawn
      state.vehicleAct.chargeSec = sec;
      state.vehicleAct.strength01 = clamp(sec / CHARGE_MAX_SEC, 0, 1);
      state.vehicleAct.hitDone = false;

      // 初始化放到 physics 里（依赖 layout）
      state.vehicleAct.x = 0;
      state.vehicleAct.y = 0;
      state.vehicleAct.vx = 0;
      state.vehicleAct.w = 0;
      state.vehicleAct.h = 0;

      // 清理旧特效（避免叠加）
      state.throwFx.active = false;
      state.flattenFx.active = false;

      return;
    }

    // punch 模式：原逻辑
    if (state.punch?.active) return;
    if (state.fly?.active) return;

    state.punch.active = true;
    state.punch.phase = 'out';
    state.punch.t = 0;
    state.punch.hitDone = false;
    state.punch.side = side;
    state.punch.strength = sec;
    state.punch.over = rawSec > CHARGE_MAX_SEC;
  }

  function spawnRagePunch(side) {
    if ((state.modeKey ?? 'punch') !== 'rage') return;
    if (isBusy()) return;

    const now = performance.now();
    if (now - lastRageSpawnMs < RAGE_MIN_INTERVAL_SEC * 1000) return;
    lastRageSpawnMs = now;

    state.interacted = true;

    const p = {
      active: true,
      phase: 'out',
      t: 0,
      hitDone: false,
      side,
      weaponKey: state.weaponKey ?? 'fist',
      strength01: clamp(RAGE_STRENGTH01, 0, 1),
    };

    if (!Array.isArray(state.ragePunches)) state.ragePunches = [];
    state.ragePunches.push(p);

    // cap
    const maxN = Math.max(1, (RAGE_MAX_PUNCHES | 0));
    if (state.ragePunches.length > maxN) {
      state.ragePunches.splice(0, state.ragePunches.length - maxN);
    }
  }

  function bossKeyToggle() {
    if (!state.bossKey) state.bossKey = { active: false, prevTargetKey: state.targetKey };

    if (state.bossKey.active) {
      // restore
      state.targetKey = state.bossKey.prevTargetKey ?? state.targetKey;
      state.bossKey.active = false;
    } else {
      state.bossKey.prevTargetKey = state.targetKey;
      // IMPORTANT: do NOT use comma operator here; we want the boss-key target key.
      state.targetKey = BOSSKEY_TARGET_KEY;
      state.bossKey.active = true;

      // bosskey 目标不能命名：强制清空
      if (state.namesByKey) state.namesByKey[BOSSKEY_TARGET_KEY] = '';
    }
  }

  // pointer
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);

    // 尽量把焦点拉回 canvas，避免键盘敲字落到输入框
    try { canvas.focus(); } catch (_) {}

    const side = getSideFromEvent(canvas, e);

    if ((state.modeKey ?? 'punch') === 'rage') {
      spawnRagePunch(side);
      return;
    }

    startCharge(side);
  });

  canvas.addEventListener('pointerup', (e) => {
    e.preventDefault();
    if ((state.modeKey ?? 'punch') === 'rage') return;
    releaseCharge();
  });

  canvas.addEventListener('pointercancel', (e) => {
    e.preventDefault();
    audio?.stopCharge?.();
    if (state.charge) state.charge.active = false;
  });

  // keyboard
  window.addEventListener('keydown', (e) => {
    // 空格：老板键（任何模式都可用）
    if (e.code === 'Space' || e.key === ' ') {
      // 在输入框/下拉框中输入时，不要触发老板键（否则无法输入空格）
      if (isTypingTarget(e) || e.isComposing) return;
      e.preventDefault();
      bossKeyToggle();
      return;
    }

    // rage：任意字母触发攻击
    if ((state.modeKey ?? 'punch') !== 'rage') return;

    // 避免在输入框打字时触发攻击
    if (isTypingTarget(e)) return;

    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!isLetterKey(e.key)) return;

    e.preventDefault();
    e.stopPropagation?.();

    const side = (Math.random() < 0.5) ? -1 : +1;
    spawnRagePunch(side);
  }, { passive: false });

  return { startCharge, releaseCharge, spawnRagePunch, bossKeyToggle };
}
