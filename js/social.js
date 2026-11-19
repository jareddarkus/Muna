// Social: friends and groups in one tab, with predictive search, invitations and featured groups.
import { h, toast, debounce } from './util.js';
import { icon, habitIcon } from './icons.js';
import { PALETTE, COLORS, COLOR_NAMES, hex } from './colors.js';
import { avatar, segmented, openPanel, panelBar, toggleSwitch, confirmDialog } from './ui.js';
import { card, rateRing } from './cards.js';
import { openIconPicker } from './editor.js';
import { openGroup, groupItems } from './group.js';
import { attachHold } from './hold.js';
import { openProfile, personItems } from './profile.js';
import {
  state, subscribe, myGroups, friendsOf, incomingRequests, outgoingRequests, profileOf, searchGroups, recommendedGroups, searchUsers,
  acceptFriend, removeFriendship, respondInvite, respondRequest, createGroup, joinGroup, requestJoin, addFriendById, memberRate, friendshipWith, refreshSocialNow,
} from './store.js';

const fail = (e) => toast(e?.code === '23505' ? 'That name is already taken.' : e?.message || 'Something went wrong');

export function mountSocial(root) {
  let tab = 'friends';
  const add = h('button', { type: 'button', class: 'circle-btn gray', 'aria-label': 'New', onClick: () => (tab === 'groups' ? openCreateGroup() : search.focus()) }, icon('plus', { size: 34.5, stroke: 2.09 }));
  const seg = segmented([['friends', 'Friends'], ['groups', 'Groups']], tab, (v) => { tab = v; search.value = ''; results = null; render(); });
  const search = h('input', { class: 'pill-input search', type: 'search', placeholder: 'Search', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, enterKeyHint: 'search',
    onInput: debounce(async () => { await runSearch(); }, 220) });
  const searchWrap = h('div', { class: 'search-wrap' }, icon('search', { size: 30, stroke: 1.8 }), search);
  const notifs = h('section', { class: 'notifs' });
  const body = h('div', { class: 'cards' });
  root.append(h('header', { class: 'top-bar center-only' }, h('span'), h('h2', { class: 'screen-title' }, 'Social'), add), h('div', { class: 'seg-wrap' }, seg.el), searchWrap, notifs, body);

  let results = null, featured = [], recommended = [], loadedGroups = false;
  const rateCache = new Map();

  async function runSearch() {
    const q = search.value.trim();
    if (!q) { results = null; render(); return; }
    try { results = tab === 'friends' ? await searchUsers(q) : await searchGroups(q); } catch (e) { results = []; if (state.demo) toast(e.message); }
    render();
  }
  async function loadGroupExtras() {
    if (state.demo) return;
    try {
      const [f, r] = await Promise.all([searchGroups(''), recommendedGroups()]);
      const mine = new Set(myGroups().map((g) => g.id));
      featured = f.filter((g) => !mine.has(g.id)); recommended = r.filter((g) => !mine.has(g.id) && !featured.some((x) => x.id === g.id));
      loadedGroups = true; render();
    } catch (e) { console.error(e); }
  }

  // ── building blocks ──
  const miniBtn = (cls, ic, label, fn) => h('button', { type: 'button', class: `mini-btn ${cls}`, 'aria-label': label, onClick: (e) => { e.stopPropagation(); fn(); } }, icon(ic, { size: 30, stroke: 2.2, filled: false }));
  function personCard(p, { sub, right, onClick }) {
    const c = card({ onClick: onClick || (() => openProfile(p.id)) });
    c.set({ color: hex('purple'), icon: null, name: `@${p.username}`, sub: sub ?? (p.about || 'No About me yet'), done: false, showFlag: false });
    c.circle.replaceChildren(avatar(p, 60)); c.el.classList.add('person');
    if (right) c.slot.append(right);
    if (!onClick) attachHold(c.el, () => personItems(p.id));
    return c.el;
  }
  function rateFor(uid) {
    const rr = rateRing(); rr.set(null);
    if (rateCache.has(uid)) rr.set(rateCache.get(uid));
    else memberRate(uid).then((pct) => { rateCache.set(uid, pct); rr.set(pct); }).catch(() => {});
    return rr.el;
  }
  function groupCard(g, { pct, count, status } = {}) {
    const c = card({ onClick: () => openGroup(g.id) });
    const members = count ?? state.groupRates.get(g.id)?.member_count;
    const rate = pct !== undefined ? pct : state.groupRates.get(g.id)?.pct;
    c.set({ color: hex(g.color), icon: g.icon, name: g.name, sub: `${members ?? '–'} member${members === 1 ? '' : 's'} • ${g.is_public ? 'Public' : 'Private'}`, done: false, showFlag: false });
    const rr = rateRing(); rr.set(rate ?? null); c.slot.append(rr.el);
    if (status === 'invited') c.el.classList.add('invited');
    attachHold(c.el, () => groupItems(state.groups.get(g.id) || g));
    return c.el;
  }
  const section = (title, els) => (els.length ? [h('h3', { class: 'list-title' }, title), ...els] : []);

  // ── notifications: invitations and friend requests ──
  function renderNotifs() {
    const rows = [];
    for (const inv of state.invites) {
      const g = state.groups.get(inv.group_id); if (!g) continue;
      const from = profileOf(inv.inviter_id);
      const c = card({ onClick: () => openGroup(g.id) });
      c.set({ color: hex(g.color), icon: g.icon, name: g.name, sub: `@${from.username} invited you`, done: false, showFlag: false });
      c.slot.append(h('span', { class: 'mini-actions' }, miniBtn('yes', 'check', 'Accept', () => respondInvite(inv.id, true).then(() => toast('Joined')).catch(fail)), miniBtn('no', 'x', 'Decline', () => respondInvite(inv.id, false).catch(fail))));
      rows.push(c.el);
    }
    for (const f of incomingRequests()) {
      rows.push(personCard(f.other, { sub: 'wants to be friends', right: h('span', { class: 'mini-actions' }, miniBtn('yes', 'check', 'Accept', () => acceptFriend(f.id).then(() => toast('You are now friends')).catch(fail)), miniBtn('no', 'x', 'Decline', () => removeFriendship(f.id).catch(fail))) }));
    }
    for (const r of state.requests) {
      const g = state.groups.get(r.group_id); if (!g) continue;
      const p = profileOf(r.user_id);
      rows.push(personCard(p, { sub: `asks to join ${g.name}`, right: h('span', { class: 'mini-actions' }, miniBtn('yes', 'check', 'Accept', () => respondRequest(g.id, r.user_id, true).catch(fail)), miniBtn('no', 'x', 'Decline', () => respondRequest(g.id, r.user_id, false).catch(fail))) }));
    }
    notifs.replaceChildren(...(rows.length ? [h('h3', { class: 'list-title' }, 'Notifications'), h('div', { class: 'cards' }, rows)] : []));
  }

  function render() {
    renderNotifs();
    const q = search.value.trim();
    const out = [];
    if (q && results) {
      if (tab === 'friends') {
        out.push(...section('People', results.map((p) => {
          const fr = friendshipWith(p.id);
          const right = !fr ? miniBtn('add', 'user-plus', 'Add friend', () => addFriendById(p.id).then(() => { toast('Request sent'); render(); }).catch(fail))
            : h('span', { class: 'status-tag' }, fr.status === 'accepted' ? 'Friends' : 'Pending');
          return personCard(p, { right });
        })));
      } else out.push(...section('Groups', results.map((g) => groupCard(g, { pct: g.pct, count: g.member_count, status: g.status }))));
      if (!results.length) out.push(h('p', { class: 'empty-text' }, 'No results'));
    } else if (tab === 'friends') {
      const fr = friendsOf();
      out.push(...section('Friends', fr.map((f) => personCard(f.other, { right: rateFor(f.other.id) }))));
      const sent = outgoingRequests();
      out.push(...section('Sent', sent.map((f) => personCard(f.other, { sub: 'Request sent', right: miniBtn('no', 'x', 'Cancel request', async () => { if (await confirmDialog({ title: 'Cancel your request?', message: `Your friend request to @${f.other.username} will be withdrawn.`, confirm: 'Cancel request', cancel: 'Keep it' })) removeFriendship(f.id).catch(fail); }) }))));
      if (!fr.length && !sent.length) out.push(h('p', { class: 'empty-text' }, 'Search a username to add friends'));
    } else {
      const mine = myGroups();
      out.push(...section('My groups', mine.map((g) => groupCard(g))));
      out.push(...section('Featured', featured.map((g) => groupCard(g, { pct: g.pct, count: g.member_count, status: g.status }))));
      out.push(...section('Recommended for you', recommended.map((g) => groupCard(g, { pct: g.pct, count: g.member_count, status: g.status }))));
      if (!mine.length && !featured.length && !recommended.length) out.push(h('p', { class: 'empty-text' }, loadedGroups ? 'No groups yet. Create the first one!' : 'No groups yet'));
    }
    body.replaceChildren(...out);
  }

  subscribe(() => { render(); });
  render();
  return { show() { if (state.demo) return; refreshSocialNow().catch(() => {}); loadGroupExtras(); } };
}

