// src/core/config.js
const withBase = (p) => {
  const s = p.startsWith('/') ? p.slice(1) : p;
  return new URL(s, document.baseURI).toString();
};

export const TARGETS = [
  { key: 'sandbag', src: withBase('assets/sandbag.png'), type: 'bag' },
  { key: 'boss1',   src: withBase('assets/boss1.png'),   type: 'boss' },
  { key: 'boss2',   src: withBase('assets/boss2.png'),   type: 'boss' },
];

// ✅ 道具列表（右上角新菜单用）
export const WEAPONS = [
  { key: 'fist',         src: withBase('assets/fist.png') },
  { key: 'extinguisher', src: withBase('assets/extinguisher.png') },
  { key: 'stick',        src: withBase('assets/stick.png') },
  { key: 'banana',       src: withBase('assets/banana.png') },
];

export const ASSET = {
  fist: withBase('assets/fist.png'),
  music: withBase('assets/music1.mp3'),
  charge: withBase('assets/music2.mp3'),
};

// 目标整体缩放
export const OBJECT_SCALE = 0.75;

// 蓄力（3s）
export const CHARGE_MAX_SEC = 3.0;
export const CLICK_THRESH_SEC = 0.12;

// 摆幅映射
export const SWING_MIN_DEG = 10;
export const SWING_MAX_DEG = 80;

// 拳头/道具基准大小（只随屏幕）
export const FIST_SIZE_FACTOR = 0.1;

// 目标角度限幅
export const THETA_MAX_RAD = (85 * Math.PI) / 180;

// boss 脚部枢轴
export const FOOT_PIVOT_FRAC = 0.08;
