import { h, toast, debounce } from './util.js';
import { icon } from './icons.js';
import { avatar, openSheet, sheetHeader, closeButton, backButton, dangerButton } from './ui.js';
import { compressAvatar } from './image.js';
import {
  state, subscribe, updateProfile, setAvatar, signOut, friendsOf, incomingRequests, outgoingRequests, addFriendByUsername, acceptFriend,
  removeFriendship, myGroups, membersOf, profileOf, createGroup, joinGroup, addMember, removeMember, leaveGroup, deleteGroup, renameGroup, habitList,
} from './store.js';

const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter(Boolean));
const fail = (e) => toast(e?.message || 'Something went wrong');
const USERNAME = /^[a-z0-9_]{3,20}$/;

export function mountSettings(root) {
  const avHost = h('div', { class: 'avatar-host' });
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onChange: onPhoto });
  const camera = h('button', { type: 'button', class: 'avatar-btn', 'aria-label': 'Change photo', onClick: () => file.click() }, avHost, h('span', { class: 'cam' }, icon('camera', { size: 16 })));
  const nameInput = h('input', { class: 'field-input', type: 'text', maxLength: 40, placeholder: 'Your name', autocomplete: 'off' });
  const userInput = h('input', { class: 'field-input', type: 'text', maxLength: 20, placeholder: 'username', autocapitalize: 'off', autocomplete: 'off', spellcheck: false });
  const err = h('p', { class: 'field-err', hidden: true });
  const saveBtn = h('button', { type: 'button', class: 'btn primary block', onClick: saveProfile }, 'Save');
  const friendsBadge = h('span', { class: 'badge', hidden: true });
  const demoBanner = h('div', { class: 'banner', hidden: true }, h('p', {}, 'You’re previewing Muna on this device only. Sign in with Google to sync everywhere and share habits.'),
    h('button', { type: 'button', class: 'btn primary', onClick: () => signOut() }, 'Sign in'));
  const friendsRow = row('users', 'Friends', () => (state.demo ? toast('Sign in with Google to add friends.') : openFriends()), friendsBadge);
  const groupsRow = row('user-plus', 'Groups', () => (state.demo ? toast('Sign in with Google to create groups.') : openGroups()));
  const out = dangerButton('Sign out', 'Tap again to sign out', () => signOut(), 'block');

  function row(ic, label, fn, extra) {
    return h('button', { type: 'button', class: 'list-row', onClick: fn }, h('span', { class: 'lr-ic' }, icon(ic, { size: 20 })), h('span', { class: 'lr-label' }, label), extra, icon('chevron-right', { size: 20 }));
  }

  root.append(h('header', { class: 'top' }, h('div', {}, h('h1', {}, 'Settings'), h('p', { class: 'date' }, 'Profile & friends'))),
    demoBanner,
    h('section', { class: 'card profile-card' }, camera, file, h('p', { class: 'hint center' }, 'Tap to change your photo')),
    h('section', { class: 'card fields' },
      h('label', { class: 'field' }, h('span', {}, 'Name'), nameInput),
      h('label', { class: 'field' }, h('span', {}, 'Username'), h('div', { class: 'at' }, h('i', {}, '@'), userInput)), err, saveBtn),
    h('section', { class: 'card rows' }, friendsRow, groupsRow),
    h('div', { class: 'foot-actions' }, out),
    h('p', { class: 'colophon' }, 'Muna · icons by Tabler'));

  let dirtyName = '', dirtyUser = '';
  function paint() {
    const me = state.me; if (!me) return;
    avHost.replaceChildren(avatar(me, 108));
    const editing = isDirty() || document.activeElement === nameInput || document.activeElement === userInput;
    if (!editing) { nameInput.value = me.display_name || ''; userInput.value = me.username || ''; }
    dirtyName = me.display_name || ''; dirtyUser = me.username || '';
    demoBanner.hidden = !state.demo;
    const n = state.demo ? 0 : incomingRequests().length;
    friendsBadge.hidden = !n; friendsBadge.textContent = n;
    check();
  }
  const isDirty = () => nameInput.value.trim() !== dirtyName || userInput.value.trim().toLowerCase() !== dirtyUser;
  function check() {
    const u = userInput.value.trim().toLowerCase();
    let msg = '';
    if (u && !USERNAME.test(u)) msg = 'Username: 3–20 letters, numbers or underscores.';
    err.hidden = !msg; err.textContent = msg;
    saveBtn.hidden = !isDirty(); saveBtn.disabled = !!msg || !u;
  }
  [nameInput, userInput].forEach((i) => i.addEventListener('input', check));
  async function saveProfile() {
    const u = userInput.value.trim().toLowerCase();
    saveBtn.disabled = true;
    try { await updateProfile({ display_name: nameInput.value.trim(), username: u }); dirtyName = nameInput.value.trim(); dirtyUser = u; toast('Saved'); }
    catch (e) { err.hidden = false; err.textContent = e?.code === '23505' ? 'That username is taken.' : e?.message || 'Could not save.'; }
    check();
  }
  async function onPhoto() {
    const f = file.files[0]; file.value = '';
    if (!f) return;
    camera.classList.add('busy');
    try { await setAvatar(await compressAvatar(f)); } catch (e) { fail(e); }
    camera.classList.remove('busy');
  }
  subscribe(paint); paint();
}

