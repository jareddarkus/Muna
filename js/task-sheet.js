// The screen for one task, step or sub-step: description, its steps, and the complete button.
import { h, tap } from './util.js';
import { icon, habitIcon } from './icons.js';
import { openPanel, panelBar } from './ui.js';
import { PALETTE, hex } from './colors.js';
import { state, subscribe, childrenOf, isTaskDone, setTaskDone, stepCount, taskPath, taskProgress } from './store.js';
import { attachHold } from './hold.js';
import { openTaskEditor } from './task-editor.js';
import { taskItems } from './task-actions.js';
import { togetherStrip } from './together.js';
import { syncTaskCards } from './task-card.js';

export function openTask(id) {
  if (!state.tasks.get(id)) return;
  let unsub = () => {};
  const panel = openPanel({ cls: 'habit-panel task-panel', onClose: () => unsub(), tapClose: true });

  const edit = h('button', { type: 'button', class: 'sq-btn', 'aria-label': 'Edit', onClick: () => { panel.close(); setTimeout(() => openTaskEditor({ id }), 150); } }, icon('pencil', { size: 26, stroke: 1.8 }));
  const titleEl = h('span', { class: 'habit-bar-title' });
  const path = h('p', { class: 'habit-sub center' });
  const about = h('p', { class: 'task-about' });
  const steps = h('div', { class: 'cards step-cards' });
  const addStep = h('button', { type: 'button', class: 'pill small light', onClick: () => openTaskEditor({ parentId: id }) }, icon('plus', { size: 22, stroke: 2 }), 'Add step');
  const complete = h('button', { type: 'button', class: 'big-btn main', 'aria-label': 'Complete or reset', onClick: () => { tap(); const t = state.tasks.get(id); if (t) setTaskDone(t, !isTaskDone(t)); } }, icon('check', { size: 37.4, stroke: 3.86 }));
  panel.el.append(panelBar(panel, { left: edit, title: titleEl }),
    h('div', { class: 'panel-body center' }, path, about, steps, addStep, h('div', { class: 'habit-controls' }, complete), togetherStrip('task', id)));

  const rows = new Map();
  function update() {
    const t = state.tasks.get(id);
    if (!t) { panel.close(); return; }
    const done = isTaskDone(t);
    titleEl.textContent = t.title;
    panel.el.style.setProperty('--c', hex(t.color));
    const sc0 = stepCount(id), pr = Math.round(taskProgress(id) * 100);
    const p = [taskPath(t) ? `in ${taskPath(t)}` : '', sc0.n ? `${done ? 100 : Math.min(99, pr)}% done` : ''].filter(Boolean).join(' • '); path.textContent = p; path.hidden = !p;
    about.textContent = t.description || ''; about.hidden = !t.description;
    panel.el.classList.toggle('done', done);
    complete.style.background = done ? PALETTE.green : '';
    const kids = childrenOf(id);
    syncTaskCards(steps, kids, rows, (cid) => openTask(cid), { showPath: false }); // steps look exactly like tasks do on the Tasks tab
    steps.hidden = !kids.length;
  }
  unsub = subscribe(update);
  update();
}
