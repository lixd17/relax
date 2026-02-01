import { TARGETS, WEAPONS, VEHICLES, CUSTOM_TARGET_KEY } from './config.js';

export function createState() {
  return {
    theta: 0,
    omega: 0,
    squash: 0,
    flash: 0,

    interacted: false,

    // ✅ Mode
    modeKey: 'punch',

    // ✅ 目标
    targetKey: TARGETS[0].key,

    // ✅ 自定义目标（上传图片后注入）
    customTarget: {
      img: null,   // HTMLCanvasElement | HTMLImageElement | null
      meta: null,
    },

    // ✅ punch 模式：道具
    weaponKey: (WEAPONS.find(w => w.key === 'fist')?.key) ?? WEAPONS[0].key,

    // ✅ hit 模式：车辆
    vehicleKey: (VEHICLES.find(v => v.key === 'truck')?.key) ?? (VEHICLES[0]?.key ?? 'truck'),

    // ✅ 每个目标自己的名字（包含 custom）
    namesByKey: {
      [CUSTOM_TARGET_KEY]: '',
    },

    // --------------------
    // 输入与蓄力
    // --------------------
    charge: {
      active: false,
      side: +1,
      t0: 0,
      sec: 0,     // 0..3 clamp（用于速度/强度）
      rawSec: 0,  // 真实按住时长（仅用于少数用途）
    },

    // punch 动画（punch 模式用）
    punch: {
      active: false,
      phase: 'idle',
      t: 0,
      hitDone: false,
      side: +1,
      strength: 0,
      over: false,
    },

    // --------------------
    // 目标特效状态
    // --------------------

    // ✅ 原 fly（旋转飞出 + 缩小）
    fly: {
      active: false,
      x: 0, y: 0,
      vx: 0, vy: 0,
      ang: 0,
      angVel: 0,
      scale: 1,
    },

    // ✅ truck/car 抛物线撞飞
    throwFx: {
      active: false,
      grounded: false,
      t: 0,
      T: 0,
      x: 0, y: 0,         // 相对中心偏移
      vx: 0, vy: 0,
      g: 0,
      dxLand: 0, dyLand: 0,
      ang: 0,
      angVel: 0,
      crushed: false,
    },

    // ✅ roller 压扁：躺下 + 变扁（progress 0..1）
    flattenFx: {
      active: false,
      phase: 'down', // down/hold/up
      t: 0,
      prog: 0,
    },

    // ✅ rocket 螺旋升天（带着对象）
    rocketFx: {
      active: false,
      t: 0,
      baseX: 0,
      baseY: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      phi: 0,
      amp: 0,
      strength01: 0,
    },

    // ✅ rocket 爆炸
    explosion: {
      active: false,
      t: 0,
      x: 0,
      y: 0,
    },

    // ✅ 车辆本体运动（hit 模式核心）
    vehicleAct: {
      active: false,
      pendingInit: false,
      key: 'truck',
      chargeSec: 0,
      strength01: 0,

      hitDone: false,

      // 车辆中心位置（canvas 坐标）
      x: 0,
      y: 0,
      vx: 0,

      // 用于碰撞/出屏
      w: 0,
      h: 0,
    },
  };
}
