console.log('[RELAX BUILD]', '2026-01-31-c');

import './style.css';

import { createState } from './core/state.js';
import { setupCanvas } from './core/canvas.js';
import { createUI } from './core/ui.js';
import { loadAllImages } from './core/assets.js';
import { createHitAudio } from './core/audio.js';

import { computeLayout } from './game/layout.js';
import { attachInput } from './game/input.js';
import { updatePhysics } from './game/physics.js';
import { renderFrame } from './game/render.js';

const app = document.querySelector('#app');

function pickTargetImage(state, imgs) {
  if (state.targetKey === 'custom' && state.customTarget?.img) {
    return state.customTarget.img;
  }
  return imgs.targets.get(state.targetKey) || imgs.targets.values().next().value || imgs.fist;
}

async function main() {
  const state = createState();
  const audio = createHitAudio();

  const { canvas, ctx, getDpr } = setupCanvas(app);
  const imgs = await loadAllImages();

  createUI(state, () => {
    state.theta = 0;
    state.omega = 0;
    state.squash = 0;
    state.flash = 0;

    // 复位 punch/charge
    state.punch.active = false;
    state.charge.active = false;

    // 复位 hit
    state.vehicleAct.active = false;
    state.throwFx.active = false;
    state.flattenFx.active = false;

    // 复位 fly
    if (state.fly) {
      state.fly.active = false;
      state.fly.x = 0;
      state.fly.y = 0;
      state.fly.vx = 0;
      state.fly.vy = 0;
      state.fly.ang = 0;
      state.fly.angVel = 0;
      state.fly.scale = 1;
    }
  });

  attachInput(canvas, getDpr, state, audio);

  let lastT = performance.now();
  function frame(now) {
    const dt = (now - lastT) / 1000;
    lastT = now;

    const targetImg = pickTargetImage(state, imgs);
    const L = computeLayout(canvas, targetImg, state);

    updatePhysics(state, dt, audio, L);
    renderFrame(ctx, canvas, L, state, imgs, getDpr, now);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  app.innerHTML = `<pre style="color:#fff;padding:12px;">Load failed: ${String(err)}</pre>`;
});
