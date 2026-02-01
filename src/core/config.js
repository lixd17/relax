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
  { key: CUSTOM_TARGET_KEY, src: '', type: 'boss' },
];

export const MODES = [
  { key: 'punch', label: 'punch' },
  { key: 'hit',   label: 'hit' },
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
  { key: 'rocket', src: withBase('assets/rocket.png') },
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

// ✅ 车辆放大倍数：改为 3x
export const VEHICLE_SIZE_SCALE = 3.0;

// vehicle speed vs charge
export const VEHICLE_SPEED_MIN = 1.00;
export const VEHICLE_SPEED_MAX = 3.00;

// throw params
export const VEHICLE_LAND_MARGIN_FRAC = 0.12;
export const VEHICLE_THROW_GRAV = 3.4;

// rocket simplified quadratic curve
export const ROCKET_CURVE_AY = 1.35;
