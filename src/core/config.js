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
  // ✅ 用户上传的自定义目标：src 为空，由 UI 注入 state.customTarget.img
  { key: CUSTOM_TARGET_KEY, src: '', type: 'boss' },
];

export const MODES = [
  { key: 'punch', label: 'punch' },
  { key: 'hit',   label: 'hit' },
];

// punch 模式道具
export const WEAPONS = [
  { key: 'fist',         src: withBase('assets/fist.png') },
  { key: 'extinguisher', src: withBase('assets/extinguisher.png') },
  { key: 'stick',        src: withBase('assets/stick.png') },
  { key: 'banana',       src: withBase('assets/banana.png') },
];

// hit 模式车辆
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

// 基准大小（只随屏幕）
export const FIST_SIZE_FACTOR = 0.1;

// 目标角度限幅
export const THETA_MAX_RAD = (85 * Math.PI) / 180;

// boss 脚部枢轴
export const FOOT_PIVOT_FRAC = 0.08;

// ------------------------------
// ✅ Hit 模式车辆细调参数
// ------------------------------

// truck/car：>=2.5s 直接触发原 fly
export const VEHICLE_FLY_SEC = 2.5;

// 车辆速度：px/s = minDim * lerp(MIN, MAX, chargeSec/3)
export const VEHICLE_SPEED_MIN = 1.10;
export const VEHICLE_SPEED_MAX = 3.10;

// 车辆“车道”Y：在布局里会根据 objH 微调
export const VEHICLE_LANE_Y_FRAC = 0.86;

// truck/car 抛物线落点：离右边缘 margin
export const VEHICLE_LAND_MARGIN_FRAC = 0.12;

// 抛物线重力系数：px/s^2 = minDim * GRAV
export const VEHICLE_THROW_GRAV = 3.4;

// rocket 螺旋幅度基准（相对 minDim）
export const ROCKET_SPIRAL_AMP_MIN = 0.03;
export const ROCKET_SPIRAL_AMP_MAX = 0.07;

// rocket 爆炸时长（秒）
export const EXPLOSION_DUR_SEC = 0.60;
