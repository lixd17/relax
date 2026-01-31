import { TARGETS, WEAPONS, VEHICLES, MODES } from './config.js';
import { stripExt } from './utils.js';

export function createUI(state, onTargetChange) {
  // HMR 防重复
  document.getElementById('ui')?.remove();
  document.getElementById('nameBox')?.remove();

  // 左上角：命名
  const nameBox = document.createElement('div');
  nameBox.id = 'nameBox';
  nameBox.innerHTML = `
    <label for="nameInput">请命名对象</label>
    <input id="nameInput" placeholder="回车确认" />
  `;
  document.body.appendChild(nameBox);

  const nameInput = nameBox.querySelector('#nameInput');

  function syncNameInput() {
    nameInput.value = state.namesByKey[state.targetKey] ?? '';
  }

  nameInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const txt = nameInput.value.trim();
    if (txt.length === 0) {
      delete state.namesByKey[state.targetKey];
    } else {
      state.namesByKey[state.targetKey] = txt;
    }
    nameInput.blur();
  });

  // 左上角：Mode/Target + Item/Vehicle（纵向）
  const ui = document.createElement('div');
  ui.id = 'ui';
  ui.innerHTML = `
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
  document.body.appendChild(ui);

  // Mode select
  const modeSel = ui.querySelector('#modeSel');
  for (const m of MODES) {
    const opt = document.createElement('option');
    opt.value = m.key;
    opt.textContent = stripExt(m.label ?? m.key);
    modeSel.appendChild(opt);
  }
  modeSel.value = state.modeKey ?? 'punch';

  // Target select
  const targetSel = ui.querySelector('#targetSel');
  for (const t of TARGETS) {
    const opt = document.createElement('option');
    opt.value = t.key;
    opt.textContent = stripExt(t.key);
    targetSel.appendChild(opt);
  }
  targetSel.value = state.targetKey;

  targetSel.addEventListener('change', () => {
    state.targetKey = targetSel.value;
    syncNameInput();
    onTargetChange?.();
  });

  // Item/Vehicle select (depends on mode)
  const toolLabel = ui.querySelector('#toolLabel');
  const toolSel = ui.querySelector('#toolSel');

  function setOptions(items, selectedKey) {
    toolSel.innerHTML = '';
    for (const it of items) {
      const key = (typeof it === 'string') ? it : it.key;
      const label = (typeof it === 'string') ? it : (it.label ?? it.key);
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = stripExt(label);
      toolSel.appendChild(opt);
    }
    if (selectedKey != null) toolSel.value = selectedKey;
  }

  function refreshToolSel() {
    const mode = state.modeKey ?? 'punch';
    if (mode === 'hit') {
      toolLabel.textContent = 'Vehicle';
      const keys = VEHICLES.map(v => v.key);
      if (!keys.includes(state.vehicleKey)) {
        state.vehicleKey = (VEHICLES.find(v => v.key === 'truck')?.key) ?? (VEHICLES[0]?.key ?? 'truck');
      }
      setOptions(VEHICLES, state.vehicleKey);
    } else {
      toolLabel.textContent = 'Item';
      const keys = WEAPONS.map(w => w.key);
      if (!keys.includes(state.weaponKey)) {
        state.weaponKey = (WEAPONS.find(w => w.key === 'fist')?.key) ?? WEAPONS[0].key;
      }
      setOptions(WEAPONS, state.weaponKey);
    }
  }

  modeSel.addEventListener('change', () => {
    state.modeKey = modeSel.value;
    refreshToolSel();
  });

  toolSel.addEventListener('change', () => {
    const mode = state.modeKey ?? 'punch';
    if (mode === 'hit') state.vehicleKey = toolSel.value;
    else state.weaponKey = toolSel.value;
  });

  refreshToolSel();

  syncNameInput();

  return { nameInput, modeSel, targetSel, toolSel };
}
