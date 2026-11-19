// Account: photo (with crop), username, About me, notifications, updates, sign out.
import { h, toast, tap } from './util.js';
import { icon } from './icons.js';
import { avatar, toggleSwitch, dangerButton, confirmDialog, segmented } from './ui.js';
import { getTheme, setTheme } from './theme.js';
import { attachHold } from './hold.js';
import { openCropper } from './cropper.js';
import { openUpdates, hasUnseenUpdate } from './updates.js';
import { VERSION } from './version.js';
import { permissionState, isEnabled, enablePush, disablePush, sendTest } from './push.js';
import { state, subscribe, updateProfile, setAvatar, removeAvatar, signOut } from './store.js';
import { overallRate } from './rates.js';

const USERNAME = /^[a-z0-9_]{3,20}$/;
const fail = (e) => toast(e?.message || 'Something went wrong');

export function mountAccount(root) {
  const avHost = h('div', { class: 'avatar-host' });
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onChange: () => { const f = file.files[0]; file.value = ''; if (f) openCropper(f, setAvatar); } });
  const photo = h('button', { type: 'button', class: 'photo-btn', 'aria-label': 'Change photo', onClick: () => (state.demo ? toast('Sign in with Google to add a photo.') : file.click()) }, avHost, h('span', { class: 'photo-edit' }, icon('camera', { size: 30, stroke: 1.8 })));
  attachHold(photo, () => state.demo ? null : [
    { label: 'Change photo', icon: 'camera', onSelect: () => file.click() },
    state.me?.avatar_url ? { label: 'Remove photo', icon: 'photo-off', danger: true, onSelect: async () => { if (await confirmDialog({ title: 'Remove your photo?', message: 'Your initial will be shown instead.', confirm: 'Remove' })) removeAvatar().then(() => toast('Photo removed')).catch(fail); } } : null,
  ]);
  const userInput = h('input', { class: 'pill-input', type: 'text', maxLength: 20, placeholder: 'username', autocapitalize: 'off', autocomplete: 'off', spellcheck: false });
  const aboutInput = h('textarea', { class: 'about-input', maxLength: 160, rows: 3, placeholder: 'A few words about you or your goals…' });
  const counter = h('span', { class: 'counter' });
  const err = h('p', { class: 'field-err', hidden: true });
  const saveBtn = h('button', { type: 'button', class: 'pill primary block', onClick: save }, 'Save');
  const rate = h('p', { class: 'caption' });

  const notifNote = h('p', { class: 'hint tight' });
  const notifSwitch = toggleSwitch(false, async (on, api) => {
    if (state.demo) { toast('Sign in with Google to use notifications.'); return; }
    api.el.disabled = true;
    try { on ? await enablePush() : await disablePush(); api.set(on); toast(on ? 'Notifications are on' : 'Notifications are off'); } catch (e) { fail(e); }
    api.el.disabled = false; paintNotif();
  });
  const testBtn = h('button', { type: 'button', class: 'pill small light', onClick: async () => {
    testBtn.disabled = true;
    try { const n = await sendTest(); toast(n ? 'Sent. It should arrive in a moment' : 'No device is registered yet'); } catch (e) { fail(e); }
    testBtn.disabled = false;
  } }, 'Send a test');
  async function paintNotif() {
    const st = permissionState(), blocked = st === 'unsupported' || st === 'needs-install' || st === 'denied';
    notifSwitch.el.disabled = blocked && !state.demo;
    const on = !blocked && (await isEnabled());
    notifSwitch.set(on); testBtn.hidden = !on;
    notifNote.textContent = state.demo ? 'Sign in with Google to get reminders.'
      : st === 'needs-install' ? 'On iPhone, first add Muna to your Home Screen (Share, then Add to Home Screen) and open it from there.'
      : st === 'unsupported' ? 'This browser does not support notifications.'
      : st === 'denied' ? 'Blocked. Allow notifications for Muna in your browser or phone settings.'
      : on ? 'You get a reminder for habits that have one, if they are not done yet.' : 'Allow notifications, then set a reminder time on any habit.';
  }

  const updDot = h('span', { class: 'upd-dot', hidden: !hasUnseenUpdate() });
  const updates = h('button', { type: 'button', class: 'list-pill', onClick: () => openUpdates(() => { updDot.hidden = true; }) }, h('span', {}, 'Updates'), h('span', { class: 'ver-chip' }, `v${VERSION}`), updDot);
  const out = dangerButton('Sign out', 'You can sign back in with Google any time.', () => signOut(), 'block', 'Sign out');

  root.append(
    h('header', { class: 'top-bar center-only' }, h('span'), h('h2', { class: 'screen-title' }, 'Account'), h('span')),
    h('section', { class: 'profile-head' }, photo, file, rate),
    h('section', { class: 'field-card' }, h('h3', {}, 'Username'), h('div', { class: 'at' }, h('i', {}, '@'), userInput),
      h('div', { class: 'row-between' }, h('h3', {}, 'About me'), counter), aboutInput, err, saveBtn),
    h('section', { class: 'field-card' }, h('h3', {}, 'Appearance'), segmented([['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], getTheme(), (v) => { tap(); setTheme(v); }).el),
    h('section', { class: 'field-card' }, h('div', { class: 'row-between' }, h('h3', {}, 'Notifications'), notifSwitch.el), notifNote, h('div', { class: 'test-row' }, testBtn)),
    updates, out, h('div', { class: 'spacer' }));

  let base = { u: '', a: '' };
  const dirty = () => userInput.value.trim().toLowerCase() !== base.u || aboutInput.value !== base.a;
  function check() {
    const u = userInput.value.trim().toLowerCase();
    const msg = u && !USERNAME.test(u) ? 'Username: 3–20 letters, numbers or underscores.' : '';
    err.hidden = !msg; err.textContent = msg;
    counter.textContent = `${aboutInput.value.length}/160`;
    saveBtn.hidden = !dirty(); saveBtn.disabled = !!msg || !u;
  }
  function paint() {
    const me = state.me; if (!me) return;
    avHost.replaceChildren(avatar(me, 110));
    if (!dirty() && document.activeElement !== userInput && document.activeElement !== aboutInput) { userInput.value = me.username || ''; aboutInput.value = me.about || ''; }
    base = { u: me.username || '', a: me.about || '' };
    const pct = overallRate();
    rate.textContent = pct == null ? 'Your 21-day rate appears once you have habits' : `${pct}% over the last 21 days`;
    check();
  }
  [userInput, aboutInput].forEach((i) => i.addEventListener('input', check));
  async function save() {
    saveBtn.disabled = true;
    try { await updateProfile({ username: userInput.value.trim().toLowerCase(), about: aboutInput.value.trim() }); toast('Saved'); }
    catch (e) { err.hidden = false; err.textContent = e?.code === '23505' ? 'That username is taken.' : e?.message || 'Could not save.'; }
    check();
  }
  subscribe(paint); paint(); paintNotif();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') paintNotif(); });
}
