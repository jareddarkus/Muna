// The screen for one task, step or sub-step: description, its steps, and the complete button.
import { h, tap } from './util.js';
import { icon, habitIcon } from './icons.js';
import { openPanel, panelBar } from './ui.js';
import { PALETTE, hex } from './colors.js';
import { state, subscribe, childrenOf, isTaskDone, setTaskDone, stepCount, taskPath, taskProgress } from './store.js';
import { attachHold } from './hold.js';
import { openTaskEditor } from './task-editor.js';
import { taskItems } from './task-actions.js';

export function openTask(id) {
  if (!state.tasks.get(id)) return;
  let unsub = () => {};
  const panel = openPanel({ cls: 'habit-panel task-panel', onClose: () => unsub(), tapClose: true });

  const edit = h('button', { type: 'button', class: 'sq-btn', 'aria-label': 'Edit', onClick: () => { panel.close(); setTimeout(() => openTaskEditor({ id }), 150); } }, icon('pencil', { size: 26, stroke: 1.8 }));
  const titleEl = h('span', { class: 'habit-bar-title' });
  const path = h('p', { class: 'habit-sub center' });
  const about = h('p', { class: 'task-about' });
  const steps = h('div', { class: 'step-list' });
  const addStep = h('button', { type: 'button', class: 'pill small light', onClick: () => openTaskEditor({ parentId: id }) }, icon('plus', { size: 22, stroke: 2 }), 'Add step');
  const complete = h('button', { type: 'button', class: 'big-btn main', 'aria-label': 'Complete or reset', onClick: () => { tap(); const t = state.tasks.get(id); if (t) setTaskDone(t, !isTaskDone(t)); } }, icon('check', { size: 37.4, stroke: 3.86 }));
  panel.el.append(panelBar(panel, { left: edit, title: titleEl }),
    h('div', { class: 'panel-body center' }, path, about, steps, addStep, h('div', { class: 'habit-controls' }, complete)));

  const rows = new Map();
  function row(t) {
    const box = h('button', { type: 'button', class: 'step-box', 'aria-label': 'Toggle step', onClick: (e) => { e.stopPropagation(); tap(); const c = state.tasks.get(t.id); if (c) setTaskDone(c, !isTaskDone(c)); } }, icon('check', { size: 18, stroke: 3 }));
    const name = h('span', { class: 'step-name' });
    const count = h('span', { class: 'step-count' });
    const ic = h('span', { class: 'step-ic' });
    const el = h('div', { class: 'step-row', role: 'button', tabindex: 0, onClick: () => openTask(t.id), onKeydown: (e) => { if (e.key === 'Enter') openTask(t.id); } }, box, ic, name, count);
    const r = { el, box, name, count, ic, t, ref: null };
    attachHold(el, () => taskItems(r.t));
    return r;
  }
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
    for (const [k, r] of rows) if (!kids.some((c) => c.id === k)) { r.el.remove(); rows.delete(k); }
    const els = kids.map((c) => {
      let r = rows.get(c.id); if (!r) { r = row(c); rows.set(c.id, r); }
      r.t = c;
      r.name.textContent = c.title;
      if (r.ref !== c.icon) { r.ref = c.icon; r.ic.replaceChildren(habitIcon(c.icon, 22, 1.8)); }
      const sc = stepCount(c.id); r.count.textContent = sc.n ? `${Math.round(taskProgress(c.id) * 100)}%` : '';
      r.el.classList.toggle('done', isTaskDone(c));
      return r.el;
    });
    const cur = [...steps.children];
    if (els.length !== cur.length || els.some((e, i) => e !== cur[i])) steps.replaceChildren(...els);
    steps.hidden = !kids.length;
  }
  unsub = subscribe(update);
  update();
}
