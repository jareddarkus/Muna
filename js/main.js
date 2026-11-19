import { h, toast, tap } from './util.js';
import { icon } from './icons.js';
import { VERSION } from './version.js';
import { syncPush } from './push.js';
import { renderGoogleButton } from './google-signin.js';
import { state, subscribe, boot, signInGoogle, signInGoogleToken, googleEnabled, enterDemo, pendingCount } from './store.js';
import './theme.js';
import { mountHome } from './home.js';
import { mountTasks } from './tasks.js';
import { mountReports } from './reports.js';
import { mountSocial } from './social.js';
import { mountAccount } from './account.js';

const app = document.getElementById('app');
const GOOGLE_G = '<svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

// Block pinch zoom (Safari ignores user-scalable=no). Double-tap zoom is disabled in CSS; taps are never swallowed.
['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
// two-finger pinch and text selection are off (except while typing in a field)
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });
document.addEventListener('selectstart', (e) => { if (!e.target.closest?.('input, textarea, [contenteditable="true"]')) e.preventDefault(); });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

// Google/Supabase report sign-in problems in the address bar. Read it before the store tidies the URL up.
const authError = (() => {
  const p = new URLSearchParams(location.search + '&' + location.hash.slice(1));
  const msg = p.get('error_description') || p.get('error');
  return msg ? `Sign-in didn’t work: ${msg.replace(/\+/g, ' ')}` : '';
})();

