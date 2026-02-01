import { TARGETS, WEAPONS, VEHICLES, CUSTOM_TARGET_KEY } from './config.js';

export function createState() {
  return {
    theta: 0,
    omega: 0,
    squash: 0,
    flash: 0,

    interacted: false,

    modeKey: 'punch',
    targetKey: TARGETS[0].key,

    // custom 上传：
    // - src   : 原始(已缩放)图（用于切回原图 / 重新抠图）
    // - cutout: 抠图结果（可能为 null）
    // - img   : 最终用于渲染的贴图（src 或 cutout，再叠加自动裁剪透明边缘）
    customTarget: { src: null, cutout: null, img: null, meta: null },

    weaponKey: (WEAPONS.find(w => w.key === 'fist')?.key) ?? WEAPONS[0].key,
    vehicleKey: (VEHICLES.find(v => v.key === 'truck')?.key) ?? (VEHICLES[0]?.key ?? 'truck'),

    namesByKey: { [CUSTOM_TARGET_KEY]: '' },

    // 老板键（空格）：临时切到 custom（显示为沙袋），再按一次可切回
    bossKey: {
      active: false,
      prevTargetKey: TARGETS[0].key,
    },

    charge: {
      active: false,
      side: +1,
      t0: 0,
      sec: 0,
      rawSec: 0,
    },

    punch: {
      active: false,
      phase: 'idle',
      t: 0,
      hitDone: false,
      side: +1,
      strength: 0,
      over: false,
    },

    // rage 模式：允许同屏多个“出拳”动画
    ragePunches: [],

    fly: {
      active: false,
      x: 0, y: 0,
      vx: 0, vy: 0,
      ang: 0,
      angVel: 0,
      scale: 1,
    },

    // truck/car throw
    throwFx: {
      active: false,
      grounded: false,
      t: 0,
      T: 0,
      x: 0, y: 0,
      vx: 0, vy: 0,
      g: 0,
      dxLand: 0, dyLand: 0,
      ang: 0,
      angVel: 0,
      crushed: false,
      side: -1,
    },

    // ✅ roller: 先躺下再横向压扁（分离 rot / squash）
    flattenFx: {
      active: false,
      phase: 'down',     // down -> squash -> hold -> up
      t: 0,
      side: -1,          // -1:left hit, +1:right hit
      rot01: 0,          // 0..1 (0站立 -> 1躺下)
      squash01: 0,       // 0..1 (0正常 -> 1压扁)
    },

    // vehicle act (hit)
    vehicleAct: {
      active: false,
      pendingInit: false,
      key: 'truck',
      side: -1,

      chargeSec: 0,
      strength01: 0,

      hitDone: false,

      x: 0,
      y: 0,
      vx: 0,

      w: 0,
      h: 0,
    },
  };
}
