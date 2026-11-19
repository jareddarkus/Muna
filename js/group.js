// A group: description, members with their overall rate, the feed (posts, likes, comments), and admin tools.
import { h, toast, debounce, timeAgo, goalLabel } from './util.js';
import { icon, habitIcon } from './icons.js';
import { PALETTE, COLORS, COLOR_NAMES, hex, rateColor } from './colors.js';
import { avatar, segmented, openPanel, panelBar, dangerButton, toggleSwitch, iconCircle, closeAllPanels, confirmDialog } from './ui.js';
import { card, rateRing, habitSub, flag } from './cards.js';
import { openIconPicker } from './editor.js';
import { openProfile } from './profile.js';
import {
  state, subscribe, bus, isMember, isAdmin, membersOf, profileOf, loadGroup, groupOverview, joinGroup, requestJoin, leaveGroup, deleteGroup, updateGroup,
  respondRequest, respondInvite, inviteUser, searchUsers, listPosts, createPost, deletePost, togglePostLike, listComments, addComment, deleteComment, toggleCommentLike,
  copyHabit, habitList, refreshSocialNow,
} from './store.js';

const fail = (e) => toast(e?.code === '23505' ? 'That name is already taken.' : e?.message || 'Something went wrong');

export function openGroup(gid) {
  let unsub = () => {}, unbus = () => {};
  const panel = openPanel({ cls: 'group', onClose: () => { unsub(); unbus(); } });
  const manage = h('button', { type: 'button', class: 'pill small', onClick: () => openGroupAdmin(gid) }, 'Manage');
  const head = h('section', { class: 'group-head' });
  const actions = h('div', { class: 'profile-actions' });
  const tabsHost = h('div', { class: 'seg-wrap' });
  const content = h('div', { class: 'group-content' });
  const bar = panelBar(panel, { right: manage });
  panel.el.append(bar, h('div', { class: 'panel-body' }, head, actions, tabsHost, content, h('div', { class: 'spacer' })));
  manage.hidden = true;

  let tab = 'feed', overview = [], posts = [], composerHabit = null;
  const tabs = segmented([['feed', 'Feed'], ['members', 'Members']], tab, (v) => { tab = v; paintContent(); });

  async function loadAll() {
    await loadGroup(gid).catch(() => {});
    if (isMember(gid)) {
      [overview, posts] = await Promise.all([groupOverview(gid).catch(() => []), listPosts(gid).catch(() => [])]);
    }
    paint(); paintContent();
  }

  function paint() {
    const g = state.groups.get(gid);
    if (!g) { head.replaceChildren(h('p', { class: 'empty-text' }, 'Loading…')); return; }
    panel.el.style.setProperty('--c', hex(g.color));
    const member = isMember(gid), admin = isAdmin(gid);
    manage.hidden = !admin;
    const rate = state.groupRates.get(gid);
    const invited = state.invites.find((i) => i.group_id === gid);
    const requested = state.requests.some((r) => r.group_id === gid && r.user_id === state.me.id);
    head.replaceChildren(iconCircle(g.icon, hex(g.color), 100, 56), h('h2', { class: 'person-name' }, g.name),
      g.description ? h('p', { class: 'about' }, g.description) : null,
      h('p', { class: 'meta' }, `${rate?.member_count ?? membersOf(gid).length} members • ${g.is_public ? 'Public' : 'Private'}`));
    if (member && rate) { const rr = rateRing(); rr.set(rate.pct); head.append(h('div', { class: 'rate-line' }, rr.el, h('span', {}, 'group average, last 21 days'))); }

    actions.replaceChildren();
    if (!member) {
      if (invited) actions.append(h('button', { type: 'button', class: 'pill primary', onClick: () => respondInvite(invited.id, true).then(loadAll).catch(fail) }, 'Accept invitation'), h('button', { type: 'button', class: 'pill light', onClick: () => respondInvite(invited.id, false).then(() => panel.close()).catch(fail) }, 'Decline'));
      else if (g.is_public) actions.append(h('button', { type: 'button', class: 'pill primary', onClick: () => joinGroup(gid).then(loadAll).catch(fail) }, 'Join group'));
      else if (requested) actions.append(h('span', { class: 'pill light static' }, 'Request sent, waiting for an admin'));
      else actions.append(h('button', { type: 'button', class: 'pill primary', onClick: () => requestJoin(gid).then(() => { toast('Request sent'); paint(); }).catch(fail) }, 'Request to join'));
    }
    tabsHost.replaceChildren(...(member ? [tabs.el] : []));
    if (!member) content.replaceChildren(h('p', { class: 'hint center' }, g.is_public ? 'Join to see posts and members.' : 'This group is private. Ask to join to see what is inside.'));
  }

  function paintContent() {
    if (!isMember(gid)) return;
    if (tab === 'members') {
      const rows = overview.map((m) => {
        const p = profileOf(m.user_id);
        const c = card({ onClick: () => openProfile(m.user_id, { groupId: gid }) });
        c.set({ color: hex('purple'), icon: null, name: `@${p.username}${m.user_id === state.me.id ? ' (you)' : ''}`, sub: m.role === 'admin' ? 'Admin' : 'Member', done: false, showFlag: false });
        c.circle.replaceChildren(avatar(p, 60)); c.el.classList.add('person');
        const rr = rateRing(); rr.set(m.pct); c.slot.append(rr.el);
        return c.el;
      });
      content.replaceChildren(h('div', { class: 'cards' }, rows), h('div', { class: 'leave' }, dangerButton('Leave group', 'You will stop seeing its posts and members. You can join again later if it is public.', async () => { await leaveGroup(gid).catch(fail); panel.close(); }, 'block', 'Leave')));
      return;
    }
    // feed
    const input = h('textarea', { class: 'about-input', maxLength: 500, rows: 3, placeholder: 'Share something with the group…' });
    const chip = h('div', { class: 'attach' });
    const post = h('button', { type: 'button', class: 'pill primary small', onClick: async () => {
      const body = input.value.trim();
      if (!body && !composerHabit) return;
      post.disabled = true;
      try { await createPost(gid, body, composerHabit); input.value = ''; composerHabit = null; paintChip(); posts = await listPosts(gid); paintContent(); } catch (e) { fail(e); }
      post.disabled = false;
    } }, 'Post');
    const attach = h('button', { type: 'button', class: 'pill small light', onClick: () => pickHabit((hb) => { composerHabit = hb; paintChip(); }) }, icon('plus', { size: 24, stroke: 2 }), 'Share a habit');
    function paintChip() {
      chip.replaceChildren(...(composerHabit ? [h('span', { class: 'attach-chip' }, habitIcon(composerHabit.icon, 22, 1.8), composerHabit.title, h('button', { type: 'button', 'aria-label': 'Remove', onClick: () => { composerHabit = null; paintChip(); } }, icon('x', { size: 22, stroke: 2 })))] : []));
    }
    paintChip();
    content.replaceChildren(h('section', { class: 'field-card composer' }, input, chip, h('div', { class: 'row-between' }, attach, post)),
      ...(posts.length ? posts.map(postCard) : [h('p', { class: 'empty-text' }, 'No posts yet. Say hello!')]));
  }

  function postCard(p) {
    const author = profileOf(p.author_id);
    const liked = p.likes.includes(state.me.id);
    const likeBtn = h('button', { type: 'button', class: `act ${liked ? 'on' : ''}`, 'aria-label': 'Like', onClick: async () => {
      const next = !p.likes.includes(state.me.id);
      p.likes = next ? [...p.likes, state.me.id] : p.likes.filter((x) => x !== state.me.id);
      paintContent();
      try { await togglePostLike(p.id, next); } catch (e) { fail(e); posts = await listPosts(gid); paintContent(); }
    } }, icon('heart', { size: 30, stroke: 1.8, filled: liked }), String(p.likes.length || ''));
    const comment = h('button', { type: 'button', class: 'act', 'aria-label': 'Comments', onClick: () => openComments(p, gid) }, icon('message-circle', { size: 30, stroke: 1.8 }), String(p.comment_count || ''));
    const canDelete = p.author_id === state.me.id || isAdmin(gid);
    return h('article', { class: 'post' },
      h('header', {}, h('button', { type: 'button', class: 'post-author', onClick: () => openProfile(p.author_id, { groupId: gid }) }, avatar(author, 44), h('span', {}, h('b', {}, `@${author.username}`), h('i', {}, timeAgo(p.created_at)))),
        canDelete ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Delete post', onClick: async () => { if (!(await confirmDialog({ title: 'Delete this post?', message: 'Its comments and likes will be removed too.' }))) return; try { await deletePost(p.id); posts = posts.filter((x) => x.id !== p.id); paintContent(); } catch (e) { fail(e); } } }, icon('trash', { size: 28, stroke: 1.8 })) : null),
      p.body ? h('p', { class: 'post-body' }, p.body) : null,
      p.habit ? habitAttachment(p) : null,
      h('footer', {}, likeBtn, comment));
  }
  function habitAttachment(p) {
    const hb = p.habit, rr = rateRing(); rr.set(p.pct);
    const copy = h('button', { type: 'button', class: 'pill small light', onClick: async (e) => {
      e.currentTarget.disabled = true;
      try { await copyHabit(hb); toast('Added to your habits'); } catch (er) { fail(er); }
      e.currentTarget.disabled = false;
    } }, 'Copy');
    return h('div', { class: 'shared-habit', style: { '--c': hex(hb.color) } }, iconCircle(hb.icon, hex(hb.color), 48, 28),
      h('span', { class: 'sh-text' }, h('b', {}, hb.title), h('i', {}, habitSub(hb))), h('span', { class: 'sh-right' }, rr.el, copy));
  }
  function pickHabit(done) {
    const pick = openPanel({ cls: 'picker-habit' });
    const list = h('div', { class: 'cards' }, habitList().map((hb) => { const c = card({ onClick: () => { done(hb); pick.close(); } }); c.set({ color: hex(hb.color), icon: hb.icon, name: hb.title, sub: habitSub(hb), done: false }); return c.el; }));
    pick.el.append(panelBar(pick, { title: 'Share a habit' }), h('div', { class: 'panel-body' }, h('p', { class: 'hint center' }, 'Members see its 21-day completion and can copy it. Your reports stay private.'), list.children.length ? list : h('p', { class: 'empty-text' }, 'No habits yet')));
  }

  unsub = subscribe(() => { paint(); if (isMember(gid)) { const o = membersOf(gid); if (o.length !== overview.length) groupOverview(gid).then((r) => { overview = r; paintContent(); }).catch(() => {}); } });
  unbus = bus.on('posts', async () => { if (isMember(gid)) { posts = await listPosts(gid).catch(() => posts); if (tab === 'feed' && !document.activeElement?.matches?.('textarea')) paintContent(); } });
  paint();
  loadAll();
}

// ───────────── comments ─────────────
function openComments(post, gid) {
  let unbus = () => {};
  const panel = openPanel({ cls: 'comments', onClose: () => unbus() });
  const list = h('div', { class: 'comment-list' });
  let replyTo = null, data = { comments: [], likes: [] };
  const replyChip = h('div', { class: 'reply-chip', hidden: true });
  const input = h('input', { class: 'pill-input', type: 'text', maxLength: 300, placeholder: 'Add a comment…', enterKeyHint: 'send', onKeydown: (e) => e.key === 'Enter' && send() });
  const sendBtn = h('button', { type: 'button', class: 'circle-btn primary', 'aria-label': 'Send', onClick: send }, icon('send', { size: 30, stroke: 1.8 }));
  panel.el.append(panelBar(panel, { title: 'Comments' }), h('div', { class: 'panel-body' }, list), h('div', { class: 'comment-bar' }, replyChip, h('div', { class: 'comment-input' }, input, sendBtn)));

  async function load() { data = await listComments(post.id).catch(() => data); paint(); }
  async function send() {
    const body = input.value.trim(); if (!body) return;
    sendBtn.disabled = true;
    const mention = replyTo?.parent_id ? `@${profileOf(replyTo.author_id).username} ` : ''; // replying to a reply keeps the thread and tags them
    try { await addComment(post.id, mention + body, replyTo ? replyTo.parent_id || replyTo.id : null); input.value = ''; setReply(null); post.comment_count = (post.comment_count || 0) + 1; await load(); } catch (e) { fail(e); }
    sendBtn.disabled = false;
  }
  function setReply(c) {
    replyTo = c;
    replyChip.hidden = !c;
    replyChip.replaceChildren(...(c ? [`Replying to @${profileOf(c.author_id).username}`, h('button', { type: 'button', 'aria-label': 'Cancel', onClick: () => setReply(null) }, icon('x', { size: 22, stroke: 2 }))] : []));
    if (c) input.focus();
  }
  function item(c, reply) {
    const author = profileOf(c.author_id);
    const likes = data.likes.filter((l) => l.comment_id === c.id).map((l) => l.user_id);
    const liked = likes.includes(state.me.id);
    const like = h('button', { type: 'button', class: `act small ${liked ? 'on' : ''}`, 'aria-label': 'Like', onClick: async () => {
      const next = !liked;
      data.likes = next ? [...data.likes, { comment_id: c.id, user_id: state.me.id }] : data.likes.filter((l) => !(l.comment_id === c.id && l.user_id === state.me.id));
      paint();
      try { await toggleCommentLike(c.id, next); } catch (e) { fail(e); load(); }
    } }, icon('heart', { size: 26, stroke: 1.8, filled: liked }), String(likes.length || ''));
    const canDelete = c.author_id === state.me.id || isAdmin(gid);
    return h('div', { class: `comment ${reply ? 'reply' : ''}` }, avatar(author, reply ? 32 : 40),
      h('div', { class: 'comment-main' }, h('p', {}, h('b', {}, `@${author.username}`), ' ', c.body),
        h('div', { class: 'comment-meta' }, h('i', {}, timeAgo(c.created_at)), h('button', { type: 'button', onClick: () => setReply(c) }, 'Reply'),
          canDelete ? h('button', { type: 'button', onClick: async () => { if (!(await confirmDialog({ title: 'Delete this comment?', message: reply ? '' : 'Replies to it will be removed too.' }))) return; try { await deleteComment(c.id); post.comment_count = Math.max(0, (post.comment_count || 1) - 1); await load(); } catch (e) { fail(e); } } }, 'Delete') : null)), like);
  }
  function paint() {
    const top = data.comments.filter((c) => !c.parent_id);
    list.replaceChildren(...(top.length ? top.flatMap((c) => [item(c, false), ...data.comments.filter((r) => r.parent_id === c.id).map((r) => item(r, true))]) : [h('p', { class: 'empty-text' }, 'No comments yet')]));
  }
  unbus = bus.on('posts', load);
  load();
}

// ───────────── admin tools ─────────────
function openGroupAdmin(gid) {
  let unsub = () => {};
  const panel = openPanel({ cls: 'editor', onClose: () => unsub() });
  const g = state.groups.get(gid);
  const draft = { name: g.name, description: g.description, icon: g.icon, color: g.color, is_public: g.is_public };
  const paint = () => panel.el.style.setProperty('--c', hex(draft.color));
  paint();
  const circle = h('button', { type: 'button', class: 'name-circle', 'aria-label': 'Choose icon', onClick: () => openIconPicker(draft, (ref) => { draft.icon = ref; paintIcon(); }) });
  const paintIcon = () => circle.replaceChildren(habitIcon(draft.icon, 26, 1.7));
  const name = h('input', { class: 'name-input', type: 'text', maxLength: 40, value: draft.name, onInput: (e) => { draft.name = e.target.value; } });
  const desc = h('textarea', { class: 'about-input', maxLength: 200, rows: 3, value: draft.description, onInput: (e) => { draft.description = e.target.value; } });
  desc.value = draft.description;
  const swatches = h('div', { class: 'swatches' }, COLORS.map((k) => h('button', { type: 'button', class: `swatch ${k === draft.color ? 'on' : ''}`, 'data-k': k, 'aria-label': COLOR_NAMES[k], style: { background: PALETTE[k] },
    onClick: () => { draft.color = k; paint(); swatches.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on', b.dataset.k === k)); } })));
  const sw = toggleSwitch(draft.is_public, (on, api) => { api.set(on); draft.is_public = on; });
  const save = h('button', { type: 'button', class: 'pill primary block', onClick: async () => {
    save.disabled = true;
    try { await updateGroup(gid, { name: draft.name.trim(), description: draft.description.trim(), icon: draft.icon, color: draft.color, is_public: draft.is_public }); toast('Saved'); } catch (e) { fail(e); }
    save.disabled = false;
  } }, 'Save changes');

  // invite people by username (predictive)
  const invInput = h('input', { class: 'pill-input', type: 'search', placeholder: 'Invite by username', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, onInput: debounce(async () => {
    const q = invInput.value.trim();
    if (!q) { invList.replaceChildren(); return; }
    const rows = (await searchUsers(q).catch(() => [])).filter((p) => !membersOf(gid).some((m) => m.user_id === p.id));
    invList.replaceChildren(...rows.map((p) => {
      const c = card({ onClick: () => openProfile(p.id) });
      c.set({ color: hex('purple'), icon: null, name: `@${p.username}`, sub: p.about || 'No About me yet', done: false, showFlag: false });
      c.circle.replaceChildren(avatar(p, 60)); c.el.classList.add('person');
      c.slot.append(h('button', { type: 'button', class: 'pill small', onClick: (e) => { e.stopPropagation(); inviteUser(gid, p.id).then(() => { toast(`Invited @${p.username}`); invInput.value = ''; invList.replaceChildren(); }).catch(fail); } }, 'Invite'));
      return c.el;
    }));
  }, 220) });
  const invList = h('div', { class: 'cards' });
  const reqList = h('div', { class: 'cards' });
  const reqTitle = h('h3', { class: 'list-title' }, 'Join requests');
  function paintReqs() {
    const rs = state.requests.filter((r) => r.group_id === gid);
    reqTitle.hidden = reqList.hidden = !rs.length;
    reqList.replaceChildren(...rs.map((r) => {
      const p = profileOf(r.user_id);
      const c = card({ onClick: () => openProfile(r.user_id) });
      c.set({ color: hex('purple'), icon: null, name: `@${p.username}`, sub: 'wants to join', done: false, showFlag: false });
      c.circle.replaceChildren(avatar(p, 60)); c.el.classList.add('person');
      c.slot.append(h('span', { class: 'mini-actions' },
        h('button', { type: 'button', class: 'mini-btn yes', 'aria-label': 'Accept', onClick: (e) => { e.stopPropagation(); respondRequest(gid, r.user_id, true).catch(fail); } }, icon('check', { size: 30, stroke: 2.2 })),
        h('button', { type: 'button', class: 'mini-btn no', 'aria-label': 'Decline', onClick: (e) => { e.stopPropagation(); respondRequest(gid, r.user_id, false).catch(fail); } }, icon('x', { size: 30, stroke: 2.2 }))));
      return c.el;
    }));
  }
  unsub = subscribe(paintReqs);
  const del = dangerButton('Delete group', 'The group, all its posts and comments are removed for everyone. It cannot be undone.', async () => { await deleteGroup(gid).catch(fail); closeAllPanels(); }, 'block');

  panel.el.append(panelBar(panel, { title: 'Manage group' }), h('div', { class: 'panel-body' },
    h('div', { class: 'name-pill' }, circle, name),
    h('section', { class: 'field-card' }, h('h3', {}, 'Color'), swatches),
    h('section', { class: 'field-card' }, h('h3', {}, 'Description'), desc),
    h('section', { class: 'field-card' }, h('div', { class: 'row-between' }, h('h3', {}, 'Public'), sw.el), h('p', { class: 'hint' }, 'Private groups need an invitation or an admin approving a request.')),
    save, reqTitle, reqList,
    h('h3', { class: 'list-title' }, 'Invite'), invInput, invList, del, h('div', { class: 'spacer' })));
  paintIcon(); paintReqs();
}
