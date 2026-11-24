// "Together" strip on a habit / task screen: everyone in it and how far they are today (count or time).
import { h } from './util.js';
import { icon } from './icons.js';
import { avatar, ring } from './ui.js';
import { hex } from './colors.js';
import { state, itemPeople, profileOf } from './store.js';
import { openTogether } from './together-panel.js';

/** How far a person is today, in their own habit's unit: "2 of 5", "25 of 30 min". */
export function progressText(r) {
  if (r.status === 'pending') return 'Invited';
  if (r.value == null) return r.done ? 'Done' : '';
  if (r.goal_type === 'time') return `${Math.floor(r.value / 60)} of ${Math.round(r.target / 60)} min`;
  return `${r.value} of ${r.target}${r.unit ? ` ${r.unit}` : ''}`;
}

/** Their progress as a small ring (a check inside once they are done); "Invited" until they accept. */
function personRing(r, hb) {
  if (r.status === 'pending') return h('span', { class: 'tg-val' }, 'Invited');
  const rg = ring({ size: 44, stroke: 6, color: hex(hb?.color || 'green') });
  const p = r.done ? 1 : r.value != null && r.target ? Math.min(1, r.value / r.target) : 0;
  rg.set(p);
  return h('span', { class: `tg-ring ${r.done ? 'ok' : ''}`, title: progressText(r), 'aria-label': progressText(r) }, rg.el, r.done ? h('span', { class: 'tg-check' }, icon('check', { size: 18, stroke: 3.2 })) : null);
}

const seen = new Map(); // item id -> last list of people (so the strip is there the moment the screen opens)

/** Returns an element showing the OTHER people in a shared habit / task (never you). Drawn at once from what is already known, then updated quietly. */
export function togetherStrip(kind, id) {
  const el = h('button', { type: 'button', class: 'together', hidden: true, 'aria-label': 'See everyone, and send a reminder', onClick: () => { const it = (kind === 'habit' ? state.habits : state.tasks).get(id); if (it) openTogether(kind, it); } });
  if (state.demo || !state.me) return el;
  const draw = (rows) => {
    const others = (rows || []).filter((r) => r.user_id !== state.me.id);
    if (!others.length) { el.hidden = true; return; }
    el.replaceChildren(
      kind === 'habit'
        ? h('div', { class: 'tg-list' }, others.map((r) => {
          const p = profileOf(r.user_id);
          return h('div', { class: `tg-row ${r.status === 'pending' ? 'pending' : ''}` },
            h('span', { class: 'tg' }, avatar(p, 34)),
            h('span', { class: 'tg-name' }, `@${p.username}`), personRing(r, state.habits.get(id)));
        }))
        : h('div', { class: 'avatars' }, others.map((r) => h('span', { class: `tg ${r.status === 'pending' ? 'pending' : ''}`, title: `@${profileOf(r.user_id).username}` }, avatar(profileOf(r.user_id), 38)))),
      h('p', { class: 'hint' }, kind === 'task' ? 'Shared: everyone sees changes live' : 'Tap to remind someone'));
    el.hidden = false;
  };
  draw(state.together.get(id) || seen.get(id));
  itemPeople(kind, id).then((rows) => { seen.set(id, rows); draw(rows); }).catch(() => {});
  return el;
}
