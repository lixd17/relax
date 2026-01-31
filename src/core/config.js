// src/core/config.js
const withBase = (p) => {
  const s = p.startsWith('/') ? p.slice(1) : p;
  return new URL(s, document.baseURI).toString();
};

export const CUSTOM_TARGET_KEY = 'custom';

export const TARGETS = [
  { key: 'sandbag', src: withBase('assets/sandbag.png'), type: 'bag' },
  { key: 'boss1',   src: withBase('assets/boss1.png'),   type: 'boss' },
  { key: 'boss2',   src: withBase('assets/boss2.png'),   type: 'boss' },
  // ✅ 用户自定义目标（图片由 UI 上传；这里不提供 src）
  { key: CUSTOM_TARGET_KEY, src: '', type: 'boss' },
];

// ✅ Mode（punch=现有逻辑；hit=vehicle 菜单）
export const MODES = [
  { key: 'punch', label: 'punch' },
  { key: 'hit',   label: 'hit' },
];

// ✅ 道具列表（punch 模式用）
export const WEAPONS = [
  { key: 'fist',         src: withBase('assets/fist.png') },
  { key: 'extinguisher', src: withBase('assets/extinguisher.png') },
  { key: 'stick',        src: withBase('assets/stick.png') },
  { key: 'banana',       src: withBase('assets/banana.png') },
];

// ✅ 交通工具列表（hit 模式用）
// 注意：你需要在 public/assets/ 下放置这些图片：
// truck.png, car.png, roller.png, rocket.png
export const VEHICLES = [
  { key: 'truck',  src: withBase('assets/truck.png') },
  { key: 'car',    src: withBase('assets/car.png') },
  { key: 'roller', src: withBase('assets/roller.png') },
  { key: 'rocket', src: withBase('assets/rocket.png') },
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
