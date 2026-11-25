// Create / edit a task, step or sub-step: name + icon, description, day, parent, and its own steps.
import { h, toast } from './util.js';
import { icon, habitIcon } from './icons.js';
import { COLORS, COLOR_NAMES, PALETTE, hex, colorKey } from './colors.js';
import { openPanel, panelBar, dangerButton, toggleSwitch } from './ui.js';
import { state, subscribe, sharesOf, isSharedByOther, leaveSharedTask, saveTask, deleteTask, duplicateTask, childrenOf, descendantIds, taskPath, taskList, isTaskDone } from './store.js';
import { openIconPicker } from './editor.js';
import { openInvite } from './invite.js';
import { syncTaskCards } from './task-card.js';

/** openTaskEditor({ id }) edits; openTaskEditor({ parentId?, day? }) creates a task (no parent) or a step (with a parent). */
export function openTaskEditor({ id = null, parentId = null, day = null, anytime = false, project = false } = {}) {
  const existing = id ? state.tasks.get(id) : null;
  if (id && !existing) return;
  const draft = existing
    ? { title: existing.title, icon: existing.icon, color: colorKey(existing.color), description: existing.description || '', day: existing.day, time: existing.due_time || null, project: !!existing.project, parent: existing.parent_id }
    : { title: '', icon: 'outline:list-check', color: parentId && state.tasks.get(parentId) ? colorKey(state.tasks.get(parentId).color) : 'purple', description: '', day: parentId ? day : anytime ? null : day || state.taskDay, time: null, project: !parentId && project, parent: parentId };
  let savedId = existing?.id || null; // set once the task exists (so steps can be added before the final save)
  let unsub = () => {};
  const panel = openPanel({ cls: 'editor', onClose: () => unsub(), backdropClose: false });
  const paintColor = () => panel.el.style.setProperty('--c', hex(draft.color));
  paintColor();
  const isStep = () => !!draft.parent;
  const heading = () => `${savedId ? 'Edit' : 'New'} ${isStep() ? 'step' : 'task'}`;

  const circle = h('button', { type: 'button', class: 'name-circle', 'aria-label': 'Choose icon', onClick: () => openIconPicker({ icon: draft.icon, color: draft.color }, (ref) => { draft.icon = ref; paintIcon(); }) });
  const paintIcon = () => circle.replaceChildren(habitIcon(draft.icon, 26, 1.7));
  const name = h('input', { class: 'name-input', type: 'text', placeholder: 'Type here...', maxLength: 80, value: draft.title, autocomplete: 'off', enterKeyHint: 'done', onInput: (e) => { draft.title = e.target.value; validate(); } });
  const about = h('textarea', { class: 'about-input', rows: 3, maxLength: 1000, placeholder: 'Description (optional)', value: draft.description, onInput: (e) => { draft.description = e.target.value; } });

  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Color' }, COLORS.map((k) =>
    h('button', { type: 'button', class: `swatch ${k === draft.color ? 'on' : ''}`, 'data-k': k, role: 'radio', 'aria-label': COLOR_NAMES[k], style: { background: PALETTE[k] },
      onClick: () => { draft.color = k; paintColor(); swatches.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on', b.dataset.k === k)); } })));

  // day: optional for every task and step
  const dayInput = h('input', { class: 'pill-input date-input', type: 'date', value: draft.day || state.taskDay, 'aria-label': 'Day', onChange: (e) => { if (e.target.value) draft.day = e.target.value; } });
  const dayOn = toggleSwitch(!!draft.day, (on, api) => { api.set(on); draft.day = on ? dayInput.value || state.taskDay : null; paintDay(); });
  const dayHead = h('div', { class: 'row-between' }, h('h3', {}, 'Day'), dayOn.el);
  const dayHint = h('p', { class: 'hint' });
  function paintDay() {
    dayInput.hidden = !draft.day; dayOn.set(!!draft.day);
    dayHint.hidden = !!draft.day;
    timeCard.hidden = !draft.day; timeInput.hidden = !draft.time; timeOn.set(!!draft.time);
    projectCard.hidden = isStep();
    dayHint.textContent = isStep() ? 'No day: it just lives inside its task.' : 'No day: it shows on Today every day, under Carried over, until you finish it.';
  }

  // time of day (only with a day)
  const timeInput = h('input', { class: 'pill-input date-input', type: 'time', value: draft.time || '09:00', 'aria-label': 'Time', onChange: (e) => { draft.time = e.target.value || null; } });
  const timeOn = toggleSwitch(!!draft.time, (on, api) => { api.set(on); draft.time = on ? timeInput.value || '09:00' : null; paintDay(); });
  const timeCard = h('section', { class: 'field-card' }, h('div', { class: 'row-between' }, h('h3', {}, 'Time'), timeOn.el), timeInput);
  // project: shows in the Projects tab
  const projectOn = toggleSwitch(draft.project, (on, api) => { api.set(on); draft.project = on; });
  const projectCard = h('section', { class: 'field-card' }, h('div', { class: 'row-between' }, h('h3', {}, 'Project'), projectOn.el), h('p', { class: 'hint' }, 'Shows in the Projects tab, where you follow how far its steps are.'));

  // parent
  const parentLabel = h('span', {});
  const parentRow = h('button', { type: 'button', class: 'list-pill', onClick: () => pickParent() }, parentLabel, icon('chevron-right', { size: 22, stroke: 2 }));
  function paintParent() {
    const p = draft.parent ? state.tasks.get(draft.parent) : null;
    parentLabel.textContent = p ? [taskPath(p), p.title].filter(Boolean).join(' › ') : 'Top level';
    title.textContent = heading(); paintDay(); paintSave(); dup.hidden = del.hidden = !savedId;
  }
  function pickParent() {
    const pick = openPanel({ cls: 'picker-habit short', tapClose: true });
    const banned = new Set(savedId ? [savedId, ...descendantIds(savedId)] : []);
    const rows = [{ id: null, title: 'Top level', depth: 0, ic: null }];
    const walk = (pid, depth) => { for (const t of taskList()) if (t.parent_id === pid && !banned.has(t.id)) { rows.push({ id: t.id, title: t.title, depth, ic: t.icon }); walk(t.id, depth + 1); } };
    walk(null, 0);
    const list = h('div', { class: 'parent-list' }, rows.map((r) => h('button', { type: 'button', class: `list-pill parent-row ${draft.parent === r.id ? 'on' : ''}`, style: { paddingLeft: `${25 + r.depth * 18}px` },
      onClick: () => { draft.parent = r.id; pick.close(); paintParent(); } },
      r.ic ? habitIcon(r.ic, 22, 1.8) : null, h('span', {}, r.title), draft.parent === r.id ? icon('check', { size: 22, stroke: 2.4 }) : null)));
    pick.el.append(panelBar(pick, { title: 'Belongs to' }), h('div', { class: 'panel-body' }, h('p', { class: 'hint center' }, 'Move it under another task or step, or make it a top-level task.'), list));
  }

  // together: invite friends to this task
  const inviteCount = h('span', { class: 'ver-chip', hidden: true });
  const inviteRow = h('button', { type: 'button', class: 'list-pill', onClick: async () => {
    if (!draft.title.trim()) { toast('Give it a name first.'); name.focus(); return; }
    inviteRow.disabled = true;
    try { await persist(); openInvite('task', state.tasks.get(savedId)); } catch (e) { toast(e.message || 'Could not save'); }
    inviteRow.disabled = false;
  } }, h('span', {}, 'Invite friends'), inviteCount, icon('chevron-right', { size: 22, stroke: 2 }));
  const paintInvites = () => { const n = savedId ? sharesOf('task', savedId).length : 0; inviteCount.hidden = !n; inviteCount.textContent = String(n); };

  // steps
  const stepList = h('div', { class: 'cards step-cards edit' });
  const stepsCard = h('section', { class: 'field-card' }, h('h3', {}, 'Steps'), stepList,
    h('button', { type: 'button', class: 'pill small light', onClick: addStep }, icon('plus', { size: 22, stroke: 2 }), 'Add step'));
  const stepCards = new Map();
  function paintSteps() {
    const kids = savedId ? childrenOf(savedId) : [];
    syncTaskCards(stepList, kids, stepCards, (cid) => openTaskEditor({ id: cid }), { showPath: false });
    stepList.hidden = !kids.length;
  }
  async function addStep() {
    if (!draft.title.trim()) { toast('Give it a name first.'); name.focus(); return; }
    try { await persist(); openTaskEditor({ parentId: savedId }); } catch (e) { toast(e.message || 'Could not save'); }
  }
  unsub = subscribe(() => { if (savedId && !state.tasks.has(savedId)) { panel.close(); return; } paintSteps(); paintInvites(); });

  let persisting = null; // taps that arrive while the first save is still running wait for it (they used to create the task again)
  const persist = () => (persisting ??= doPersist().finally(() => { persisting = null; }));
  async function doPersist() {
    const row = { id: savedId || undefined, title: draft.title.trim(), icon: draft.icon, color: draft.color, description: draft.description.trim(), day: draft.day || null, due_time: draft.day ? draft.time : null, project: isStep() ? false : draft.project, parent_id: draft.parent };
    savedId = await saveTask(row);
    paintParent(); paintSteps();
  }
  const save = h('button', { type: 'button', class: 'pill primary block', onClick: onSave });
  function paintSave() { save.textContent = savedId ? 'Save changes' : isStep() ? 'Add step' : 'Add task'; }
  function validate() { save.disabled = !draft.title.trim(); }
  async function onSave() {
    if (!draft.title.trim()) return;
    save.disabled = true;
    try { await persist(); panel.close(); } catch (e) { toast(e.message || 'Could not save'); save.disabled = false; }
  }
  const dup = h('button', { type: 'button', class: 'pill light block', onClick: async () => {
    try { await duplicateTask(savedId); toast('Duplicated'); panel.close(); } catch (e) { toast(e.message || 'Could not duplicate'); }
  } }, icon('copy', { size: 24, stroke: 1.8 }), 'Duplicate');
  const leaving = isSharedByOther(existing);
  const del = leaving
    ? dangerButton('Leave task', 'It stays with the person who shared it. It just disappears from your list.', async () => { await leaveSharedTask(savedId); panel.close(); }, 'block', 'Leave')
    : dangerButton('Delete', 'This also deletes everything inside it. It cannot be undone.', async () => { await deleteTask(savedId); panel.close(); }, 'block');
  dup.hidden = del.hidden = !existing;

  const title = h('h2', {}, heading());
  const bar = panelBar(panel, { title: '' });
  bar.querySelector('h2').replaceWith(title);
  panel.el.append(bar,
    h('div', { class: 'panel-body' },
      h('div', { class: 'name-pill' }, circle, name),
      h('section', { class: 'field-card' }, h('h3', {}, 'Color'), swatches),
      h('section', { class: 'field-card' }, h('h3', {}, 'Description'), about),
      h('section', { class: 'field-card' }, dayHead, dayInput, dayHint), timeCard, projectCard,
      h('section', { class: 'field-card' }, h('h3', {}, 'Belongs to'), parentRow),
      stepsCard, state.demo || isStep() || isSharedByOther(existing) ? null : h('section', { class: 'field-card' }, h('h3', {}, 'Together'), inviteRow), save, dup, del, h('div', { class: 'spacer' })));
  paintIcon(); paintParent(); paintSteps(); validate();
  if (!existing) setTimeout(() => name.focus({ preventScroll: true }), 400);
}
