// "Together" strip on a habit / task screen: the friends who joined, and who is done today.
import { h } from './util.js';
import { icon } from './icons.js';
import { avatar } from './ui.js';
import { state, itemPeople, profileOf } from './store.js';
import { openTogether } from './together-panel.js';

/** Returns an element that fills itself once (nothing is drawn when nobody has been invited). */
export function togetherStrip(kind, id) {
  const el = h('button', { type: 'button', class: 'together', hidden: true, 'aria-label': 'See who is done and send a reminder', onClick: () => { const it = (kind === 'habit' ? state.habits : state.tasks).get(id); if (it) openTogether(kind, it); } });
  if (state.demo || !state.me) return el;
  itemPeople(kind, id).then((rows) => {
    if (!rows || rows.length < 2) return;
    el.replaceChildren(
      h('div', { class: 'avatars' }, rows.map((r) => h('span', { class: `tg ${r.status === 'pending' ? 'pending' : ''}`, title: `@${profileOf(r.user_id).username}${r.status === 'pending' ? ' (invited)' : ''}` },
        avatar(profileOf(r.user_id), 38), kind === 'habit' && r.done ? h('span', { class: 'tg-done' }, icon('check', { size: 12, stroke: 3.5 })) : null))),
      h('p', { class: 'hint' }, kind === 'task' ? 'Shared: everyone sees changes live' : `Together: ${rows.filter((r) => r.done).length} of ${rows.filter((r) => r.status !== 'pending').length} done today`));
    el.hidden = false;
  }).catch(() => {});
  return el;
}
