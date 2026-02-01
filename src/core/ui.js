import { TARGETS, WEAPONS, VEHICLES, MODES, CUSTOM_TARGET_KEY } from './config.js';
import {
  stripExt,
  loadImageFromFile,
  imageToCanvasScaled,
  autoCropAlphaCanvas,
} from './utils.js';

export function createUI(state, onTargetChange) {
  // HMR 防重复
  document.getElementById('menuDock')?.remove();
  document.getElementById('menuOverlay')?.remove();

  // 半透明遮罩（打开菜单时启用；点空白处收回）
  const overlay = document.createElement('div');
  overlay.id = 'menuOverlay';
  overlay.style.display = 'none';
  document.body.appendChild(overlay);

  // 总菜单容器
  const dock = document.createElement('div');
  dock.id = 'menuDock';
  dock.innerHTML = `
    <div id="menuHeader">
      <button id="menuToggle" type="button" aria-label="menu">☰</button>
      <div id="menuTitle">Menu</div>
      <div id="menuStatus"></div>
    </div>

    <div id="menuBody">
      <div class="panel" id="objectPanel">
        <div class="panelTitle">Object</div>
        <div class="hint">
          建议上传<strong>仅含身体的长方形</strong>图片（初期不做抠图）。若是带透明背景的 PNG，可勾选“自动裁剪透明边缘”。
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
      </div>

      <div class="panel" id="controlsPanel">
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
      </div>

      <div class="panel panelFooter">
        <div class="row footerRow">
          <button id="menuOk" type="button">完成</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(dock);

  // ---------- open/close ----------
  const btnToggle = dock.querySelector('#menuToggle');
  const statusEl = dock.querySelector('#menuStatus');
  const btnOk = dock.querySelector('#menuOk');

  function setOpen(open) {
    dock.classList.toggle('open', !!open);
    overlay.style.display = open ? 'block' : 'none';
    if (!open) {
      // 收回时，尽量退出输入焦点（手机键盘会自动收起）
      const ae = document.activeElement;
      if (ae && typeof ae.blur === 'function') ae.blur();
    }
  }
  function toggleOpen() {
    setOpen(!dock.classList.contains('open'));
  }

  btnToggle.addEventListener('click', toggleOpen);
  btnOk.addEventListener('click', () => setOpen(false));
  overlay.addEventListener('click', () => setOpen(false));

  // ---------- Object: name + upload ----------
  const nameInput = dock.querySelector('#nameInput');
  const btnSave = dock.querySelector('#nameSave');
  const imgInput = dock.querySelector('#imgInput');
  const btnClear = dock.querySelector('#imgClear');
  const autoCrop = dock.querySelector('#autoCrop');
  const preview = dock.querySelector('#customPreview');
  const metaEl = dock.querySelector('#customMeta');

  function syncNameInput() {
    const isCustom = (state.targetKey === CUSTOM_TARGET_KEY);
    if (isCustom) {
      nameInput.value = '';
      nameInput.placeholder = '（custom 不可命名，用于老板键）';
      nameInput.disabled = true;
      btnSave.disabled = true;
      // 强制清空，避免残留
      delete state.namesByKey[CUSTOM_TARGET_KEY];
      return;
    }

    nameInput.disabled = false;
    btnSave.disabled = false;
    nameInput.placeholder = '给目标取个名字...';
    nameInput.value = state.namesByKey[state.targetKey] ?? '';
  }

  function commitName() {
    if (state.targetKey === CUSTOM_TARGET_KEY) return;
    const txt = (nameInput.value ?? '').trim();
    if (txt.length === 0) {
      delete state.namesByKey[state.targetKey];
    } else {
      state.namesByKey[state.targetKey] = txt;
    }
    updateStatusLine();
  }

  // ✅ PC Enter + 手机 change/blur + 保存按钮
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
    metaEl.textContent = m ? `已加载：${m.w}×${m.h}${m.cropped ? '（已裁剪）' : ''}` : `已加载：${iw}×${ih}`;
  }

  async function setCustomTargetFromFile(file) {
    if (!state.customTarget) state.customTarget = { img: null, meta: null };

    try {
      const { img, url } = await loadImageFromFile(file);

      // 先缩放，避免手机拍照大图占用过高
      let canvas = imageToCanvasScaled(img, 2048);

      let cropped = false;
      if (autoCrop.checked) {
        const out = autoCropAlphaCanvas(canvas, 10, 6);
        if (out !== canvas) {
          canvas = out;
          cropped = true;
        }
      }

      URL.revokeObjectURL(url);

      state.customTarget.img = canvas;
      state.customTarget.meta = {
        w: canvas.width,
        h: canvas.height,
        cropped,
        from: file.name || 'upload',
      };

      // 上传即切到 custom target
      state.targetKey = CUSTOM_TARGET_KEY;
      targetSel.value = CUSTOM_TARGET_KEY;
      syncNameInput();
      drawPreviewFromCustom();
      onTargetChange?.();
      updateStatusLine();
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
    imgInput.value = ''; // 允许重复选择同一张
  });

  btnClear.addEventListener('click', () => {
    if (state.customTarget) {
      state.customTarget.img = null;
      state.customTarget.meta = null;
    }

    if (state.targetKey === CUSTOM_TARGET_KEY) {
      state.targetKey = TARGETS[0].key;
      targetSel.value = state.targetKey;
      syncNameInput();
      onTargetChange?.();
    }

    drawPreviewFromCustom();
    updateStatusLine();
  });

  // ---------- Controls: mode/target/tool ----------
  const modeSel = dock.querySelector('#modeSel');
  const targetSel = dock.querySelector('#targetSel');
  const toolSel = dock.querySelector('#toolSel');
  const toolLabel = dock.querySelector('#toolLabel');

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
  targetSel.innerHTML = '';
  for (const t of TARGETS) {
    const opt = document.createElement('option');
    opt.value = t.key;
    opt.textContent = stripExt(t.key);
    targetSel.appendChild(opt);
  }
  targetSel.value = state.targetKey;

  function rebuildToolMenu() {
    toolSel.innerHTML = '';

    const isHit = (state.modeKey === 'hit');
    const list = isHit ? VEHICLES : WEAPONS;
    toolLabel.textContent = isHit ? 'Vehicle' : 'Item';

    for (const it of list) {
      const opt = document.createElement('option');
      opt.value = it.key;
      opt.textContent = stripExt(it.key);
      toolSel.appendChild(opt);
    }

    if (isHit) {
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
    // 切模式时清理可能遗留的输入/动画状态（避免交叉影响）
    if (state.charge) state.charge.active = false;
    if (state.punch) state.punch.active = false;
    if (Array.isArray(state.ragePunches)) state.ragePunches.length = 0;
    rebuildToolMenu();
    updateStatusLine();
  });

  targetSel.addEventListener('change', () => {
    state.targetKey = targetSel.value;
    if (state.bossKey) {
      state.bossKey.active = false;
      state.bossKey.prevTargetKey = state.targetKey;
    }
    syncNameInput();
    onTargetChange?.();
    updateStatusLine();
  });

  toolSel.addEventListener('change', () => {
    if (state.modeKey === 'hit') state.vehicleKey = toolSel.value;
    else state.weaponKey = toolSel.value;
    updateStatusLine();
  });

  function updateStatusLine() {
    const mode = state.modeKey ?? 'punch';
    const target = state.targetKey ?? 'sandbag';
    const tool = (mode === 'hit') ? (state.vehicleKey ?? 'truck') : (state.weaponKey ?? 'fist');
    statusEl.textContent = `${mode} · ${target} · ${tool}`;
  }

  // 初始
  rebuildToolMenu();
  syncNameInput();
  drawPreviewFromCustom();
  updateStatusLine();
  setOpen(false);

  return { modeSel, targetSel, toolSel, nameInput };
}
