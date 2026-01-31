import { TARGETS, WEAPONS } from './config.js';

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

    targetKey: TARGETS[0].key,

    // ✅ 新增：道具选择（默认 fist，如果列表里没有就取第一个）
    weaponKey: (WEAPONS.find(w => w.key === 'fist')?.key) ?? WEAPONS[0].key,

    // ✅ 每个目标自己的名字
    namesByKey: {},
  };
}
