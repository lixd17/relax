import { TARGETS, WEAPONS, VEHICLES, MODES, CUSTOM_TARGET_KEY } from './config.js';
import {
  stripExt,
  loadImageFromFile,
  imageToCanvasScaled,
  autoCropAlphaCanvas,
} from './utils.js';

export function createUI(state, onTargetChange) {
  // HMR 防重复
  document.getElementById('hudLeft')?.remove();

  // 左上：HUD 容器（避免手机安全区/回车布局问题）
  const hudLeft = document.createElement('div');
  hudLeft.id = 'hudLeft';
  document.body.appendChild(hudLeft);

  // ------------------------------
  // Panel A: Object（命名 + 上传）
  // ------------------------------
  const objectPanel = document.createElement('div');
  objectPanel.id = 'objectPanel';
  objectPanel.className = 'panel';
  objectPanel.innerHTML = `
    <div class="panelTitle">Object</div>
    <div class="hint">
      建议上传<strong>仅含身体的长方形</strong>图片。若是带透明背景的 PNG，可勾选“自动裁剪透明边缘”。
      <span class="mobileNote">（手机端：输入完点“保存”，或点空白处即可生效）</span>
    </div>

    <div class="row">
      <label for="nameInput">Name</label>
      <input id="nameInput" placeholder="输入后保存" enterkeyhint="done" />
      <button id="nameSave" type="button">保存</button>
    </div>

    <div class="row">
      <label for="imgInput">Image</label>
      <input id="imgInput" type="file" accept="image/*" />
      <button id="imgClear" type="button">清除</button>
    </div>

    <div class="row rowTight">
      <label class="inline">
        <input id="autoCrop" type="checkbox" checked />
        自动裁剪透明边缘
      </label>
      <div class="mini">
        <canvas id="customPreview" width="72" height="72"></canvas>
      </div>
    </div>

    <div class="hint" id="customMeta"></div>
  `;
  hudLeft.appendChild(objectPanel);

  const nameInput = objectPanel.querySelector('#nameInput');
  const btnSave = objectPanel.querySelector('#nameSave');
  const imgInput = objectPanel.querySelector('#imgInput');
  const btnClear = objectPanel.querySelector('#imgClear');
  const autoCrop = objectPanel.querySelector('#autoCrop');
  const preview = objectPanel.querySelector('#customPreview');
  const metaEl = objectPanel.querySelector('#customMeta');

  function syncNameInput() {
    nameInput.value = state.namesByKey[state.targetKey] ?? '';
  }

  function commitName() {
    const txt = (nameInput.value ?? '').trim();
    if (txt.length === 0) {
      delete state.namesByKey[state.targetKey];
    } else {
      state.namesByKey[state.targetKey] = txt;
    }
  }

  // ✅ PC：Enter；手机：blur/change + “保存”按钮
  nameInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    commitName();
    nameInput.blur();
  });
  nameInput.addEventListener('change', () => commitName());
  nameInput.addEventListener('blur', () => commitName());
  btnSave.addEventListener('click', () => {
    commitName();
    nameInput.blur();
  });

  function drawPreviewFromCustom() {
    const ctx = preview.getContext('2d');
    ctx.clearRect(0, 0, preview.width, preview.height);

    const img = state.customTarget?.img;
    if (!img) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('no', preview.width / 2, preview.height / 2 - 6);
      ctx.fillText('image', preview.width / 2, preview.height / 2 + 8);
      ctx.globalAlpha = 1;
      metaEl.textContent = '';
      return;
    }

    const iw = img.width || img.naturalWidth || 1;
    const ih = img.height || img.naturalHeight || 1;
    const s = Math.min(preview.width / iw, preview.height / ih);
    const w = iw * s;
    const h = ih * s;
    const x = (preview.width - w) / 2;
    const y = (preview.height - h) / 2;
    ctx.drawImage(img, x, y, w, h);

    const m = state.customTarget?.meta;
    if (m) {
      metaEl.textContent = `已加载：${m.w}×${m.h}${m.cropped ? '（已裁剪）' : ''}`;
    } else {
      metaEl.textContent = `已加载：${iw}×${ih}`;
    }
  }

  async function setCustomTargetFromFile(file) {
    // 清理旧的
    if (state.customTarget) {
      state.customTarget.img = null;
      state.customTarget.meta = null;
    } else {
      state.customTarget = { img: null, meta: null };
    }

    try {
      const { img, url } = await loadImageFromFile(file);

      // 先缩放到合理大小再做裁剪，避免手机超大照片爆内存
      let canvas = imageToCanvasScaled(img, 2048);

      let cropped = false;
      if (autoCrop.checked) {
        const out = autoCropAlphaCanvas(canvas, 10, 6);
        if (out !== canvas) {
          canvas = out;
          cropped = true;
        }
      }

      // 释放 objectURL（我们已经转成 canvas 了）
      URL.revokeObjectURL(url);

      state.customTarget.img = canvas;
      state.customTarget.meta = {
        w: canvas.width,
        h: canvas.height,
        cropped,
        from: file.name || 'upload',
      };

      // 上传即切到 custom
      state.targetKey = CUSTOM_TARGET_KEY;
      targetSel.value = CUSTOM_TARGET_KEY;
      syncNameInput();
      drawPreviewFromCustom();
      onTargetChange?.();
    } catch (e) {
      console.warn('[ui] upload image failed', e);
      metaEl.textContent = '图片加载失败：请换一张试试（建议 PNG/JPG）';
      drawPreviewFromCustom();
    }
  }

  imgInput.addEventListener('change', async () => {
    const file = imgInput.files?.[0];
    if (!file) return;
    await setCustomTargetFromFile(file);

    // 允许重复选择同一张文件：重置 input
    imgInput.value = '';
  });

  btnClear.addEventListener('click', () => {
    if (state.customTarget) {
      state.customTarget.img = null;
      state.customTarget.meta = null;
    }

    // 如果当前就在 custom，则回到第一个默认目标
    if (state.targetKey === CUSTOM_TARGET_KEY) {
      state.targetKey = TARGETS[0].key;
      targetSel.value = state.targetKey;
      syncNameInput();
      onTargetChange?.();
    }

    drawPreviewFromCustom();
  });

  // ------------------------------
  // Panel B: Mode / Target / Tool
  // ------------------------------
  const ui = document.createElement('div');
  ui.id = 'ui';
  ui.className = 'panel';
  ui.innerHTML = `
    <div class="panelTitle">Controls</div>
    <div class="row">
      <label for="modeSel">Mode</label>
      <select id="modeSel"></select>
    </div>
    <div class="row">
      <label for="targetSel">Target</label>
      <select id="targetSel"></select>
    </div>
    <div class="row">
      <label id="toolLabel" for="toolSel">Item</label>
      <select id="toolSel"></select>
    </div>
  `;
  hudLeft.appendChild(ui);

  const modeSel = ui.querySelector('#modeSel');
  const targetSel = ui.querySelector('#targetSel');
  const toolSel = ui.querySelector('#toolSel');
  const toolLabel = ui.querySelector('#toolLabel');

  // Mode options
  for (const m of MODES) {
    const opt = document.createElement('option');
    opt.value = m.key;
    opt.textContent = m.label;
    modeSel.appendChild(opt);
  }
  if (!state.modeKey) state.modeKey = 'punch';
  modeSel.value = state.modeKey;

  // Target options（包含 custom）
  for (const t of TARGETS) {
    const opt = document.createElement('option');
    opt.value = t.key;
    opt.textContent = stripExt(t.key);
    targetSel.appendChild(opt);
  }
  targetSel.value = state.targetKey;

  function rebuildToolMenu() {
    toolSel.innerHTML = '';

    const mode = state.modeKey ?? 'punch';
    const isHit = (mode === 'hit');

    const list = isHit ? VEHICLES : WEAPONS;
    toolLabel.textContent = isHit ? 'Vehicle' : 'Item';

    for (const it of list) {
      const opt = document.createElement('option');
      opt.value = it.key;
      opt.textContent = stripExt(it.key);
      toolSel.appendChild(opt);
    }

    if (isHit) {
      // default
      if (!state.vehicleKey || !list.find(v => v.key === state.vehicleKey)) {
        state.vehicleKey = list[0].key;
      }
      toolSel.value = state.vehicleKey;
    } else {
      if (!state.weaponKey || !list.find(w => w.key === state.weaponKey)) {
        state.weaponKey = list[0].key;
      }
      toolSel.value = state.weaponKey;
    }
  }

  modeSel.addEventListener('change', () => {
    state.modeKey = modeSel.value;
    rebuildToolMenu();
  });

  targetSel.addEventListener('change', () => {
    state.targetKey = targetSel.value;
    syncNameInput();
    onTargetChange?.();
  });

  toolSel.addEventListener('change', () => {
    const mode = state.modeKey ?? 'punch';
    if (mode === 'hit') state.vehicleKey = toolSel.value;
    else state.weaponKey = toolSel.value;
    // ✅ 不强制 reset（避免切换就中断蓄力/动作）
  });

  // 初始刷新
  rebuildToolMenu();
  syncNameInput();
  drawPreviewFromCustom();

  return { nameInput, modeSel, targetSel, toolSel };
}