const logoSvg = (size) => `<svg viewBox="0 0 96 96" width="${size}" height="${size}" aria-hidden="true"><circle cx="48" cy="48" r="38" fill="none" stroke="#E9E5EF" stroke-width="12"/><circle cx="48" cy="48" r="38" fill="none" stroke="#91DCA4" stroke-width="12" stroke-linecap="round" stroke-dasharray="238.76" stroke-dashoffset="62" transform="rotate(-90 48 48)"/><path d="M36 49l8 8 17-18" fill="none" stroke="#91DCA4" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
document.querySelector('#splash .logo').innerHTML = logoSvg(88);

let mode = null, announced = false;

function loginView() {
  const note = h('p', { class: 'login-note', hidden: true });
  const btn = h('button', { type: 'button', class: 'pill google', html: `${GOOGLE_G}<span>Continue with Google</span>` });
  const gsi = h('div', { class: 'gsi' }), classic = h('button', { type: 'button', class: 'link', hidden: true }, 'Trouble signing in? Use the other way');
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.classList.add('busy'); note.hidden = true;
    try { await signInGoogle(); } catch (e) { note.textContent = e?.message || 'Could not start Google sign-in.'; note.hidden = false; btn.disabled = false; btn.classList.remove('busy'); }
  });
  // Google's own button first (shows "Muna"); the classic redirect button is the fallback when it can't load
  btn.hidden = true;
  const useClassic = () => { gsi.hidden = true; btn.hidden = false; classic.hidden = true; };
  classic.addEventListener('click', useClassic);
  renderGoogleButton(gsi, signInGoogleToken, (e) => { note.textContent = e?.message || 'Could not sign in with Google.'; note.hidden = false; })
    .then(() => { classic.hidden = false; }).catch(useClassic);
  if (authError) { note.textContent = authError; note.hidden = false; }
  googleEnabled().then((ok) => { if (!ok) { note.textContent = 'Google sign-in is not switched on for this project yet. You can still preview the app.'; note.hidden = false; } });
  return h('div', { class: 'login' },
    h('div', { class: 'login-top' }, h('div', { class: 'logo', html: logoSvg(104) }), h('h1', {}, 'Muna'), h('p', {}, 'Small habits, every day.')),
    h('div', { class: 'login-actions' }, gsi, btn, classic, note, h('button', { type: 'button', class: 'link', onClick: () => enterDemo() }, 'Preview without an account')));
}

let tabHandler = null;
function shellView() {
  const names = ['home', 'tasks', 'reports', 'social', 'account'];
  const views = names.map((n) => h('main', { class: 'screen', id: `view-${n}`, 'aria-label': n }));
  mountHome(views[0]);
  mountTasks(views[1]);
  const reports = mountReports(views[2]);
  const social = mountSocial(views[3]);
  mountAccount(views[4]);

  // bottom bar: icons are Tabler (filled home-2 / article / messages, outline user-circle), exact sizes from the Figma file
  const tabs = [
    ['Home', () => icon('home-2', { filled: true, size: 36 })],
    ['Tasks', () => icon('list-check', { filled: true, size: 34 })],
    ['Reports', () => icon('article', { filled: true, size: 30 })],
    ['Social', () => icon('messages', { filled: true, size: 36 })],
    ['Account', () => icon('user-circle', { size: 36, stroke: 2 })],
  ];
  const badge = h('span', { class: 'tab-badge', hidden: true });
  const buttons = tabs.map(([label, mk], i) => h('button', { type: 'button', class: 'tab', 'aria-label': label, onClick: () => go(i) }, h('span', { class: 'tab-ic' }, mk()), i === 3 ? badge : null));
  const dot = h('span', { class: 'tab-dot' });
  const dock = h('nav', { class: 'dock' }, ...buttons, dot);
  let cur = -1;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  // The new screen builds itself top to bottom, left to right: each element rises from below and fades in, one after another.
  function playEnter(view) {
    if (reduce.matches || !view.animate) return;
    const kids = [];
    for (const c of view.children) {
      if (c.hidden || !c.offsetHeight) continue;
      if (c.matches('.top-bar, .cards, .rep-icons, .mini-cal, .profile-actions, .seg-wrap')) kids.push(...[...c.children].filter((x) => !x.hidden).slice(0, 30)); else kids.push(c);
    }
    // the rise is a quick ease-out, but the fade has its own softer, slower curve: an ease-out fade reaches almost full opacity at once and looks like a cut
    kids.forEach((el, k) => {
      const delay = Math.min(k * 38, 420);
      el.animate([{ transform: 'translateY(20px)' }, { transform: 'translateY(0)' }], { duration: 620, delay, easing: 'cubic-bezier(.16, .84, .3, 1)', fill: 'backwards' });
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 520, delay, easing: 'cubic-bezier(.45, 0, .35, 1)', fill: 'backwards' });
    });
  }
  function go(i) {
    if (cur >= 0 && i !== cur) tap();
    if (i === cur) { views[i].scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (cur === 2) reports.hide();
    cur = i;
    views.forEach((v, k) => { v.classList.toggle('active', k === i); v.inert = k !== i; });
    buttons.forEach((b, k) => { b.classList.toggle('active', k === i); b.setAttribute('aria-current', k === i ? 'page' : 'false'); });
    dock.style.setProperty('--i', i);
    if (i === 2) reports.show();
    if (i === 3) social.show();
    playEnter(views[i]);
  }
  go(0);
  if (tabHandler) window.removeEventListener('muna:tab', tabHandler);
  tabHandler = (e) => go(e.detail);
  window.addEventListener('muna:tab', tabHandler);
  subscribe(() => { const n = pendingCount(); badge.hidden = !n; });
  return [...views, dock];
}

function announceVersion() {
  try {
    const prev = localStorage.getItem('muna.version');
    localStorage.setItem('muna.version', VERSION);
    if (prev && prev !== VERSION) setTimeout(() => toast(`Muna updated to v${VERSION}`, 4000), 900);
  } catch {}
}

function route() {
  const splash = document.getElementById('splash');
  if (state.status === 'boot') return;
  const want = state.status === 'in' ? 'shell' : 'login';
  if (want !== mode) {
    mode = want;
    document.getElementById('layer').replaceChildren();
    document.body.classList.remove('panel-open');
    app.replaceChildren(...(want === 'shell' ? shellView() : [loginView()]));
    if (want === 'shell') { syncPush(); if (!announced) { announced = true; announceVersion(); } }
  }
  if (splash) { splash.classList.add('hide'); setTimeout(() => splash.remove(), 500); }
}
subscribe(route);
boot().catch((e) => { console.error(e); state.status = 'out'; route(); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
