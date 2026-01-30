export const TARGETS = [
  { key: 'sandbag.png', src: '/assets/sandbag.png', type: 'bag' },
  { key: 'boss1.png',   src: '/assets/boss1.png',   type: 'boss' },
  { key: 'boss2.png',   src: '/assets/boss2.png',   type: 'boss' },
];

export const ASSET = {
  fist: '/assets/fist.png',
  music: '/assets/music1.mp3',
  charge: '/assets/music2.mp3', // ✅ 新增：蓄力音效
};

// 目标整体缩放（你之前想要 75%）
export const OBJECT_SCALE = 0.75;

// 蓄力（你已经改成 3s）
export const CHARGE_MAX_SEC = 3.0;
export const CLICK_THRESH_SEC = 0.12;

// 摆幅映射
export const SWING_MIN_DEG = 10;
export const SWING_MAX_DEG = 80;

// 拳头大小固定：只随屏幕，不随目标
export const FIST_SIZE_FACTOR = 0.1;

// 目标角度限幅（略大于 80°）
export const THETA_MAX_RAD = (85 * Math.PI) / 180;

// boss 脚部枢轴（越小越靠底）
export const FOOT_PIVOT_FRAC = 0.08;