// ───────────── create a group ─────────────
export function openCreateGroup() {
  if (state.demo) { toast('Sign in with Google to create groups.'); return; }
  const draft = { name: '', description: '', icon: 'outline:users', color: 'purple', is_public: true };
  const panel = openPanel({ cls: 'editor', tapClose: true });
  const paint = () => panel.el.style.setProperty('--c', hex(draft.color));
  paint();
  const circle = h('button', { type: 'button', class: 'name-circle', 'aria-label': 'Choose icon', onClick: () => openIconPicker(draft, (ref) => { draft.icon = ref; paintIcon(); }) });
  const paintIcon = () => circle.replaceChildren(habitIcon(draft.icon, 26, 1.7));
  const name = h('input', { class: 'name-input', type: 'text', maxLength: 40, placeholder: 'Group name', autocomplete: 'off', onInput: (e) => { draft.name = e.target.value; validate(); } });
  const desc = h('textarea', { class: 'about-input', maxLength: 200, rows: 3, placeholder: 'What is this group about?', onInput: (e) => { draft.description = e.target.value; } });
  const swatches = h('div', { class: 'swatches' }, COLORS.map((k) => h('button', { type: 'button', class: `swatch ${k === draft.color ? 'on' : ''}`, 'data-k': k, 'aria-label': COLOR_NAMES[k], style: { background: PALETTE[k] },
    onClick: () => { draft.color = k; paint(); swatches.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on', b.dataset.k === k)); } })));
  const privacyNote = h('p', { class: 'hint' });
  const sw = toggleSwitch(true, (on, api) => { api.set(on); draft.is_public = on; paintPrivacy(); });
  const paintPrivacy = () => { privacyNote.textContent = draft.is_public ? 'Anyone can find and join this group.' : 'People find it by name but need your approval or an invitation to join.'; };
  const create = h('button', { type: 'button', class: 'pill primary block', onClick: async () => {
    create.disabled = true;
    try { const g = await createGroup(draft); panel.close(); setTimeout(() => openGroup(g.id), 200); } catch (e) { fail(e); create.disabled = false; }
  } }, 'Create group');
  const validate = () => { create.disabled = draft.name.trim().length < 2; };
  panel.el.append(panelBar(panel, { title: 'New group' }), h('div', { class: 'panel-body' },
    h('div', { class: 'name-pill' }, circle, name),
    h('section', { class: 'field-card' }, h('h3', {}, 'Color'), swatches),
    h('section', { class: 'field-card' }, h('h3', {}, 'Description'), desc),
    h('section', { class: 'field-card' }, h('div', { class: 'row-between' }, h('h3', {}, 'Public'), sw.el), privacyNote),
    create, h('div', { class: 'spacer' })));
  paintIcon(); paintPrivacy(); validate();
  setTimeout(() => name.focus({ preventScroll: true }), 400);
}
