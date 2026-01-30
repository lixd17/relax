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

async function main() {
  const state = createState();
  const audio = createHitAudio();

  const { canvas, ctx, getDpr } = setupCanvas(app);
  const imgs = await loadAllImages();

  // UI：切换目标时顺便把状态收敛一下，避免切换瞬间还在狂摆
  createUI(state, () => {
    state.theta = 0;
    state.omega = 0;
    state.squash = 0;
    state.flash = 0;
    state.punch.active = false;
    state.charge.active = false;
  });

  // Input
  attachInput(canvas, getDpr, state, audio);

  // Loop
  let lastT = performance.now();
  function frame(now) {
    const dt = (now - lastT) / 1000;
    lastT = now;

    const targetImg = imgs.targets.get(state.targetKey);
    const L = computeLayout(canvas, targetImg, state);

    updatePhysics(state, dt, audio);
    renderFrame(ctx, canvas, L, state, imgs, getDpr, now);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  app.innerHTML = `<pre style="color:#fff;padding:12px;">Load failed: ${String(err)}</pre>`;
});
