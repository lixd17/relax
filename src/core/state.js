import { TARGETS } from './config.js';

export function createState() {
  return {
    theta: 0,
    omega: 0,
    squash: 0,
    flash: 0,

    punch: {
      active: false,
      phase: 'idle', // 'out' | 'back'
      t: 0,
      hitDone: false,
      side: +1,
      strength: 0,
    },

    charge: {
      active: false,
      side: +1,
      t0: 0,
      sec: 0,
    },

    interacted: false,

    targetKey: TARGETS[0].key,

    // ✅ 每个目标自己的名字
    namesByKey: {},
  };
}
