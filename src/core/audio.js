import { ASSET } from './config.js';

export function createHitAudio() {
  // ---------- hit sfx (music1) ----------
  const hit = new Audio(ASSET.music);
  hit.loop = false;
  hit.volume = 0.55;

  async function playOnce() {
    try {
      hit.pause();
      hit.currentTime = 0;
      await hit.play();
    } catch {}
  }

  // ---------- charge sfx (music2) with seamless tail-loop ----------
  const RATE = 2 / 3;          // 2s -> 3s
  const VOL = 0.45;

  // 你想“循环最后一点点”，这里可以设 0.1
  const LOOP_TAIL_SEC = 0.10;

  // 交叉淡化时间：建议 0.015~0.03（太小会点一下，太大像“抖动”）
  const XFADE_SEC = 0.02;

  // 不要贴着文件最末端取尾巴（避开 mp3 padding/尾帧伪影）
  const END_PAD_SEC = 0.03;

  let ac = null;
  let chargeBuf = null;
  let loopBuf = null;

  // 两路播放：完整一次 + 尾段循环
  let fullSrc = null;
  let fullGain = null;
  let loopSrc = null;
  let loopGain = null;

  function ensureAudioContext() {
    if (!ac) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      ac = new Ctx();
    }
    return ac;
  }

  async function ensureChargeBuffer() {
    if (chargeBuf) return chargeBuf;

    const ctx = ensureAudioContext();
    try { await ctx.resume(); } catch {}

    const res = await fetch(ASSET.charge);
    const arr = await res.arrayBuffer();
    chargeBuf = await ctx.decodeAudioData(arr);

    // 预构建 loopBuf（尾段循环片段）
    loopBuf = buildSeamlessLoopBuffer(ctx, chargeBuf, LOOP_TAIL_SEC, XFADE_SEC, END_PAD_SEC);

    return chargeBuf;
  }

  function stopCharge() {
    if (!ac) return;
    const t = ac.currentTime;

    // 淡出避免“啪”一下断
    if (fullGain) {
      try {
        fullGain.gain.cancelScheduledValues(t);
        fullGain.gain.setValueAtTime(fullGain.gain.value, t);
        fullGain.gain.linearRampToValueAtTime(0.0001, t + 0.06);
      } catch {}
    }
    if (loopGain) {
      try {
        loopGain.gain.cancelScheduledValues(t);
        loopGain.gain.setValueAtTime(loopGain.gain.value, t);
        loopGain.gain.linearRampToValueAtTime(0.0001, t + 0.06);
      } catch {}
    }

    // 停源
    try { fullSrc?.stop(t + 0.07); } catch {}
    try { loopSrc?.stop(t + 0.07); } catch {}

    fullSrc = null; fullGain = null;
    loopSrc = null; loopGain = null;
  }

  async function startCharge() {
    stopCharge();

    const ctx = ensureAudioContext();
    try { await ctx.resume(); } catch {}

    let buf;
    try {
      buf = await ensureChargeBuffer();
    } catch {
      return;
    }

    // full: 播放整个 music2 一次（慢放）
    fullSrc = ctx.createBufferSource();
    fullSrc.buffer = buf;
    fullSrc.playbackRate.value = RATE;
    fullSrc.loop = false;

    fullGain = ctx.createGain();
    fullGain.gain.value = VOL;
    fullSrc.connect(fullGain);
    fullGain.connect(ctx.destination);

    // loop: 尾段循环（已做首尾交叉）
    loopSrc = ctx.createBufferSource();
    loopSrc.buffer = loopBuf;
    loopSrc.playbackRate.value = RATE;
    loopSrc.loop = true;

    loopGain = ctx.createGain();
    loopGain.gain.value = 0.0001; // 先静音，等进入尾段再淡入
    loopSrc.connect(loopGain);
    loopGain.connect(ctx.destination);

    const t0 = ctx.currentTime;
    fullSrc.start(t0);
    loopSrc.start(t0); // 提前启动，但静音；后面再交叉切过去

    // 计算“进入尾段”的时间点（按原始 buffer 时间 / RATE）
    const segEnd = Math.max(0, buf.duration - END_PAD_SEC);
    const segStart = Math.max(0, segEnd - LOOP_TAIL_SEC);

    const tSeg = t0 + (segStart / RATE);

    // 在进入尾段时，full -> loop 做一次交叉淡化
    // full 播放到尾段时就开始淡出，loop 同时淡入（两路内容一致，观感平滑）
    const xf = XFADE_SEC;
    try {
      // full fade out
      fullGain.gain.setValueAtTime(VOL, tSeg);
      fullGain.gain.linearRampToValueAtTime(0.0001, tSeg + xf);

      // loop fade in
      loopGain.gain.setValueAtTime(0.0001, tSeg);
      loopGain.gain.linearRampToValueAtTime(VOL, tSeg + xf);
    } catch {}

    // full 播完以后就可以关掉（不关也行，这里省资源）
    const fullDur = buf.duration / RATE;
    try {
      fullSrc.stop(t0 + fullDur + 0.10);
    } catch {}
  }

  return { playOnce, startCharge, stopCharge };
}

/**
 * 从原始 buffer 末尾取一段 tail（避开最末 END_PAD_SEC），并做“首尾交叉”以便无缝循环。
 * 这能显著减小 0.1s 这种超短 loop 的断点感。
 */
function buildSeamlessLoopBuffer(ctx, buf, tailSec, xfadeSec, endPadSec) {
  const sr = buf.sampleRate;

  const segEndSec = Math.max(0, buf.duration - endPadSec);
  const segStartSec = Math.max(0, segEndSec - tailSec);

  const start = Math.floor(segStartSec * sr);
  const end = Math.floor(segEndSec * sr);

  const L = Math.max(1, end - start);

  // xfade 样本数：不要超过段长的 1/4
  let xfN = Math.floor(xfadeSec * sr);
  xfN = Math.max(1, Math.min(xfN, Math.floor(L / 4)));

  const out = ctx.createBuffer(buf.numberOfChannels, L, sr);

  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src = buf.getChannelData(ch);
    const seg = src.subarray(start, end);

    const dst = out.getChannelData(ch);
    dst.set(seg);

    // 对首尾做“环形交叉”：让末尾 -> 开头的跳变被平滑化
    for (let i = 0; i < xfN; i++) {
      const w = i / xfN;
      const a0 = seg[i];
      const a1 = seg[L - xfN + i];

      // 头部混入尾部
      dst[i] = a0 * w + a1 * (1 - w);

      // 尾部混入头部（对称）
      const j = L - xfN + i;
      dst[j] = a1 * (1 - w) + a0 * w;
    }
  }

  return out;
}
