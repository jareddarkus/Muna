// Press-and-hold menu and sharing for tasks, steps and sub-steps.
import { h, toast } from './util.js';
import { openPanel, panelBar, confirmDialog } from './ui.js';
import { card } from './cards.js';
import { hex } from './colors.js';
import { state, isShared, isTaskDone, setTaskDone, deleteTask, duplicateTask, myGroups, createPost, taskSnapshot } from './store.js';
import { openTask } from './task-sheet.js';
import { openTaskEditor } from './task-editor.js';
import { openInvite } from './invite.js';
import { openTogether } from './together-panel.js';

const fail = (e) => toast(e?.message || 'Something went wrong');

export function shareTask(t) {
  if (state.demo) { toast('Sign in with Google to share tasks.'); return; }
  const groups = myGroups();
  if (!groups.length) { toast('Join or create a group first (Social tab).'); return; }
  const post = async (g) => { try { await createPost(g.id, '', null, taskSnapshot(t.id)); toast(`Shared to ${g.name}`); } catch (e) { fail(e); } };
  if (groups.length === 1) { post(groups[0]); return; }
  const panel = openPanel({ cls: 'picker-habit short', tapClose: true });
  const list = h('div', { class: 'cards' }, groups.map((g) => {
    const c = card({ onClick: () => { panel.close(); post(g); } });
    c.set({ color: hex(g.color), icon: g.icon, name: g.name, sub: 'Share here', done: false, showFlag: false });
    return c.el;
  }));
  panel.el.append(panelBar(panel, { title: 'Share to…' }), h('div', { class: 'panel-body' }, list));
}

export function taskItems(t) {
  const done = isTaskDone(t);
  return [
    { label: 'Open', icon: 'eye', onSelect: () => openTask(t.id) },
    { label: done ? 'Mark as not done' : 'Mark as done', icon: 'circle-check', onSelect: () => setTaskDone(t, !done).catch(fail) },
    { label: 'Edit', icon: 'pencil', onSelect: () => openTaskEditor({ id: t.id }) },
    { label: 'Add step', icon: 'plus', onSelect: () => openTaskEditor({ parentId: t.id }) },
    { label: 'Duplicate', icon: 'copy', onSelect: () => duplicateTask(t.id).then(() => toast('Duplicated')).catch(fail) },
    state.demo || t.parent_id ? null : { label: 'Invite friends', icon: 'user-plus', onSelect: () => openInvite('task', t) },
    !state.demo && !t.parent_id && isShared('task', t.id) ? { label: 'Remind someone', icon: 'bell', onSelect: () => openTogether('task', t) } : null,
    state.demo ? null : { label: 'Share to a group', icon: 'send', onSelect: () => shareTask(t) },
    { label: 'Delete', icon: 'trash', danger: true, onSelect: async () => {
      if (await confirmDialog({ title: 'Delete?', message: 'This also deletes everything inside it. It cannot be undone.' })) deleteTask(t.id).catch(fail);
    } },
  ];
}