// ───────────── friends ─────────────
function openFriends() {
  let unsub = () => {};
  const sheet = openSheet({ cls: 'tall', onClose: () => unsub() });
  const input = h('input', { class: 'field-input', type: 'text', placeholder: 'Friend’s username', autocapitalize: 'off', autocomplete: 'off', spellcheck: false, enterKeyHint: 'send', onKeydown: (e) => e.key === 'Enter' && add() });
  const addBtn = h('button', { type: 'button', class: 'btn primary', onClick: add }, 'Add');
  async function add() {
    addBtn.disabled = true;
    try { toast(await addFriendByUsername(input.value)); input.value = ''; } catch (e) { fail(e); }
    addBtn.disabled = false;
  }
  const body = h('div', { class: 'sheet-scroll' });
  sheet.el.append(sheetHeader({ title: 'Friends', left: backButton(sheet), right: closeButton(sheet) }), body);

  const person = (p, ...actions) => h('div', { class: 'person' }, avatar(p, 44), h('div', { class: 'person-main' }, h('b', {}, p.display_name || p.username), h('span', {}, `@${p.username}`)), h('div', { class: 'person-actions' }, actions));
  function paint() {
    const inc = incomingRequests(), out = outgoingRequests(), fr = friendsOf();
    fill(body,
      h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'Add a friend'),
        h('div', { class: 'inline-form' }, h('div', { class: 'at grow' }, h('i', {}, '@'), input), addBtn),
        h('p', { class: 'hint' }, `Your username is @${state.me.username}. Share it so friends can find you.`)),
      inc.length ? h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'Requests'), inc.map((f) => person(f.other,
        h('button', { type: 'button', class: 'btn small primary', onClick: () => acceptFriend(f.id).catch(fail) }, 'Accept'),
        h('button', { type: 'button', class: 'circle-btn tiny', 'aria-label': 'Decline', onClick: () => removeFriendship(f.id).catch(fail) }, icon('x', { size: 16 }))))) : null,
      h('section', { class: 'card' }, h('h3', { class: 'card-title' }, `Friends${fr.length ? ` · ${fr.length}` : ''}`),
        fr.length ? fr.map((f) => person(f.other, dangerButton('Remove', 'Sure?', () => removeFriendship(f.id).catch(fail), 'small'))) : h('p', { class: 'hint' }, 'No friends yet.')),
      out.length ? h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'Sent'), out.map((f) => person(f.other, h('button', { type: 'button', class: 'btn small', onClick: () => removeFriendship(f.id).catch(fail) }, 'Cancel')))) : null,
      h('div', { class: 'sheet-spacer' }));
  }
  const keep = (fn) => () => { // don't wipe the input while the user is typing
    const v = input.value, f = document.activeElement === input; fn(); const n = body.querySelector('input'); if (n) { n.value = v; if (f) n.focus(); }
  };
  unsub = subscribe(keep(paint)); paint();
}

