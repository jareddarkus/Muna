// The people in a shared habit / task: who is done today, and a button to remind the ones who are not.
import { h, toast } from './util.js';
import { icon } from './icons.js';
import { openPanel, panelBar, avatar } from './ui.js';
import { state, itemPeople, nudgePerson, profileOf } from './store.js';

export function openTogether(kind, item) {
  const panel = openPanel({ cls: 'picker-habit short', tapClose: true });
  const list = h('div', { class: 'invite-list' }, h('p', { class: 'hint center' }, 'Loading…'));
  panel.el.append(panelBar(panel, { title: 'Together' }), h('div', { class: 'panel-body' },
    h('p', { class: 'hint center' }, kind === 'task' ? 'This task is shared: everyone sees and edits the same one, live. Tap the bell to remind someone.' : 'Everyone logs their own. Tap the bell to remind someone who has not done it yet.'), list));
  const sent = new Set();
  async function paint() {
    let rows = [];
    try { rows = await itemPeople(kind, item.id); } catch (e) { list.replaceChildren(h('p', { class: 'hint center' }, 'Could not load.')); return; }
    list.replaceChildren(...rows.map((r) => {
      const me = r.user_id === state.me.id, p = profileOf(r.user_id);
      const status = r.status === 'pending' ? 'Invited' : kind === 'task' ? 'In' : r.done ? 'Done' : 'Not yet';
      const canRemind = !me && r.status !== 'pending' && !r.done;
      const bell = canRemind ? h('button', { type: 'button', class: 'remind', 'aria-label': `Remind @${p.username}`, disabled: sent.has(r.user_id), onClick: async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try { await nudgePerson(kind, item, r.user_id); sent.add(r.user_id); toast(`Reminder sent to @${p.username}`); paint(); }
        catch (er) { toast(er?.message || 'Could not send'); b.disabled = false; }
      } }, icon('bell', { size: 22, stroke: 2 })) : null;
      return h('div', { class: `invite-row ${r.done ? 'is-done' : ''}` }, avatar(p, 40), h('span', { class: 'invite-name' }, `@${p.username}${me ? ' (you)' : ''}`),
        h('span', { class: `invite-status ${r.done ? 'ok' : ''}` }, sent.has(r.user_id) ? 'Reminded' : status), bell);
    }));
  }
  paint();
}
