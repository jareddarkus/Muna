import './theme.js';
import { h, toast } from './util.js';
import { VERSION } from './version.js';
import { syncPush } from './push.js';
import { icon } from './icons.js';
import { state, subscribe, boot, signInGoogle, googleEnabled, enterDemo } from './store.js';
import { mountHome } from './home.js';
import { mountStats } from './stats.js';
import { mountSettings } from './settings.js';

const app = document.getElementById('app');
const GOOGLE_G = '<svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

// The mark: a progress ring with a check.
const logoSvg = (size) => `<svg viewBox="0 0 96 96" width="${size}" height="${size}" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#68A4FF"/><stop offset="1" stop-color="#7C4DFF"/></linearGradient></defs><circle cx="48" cy="48" r="38" fill="none" stroke="currentColor" stroke-opacity=".08" stroke-width="12"/><circle cx="48" cy="48" r="38" fill="none" stroke="url(#lg)" stroke-width="12" stroke-linecap="round" stroke-dasharray="238.76" stroke-dashoffset="62" transform="rotate(-90 48 48)"/><path d="M36 49l8 8 17-18" fill="none" stroke="url(#lg)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
document.querySelector('#splash .logo').innerHTML = logoSvg(88);

// Google/Supabase report sign-in problems in the address bar. Read it before the store tidies the URL up.
const authError = (() => {
  const p = new URLSearchParams(location.search + '&' + location.hash.slice(1));
  const msg = p.get('error_description') || p.get('error');
  return msg ? `Sign-in didn\u2019t work: ${msg.replace(/\+/g, ' ')}` : '';
})();

// Block pinch-zoom and double-tap zoom (Safari ignores user-scalable=no, so also stop the gesture itself).
['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
let lastTouch = 0;
document.addEventListener('touchend', (e) => { const now = Date.now(); if (now - lastTouch < 300 && !e.target.closest('input,textarea')) e.preventDefault(); lastTouch = now; }, { passive: false });

let mode = null; // 'login' | 'shell'
let tabs = null;

function loginView() {
  const note = h('p', { class: 'login-note', hidden: true });
  const btn = h('button', { type: 'button', class: 'btn google', html: `${GOOGLE_G}<span>Continue with Google</span>` });
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.classList.add('busy'); note.hidden = true;
    try { await signInGoogle(); } catch (e) { note.textContent = e?.message || 'Could not start Google sign-in.'; note.hidden = false; btn.disabled = false; btn.classList.remove('busy'); }
  });
  if (authError) { note.textContent = authError; note.hidden = false; }
  googleEnabled().then((ok) => { if (!ok) { note.textContent = 'Google sign-in isn’t switched on for this project yet. You can still preview the app.'; note.hidden = false; } });
  return h('div', { class: 'login' },
    h('div', { class: 'login-top' }, h('div', { class: 'logo', html: logoSvg(104) }), h('h1', {}, 'Muna'), h('p', {}, 'Small habits, every day.')),
    h('div', { class: 'login-actions' }, btn, note, h('button', { type: 'button', class: 'link', onClick: () => enterDemo() }, 'Preview without an account')));
}

function shellView() {
  const views = ['home', 'stats', 'settings'].map((n) => h('main', { class: 'view', id: `view-${n}`, 'aria-label': n }));
  const stats = mountStats(views[1]);
  mountHome(views[0]); mountSettings(views[2]);
  const items = [['home', 'Today'], ['clipboard-data', 'Progress'], ['settings', 'Settings']];
  const thumb = h('span', { class: 'dock-thumb' });
  const buttons = items.map(([ic, label], i) => h('button', { type: 'button', class: 'dock-btn', 'aria-label': label, onClick: () => go(i) },
    h('span', { class: 'off' }, icon(ic, { size: 26 })), h('span', { class: 'on' }, icon(ic, { size: 26, filled: true }))));
  const dock = h('nav', { class: 'dock' }, h('div', { class: 'dock-pill' }, thumb, buttons));
  let cur = -1;
  function go(i) {
    if (i === cur) { views[i].scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (cur === 1) stats.hide();
    cur = i;
    views.forEach((v, k) => { v.classList.toggle('active', k === i); v.inert = k !== i; });
    buttons.forEach((b, k) => { b.classList.toggle('active', k === i); b.setAttribute('aria-current', k === i ? 'page' : 'false'); });
    dock.style.setProperty('--i', i);
    if (i === 1) stats.show();
  }
  go(0);
  return [...views, dock];
}

// "Updated to vX" — shown once, the first time a new version runs.
function announceVersion() {
  try {
    const prev = localStorage.getItem('muna.version');
    localStorage.setItem('muna.version', VERSION);
    if (prev && prev !== VERSION) setTimeout(() => toast(`Muna updated to v${VERSION}`, 4000), 900);
  } catch {}
}

let announced = false;
function route() {
  const splash = document.getElementById('splash');
  if (state.status === 'boot') return;
  const want = state.status === 'in' ? 'shell' : 'login';
  if (want !== mode) {
    mode = want;
    document.getElementById('layer').replaceChildren();
    document.body.classList.remove('sheet-open');
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