// ───────────── groups ─────────────
function openGroups() {
  let unsub = () => {};
  const sheet = openSheet({ cls: 'tall', onClose: () => unsub() });
  const name = h('input', { class: 'field-input', type: 'text', placeholder: 'New group name', maxLength: 40, onKeydown: (e) => e.key === 'Enter' && create() });
  const code = h('input', { class: 'field-input', type: 'text', placeholder: 'Invite code', maxLength: 12, autocapitalize: 'off', autocomplete: 'off', onKeydown: (e) => e.key === 'Enter' && join() });
  async function create() {
    if (!name.value.trim()) return;
    try { const g = await createGroup(name.value); name.value = ''; openGroup(g.id); } catch (e) { fail(e); }
  }
  async function join() {
    if (!code.value.trim()) return;
    try { const id = await joinGroup(code.value); code.value = ''; toast('Joined'); openGroup(id); } catch (e) { fail(/invalid/i.test(e?.message) ? new Error('That code doesn’t match any group.') : e); }
  }
  const body = h('div', { class: 'sheet-scroll' });
  sheet.el.append(sheetHeader({ title: 'Groups', left: backButton(sheet), right: closeButton(sheet) }), body);
  function paint() {
    const gs = myGroups();
    fill(body,
      gs.length ? h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'Your groups'), gs.map((g) => {
        const ms = membersOf(g.id), shared = habitList().filter((x) => x.group_id === g.id).length;
        return h('button', { type: 'button', class: 'person tap', onClick: () => openGroup(g.id) },
          h('span', { class: 'bubble sm group-bubble' }, icon('users', { size: 18 })),
          h('div', { class: 'person-main' }, h('b', {}, g.name), h('span', {}, `${ms.length} member${ms.length === 1 ? '' : 's'} · ${shared} shared habit${shared === 1 ? '' : 's'}`)), icon('chevron-right', { size: 20 }));
      })) : h('section', { class: 'card' }, h('p', { class: 'hint' }, 'Groups let you share habits and see each other’s progress.')),
      h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'Create a group'), h('div', { class: 'inline-form' }, name, h('button', { type: 'button', class: 'btn primary', onClick: create }, 'Create'))),
      h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'Join with a code'), h('div', { class: 'inline-form' }, code, h('button', { type: 'button', class: 'btn primary', onClick: join }, 'Join'))),
      h('div', { class: 'sheet-spacer' }));
  }
  const keep = () => { const vals = [...body.querySelectorAll('input')].map((i) => i.value); const f = [...body.querySelectorAll('input')].indexOf(document.activeElement); paint(); body.querySelectorAll('input').forEach((i, k) => { i.value = vals[k] || ''; if (k === f) i.focus(); }); };
  unsub = subscribe(keep); paint();
}

function openGroup(id) {
  let unsub = () => {};
  const sheet = openSheet({ cls: 'tall', onClose: () => unsub() });
  const body = h('div', { class: 'sheet-scroll' });
  const title = h('span', {});
  sheet.el.append(sheetHeader({ title: 'Group', left: backButton(sheet), right: closeButton(sheet) }), body);
  const renameInput = h('input', { class: 'field-input', type: 'text', maxLength: 40, onChange: (e) => e.target.value.trim() && renameGroup(id, e.target.value).catch(fail) });

  function paint() {
    const g = state.groups.get(id);
    if (!g) { sheet.close(); return; }
    const owner = g.owner_id === state.me.id;
    const ms = membersOf(id);
    const inGroup = new Set(ms.map((m) => m.user_id));
    const invitable = friendsOf().filter((f) => !inGroup.has(f.other.id));
    const focus = document.activeElement === renameInput;
    renameInput.value = renameInput.value && focus ? renameInput.value : g.name;
    renameInput.disabled = !owner;
    fill(body,
      h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'Name'), renameInput),
      h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'Invite code'),
        h('div', { class: 'code-box' }, h('code', {}, g.invite_code), h('button', { type: 'button', class: 'pill-btn', onClick: () => navigator.clipboard?.writeText(g.invite_code).then(() => toast('Code copied'), () => toast(g.invite_code)) }, icon('copy', { size: 16 }), 'Copy')),
        h('p', { class: 'hint' }, 'Anyone with this code can join from Settings → Groups.')),
      invitable.length ? h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'Add a friend'),
        h('div', { class: 'chips' }, invitable.map((f) => h('button', { type: 'button', class: 'chip with-av', onClick: () => addMember(id, f.other.id).then(() => toast(`Added ${f.other.display_name || '@' + f.other.username}`)).catch(fail) }, avatar(f.other, 22), f.other.display_name?.split(' ')[0] || `@${f.other.username}`)))) : null,
      h('section', { class: 'card' }, h('h3', { class: 'card-title' }, `Members · ${ms.length}`), ms.map((m) => {
        const p = profileOf(m.user_id);
        return h('div', { class: 'person' }, avatar(p, 44), h('div', { class: 'person-main' }, h('b', {}, (p.display_name || p.username) + (m.user_id === state.me.id ? ' (you)' : '')), h('span', {}, `@${p.username}${m.role === 'owner' ? ' · owner' : ''}`)),
          owner && m.role !== 'owner' ? h('div', { class: 'person-actions' }, dangerButton('Remove', 'Sure?', () => removeMember(id, m.user_id).catch(fail), 'small')) : null);
      })),
      owner ? dangerButton('Delete group', 'Tap again — this removes shared habits', async () => { await deleteGroup(id); sheet.close(); }, 'block')
        : dangerButton('Leave group', 'Tap again to leave', async () => { await leaveGroup(id); sheet.close(); }, 'block'),
      h('div', { class: 'sheet-spacer' }));
  }
  unsub = subscribe(paint); paint();
}
