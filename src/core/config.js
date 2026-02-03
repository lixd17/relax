// src/core/config.js
const withBase = (p) => {
  const s = p.startsWith('/') ? p.slice(1) : p;
  return new URL(s, document.baseURI).toString();
};

export const CUSTOM_TARGET_KEY = 'custom';
export const BOSSKEY_TARGET_KEY = 'stealth';

// background
export const DEFAULT_BG_KEY = 'default';
export const CUSTOM_BG_KEY = 'back0';


export const TARGETS = [
  { key: 'sandbag', src: withBase('assets/sandbag.png'), type: 'bag' },
  { key: 'boss1',   src: withBase('assets/boss1.png'),   type: 'boss' },
  { key: 'boss2',   src: withBase('assets/boss2.png'),   type: 'boss' },

  // 老板键目标：按空格临时切换到此目标（渲染上会强制显示为“沙袋”以便隐藏）
  { key: BOSSKEY_TARGET_KEY, src: withBase('assets/sandbag.png'), type: 'bag' },

  // custom：用户上传槽；src 为空将不会自动加载（由 state.customTarget.img 提供）
  { key: CUSTOM_TARGET_KEY, src: '', type: 'boss' },
];

// 背景：默认（程序渐变）+ 两张内置图 + 用户上传槽
// - default: 不加载图片，由 render.js 画渐变
// - back1/back2: 放在 public/assets/back1.png, back2.png
// - back0: 用户上传（src 为空，由 state.customBackground.img 提供）
export const BACKGROUNDS = [
  { key: DEFAULT_BG_KEY, src: '' },
  { key: 'back1', src: withBase('assets/back1.png') },
  { key: 'back2', src: withBase('assets/back2.png') },
  { key: CUSTOM_BG_KEY, src: '' },
];

export const MODES = [
  { key: 'punch', label: 'punch' },
  { key: 'hit',   label: 'hit' },
  { key: 'rage',  label: 'rage' },
];

export const WEAPONS = [
  { key: 'fist',         src: withBase('assets/fist.png') },
  { key: 'extinguisher', src: withBase('assets/extinguisher.png') },
  { key: 'stick',        src: withBase('assets/stick.png') },
  { key: 'banana',       src: withBase('assets/banana.png') },
];

export const VEHICLES = [
  { key: 'truck',  src: withBase('assets/truck.png') },
  { key: 'car',    src: withBase('assets/car.png') },
  { key: 'roller', src: withBase('assets/roller.png') },
  // rocket 已移除（图片也可删除）
];

export const ASSET = {
  fist: withBase('assets/fist.png'),
  music: withBase('assets/music1.mp3'),
  charge: withBase('assets/music2.mp3'),
};

export const OBJECT_SCALE = 0.75;

// charge
export const CHARGE_MAX_SEC = 3.0;
export const CLICK_THRESH_SEC = 0.12;

// rage
export const RAGE_STRENGTH01 = 0.65;       // 0..1
export const RAGE_MAX_PUNCHES = 20;         // 同屏最多同时存在多少个“拳头动画”
export const RAGE_MIN_INTERVAL_SEC = 0.03;  // 防止键盘长按/自动重复把性能打爆

// swing
export const SWING_MIN_DEG = 10;
export const SWING_MAX_DEG = 80;

export const FIST_SIZE_FACTOR = 0.1;
export const THETA_MAX_RAD = (85 * Math.PI) / 180;
export const FOOT_PIVOT_FRAC = 0.08;

// ------------------------------
// Hit mode tuning
// ------------------------------

// truck/car >= 2.5s -> fly
export const VEHICLE_FLY_SEC = 2.5;

// 车辆放大倍数：3x
export const VEHICLE_SIZE_SCALE = 3.0;

// vehicle speed vs charge
export const VEHICLE_SPEED_MIN = 1.00;
export const VEHICLE_SPEED_MAX = 3.00;

// throw params
export const VEHICLE_LAND_MARGIN_FRAC = 0.12;
export const VEHICLE_THROW_GRAV = 3.4;
