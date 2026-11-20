// Invite friends to join a habit or a task. Only friends can be invited; they have to accept (Social → Notifications).
import { h, toast } from './util.js';
import { icon } from './icons.js';
import { openPanel, panelBar, avatar, confirmDialog } from './ui.js';
import { state, subscribe, friendsOf, sharesOf, inviteFriends, removeShare, profileOf } from './store.js';

const fail = (e) => toast(e?.message || 'Something went wrong');

/** kind: 'habit' | 'task'; item: the saved habit / task row. */
export function openInvite(kind, item) {
  if (state.demo) { toast('Sign in with Google to invite friends.'); return; }
  const noun = kind === 'habit' ? 'habit' : 'task';
  let unsub = () => {};
  const panel = openPanel({ cls: 'picker-habit', tapClose: true, onClose: () => unsub() });
  const picked = new Set();
  const inList = h('div', { class: 'invite-list' });
  const friendList = h('div', { class: 'invite-list' });
  const send = h('button', { type: 'button', class: 'pill primary block', onClick: async () => {
    send.disabled = true;
    try { await inviteFriends(kind, item, [...picked]); toast(picked.size === 1 ? 'Invitation sent' : 'Invitations sent'); panel.close(); } catch (e) { fail(e); send.disabled = false; }
  } }, 'Send invitation');
  const inTitle = h('h3', { class: 'list-title' }, `In this ${noun}`), friendTitle = h('h3', { class: 'list-title' }, 'Your friends');
  const empty = h('p', { class: 'hint center' }, 'You can only invite friends. Add some in the Social tab first.');
  panel.el.style.setProperty('--c', 'var(--purple)');
  panel.el.append(panelBar(panel, { title: 'Invite friends' }), h('div', { class: 'panel-body' }, inTitle, inList, friendTitle, friendList, empty, send));

  function paint() {
    const sent = sharesOf(kind, item.id), taken = new Set(sent.map((s) => s.invitee_id));
    inTitle.hidden = inList.hidden = !sent.length;
    inList.replaceChildren(...sent.map((s) => {
      const p = profileOf(s.invitee_id);
      return h('div', { class: 'invite-row' }, avatar(p, 40), h('span', { class: 'invite-name' }, `@${p.username}`), h('span', { class: 'invite-status' }, s.status === 'accepted' ? 'Joined' : 'Invited'),
        h('button', { type: 'button', class: 'invite-x', 'aria-label': 'Remove', onClick: async () => {
          if (!(await confirmDialog({ title: `Remove @${p.username}?`, message: s.status === 'accepted' ? `They keep their own copy, but it is no longer shared with you.` : 'The invitation is withdrawn.', confirm: 'Remove' }))) return;
          try { await removeShare(s.id); } catch (e) { fail(e); }
        } }, icon('x', { size: 22, stroke: 2 })));
    }));
    const friends = friendsOf().filter((f) => !taken.has(f.other.id));
    friendTitle.hidden = !friends.length;
    friendList.replaceChildren(...friends.map((f) => {
      const on = picked.has(f.other.id);
      return h('button', { type: 'button', class: `invite-row pick ${on ? 'on' : ''}`, 'aria-pressed': String(on), onClick: () => { picked.has(f.other.id) ? picked.delete(f.other.id) : picked.add(f.other.id); paint(); } },
        avatar(f.other, 40), h('span', { class: 'invite-name' }, `@${f.other.username}`), h('span', { class: 'invite-check' }, icon('check', { size: 20, stroke: 3 })));
    }));
    empty.hidden = !!friends.length || !!sent.length;
    send.hidden = !picked.size; send.textContent = picked.size > 1 ? `Send ${picked.size} invitations` : 'Send invitation';
  }
  unsub = subscribe(paint);
  paint();
}
