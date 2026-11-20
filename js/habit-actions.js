// What the press-and-hold menus do, in one place.
import { h, toast } from './util.js';
import { openPanel, panelBar, confirmDialog } from './ui.js';
import { card } from './cards.js';
import { hex } from './colors.js';
import { state, valueOf, setValue, deleteHabit, myGroups, createPost, isShared } from './store.js';
import { openHabit } from './habit.js';
import { openEditor } from './editor.js';
import { openInvite } from './invite.js';
import { openTogether } from './together-panel.js';

const fail = (e) => toast(e?.message || 'Something went wrong');

/** Share a habit to one of my groups (it appears as a post others can copy). */
export function shareHabit(hb) {
  if (state.demo) { toast('Sign in with Google to share habits.'); return; }
  const groups = myGroups();
  if (!groups.length) { toast('Join or create a group first (Social tab).'); return; }
  const post = async (g) => { try { await createPost(g.id, '', hb); toast(`Shared to ${g.name}`); } catch (e) { fail(e); } };
  if (groups.length === 1) { post(groups[0]); return; }
  const panel = openPanel({ cls: 'picker-habit short', tapClose: true });
  const list = h('div', { class: 'cards' }, groups.map((g) => {
    const c = card({ onClick: () => { panel.close(); post(g); } });
    c.set({ color: hex(g.color), icon: g.icon, name: g.name, sub: 'Share here', done: false, showFlag: false });
    return c.el;
  }));
  panel.el.append(panelBar(panel, { title: 'Share to…' }), h('div', { class: 'panel-body' }, list));
}

/** Menu for a habit card (Today and Reports). */
export function habitItems(hb, { day = state.viewDay, extra = [] } = {}) {
  const v = valueOf(hb.id, day);
  return [
    { label: 'Log', icon: 'circle-check', onSelect: () => openHabit(hb.id, day) },
    ...extra,
    { label: 'Edit', icon: 'pencil', onSelect: () => openEditor(hb.id) },
    state.demo ? null : { label: 'Invite friends', icon: 'user-plus', onSelect: () => openInvite('habit', hb) },
    !state.demo && isShared('habit', hb.id) ? { label: 'Remind someone', icon: 'bell', onSelect: () => openTogether('habit', hb) } : null,
    state.demo ? null : { label: 'Share to a group', icon: 'send', onSelect: () => shareHabit(hb) },
    v > 0 ? { label: 'Reset this day', icon: 'refresh', onSelect: () => setValue(hb, 0, day) } : null,
    { label: 'Delete', icon: 'trash', danger: true, onSelect: async () => {
      if (await confirmDialog({ title: 'Delete habit?', message: 'This removes the habit and all of its history. It cannot be undone.' })) deleteHabit(hb.id).catch(fail);
    } },
  ];
}
