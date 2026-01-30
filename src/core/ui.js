import { TARGETS } from './config.js';
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

  // 右上角：目标选择
  const ui = document.createElement('div');
  ui.id = 'ui';
  ui.innerHTML = `
    <label for="targetSel">Target</label>
    <select id="targetSel"></select>
  `;
  document.body.appendChild(ui);

  const sel = ui.querySelector('#targetSel');
  for (const t of TARGETS) {
    const opt = document.createElement('option');
    opt.value = t.key;
    opt.textContent = stripExt(t.key); // 不带 .png
    sel.appendChild(opt);
  }
  sel.value = state.targetKey;

  sel.addEventListener('change', () => {
    state.targetKey = sel.value;
    syncNameInput();
    onTargetChange?.();
  });

  syncNameInput();

  return { nameInput, sel };
}
