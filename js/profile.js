// Someone's profile: photo, About me, their 21-day rate, friendship actions — and their habits if you are friends.
import { h, toast } from './util.js';
import { icon } from './icons.js';
import { hex } from './colors.js';
import { avatar, openPanel, panelBar, dangerButton } from './ui.js';
import { card, rateRing, habitSub } from './cards.js';
import { state, subscribe, profileOf, memberRate, friendHabits, friendshipWith, addFriendById, acceptFriend, removeFriendship, isAdmin, membersOf, setRole, kickMember } from './store.js';

const fail = (e) => toast(e?.message || 'Something went wrong');

export function openProfile(uid, { groupId } = {}) {
  let unsub = () => {};
  const panel = openPanel({ cls: 'profile', onClose: () => unsub() });
  const p0 = profileOf(uid);
  const head = h('section', { class: 'profile-head' });
  const actions = h('div', { class: 'profile-actions' });
  const habits = h('div', { class: 'cards' });
  const note = h('p', { class: 'hint center' });
  panel.el.append(panelBar(panel), h('div', { class: 'panel-body' }, head, actions, note, habits, h('div', { class: 'spacer' })));

  let pct, loaded = false, habitRows = null;
  Promise.all([memberRate(uid).catch(() => null), friendHabits(uid).catch(() => [])]).then(([r, hs]) => { pct = r; habitRows = hs; loaded = true; paint(); });

  function paint() {
    const p = profileOf(uid) || p0;
    const fr = friendshipWith(uid);
    const friends = fr?.status === 'accepted';
    head.replaceChildren(avatar(p, 110), h('h2', { class: 'person-name' }, `@${p.username}`), p.about ? h('p', { class: 'about' }, p.about) : h('p', { class: 'about muted' }, 'No About me yet'));
    if (loaded && pct != null) { const r = rateRing(); r.set(pct); head.append(h('div', { class: 'rate-line' }, r.el, h('span', {}, '21-day completion'))); }

    actions.replaceChildren();
    if (uid !== state.me.id) {
      if (!fr) actions.append(h('button', { type: 'button', class: 'pill primary', onClick: () => addFriendById(uid).then(() => toast('Request sent')).catch(fail) }, icon('user-plus', { size: 28, stroke: 1.8 }), 'Add friend'));
      else if (fr.status === 'pending' && fr.addressee_id === state.me.id) actions.append(h('button', { type: 'button', class: 'pill primary', onClick: () => acceptFriend(fr.id).catch(fail) }, 'Accept request'), h('button', { type: 'button', class: 'pill light', onClick: () => removeFriendship(fr.id).catch(fail) }, 'Decline'));
      else if (fr.status === 'pending') actions.append(h('button', { type: 'button', class: 'pill light', onClick: () => removeFriendship(fr.id).catch(fail) }, 'Request sent · Cancel'));
      else actions.append(h('span', { class: 'pill light static' }, icon('user-check', { size: 28, stroke: 1.8 }), 'Friends'), dangerButton('Remove', 'Tap again to remove', () => removeFriendship(fr.id).catch(fail), 'small'));
      // admin tools when opened from a group
      if (groupId && isAdmin(groupId)) {
        const m = membersOf(groupId).find((x) => x.user_id === uid);
        if (m) {
          actions.append(m.role === 'admin'
            ? h('button', { type: 'button', class: 'pill light', onClick: () => setRole(groupId, uid, 'member').then(() => toast('Not an admin anymore')).catch(fail) }, 'Remove admin')
            : h('button', { type: 'button', class: 'pill light', onClick: () => setRole(groupId, uid, 'admin').then(() => toast('Now an admin')).catch(fail) }, icon('crown', { size: 28, stroke: 1.8 }), 'Make admin'));
          if (m.role !== 'admin') actions.append(dangerButton('Remove from group', 'Tap again to remove', async () => { await kickMember(groupId, uid).catch(fail); panel.close(); }, 'small'));
        }
      }
    }

    habits.replaceChildren();
    note.textContent = '';
    if (uid === state.me.id) return;
    if (!friends) { note.textContent = 'Become friends to see their habits.'; return; }
    if (!loaded) return;
    if (!habitRows?.length) { note.textContent = 'No habits yet.'; return; }
    for (const hb of habitRows) {
      const c = card({}); c.set({ color: hex(hb.color), icon: hb.icon, name: hb.title, sub: habitSub(hb), done: false });
      const rr = rateRing(); rr.set(hb.pct); c.slot.append(rr.el); habits.append(c.el);
    }
  }
  unsub = subscribe(paint);
  paint();
}
