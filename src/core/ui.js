import { TARGETS, WEAPONS, VEHICLES, MODES, CUSTOM_TARGET_KEY } from './config.js';
import {
  stripExt,
  loadImageFromFile,
  imageToCanvasScaled,
  autoCropAlphaCanvas,
} from './utils.js';
import { cutoutPerson } from './cutout.js';
import { openCropper } from './cropper.js';

export function createUI(state, onTargetChange) {
  // HMR 防重复
  document.getElementById('menuDock')?.remove();
  document.getElementById('menuOverlay')?.remove();
  document.getElementById('helpModal')?.remove();

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
      <button id="helpToggle" type="button" aria-label="help">help</button>
      <div id="menuStatus"></div>
    </div>

    <div id="menuBody">
      <div class="panel" id="objectPanel">
        <div class="panelTitle">Object</div>
        <div class="hint">
          上传图片后会优先尝试<strong>人像抠图（Beta）</strong>；效果不好可用“手动裁剪”兜底。透明 PNG 仍可勾选“自动裁剪透明边缘”。
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

        <div class="row rowTight">
          <label class="inline">
            <input id="autoCutout" type="checkbox" checked />
            自动抠人像（Beta）
          </label>
          <button id="manualCrop" type="button">手动裁剪</button>
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

  // Help modal（常驻在左上角；点击 help 打开）
  const helpModal = document.createElement('div');
  helpModal.id = 'helpModal';
  helpModal.style.display = 'none';
  helpModal.innerHTML = `
    <div class="helpCard" role="dialog" aria-modal="true" aria-label="Help">
      <div class="helpHeader">
        <div class="helpTitle">Help</div>
        <button id="helpClose" type="button" aria-label="close">✕</button>
      </div>

      <div class="helpBody">
        <div class="helpSection">
          <div class="helpH">快速开始</div>
          <ul>
            <li><b>打开菜单</b>：左上角 ☰</li>
            <li><b>punch</b>：按住鼠标/触屏蓄力 → 松开出拳</li>
            <li><b>hit</b>：按住蓄力 → 松开出车（从左右冲出来）</li>
            <li><b>rage</b>：无蓄力；鼠标点击或键盘字母键（A–Z）都能连续出拳</li>
          </ul>
        </div>

        <div class="helpSection">
          <div class="helpH">模式说明</div>
          <ul>
            <li><b>punch</b>：蓄力越久越狠（最多 3 秒），超时会触发“过载”判定</li>
            <li><b>hit</b>：蓄力影响车辆速度/力度；短蓄力更像“撞飞”，长蓄力更像“直接飞出去”</li>
            <li><b>rage</b>：每次点击/每次字母输入都会生成一个新的攻击（可同屏多拳）</li>
          </ul>
        </div>

        <div class="helpSection">
          <div class="helpH">输入规则</div>
          <ul>
            <li><b>鼠标/触屏</b>：点左边从左出，点右边从右出（和拳头一致）</li>
            <li><b>键盘字母键（A–Z）</b>：仅在 rage 中有效；左右随机一边出拳</li>
            <li><b>输入法提示</b>：浏览器无法强制切换系统输入法；想爽打建议切到英文输入</li>
          </ul>
        </div>

        <div class="helpSection">
          <div class="helpH">老板键</div>
          <ul>
            <li><span class="kbd">Space</span>：一键切到 <b>custom</b>（伪装成“打沙袋”）；再按一次切回原目标</li>
            <li>custom <b>不可命名</b>，避免露馅</li>
          </ul>
        </div>

        <div class="helpSection">
          <div class="helpH">小技巧</div>
          <ul>
            <li>菜单里的 <b>Object</b> 可以上传自定义图片；透明 PNG 可勾选“自动裁剪”</li>
            <li><span class="kbd">Esc</span>：关闭 Help（也可点空白处关闭）</li>
          </ul>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(helpModal);


  // ---------- open/close ----------
  const btnToggle = dock.querySelector('#menuToggle');
  const btnHelp = dock.querySelector('#helpToggle');
  const statusEl = dock.querySelector('#menuStatus');
  const btnOk = dock.querySelector('#menuOk');
  const btnHelpClose = helpModal.querySelector('#helpClose');

  let helpOpen = false;

  function syncOverlay() {
    overlay.style.display = (dock.classList.contains('open') || helpOpen) ? 'block' : 'none';
  }

  function blurActive() {
    const ae = document.activeElement;
    if (ae && typeof ae.blur === 'function') ae.blur();
  }

  function setOpen(open) {
    dock.classList.toggle('open', !!open);
    syncOverlay();
    if (!open) blurActive();
  }
  function toggleOpen() {
    setOpen(!dock.classList.contains('open'));
  }

  function setHelpOpen(open) {
    helpOpen = !!open;
    helpModal.style.display = helpOpen ? 'block' : 'none';
    if (helpOpen) dock.classList.remove('open');
    syncOverlay();
    if (!helpOpen) blurActive();
  }
  function toggleHelp() {
    setHelpOpen(!helpOpen);
  }

  btnToggle.addEventListener('click', toggleOpen);
  btnHelp.addEventListener('click', toggleHelp);
  btnOk.addEventListener('click', () => setOpen(false));
  btnHelpClose.addEventListener('click', () => setHelpOpen(false));

  // 点空白处：同时收回菜单 + help
  overlay.addEventListener('click', () => {
    setOpen(false);
    setHelpOpen(false);
  });

  // 点 help 卡片外部也关闭
  helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) setHelpOpen(false);
  });

  // HMR 下避免重复绑定全局 ESC
  if (window.__relaxHelpKeyHandler) {
    window.removeEventListener('keydown', window.__relaxHelpKeyHandler);
  }
  window.__relaxHelpKeyHandler = (e) => {
    if (e.key === 'Escape' && helpOpen) setHelpOpen(false);
  };
  window.addEventListener('keydown', window.__relaxHelpKeyHandler);

  // ---------- Object: name + upload ----------
  const nameInput = dock.querySelector('#nameInput');
  const btnSave = dock.querySelector('#nameSave');
  const imgInput = dock.querySelector('#imgInput');
  const btnClear = dock.querySelector('#imgClear');
  const autoCrop = dock.querySelector('#autoCrop');
  const autoCutout = dock.querySelector('#autoCutout');
  const btnManualCrop = dock.querySelector('#manualCrop');
  const preview = dock.querySelector('#customPreview');
  const metaEl = dock.querySelector('#customMeta');

  let customEpoch = 0;

  function setBusy(busy, msg) {
    imgInput.disabled = busy;
    btnClear.disabled = busy;
    autoCrop.disabled = busy;
    autoCutout.disabled = busy;
    btnManualCrop.disabled = busy;
    if (msg != null) metaEl.textContent = msg;
  }

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
    if (m) {
      const tags = [m.cutout ? '抠图' : null, m.cropped ? '裁剪' : null].filter(Boolean).join(' / ');
      metaEl.textContent = `已加载：${m.w}×${m.h}${tags ? `（${tags}）` : ''}`;
    } else {
      metaEl.textContent = `已加载：${iw}×${ih}`;
    }
  }

  async function setCustomTargetFromFile(file) {
    if (!state.customTarget) state.customTarget = { src: null, img: null, meta: null };
    const epoch = ++customEpoch;
    setBusy(true, '处理中...');

    try {
      const { img, url } = await loadImageFromFile(file);

      if (epoch !== customEpoch) {
        URL.revokeObjectURL(url);
        return;
      }

      // 先缩放，避免手机拍照大图占用过高
      const srcCanvas = imageToCanvasScaled(img, 2048);
      state.customTarget.src = srcCanvas;
      let canvas = srcCanvas;

      // 先做人像抠图（Beta），失败就保留原图（再靠手动裁剪兜底）
      let cutout = false;
      if (autoCutout.checked) {
        metaEl.textContent = '人像抠图中...（首次会加载模型）';
        const out = await cutoutPerson(canvas);
        if (epoch !== customEpoch) {
          URL.revokeObjectURL(url);
          return;
        }
        if (out) {
          canvas = out;
          cutout = true;
        } else {
          metaEl.textContent = '未检测到人像或抠图失败（可用手动裁剪兜底）';
        }
      }

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
        cutout,
        from: file.name || 'upload',
      };

      // 上传即切到 custom target
      state.targetKey = CUSTOM_TARGET_KEY;
      targetSel.value = CUSTOM_TARGET_KEY;
      syncNameInput();
      drawPreviewFromCustom();
      onTargetChange?.();
      updateStatusLine();
      setBusy(false);
    } catch (e) {
      console.warn('[ui] upload image failed', e);
      metaEl.textContent = '图片加载失败：请换一张试试（建议 PNG/JPG）';
      drawPreviewFromCustom();
      setBusy(false);
    }
  }

  async function runManualCrop() {
    const src = state.customTarget?.src || state.customTarget?.img;
    if (!src) {
      metaEl.textContent = '还没有上传图片。';
      return;
    }

    const epoch = ++customEpoch;
    setBusy(true, '打开裁剪器...');

    const ret = await openCropper(src, { title: '手动裁剪（兜底）' });
    if (epoch !== customEpoch) return;
    if (!ret || !ret.canvas) {
      setBusy(false);
      return;
    }

    // 裁剪后的图作为新的 src
    state.customTarget.src = ret.canvas;
    let canvas = ret.canvas;

    // 裁剪后可再次尝试抠人像
    let cutout = false;
    if (autoCutout.checked) {
      metaEl.textContent = '裁剪完成，正在抠人像...';
      const out = await cutoutPerson(canvas);
      if (epoch !== customEpoch) return;
      if (out) {
        canvas = out;
        cutout = true;
      }
    }

    let cropped = false;
    if (autoCrop.checked) {
      const out2 = autoCropAlphaCanvas(canvas, 10, 6);
      if (out2 !== canvas) {
        canvas = out2;
        cropped = true;
      }
    }

    state.customTarget.img = canvas;
    state.customTarget.meta = {
      w: canvas.width,
      h: canvas.height,
      cropped,
      cutout,
      from: 'manual crop',
    };

    // 手动裁剪不自动切 target（避免老板键场景误触），但如果当前就是 custom，就更新预览
    drawPreviewFromCustom();
    updateStatusLine();
    setBusy(false);
  }

  imgInput.addEventListener('change', async () => {
    const file = imgInput.files?.[0];
    if (!file) return;
    await setCustomTargetFromFile(file);
    imgInput.value = ''; // 允许重复选择同一张
  });

  btnClear.addEventListener('click', () => {
    if (state.customTarget) {
      state.customTarget.src = null;
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

  btnManualCrop.addEventListener('click', () => {
    runManualCrop();
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
