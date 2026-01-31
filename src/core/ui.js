import { TARGETS, WEAPONS } from './config.js';
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

  // 右上角：目标选择 + 道具选择（纵向）
  const ui = document.createElement('div');
  ui.id = 'ui';
  ui.innerHTML = `
    <div class="row">
      <label for="targetSel">Target</label>
      <select id="targetSel"></select>
    </div>
    <div class="row">
      <label for="weaponSel">Item</label>
      <select id="weaponSel"></select>
    </div>
  `;
  document.body.appendChild(ui);

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

  // Weapon select
  const weaponSel = ui.querySelector('#weaponSel');
  for (const w of WEAPONS) {
    const opt = document.createElement('option');
    opt.value = w.key;
    opt.textContent = stripExt(w.key);
    weaponSel.appendChild(opt);
  }
  weaponSel.value = state.weaponKey ?? WEAPONS[0].key;

  weaponSel.addEventListener('change', () => {
    state.weaponKey = weaponSel.value;
    // ✅ 不强制 reset（避免切道具就中断蓄力/动作）
  });

  syncNameInput();

  return { nameInput, targetSel, weaponSel };
}
