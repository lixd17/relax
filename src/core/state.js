import { TARGETS, WEAPONS, VEHICLES, CUSTOM_TARGET_KEY } from './config.js';

export function createState() {
  return {
    theta: 0,
    omega: 0,
    squash: 0,
    flash: 0,

    // ✅ 打飞状态
    fly: {
      active: false,
      x: 0, y: 0,
      vx: 0, vy: 0,
      ang: 0,
      angVel: 0,
      scale: 1,
    },

    punch: {
      active: false,
      phase: 'idle',
      t: 0,
      hitDone: false,
      side: +1,
      strength: 0,
      over: false, // rawSec > 3s ?
    },

    charge: {
      active: false,
      side: +1,
      t0: 0,
      sec: 0,     // 0..3（用于强度）
      rawSec: 0,  // 真实按住时长（用于判断 >3s）
    },

    interacted: false,

    // ✅ 左上角 Mode
    modeKey: 'punch',

    // ✅ 当前目标
    targetKey: TARGETS[0].key,

    // ✅ 用户上传的自定义目标（draw/layout 会优先用这里的 img）
    customTarget: {
      img: null,      // HTMLImageElement | HTMLCanvasElement | null
      meta: null,     // { w,h, cropped:boolean, from:string } | null
    },

    // ✅ punch 模式：道具选择（默认 fist）
    weaponKey: (WEAPONS.find(w => w.key === 'fist')?.key) ?? WEAPONS[0].key,

    // ✅ hit 模式：交通工具选择（默认 truck）
    vehicleKey: (VEHICLES.find(v => v.key === 'truck')?.key) ?? (VEHICLES[0]?.key ?? 'truck'),

    // ✅ 每个目标自己的名字（包含 custom）
    namesByKey: {
      [CUSTOM_TARGET_KEY]: '',
    },
  };
}
